from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class ActividadRentabilidad(BaseModel):
    actividad_tipo: str  # "lote" | "ciclo"
    actividad_id: int
    nombre: str
    ingresos_usd: Decimal
    gastos_directos_usd: Decimal
    margen_usd: Decimal
    margen_ha_usd: Optional[Decimal]
    anualizado_usd_ha: Optional[Decimal]
    es_proyectado: bool


class PotreroRentabilidad(BaseModel):
    potrero_id: int
    nombre: str
    hectareas: Optional[Decimal]
    actividades: list[ActividadRentabilidad]
    gastos_prorrateados_usd: Decimal
    gastos_estructurales_usd: Decimal
    margen_neto_usd: Decimal
    margen_neto_ha_usd: Optional[Decimal]
    margen_neto_ha_anualizado_usd: Optional[Decimal]
    es_proyectado: bool


class EstablecimientoRentabilidad(BaseModel):
    periodo_desde: Optional[date]
    periodo_hasta: Optional[date]
    potreros: list[PotreroRentabilidad]
    margen_total_usd: Decimal
    margen_ha_usd: Optional[Decimal]
    proyeccion_anual_usd_ha: Optional[Decimal]
