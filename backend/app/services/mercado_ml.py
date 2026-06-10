"""
Modelo ensemble de alta precisión para predicción de precios ganaderos.

Arquitectura:
  - XGBoost con feature engineering completo (rezagos, promedios, cruzados, estacionalidad)
    y selección automática de hiperparámetros por validación multi-fold.
  - Prophet para tendencia/estacionalidad base.
  - Ensemble ponderado por MAPE de validación real (walk-forward multi-fold).
  - Limpieza de outliers en el histórico antes de entrenar.
  - Intervalos de confianza basados en el error real medido del ensemble,
    creciendo con el horizonte de proyección.

MAPE objetivo: < 8% (vs ~15% del modelo anterior)
"""
from __future__ import annotations

import logging
import warnings
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)

DATA_PATH = Path(__file__).parent.parent / "data" / "dataset_completo_ganado.csv"
ANOS_HISTORIAL = 10      # más datos para XGBoost que para Prophet
MESES_PROYECCION = 12

# ── Validación multi-fold ─────────────────────────────────────────────────────
N_FOLDS = 3
FOLD_SIZE = 6            # meses por fold (3 x 6 = 18 meses de holdout total)
Z_INTERVALO = 1.645      # equivalente a ~90% de confianza

# ── Grilla de hiperparámetros XGBoost ────────────────────────────────────────
# Se evalúa cada combinación con validación multi-fold y se elige la de menor
# MAPE para cada categoría (los datos son escasos, ~120 meses, por lo que
# modelos simples suelen generalizar mejor que uno único fijo para todas).
XGB_PARAM_GRID: list[dict] = [
    dict(n_estimators=300, max_depth=3, learning_rate=0.05, min_child_weight=5,
         subsample=0.8, colsample_bytree=0.8, reg_alpha=0.1, reg_lambda=1.0),
    dict(n_estimators=400, max_depth=4, learning_rate=0.04, min_child_weight=3,
         subsample=0.8, colsample_bytree=0.8, reg_alpha=0.1, reg_lambda=1.0),
    dict(n_estimators=250, max_depth=3, learning_rate=0.06, min_child_weight=4,
         subsample=0.7, colsample_bytree=0.9, reg_alpha=0.3, reg_lambda=1.5),
    dict(n_estimators=600, max_depth=5, learning_rate=0.03, min_child_weight=2,
         subsample=0.9, colsample_bytree=0.9, reg_alpha=0.05, reg_lambda=1.0),
]

# ── Variables cruzadas por categoría ─────────────────────────────────────────
# Qué otras categorías se usan como features para predecir cada target
CROSS_FEATURES: dict[str, list[str]] = {
    "pr_terneros_usd_kg":        ["inac_novillo_pie", "pr_novillos_1_2_usd_kg", "rhe_novillo"],
    "pr_terneras_usd_kg":        ["inac_novillo_pie", "pr_vaquillonas_1_2_usd_kg", "rhe_novillo"],
    "pr_novillos_1_2_usd_kg":    ["pr_terneros_usd_kg", "inac_novillo_pie", "rhe_novillo"],
    "pr_novillos_2_3_usd_kg":    ["pr_novillos_1_2_usd_kg", "inac_novillo_pie", "rhe_novillo"],
    "pr_vaquillonas_1_2_usd_kg": ["pr_terneras_usd_kg", "inac_vaquillona_pie", "rhe_novillo"],
    "pr_vaquillonas_2mas_usd_kg":["pr_vaquillonas_1_2_usd_kg", "inac_vaquillona_pie", "rhe_novillo"],
    "pr_vacas_invernada_usd_kg": ["inac_vaca_pie", "rhe_vaca", "pr_novillos_1_2_usd_kg"],
    "pr_piezas_cria_usd_cab":    ["pr_terneros_usd_kg", "pr_vacas_invernada_usd_kg", "inac_novillo_pie"],
    "pr_vientres_prenados_usd_cab": ["pr_piezas_cria_usd_cab", "inac_vaca_pie", "rhe_vaca"],
    "pr_vientres_entorados_usd_cab":["pr_piezas_cria_usd_cab", "inac_vaca_pie", "rhe_vaca"],
    "inac_novillo_pie":          ["rhe_novillo", "pr_novillos_1_2_usd_kg", "pr_terneros_usd_kg"],
    "inac_vaca_pie":             ["rhe_vaca", "pr_vacas_invernada_usd_kg", "inac_novillo_pie"],
    "inac_vaquillona_pie":       ["rhe_novillo", "pr_vaquillonas_1_2_usd_kg", "inac_novillo_pie"],
}


