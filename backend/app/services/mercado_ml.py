"""
Modelo ensemble de alta precisión para predicción de precios ganaderos.

Arquitectura:
  - XGBoost con feature engineering completo (rezagos, promedios, cruzados, estacionalidad)
  - Prophet para tendencia/estacionalidad base
  - Ensemble ponderado por MAPE de validación real (walk-forward)
  - Tipo de cambio USD/UYU como variable exógena

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
MESES_VALIDACION = 18    # walk-forward: últimos 18 meses como test set

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
      - Variables cruzadas con rezago 1 y 3
      - Tipo de cambio USD/UYU (si disponible)
      - RHE
    """
    cross = CROSS_FEATURES.get(target_col, [])

    # Usar solo las columnas relevantes
    cols_usar = [target_col] + [c for c in cross if c in df.columns]
    if "rhe_novillo" in df.columns and "rhe_novillo" not in cols_usar:
        cols_usar.append("rhe_novillo")
    if "rhe_vaca" in df.columns and "rhe_vaca" not in cols_usar:
        cols_usar.append("rhe_vaca")

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

    return d.dropna()


def _feature_cols(df_feat: pd.DataFrame, target_col: str) -> list[str]:
    excluir = {"fecha", target_col, "mes_num"}
    return [c for c in df_feat.columns if c not in excluir]


# ── Modelo XGBoost ────────────────────────────────────────────────────────────

def entrenar_xgb(df_feat: pd.DataFrame, target_col: str, idx_train_end: int):
    """Entrena XGBoost en las filas hasta idx_train_end."""
    try:
        from xgboost import XGBRegressor
    except ImportError:
        return None

    feat_cols = _feature_cols(df_feat, target_col)
    X = df_feat[feat_cols].values
    y = df_feat[target_col].values

    X_train, y_train = X[:idx_train_end], y[:idx_train_end]

    model = XGBRegressor(
        n_estimators=400,
        learning_rate=0.04,
        max_depth=4,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        reg_alpha=0.1,
        reg_lambda=1.0,
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
    import copy

    # Historial de precios reales + predichos
    historial = list(df_feat[target_col].values)
    fechas    = list(df_feat["fecha"].values)

    # Últimas filas para reconstruir features
    ventana = df_feat.copy()

    predicciones = []

    for paso in range(n_pasos):
        # Obtener la última fila de features
        ultima_fila = ventana.iloc[-1:][feat_cols].values

        pred = float(model.predict(ultima_fila)[0])
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


# ── Validación walk-forward ───────────────────────────────────────────────────

def validar_walk_forward(
    df_feat: pd.DataFrame,
    target_col: str,
    n_test: int = MESES_VALIDACION,
) -> tuple[float, float]:
    """
    Entrena en primeros N-n_test meses, predice los últimos n_test mes a mes.
    Devuelve (mape_xgb, mape_prophet) como porcentaje.
    """
    n_total = len(df_feat)
    idx_split = n_total - n_test

    if idx_split < 24:
        return 99.0, 99.0

    # XGBoost
    result_xgb = entrenar_xgb(df_feat, target_col, idx_split)
    mape_xgb = 99.0
    if result_xgb:
        model_xgb, feat_cols = result_xgb
        df_train_part = df_feat.iloc[:idx_split]
        preds_xgb = predecir_xgb_iterativo(model_xgb, feat_cols, df_train_part, target_col, n_test)
        reales = df_feat[target_col].iloc[idx_split:].values
        mapes = [abs(p - r) / (abs(r) + 1e-9) for p, r in zip(preds_xgb, reales) if r > 0.01]
        mape_xgb = float(np.mean(mapes) * 100) if mapes else 99.0

    # Prophet
    df_serie = df_feat[["fecha", target_col]].rename(columns={"fecha": "ds", target_col: "y"})
    df_train_part = df_serie.iloc[:idx_split]
    mape_prophet = 99.0
    try:
        from prophet import Prophet
        m = Prophet(
            yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False,
            seasonality_mode="multiplicative", changepoint_prior_scale=0.08,
            seasonality_prior_scale=15, interval_width=0.90,
        )
        m.fit(df_train_part)
        futuro = m.make_future_dataframe(periods=n_test, freq="MS")
        pred   = m.predict(futuro)
        preds_prophet = pred.tail(n_test)["yhat"].values
        reales = df_feat[target_col].iloc[idx_split:].values
        mapes = [abs(p - r) / (abs(r) + 1e-9) for p, r in zip(preds_prophet, reales) if r > 0.01]
        mape_prophet = float(np.mean(mapes) * 100) if mapes else 99.0
    except Exception:
        pass

    return mape_xgb, mape_prophet


# ── Predicción ensemble ───────────────────────────────────────────────────────

def predecir_ensemble(
    df: pd.DataFrame,
    target_col: str,
) -> dict:
    """
    Pipeline completo: feature engineering → validación → ensemble → predicción.
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

    # Validación walk-forward para obtener MAPE real de cada modelo
    logger.info("  Validando %s ...", target_col)
    mape_xgb, mape_prophet = validar_walk_forward(df_feat, target_col)
    logger.info("  MAPE XGBoost=%.1f%% | Prophet=%.1f%%", mape_xgb, mape_prophet)

    # Pesos inversamente proporcionales al error (mejor modelo pesa más)
    inv_xgb     = 1.0 / (mape_xgb + 1e-6)
    inv_prophet = 1.0 / (mape_prophet + 1e-6)
    total       = inv_xgb + inv_prophet
    w_xgb       = inv_xgb / total
    w_prophet   = inv_prophet / total

    # Entrenar en TODOS los datos
    result_xgb = entrenar_xgb(df_feat, target_col, len(df_feat))
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
            p_val  = float(row["yhat"])
            p_low  = float(row["yhat_lower"])
            p_high = float(row["yhat_upper"])
        else:
            p_val = p_low = p_high = 0.0

        x_val = preds_xgb[i] if i < len(preds_xgb) else p_val

        # Combinar: punto central ensemble, intervalos de Prophet
        ensemble_val = w_xgb * x_val + w_prophet * p_val
        spread = (p_high - p_low) / 2
        ensemble_low  = max(0.0, ensemble_val - spread)
        ensemble_high = ensemble_val + spread

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
        for _, row in df_feat[[" fecha", target_col]].rename(columns={" fecha": "fecha"}).tail(24).iterrows()
    ] if " fecha" not in df_feat.columns else [
        {"mes": row["fecha"].strftime("%Y-%m"), "precio": round(float(row[target_col]), 3)}
        for _, row in df_feat[["fecha", target_col]].tail(24).iterrows()
    ]

    return {
        "proyeccion": proyeccion,
        "historico":  historico,
        "mape_xgb":      round(mape_xgb, 1),
        "mape_prophet":  round(mape_prophet, 1),
        "mape_ensemble": round(w_xgb * mape_xgb + w_prophet * mape_prophet, 1),
        "peso_xgb":      round(w_xgb * 100, 0),
        "peso_prophet":  round(w_prophet * 100, 0),
    }
