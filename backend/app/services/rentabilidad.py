import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.categoria import TipoMovimiento
from app.models.mapa import Potrero
from app.models.referencia import CotizacionDiaria, RentabilidadCache
from app.models.registro import Registro

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
    return Decimal("0"), False


async def calcular_gastos_potrero(
    potrero_id: int,
    periodo_desde: Optional[date],
    periodo_hasta: Optional[date],
    total_ha_establecimiento: Decimal,
    db: AsyncSession,
) -> tuple[Decimal, Decimal, Decimal]:
    """Devuelve (directos_usd, prorrateados_usd, estructurales_usd)."""
    res = await db.execute(select(Potrero).where(Potrero.id == potrero_id))
    potrero = res.scalar_one_or_none()
    ha_potrero = Decimal(str(potrero.hectareas)) if potrero and potrero.hectareas else Decimal("0")

    fraccion = (
        (ha_potrero / total_ha_establecimiento).quantize(Decimal("0.000001"))
        if total_ha_establecimiento > 0
        else Decimal("0")
    )

    # Filtros de período
    filtros_base = [Registro.tipo == TipoMovimiento.gasto]
    if periodo_desde:
        filtros_base.append(Registro.fecha >= periodo_desde)
    if periodo_hasta:
        filtros_base.append(Registro.fecha <= periodo_hasta)

    cond_directo_potrero = and_(
        Registro.potrero_id == potrero_id,
        Registro.actividad_tipo.is_(None),
        *filtros_base,
    )

    # Gastos de prorrateo/estructural (nivel establecimiento, sin potrero_id específico)
    cond_shared = and_(
        Registro.tipo_imputacion.in_(["prorrateo", "estructural"]),
        Registro.potrero_id.is_(None),
        *filtros_base,
    )

    # Gastos sin imputar a nivel establecimiento
    cond_sin_imputar = and_(
        Registro.tipo_imputacion.is_(None),
        Registro.potrero_id.is_(None),
        Registro.actividad_tipo.is_(None),
        *filtros_base,
    )

    stmt_potrero = select(Registro).where(cond_directo_potrero)
    stmt_shared = select(Registro).where(or_(cond_shared, cond_sin_imputar))

    pot_res = await db.execute(stmt_potrero)
    registros_potrero = pot_res.scalars().all()

    sh_res = await db.execute(stmt_shared)
    registros_shared = sh_res.scalars().all()

    directos = Decimal("0")
    prorrateados = Decimal("0")
    estructurales = Decimal("0")

    for reg in registros_potrero:
        usd = await convertir_a_usd(Decimal(str(reg.monto)), reg.moneda, reg.fecha, db)
        imputacion = reg.tipo_imputacion or "directo"
        if imputacion == "directo":
            directos += usd
        elif imputacion == "prorrateo":
            prorrateados += (usd * fraccion).quantize(Decimal("0.01"))
        else:
            estructurales += (usd * fraccion).quantize(Decimal("0.01"))

    for reg in registros_shared:
        usd = await convertir_a_usd(Decimal(str(reg.monto)), reg.moneda, reg.fecha, db)
        imputacion = reg.tipo_imputacion
        if imputacion == "prorrateo":
            prorrateados += (usd * fraccion).quantize(Decimal("0.01"))
        else:
            estructurales += (usd * fraccion).quantize(Decimal("0.01"))

    return directos, prorrateados, estructurales


_CACHE_TTL_HOURS = 6


async def invalidar_cache_potrero(potrero_id: int, db: AsyncSession) -> None:
    """Marca como inválidos todos los registros de cache del potrero."""
    cache_res = await db.execute(
        select(RentabilidadCache).where(
            RentabilidadCache.potrero_id == potrero_id,
            RentabilidadCache.valido == True,  # noqa: E712
        )
    )
    for entry in cache_res.scalars().all():
        entry.valido = False
    await db.commit()