# ── Limpieza de outliers ──────────────────────────────────────────────────────

def limpiar_outliers(df: pd.DataFrame, z_thresh: float = 4.0) -> pd.DataFrame:
    """
    Detecta saltos mes a mes anormales (z-score del cambio porcentual respecto
    a la propia serie) en cada columna numérica y reemplaza esos puntos por
    interpolación lineal. La columna 'fecha' no se toca.
    """
    df = df.copy()
    for col in df.columns:
        if col == "fecha":
            continue
        serie = df[col]
        valid = serie.dropna()
        if len(valid) < 12:
            continue
        pct = valid.pct_change()
        std = pct.std()
        mean = pct.mean()
        if not std or np.isnan(std):
            continue
        z = (pct - mean) / std
        outlier_idx = z.index[z.abs() > z_thresh]
        if len(outlier_idx) == 0:
            continue
        logger.info("Mercado: %d outlier(s) detectado(s) en %s", len(outlier_idx), col)
        df.loc[outlier_idx, col] = np.nan
        df[col] = df[col].interpolate(method="linear", limit_direction="both")
    return df


# ── Feature engineering ───────────────────────────────────────────────────────

def _ciclico(mes: int) -> tuple[float, float]:
    """Codificación cíclica del mes (sin/cos) para que enero y diciembre sean cercanos."""
    angle = 2 * np.pi * mes / 12
    return np.sin(angle), np.cos(angle)


def construir_features(df: pd.DataFrame, target_col: str) -> pd.DataFrame:
    """
    Construye la matriz de features para XGBoost a partir del dataset maestro.
    Incluye:
      - Rezagos propios: 1, 2, 3, 6, 12 meses
      - Promedios móviles: 3m, 6m, 12m
      - Diferencias: retorno mensual, retorno 3m
      - Volatilidad: std 6m
      - Estacionalidad: sin/cos del mes
      - Tendencia: tiempo en meses desde inicio
      - Variables cruzadas con rezago 1, 3 y 6
      - RHE
    """
    cross = CROSS_FEATURES.get(target_col, [])

    # Usar solo las columnas relevantes
    cols_usar = [target_col] + [c for c in cross if c in df.columns]
    if "rhe_novillo" in df.columns and "rhe_novillo" not in cols_usar:
        cols_usar.append("rhe_novillo")
    if "rhe_vaca" in df.columns and "rhe_vaca" not in cols_usar:
        cols_usar.append("rhe_vaca")
    if "usd_uyu" in df.columns and "usd_uyu" not in cols_usar:
        cols_usar.append("usd_uyu")

    d = df[["fecha"] + [c for c in cols_usar if c in df.columns]].copy()
    d = d.sort_values("fecha").reset_index(drop=True)

    # Interpolar valores faltantes
    for c in cols_usar:
        if c in d.columns:
            d[c] = d[c].interpolate(method="linear").bfill().ffill()

    # ── Features de la variable objetivo ──
    y = d[target_col]

    for lag in [1, 2, 3, 6, 12]:
        d[f"lag_{lag}"] = y.shift(lag)

    d["rm_3"]  = y.shift(1).rolling(3).mean()
    d["rm_6"]  = y.shift(1).rolling(6).mean()
    d["rm_12"] = y.shift(1).rolling(12).mean()

    d["ret_1"]  = y.shift(1).pct_change(1)
    d["ret_3"]  = y.shift(1).pct_change(3)
    d["std_6"]  = y.shift(1).rolling(6).std()
    d["ratio_rm3_rm12"] = d["rm_3"] / (d["rm_12"] + 1e-9)

    # ── Estacionalidad cíclica ──
    d["mes_num"] = d["fecha"].dt.month
    d["sin_mes"] = d["mes_num"].apply(lambda m: _ciclico(m)[0])
    d["cos_mes"] = d["mes_num"].apply(lambda m: _ciclico(m)[1])

    # ── Tendencia ──
    d["tendencia"] = np.arange(len(d))

    # ── Variables cruzadas ──
    for c in cross:
        if c not in d.columns:
            continue
        d[f"{c}_lag1"] = d[c].shift(1)
        d[f"{c}_lag3"] = d[c].shift(3)
        d[f"{c}_lag6"] = d[c].shift(6)
        d[f"{c}_rm3"]  = d[c].shift(1).rolling(3).mean()

    # ── Tipo de cambio USD/UYU ──
    if "usd_uyu" in d.columns:
        d["usd_uyu_lag1"] = d["usd_uyu"].shift(1)
        d["usd_uyu_lag3"] = d["usd_uyu"].shift(3)
        d["usd_uyu_lag6"] = d["usd_uyu"].shift(6)
        d["usd_uyu_rm3"]  = d["usd_uyu"].shift(1).rolling(3).mean()

    return d.dropna()


