"""
Servicio de predicción de precios de ganado bovino.
Entrena modelos Prophet con datos históricos INAC + Plaza Rural
y sirve predicciones cacheadas en memoria.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# ── Configuración de categorías ───────────────────────────────────────────────

CATEGORIAS: dict[str, dict] = {
    "pr_terneros_usd_kg": {
        "nombre": "Terneros",
        "grupo": "Terneros / Terneras",
        "fuente": "Plaza Rural",
        "unidad": "kg",
        "alerta_alta": 4.50,
        "alerta_baja": 3.50,
    },
    "pr_terneras_usd_kg": {
        "nombre": "Terneras",
        "grupo": "Terneros / Terneras",
        "fuente": "Plaza Rural",
        "unidad": "kg",
        "alerta_alta": 4.20,
        "alerta_baja": 3.20,
    },
    "pr_novillos_1_2_usd_kg": {
        "nombre": "Novillos 1-2 años",
        "grupo": "Novillos invernada",
        "fuente": "Plaza Rural",
        "unidad": "kg",
        "alerta_alta": 3.70,
        "alerta_baja": 2.80,
    },
    "pr_novillos_2_3_usd_kg": {
        "nombre": "Novillos 2-3 años",
        "grupo": "Novillos invernada",
        "fuente": "Plaza Rural",
        "unidad": "kg",
        "alerta_alta": 3.30,
        "alerta_baja": 2.50,
    },
    "pr_vaquillonas_1_2_usd_kg": {
        "nombre": "Vaquillonas 1-2 años",
        "grupo": "Vaquillonas",
        "fuente": "Plaza Rural",
        "unidad": "kg",
        "alerta_alta": 3.60,
        "alerta_baja": 2.70,
    },
    "pr_vaquillonas_2mas_usd_kg": {
        "nombre": "Vaquillonas 2+ años",
        "grupo": "Vaquillonas",
        "fuente": "Plaza Rural",
        "unidad": "kg",
        "alerta_alta": 3.20,
        "alerta_baja": 2.50,
    },
    "pr_vacas_invernada_usd_kg": {
        "nombre": "Vacas de invernada",
        "grupo": "Vacas invernada",
        "fuente": "Plaza Rural",
        "unidad": "kg",
        "alerta_alta": 2.70,
        "alerta_baja": 1.90,
    },
    "pr_piezas_cria_usd_cab": {
        "nombre": "Piezas de cría",
        "grupo": "Cría",
        "fuente": "Plaza Rural",
        "unidad": "cab",
        "alerta_alta": 800.0,
        "alerta_baja": 550.0,
    },
    "pr_vientres_prenados_usd_cab": {
        "nombre": "Vientres preñados",
        "grupo": "Cría",
        "fuente": "Plaza Rural",
        "unidad": "cab",
        "alerta_alta": 1400.0,
        "alerta_baja": 900.0,
    },
    "pr_vientres_entorados_usd_cab": {
        "nombre": "Vientres entorados",
        "grupo": "Cría",
        "fuente": "Plaza Rural",
        "unidad": "cab",
        "alerta_alta": 1200.0,
        "alerta_baja": 800.0,
    },
    "inac_novillo_pie": {
        "nombre": "Novillo gordo en pie",
        "grupo": "Gordo (frigorífico)",
        "fuente": "INAC",
        "unidad": "kg",
        "alerta_alta": 3.20,
        "alerta_baja": 2.50,
    },
    "inac_vaca_pie": {
        "nombre": "Vaca gorda en pie",
        "grupo": "Gordo (frigorífico)",
        "fuente": "INAC",
        "unidad": "kg",
        "alerta_alta": 2.80,
        "alerta_baja": 2.00,
    },
    "inac_vaquillona_pie": {
        "nombre": "Vaquillona gorda en pie",
        "grupo": "Gordo (frigorífico)",
        "fuente": "INAC",
        "unidad": "kg",
        "alerta_alta": 3.10,
        "alerta_baja": 2.40,
    },
}

ANOS_HISTORIAL = 8
MESES_PROYECCION = 12

# ── Cache en memoria ──────────────────────────────────────────────────────────

_cache: Optional[dict] = None
_cache_timestamp: Optional[datetime] = None

DATA_PATH = Path(__file__).parent.parent / "data" / "dataset_completo_ganado.csv"


def _entrenar_y_predecir(df_serie: pd.DataFrame) -> pd.DataFrame:
    """Entrena Prophet con los últimos ANOS_HISTORIAL años y devuelve predicción."""
    try:
        from prophet import Prophet  # import tardío para no frenar el arranque si no está
    except ImportError:
        logger.warning("Prophet no instalado. Retornando predicción vacía.")
        return pd.DataFrame()

    import warnings
    warnings.filterwarnings("ignore")

    fecha_min = df_serie["ds"].max() - pd.DateOffset(years=ANOS_HISTORIAL)
    df_train = df_serie[df_serie["ds"] >= fecha_min].copy().reset_index(drop=True)

    modelo = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
        seasonality_mode="additive",
        changepoint_prior_scale=0.05,
        seasonality_prior_scale=10,
        interval_width=0.90,
    )
    modelo.fit(df_train)
    futuro = modelo.make_future_dataframe(periods=MESES_PROYECCION, freq="MS")
    pred = modelo.predict(futuro)
    return pred[pred["ds"] > df_serie["ds"].max()][["ds", "yhat", "yhat_lower", "yhat_upper"]]


def construir_cache() -> dict:
    """Carga el CSV, entrena todos los modelos y devuelve el cache."""
    logger.info("Mercado: construyendo cache de predicciones...")

    if not DATA_PATH.exists():
        logger.error("Mercado: dataset no encontrado en %s", DATA_PATH)
        return {}

    df = pd.read_csv(DATA_PATH)
    df["fecha"] = pd.to_datetime(df["fecha"])

    resultado: dict[str, dict] = {}

    for col, cfg in CATEGORIAS.items():
        if col not in df.columns:
            continue
        df_s = (
            df[["fecha", col]]
            .dropna()
            .rename(columns={"fecha": "ds", col: "y"})
            .sort_values("ds")
            .reset_index(drop=True)
        )
        if len(df_s) < 24:
            continue

        try:
            pred = _entrenar_y_predecir(df_s)
        except Exception as e:
            logger.warning("Mercado: error proyectando %s: %s", col, e)
            continue

        precio_actual = float(df_s["y"].iloc[-1])
        fecha_ultimo_dato = df_s["ds"].iloc[-1].strftime("%Y-%m")

        proyeccion = []
        alertas = []
        for _, row in pred.iterrows():
            mes = row["ds"].strftime("%Y-%m")
            yhat = float(row["yhat"])
            ylo  = float(row["yhat_lower"])
            yhi  = float(row["yhat_upper"])

            tipo_alerta = None
            if yhat >= cfg["alerta_alta"]:
                tipo_alerta = "alta"
                alertas.append({"mes": mes, "tipo": "alta", "precio": round(yhat, 3)})
            elif yhat <= cfg["alerta_baja"]:
                tipo_alerta = "baja"
                alertas.append({"mes": mes, "tipo": "baja", "precio": round(yhat, 3)})

            proyeccion.append({
                "mes": mes,
                "estimado": round(yhat, 3),
                "minimo": round(ylo, 3),
                "maximo": round(yhi, 3),
                "alerta": tipo_alerta,
            })

        prom_proy = float(pred["yhat"].mean()) if len(pred) else precio_actual
        tendencia = "sube" if prom_proy > precio_actual else ("baja" if prom_proy < precio_actual else "estable")

        # Últimos 24 meses de datos históricos para el gráfico
        historico = []
        df_hist = df_s.tail(24)
        for _, row in df_hist.iterrows():
            historico.append({
                "mes": row["ds"].strftime("%Y-%m"),
                "precio": round(float(row["y"]), 3),
            })

        resultado[col] = {
            **cfg,
            "id": col,
            "precio_actual": round(precio_actual, 3),
            "fecha_ultimo_dato": fecha_ultimo_dato,
            "prom_proyectado": round(prom_proy, 3),
            "tendencia": tendencia,
            "historico": historico,
            "proyeccion": proyeccion,
            "alertas": alertas,
        }

    logger.info("Mercado: cache construido con %d categorías.", len(resultado))
    return resultado


def get_predicciones(forzar: bool = False) -> dict:
    """Devuelve el cache, construyéndolo si no existe."""
    global _cache, _cache_timestamp

    if _cache is None or forzar:
        _cache = construir_cache()
        _cache_timestamp = datetime.now()

    return _cache


def get_timestamp() -> Optional[str]:
    if _cache_timestamp:
        return _cache_timestamp.strftime("%d/%m/%Y %H:%M")
    return None
