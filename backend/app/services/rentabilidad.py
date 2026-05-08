from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.referencia import CotizacionDiaria

USD_UYU_FALLBACK = Decimal("40.0")


async def convertir_a_usd(
    monto: Decimal,
    moneda: str,
    fecha: date,
    db: AsyncSession,
) -> Decimal:
    if moneda == "USD":
        return monto

    # Busca la cotización más cercana dentro de los últimos 7 días
    fecha_min = fecha - timedelta(days=7)
    result = await db.execute(
        select(CotizacionDiaria)
        .where(CotizacionDiaria.fecha >= fecha_min, CotizacionDiaria.fecha <= fecha)
        .order_by(CotizacionDiaria.fecha.desc())
        .limit(1)
    )
    cotizacion = result.scalar_one_or_none()

    divisor = Decimal(str(cotizacion.usd_uyu)) if cotizacion else USD_UYU_FALLBACK
    return (monto / divisor).quantize(Decimal("0.01"))


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