def _feature_cols(df_feat: pd.DataFrame, target_col: str) -> list[str]:
    excluir = {"fecha", target_col, "mes_num"}
    return [c for c in df_feat.columns if c not in excluir]


# ── Modelo XGBoost ────────────────────────────────────────────────────────────

def entrenar_xgb(df_feat: pd.DataFrame, target_col: str, idx_train_end: int, params: Optional[dict] = None):
    """Entrena XGBoost en las filas hasta idx_train_end con los hiperparámetros dados."""
    try:
        from xgboost import XGBRegressor
    except Exception:
        return None

    feat_cols = _feature_cols(df_feat, target_col)

    # Limpiar inf y NaN antes de pasar a XGBoost
    df_clean = df_feat[feat_cols].copy()
    df_clean.replace([np.inf, -np.inf], np.nan, inplace=True)
    df_clean.fillna(df_clean.median(), inplace=True)

    X = df_clean.values
    y = df_feat[target_col].values

    X_train, y_train = X[:idx_train_end], y[:idx_train_end]

    hp = params or XGB_PARAM_GRID[1]
    model = XGBRegressor(
        **hp,
        random_state=42,
        verbosity=0,
    )
    model.fit(X_train, y_train)
    return model, feat_cols


def predecir_xgb_iterativo(
    model,
    feat_cols: list[str],
    df_feat: pd.DataFrame,
    target_col: str,
    n_pasos: int,
) -> list[float]:
    """
    Predicción iterativa: usa la predicción del paso t como entrada en t+1.
    Reconstruye las features manualmente en cada paso.
    """
    # Historial de precios reales + predichos
    historial = list(df_feat[target_col].values)

    # Últimas filas para reconstruir features
    ventana = df_feat.copy()

    predicciones = []

    for _ in range(n_pasos):
        # Obtener la última fila de features — limpiar inf/NaN
        ultima_fila = ventana.iloc[-1:][feat_cols].copy()
        ultima_fila.replace([np.inf, -np.inf], np.nan, inplace=True)
        ultima_fila.fillna(ultima_fila.median(), inplace=True)

        pred = float(model.predict(ultima_fila.values)[0])
        pred = max(pred, 0.0)  # precio no puede ser negativo
        predicciones.append(pred)

        # Agregar predicción al historial para la siguiente iteración
        historial.append(pred)

        # Reconstruir la siguiente fila de features con el precio predicho
        nueva_fila = ventana.iloc[-1:].copy()
        nueva_fila[target_col] = pred

        # Actualizar rezagos
        for lag in [1, 2, 3, 6, 12]:
            col = f"lag_{lag}"
            if col in nueva_fila.columns:
                if len(historial) > lag:
                    nueva_fila[col] = historial[-(lag + 1)]

        # Actualizar medias móviles
        for w, col in [(3, "rm_3"), (6, "rm_6"), (12, "rm_12")]:
            if col in nueva_fila.columns and len(historial) >= w:
                nueva_fila[col] = np.mean(historial[-w:])

        if "ret_1" in nueva_fila.columns and len(historial) >= 2:
            nueva_fila["ret_1"] = (historial[-1] - historial[-2]) / (historial[-2] + 1e-9)
        if "ret_3" in nueva_fila.columns and len(historial) >= 4:
            nueva_fila["ret_3"] = (historial[-1] - historial[-4]) / (historial[-4] + 1e-9)
        if "std_6" in nueva_fila.columns and len(historial) >= 6:
            nueva_fila["std_6"] = np.std(historial[-6:])
        if "ratio_rm3_rm12" in nueva_fila.columns:
            rm3  = nueva_fila.get("rm_3",  pd.Series([historial[-1]])).iloc[0]
            rm12 = nueva_fila.get("rm_12", pd.Series([historial[-1]])).iloc[0]
            nueva_fila["ratio_rm3_rm12"] = rm3 / (rm12 + 1e-9)

        if "tendencia" in nueva_fila.columns:
            nueva_fila["tendencia"] = ventana["tendencia"].iloc[-1] + 1

        # Estacionalidad para el próximo mes
        # (en la predicción iterativa no tenemos fecha real, aproximamos)
        if "sin_mes" in nueva_fila.columns:
            mes_actual = int(ventana["mes_num"].iloc[-1])
            mes_sig = (mes_actual % 12) + 1
            nueva_fila["sin_mes"] = _ciclico(mes_sig)[0]
            nueva_fila["cos_mes"] = _ciclico(mes_sig)[1]
            nueva_fila["mes_num"] = mes_sig

        ventana = pd.concat([ventana, nueva_fila], ignore_index=True)

    return predicciones


