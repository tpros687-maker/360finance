from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.produccion import CicloAgricola, LoteGanado
from app.models.referencia import CotizacionDiaria
from app.models.registro import Registro
from app.models.categoria import TipoMovimiento

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


async def calcular_ingresos_actividad(
    actividad_tipo: str,
    actividad_id: int,
    db: AsyncSession,
) -> tuple[Decimal, bool]:
    """Devuelve (ingresos_usd, es_proyectado)."""
    hoy = date.today()

    if actividad_tipo == "lote":
        res = await db.execute(select(LoteGanado).where(LoteGanado.id == actividad_id))
        lote = res.scalar_one_or_none()
        if lote is None:
            return Decimal("0"), False

        abierto = lote.fecha_salida is None or lote.peso_salida_kg is None

        # Busca registro de ingreso imputado a este lote para obtener monto y moneda reales
        reg_res = await db.execute(
            select(Registro).where(
                Registro.actividad_tipo == "lote",
                Registro.actividad_id == actividad_id,
                Registro.tipo == TipoMovimiento.ingreso,
            ).order_by(Registro.fecha.desc()).limit(1)
        )
        registro = reg_res.scalar_one_or_none()

        if registro is not None:
            ingresos_usd = await convertir_a_usd(
                Decimal(str(registro.monto)), registro.moneda, registro.fecha, db
            )
            return ingresos_usd, abierto

        # Sin registro: estima por kg producidos si tiene salida
        if not abierto:
            kg = Decimal(str(lote.peso_salida_kg)) - Decimal(str(lote.peso_entrada_kg))
            # Precio estimado: USD 2.20/kg (novillo tipo exportación, referencia)
            ingresos_usd = (kg * Decimal("2.20")).quantize(Decimal("0.01"))
            return ingresos_usd, True  # proyectado porque no hay registro real

        return Decimal("0"), True

    if actividad_tipo == "ciclo":
        res = await db.execute(select(CicloAgricola).where(CicloAgricola.id == actividad_id))
        ciclo = res.scalar_one_or_none()
        if ciclo is None:
            return Decimal("0"), False

        abierto = ciclo.fecha_cosecha is None or ciclo.toneladas_cosechadas is None

        if ciclo.toneladas_cosechadas is not None and ciclo.precio_venta_tn is not None:
            ingreso_bruto = Decimal(str(ciclo.toneladas_cosechadas)) * Decimal(str(ciclo.precio_venta_tn))
            fecha_ref = ciclo.fecha_cosecha or hoy
            ingresos_usd = await convertir_a_usd(ingreso_bruto, ciclo.moneda, fecha_ref, db)
            return ingresos_usd, abierto

        # Sin precio ni toneladas: ingreso cero, marcado proyectado si está abierto
        return Decimal("0"), abierto

    return Decimal("0"), False


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