async def calcular_rentabilidad_potrero(
    potrero_id: int,
    periodo_desde: Optional[date],
    periodo_hasta: Optional[date],
    user_id: int,
    db: AsyncSession,
) -> "PotreroRentabilidad":
    hoy = date.today()
    fecha_desde_key = periodo_desde or date(hoy.year, 1, 1)
    fecha_hasta_key = periodo_hasta or hoy

    # ── Cache lookup ──────────────────────────────────────────────────────────
    ttl_cutoff = datetime.now(timezone.utc) - timedelta(hours=_CACHE_TTL_HOURS)
    cache_res = await db.execute(
        select(RentabilidadCache).where(
            RentabilidadCache.potrero_id == potrero_id,
            RentabilidadCache.user_id == user_id,
            RentabilidadCache.periodo_desde == fecha_desde_key,
            RentabilidadCache.periodo_hasta == fecha_hasta_key,
            RentabilidadCache.valido == True,  # noqa: E712
            RentabilidadCache.calculado_at >= ttl_cutoff,
        )
    )
    cached = cache_res.scalar_one_or_none()
    if cached is not None:
        return PotreroRentabilidad.model_validate_json(cached.resultado_json)

    res = await db.execute(
        select(Potrero).where(Potrero.id == potrero_id, Potrero.user_id == user_id)
    )
    potrero = res.scalar_one_or_none()
    if potrero is None:
        raise ValueError(f"Potrero {potrero_id} no encontrado o sin acceso")

    ha_potrero = Decimal(str(potrero.hectareas)) if potrero.hectareas else None

    # Total ha del establecimiento para prorratear costos compartidos
    tot_res = await db.execute(
        select(func.sum(Potrero.hectareas)).where(
            Potrero.user_id == user_id,
            Potrero.hectareas.isnot(None),
        )
    )
    total_ha_raw = tot_res.scalar_one_or_none()
    total_ha_estab = Decimal(str(total_ha_raw)) if total_ha_raw else Decimal("0")

    fecha_desde = periodo_desde or date(hoy.year, 1, 1)
    fecha_hasta = periodo_hasta or hoy
    dias_periodo = max((fecha_hasta - fecha_desde).days, 1)

    actividades: list[ActividadRentabilidad] = []
    total_ingresos = Decimal("0")
    any_proyectado = False

    directos, prorrateados, estructurales = await calcular_gastos_potrero(
        potrero_id, periodo_desde, periodo_hasta, total_ha_estab, db
    )

    margen_neto = total_ingresos - directos - prorrateados - estructurales
    margen_neto_ha = (margen_neto / ha_potrero).quantize(Decimal("0.01")) if ha_potrero else None
    margen_neto_ha_anualizado = (
        (margen_neto_ha * Decimal("365") / Decimal(str(dias_periodo))).quantize(Decimal("0.01"))
        if margen_neto_ha is not None else None
    )

    resultado = PotreroRentabilidad(
        potrero_id=potrero_id,
        nombre=potrero.nombre,
        hectareas=ha_potrero,
        actividades=actividades,
        gastos_prorrateados_usd=prorrateados,
        gastos_estructurales_usd=estructurales,
        margen_neto_usd=margen_neto,
        margen_neto_ha_usd=margen_neto_ha,
        margen_neto_ha_anualizado_usd=margen_neto_ha_anualizado,
        es_proyectado=any_proyectado,
    )

    # ── Cache write-back ─────────────────────────────────────────────────────
    try:
        existing_res = await db.execute(
            select(RentabilidadCache).where(
                RentabilidadCache.potrero_id == potrero_id,
                RentabilidadCache.user_id == user_id,
                RentabilidadCache.periodo_desde == fecha_desde_key,
                RentabilidadCache.periodo_hasta == fecha_hasta_key,
            )
        )
        existing = existing_res.scalar_one_or_none()
        json_str = resultado.model_dump_json()
        if existing is not None:
            existing.resultado_json = json_str
            existing.calculado_at = datetime.now(timezone.utc)
            existing.valido = True
        else:
            db.add(RentabilidadCache(
                user_id=user_id,
                potrero_id=potrero_id,
                periodo_desde=fecha_desde_key,
                periodo_hasta=fecha_hasta_key,
                resultado_json=json_str,
                calculado_at=datetime.now(timezone.utc),
                valido=True,
            ))
        await db.commit()
    except Exception:
        pass  # cache failure is non-fatal

    return resultado


class EscenarioProyeccion(BaseModel):
    ingresos_usd: Decimal
    gastos_usd: Decimal
    margen_usd: Decimal
    margen_ha_usd: Optional[Decimal]


class ProyeccionAnualResult(BaseModel):
    periodo_analizado_dias: int
    total_ha: Optional[Decimal]
    pesimista: EscenarioProyeccion
    base: EscenarioProyeccion
    optimista: EscenarioProyeccion


async def calcular_proyeccion_anual(
    user_id: int,
    db: AsyncSession,
) -> ProyeccionAnualResult:
    hoy = date.today()
    inicio_anio = date(hoy.year, 1, 1)
    dias_transcurridos = max((hoy - inicio_anio).days, 1)
    factor_anual = Decimal("365") / Decimal(str(dias_transcurridos))

    pot_res = await db.execute(select(Potrero).where(Potrero.user_id == user_id))
    potreros = pot_res.scalars().all()

    total_ingresos = Decimal("0")
    total_gastos = Decimal("0")
    total_ha = Decimal("0")

    for potrero in potreros:
        if potrero.hectareas:
            total_ha += Decimal(str(potrero.hectareas))
        try:
            r = await calcular_rentabilidad_potrero(
                potrero_id=potrero.id,
                periodo_desde=inicio_anio,
                periodo_hasta=hoy,
                user_id=user_id,
                db=db,
            )
        except Exception:
            continue

        ingresos_p = sum((act.ingresos_usd for act in r.actividades), Decimal("0"))
        gastos_p = ingresos_p - r.margen_neto_usd
        total_ingresos += ingresos_p
        total_gastos += gastos_p

    ha_ref = total_ha if total_ha > 0 else None

    def escenario(factor: Decimal) -> EscenarioProyeccion:
        ing = (total_ingresos * factor_anual * factor).quantize(Decimal("0.01"))
        gas = (total_gastos * factor_anual * factor).quantize(Decimal("0.01"))
        mar = ing - gas
        mar_ha = (mar / ha_ref).quantize(Decimal("0.01")) if ha_ref else None
        return EscenarioProyeccion(
            ingresos_usd=ing,
            gastos_usd=gas,
            margen_usd=mar,
            margen_ha_usd=mar_ha,
        )

    return ProyeccionAnualResult(
        periodo_analizado_dias=dias_transcurridos,
        total_ha=ha_ref,
        pesimista=escenario(Decimal("0.85")),
        base=escenario(Decimal("1")),
        optimista=escenario(Decimal("1.15")),
    )


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