# ── Modelo Prophet ────────────────────────────────────────────────────────────

def entrenar_prophet(df_serie: pd.DataFrame) -> Optional[object]:
    try:
        from prophet import Prophet
    except ImportError:
        return None

    fecha_min = df_serie["ds"].max() - pd.DateOffset(years=ANOS_HISTORIAL)
    df_train  = df_serie[df_serie["ds"] >= fecha_min].copy()

    modelo = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
        seasonality_mode="multiplicative",
        changepoint_prior_scale=0.08,
        seasonality_prior_scale=15,
        interval_width=0.90,
    )
    modelo.fit(df_train)
    futuro = modelo.make_future_dataframe(periods=MESES_PROYECCION, freq="MS")
    pred   = modelo.predict(futuro)
    return pred[pred["ds"] > df_serie["ds"].max()][["ds", "yhat", "yhat_lower", "yhat_upper"]]


# ── Validación walk-forward multi-fold ────────────────────────────────────────

def _validar_xgb_multifold(
    df_feat: pd.DataFrame,
    target_col: str,
    xgb_params: dict,
    n_folds: int = N_FOLDS,
    fold_size: int = FOLD_SIZE,
) -> float:
    """
    Entrena con datos hasta cada corte de fold y predice los siguientes
    `fold_size` meses, acumulando errores relativos de todos los folds.
    Devuelve el MAPE (%) agregado.
    """
    n_total = len(df_feat)
    errores: list[float] = []

    for k in range(n_folds, 0, -1):
        idx_split = n_total - k * fold_size
        if idx_split < 24:
            continue
        reales = df_feat[target_col].iloc[idx_split:idx_split + fold_size].values
        if len(reales) == 0:
            continue

        result = entrenar_xgb(df_feat, target_col, idx_split, xgb_params)
        if not result:
            continue
        model, feat_cols = result
        df_train_part = df_feat.iloc[:idx_split]
        preds = predecir_xgb_iterativo(model, feat_cols, df_train_part, target_col, len(reales))

        for p, r in zip(preds, reales):
            if r > 0.01:
                errores.append(abs(p - r) / r)

    return float(np.mean(errores) * 100) if errores else 99.0


def seleccionar_mejores_params_xgb(df_feat: pd.DataFrame, target_col: str) -> tuple[dict, float]:
    """
    Evalúa la grilla de hiperparámetros con validación multi-fold y devuelve
    los mejores parámetros junto con su MAPE (%).
    """
    mejor_params = XGB_PARAM_GRID[0]
    mejor_mape = 999.0
    for params in XGB_PARAM_GRID:
        mape = _validar_xgb_multifold(df_feat, target_col, params)
        if mape < mejor_mape:
            mejor_mape = mape
            mejor_params = params
    return mejor_params, mejor_mape


def _validar_prophet_multifold(
    df_feat: pd.DataFrame,
    target_col: str,
    n_folds: int = N_FOLDS,
    fold_size: int = FOLD_SIZE,
) -> float:
    """Igual que _validar_xgb_multifold pero para Prophet. Devuelve MAPE (%)."""
    try:
        from prophet import Prophet
    except ImportError:
        return 99.0

    n_total = len(df_feat)
    df_serie = df_feat[["fecha", target_col]].rename(columns={"fecha": "ds", target_col: "y"})
    errores: list[float] = []

    for k in range(n_folds, 0, -1):
        idx_split = n_total - k * fold_size
        if idx_split < 24:
            continue
        reales = df_feat[target_col].iloc[idx_split:idx_split + fold_size].values
        if len(reales) == 0:
            continue

        try:
            df_train = df_serie.iloc[:idx_split]
            m = Prophet(
                yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False,
                seasonality_mode="multiplicative", changepoint_prior_scale=0.08,
                seasonality_prior_scale=15, interval_width=0.90,
            )
            m.fit(df_train)
            futuro = m.make_future_dataframe(periods=len(reales), freq="MS")
            pred = m.predict(futuro)
            preds_p = pred.tail(len(reales))["yhat"].values
            for p, r in zip(preds_p, reales):
                if r > 0.01:
                    errores.append(abs(p - r) / r)
        except Exception:
            continue

    return float(np.mean(errores) * 100) if errores else 99.0


# ── Predicción ensemble ───────────────────────────────────────────────────────

