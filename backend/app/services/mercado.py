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

import numpy as np
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


def _predecir_categoria(df: pd.DataFrame, col: str) -> dict:
    """Usa el modelo ensemble ML para predecir una categoría."""
    from app.services.mercado_ml import predecir_ensemble
    return predecir_ensemble(df, col)


def construir_cache() -> dict:
    """Carga el CSV, entrena todos los modelos y devuelve el cache."""
    logger.info("Mercado: construyendo cache de predicciones...")

    if not DATA_PATH.exists():
        logger.error("Mercado: dataset no encontrado en %s", DATA_PATH)
        return {}

    df = pd.read_csv(DATA_PATH)
    df["fecha"] = pd.to_datetime(df["fecha"])

    from app.services.mercado_ml import limpiar_outliers
    df = limpiar_outliers(df)

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
            ml_result = _predecir_categoria(df, col)
        except Exception as e:
            logger.warning("Mercado: error proyectando %s: %s", col, e)
            continue

        if not ml_result:
            continue

        precio_actual = float(df[col].dropna().iloc[-1])
        fecha_ultimo_dato = df["fecha"][df[col].notna()].iloc[-1].strftime("%Y-%m")

        proyeccion = []
        alertas = []
        for p in ml_result.get("proyeccion", []):
            tipo_alerta = None
            if p["estimado"] >= cfg["alerta_alta"]:
                tipo_alerta = "alta"
                alertas.append({"mes": p["mes"], "tipo": "alta", "precio": p["estimado"]})
            elif p["estimado"] <= cfg["alerta_baja"]:
                tipo_alerta = "baja"
                alertas.append({"mes": p["mes"], "tipo": "baja", "precio": p["estimado"]})
            proyeccion.append({**p, "alerta": tipo_alerta})

        prom_proy = float(np.mean([p["estimado"] for p in proyeccion])) if proyeccion else precio_actual
        tendencia = "sube" if prom_proy > precio_actual else ("baja" if prom_proy < precio_actual else "estable")

        resultado[col] = {
            **cfg,
            "id": col,
            "precio_actual": round(precio_actual, 3),
            "fecha_ultimo_dato": fecha_ultimo_dato,
            "prom_proyectado": round(prom_proy, 3),
            "tendencia": tendencia,
            "historico": ml_result.get("historico", []),
            "proyeccion": proyeccion,
            "alertas": alertas,
            "precision": {
                "mape_modelo": ml_result.get("mape_ensemble"),
                "mape_xgb": ml_result.get("mape_xgb"),
                "mape_prophet": ml_result.get("mape_prophet"),
                "peso_xgb": ml_result.get("peso_xgb"),
                "peso_prophet": ml_result.get("peso_prophet"),
            },
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