def predecir_ensemble(
    df: pd.DataFrame,
    target_col: str,
) -> dict:
    """
    Pipeline completo: feature engineering → validación multi-fold con tuning
    de hiperparámetros → ensemble → predicción con intervalos de confianza
    basados en el error real medido.
    Devuelve dict con proyección, historico, mape, y pesos del ensemble.
    """
    # Serie limpia
    df_s = (
        df[["fecha"] + [c for c in df.columns if c != "fecha"]]
        .copy()
        .sort_values("fecha")
        .reset_index(drop=True)
    )

    # Feature matrix
    df_feat = construir_features(df_s, target_col)
    if len(df_feat) < 36:
        return {}

    # Validación multi-fold: elegir mejores hiperparámetros de XGBoost y
    # obtener el MAPE real de cada modelo
    logger.info("  Validando %s ...", target_col)
    xgb_params, mape_xgb = seleccionar_mejores_params_xgb(df_feat, target_col)
    mape_prophet = _validar_prophet_multifold(df_feat, target_col)
    logger.info("  MAPE XGBoost=%.1f%% | Prophet=%.1f%%", mape_xgb, mape_prophet)

    # Pesos inversamente proporcionales al error (mejor modelo pesa más)
    inv_xgb     = 1.0 / (mape_xgb + 1e-6)
    inv_prophet = 1.0 / (mape_prophet + 1e-6)
    total       = inv_xgb + inv_prophet
    w_xgb       = inv_xgb / total
    w_prophet   = inv_prophet / total
    mape_ensemble = w_xgb * mape_xgb + w_prophet * mape_prophet

    # Error relativo "típico" (1 paso) del ensemble, usado para construir
    # intervalos de confianza que crecen con el horizonte de proyección
    sigma_rel_1 = (mape_ensemble / 100.0) * 1.2533  # MAE -> sigma (dist. normal)

    # Entrenar en TODOS los datos con los mejores hiperparámetros encontrados
    result_xgb = entrenar_xgb(df_feat, target_col, len(df_feat), xgb_params)
    preds_xgb: list[float] = []
    if result_xgb:
        model_xgb, feat_cols = result_xgb
        preds_xgb = predecir_xgb_iterativo(model_xgb, feat_cols, df_feat, target_col, MESES_PROYECCION)

    # Prophet
    df_serie = df_feat[["fecha", target_col]].rename(columns={"fecha": "ds", target_col: "y"})
    pred_prophet = entrenar_prophet(df_serie)

    # Ensemble
    proyeccion = []
    for i in range(MESES_PROYECCION):
        if pred_prophet is not None and i < len(pred_prophet):
            row = pred_prophet.iloc[i]
            p_val = float(row["yhat"])
        else:
            p_val = 0.0

        x_val = float(preds_xgb[i]) if i < len(preds_xgb) else p_val

        # Combinar: punto central ensemble
        ensemble_val = float(w_xgb * x_val + w_prophet * p_val)

        # Intervalo de confianza ~90%, creciendo con el horizonte (sqrt(h))
        horizonte = i + 1
        sigma_rel_h = float(sigma_rel_1 * np.sqrt(min(horizonte, MESES_PROYECCION)))
        spread_rel = min(sigma_rel_h * Z_INTERVALO, 0.95)  # tope: no superar ±95%
        ensemble_low  = max(0.0, ensemble_val * (1 - spread_rel))
        ensemble_high = ensemble_val * (1 + spread_rel)

        # Fecha del mes proyectado
        ultima_fecha = df_feat["fecha"].iloc[-1]
        fecha_proy = ultima_fecha + pd.DateOffset(months=i + 1)

        proyeccion.append({
            "mes":      fecha_proy.strftime("%Y-%m"),
            "estimado": round(ensemble_val, 3),
            "minimo":   round(ensemble_low, 3),
            "maximo":   round(ensemble_high, 3),
            "xgb":      round(x_val, 3),
            "prophet":  round(p_val, 3),
        })

    # Últimos 24 meses históricos
    historico = [
        {"mes": row["fecha"].strftime("%Y-%m"), "precio": round(float(row[target_col]), 3)}
        for _, row in df_feat[["fecha", target_col]].tail(24).iterrows()
    ]

    return {
        "proyeccion": proyeccion,
        "historico":  historico,
        "mape_xgb":      round(mape_xgb, 1),
        "mape_prophet":  round(mape_prophet, 1),
        "mape_ensemble": round(mape_ensemble, 1),
        "peso_xgb":      round(w_xgb * 100, 0),
        "peso_prophet":  round(w_prophet * 100, 0),
        "xgb_params":    xgb_params,
    }
