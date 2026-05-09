from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.categoria import TipoMovimiento
from app.models.mapa import Potrero
from app.models.produccion import CicloAgricola, LoteGanado
from app.models.referencia import CotizacionDiaria
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

    # Lotes y ciclos del potrero para capturar gastos imputados a actividades
    lotes_res = await db.execute(
        select(LoteGanado.id).where(LoteGanado.potrero_id == potrero_id)
    )
    lote_ids = [r for (r,) in lotes_res.all()]

    ciclos_res = await db.execute(
        select(CicloAgricola.id).where(CicloAgricola.potrero_id == potrero_id)
    )
    ciclo_ids = [r for (r,) in ciclos_res.all()]

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
    cond_lotes = and_(
        Registro.actividad_tipo == "lote",
        Registro.actividad_id.in_(lote_ids) if lote_ids else Registro.actividad_id.is_(None),
        *filtros_base,
    )
    cond_ciclos = and_(
        Registro.actividad_tipo == "ciclo",
        Registro.actividad_id.in_(ciclo_ids) if ciclo_ids else Registro.actividad_id.is_(None),
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

    stmt_potrero = select(Registro).where(or_(cond_directo_potrero, cond_lotes, cond_ciclos) if (lote_ids or ciclo_ids) else cond_directo_potrero)
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


async def calcular_rentabilidad_potrero(
    potrero_id: int,
    periodo_desde: Optional[date],
    periodo_hasta: Optional[date],
    user_id: int,
    db: AsyncSession,
) -> "PotreroRentabilidad":
    hoy = date.today()

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

    # Actividades del potrero en el período
    lote_stmt = select(LoteGanado).where(LoteGanado.potrero_id == potrero_id)
    if periodo_desde:
        lote_stmt = lote_stmt.where(LoteGanado.fecha_entrada >= periodo_desde)
    if periodo_hasta:
        lote_stmt = lote_stmt.where(LoteGanado.fecha_entrada <= periodo_hasta)
    lotes = (await db.execute(lote_stmt)).scalars().all()

    ciclo_stmt = select(CicloAgricola).where(CicloAgricola.potrero_id == potrero_id)
    if periodo_desde:
        ciclo_stmt = ciclo_stmt.where(CicloAgricola.fecha_siembra >= periodo_desde)
    if periodo_hasta:
        ciclo_stmt = ciclo_stmt.where(CicloAgricola.fecha_siembra <= periodo_hasta)
    ciclos = (await db.execute(ciclo_stmt)).scalars().all()

    async def gastos_directos_actividad(tipo: str, act_id: int) -> Decimal:
        filtros = [
            Registro.tipo == TipoMovimiento.gasto,
            Registro.actividad_tipo == tipo,
            Registro.actividad_id == act_id,
        ]
        if periodo_desde:
            filtros.append(Registro.fecha >= periodo_desde)
        if periodo_hasta:
            filtros.append(Registro.fecha <= periodo_hasta)
        g_res = await db.execute(select(Registro).where(*filtros))
        total = Decimal("0")
        for r in g_res.scalars().all():
            total += await convertir_a_usd(Decimal(str(r.monto)), r.moneda, r.fecha, db)
        return total

    actividades: list[ActividadRentabilidad] = []
    total_ingresos = Decimal("0")
    any_proyectado = False

    for lote in lotes:
        ingresos, proyectado = await calcular_ingresos_actividad("lote", lote.id, db)
        gastos_d = await gastos_directos_actividad("lote", lote.id)
        margen = ingresos - gastos_d
        margen_ha = (margen / ha_potrero).quantize(Decimal("0.01")) if ha_potrero else None
        f_out = lote.fecha_salida or hoy
        dias_lote = max((f_out - lote.fecha_entrada).days, 1)
        anualizado = (
            (margen_ha * Decimal("365") / Decimal(str(dias_lote))).quantize(Decimal("0.01"))
            if margen_ha is not None else None
        )
        if proyectado:
            any_proyectado = True
        total_ingresos += ingresos
        actividades.append(ActividadRentabilidad(
            actividad_tipo="lote",
            actividad_id=lote.id,
            nombre=lote.nombre or f"Lote #{lote.id}",
            ingresos_usd=ingresos,
            gastos_directos_usd=gastos_d,
            margen_usd=margen,
            margen_ha_usd=margen_ha,
            anualizado_usd_ha=anualizado,
            es_proyectado=proyectado,
        ))

    for ciclo in ciclos:
        ingresos, proyectado = await calcular_ingresos_actividad("ciclo", ciclo.id, db)
        gastos_d = await gastos_directos_actividad("ciclo", ciclo.id)
        margen = ingresos - gastos_d
        margen_ha = (margen / ha_potrero).quantize(Decimal("0.01")) if ha_potrero else None
        f_out = ciclo.fecha_cosecha or hoy
        dias_ciclo = max((f_out - ciclo.fecha_siembra).days, 1)
        anualizado = (
            (margen_ha * Decimal("365") / Decimal(str(dias_ciclo))).quantize(Decimal("0.01"))
            if margen_ha is not None else None
        )
        if proyectado:
            any_proyectado = True
        total_ingresos += ingresos
        actividades.append(ActividadRentabilidad(
            actividad_tipo="ciclo",
            actividad_id=ciclo.id,
            nombre=ciclo.cultivo or f"Ciclo #{ciclo.id}",
            ingresos_usd=ingresos,
            gastos_directos_usd=gastos_d,
            margen_usd=margen,
            margen_ha_usd=margen_ha,
            anualizado_usd_ha=anualizado,
            es_proyectado=proyectado,
        ))

    directos, prorrateados, estructurales = await calcular_gastos_potrero(
        potrero_id, periodo_desde, periodo_hasta, total_ha_estab, db
    )

    margen_neto = total_ingresos - directos - prorrateados - estructurales
    margen_neto_ha = (margen_neto / ha_potrero).quantize(Decimal("0.01")) if ha_potrero else None
    margen_neto_ha_anualizado = (
        (margen_neto_ha * Decimal("365") / Decimal(str(dias_periodo))).quantize(Decimal("0.01"))
        if margen_neto_ha is not None else None
    )

    return PotreroRentabilidad(
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

        # Estimate remaining income from open activities with no recorded income yet
        for act in r.actividades:
            if not act.es_proyectado or act.ingresos_usd > 0:
                continue
            if act.actividad_tipo == "lote":
                lote_res = await db.execute(
                    select(LoteGanado).where(LoteGanado.id == act.actividad_id)
                )
                lote = lote_res.scalar_one_or_none()
                if lote and lote.peso_entrada_kg and lote.cantidad:
                    # Assume 200 kg gain per head at USD 2.20/kg (novillo exportación)
                    ingreso_estimado = (
                        Decimal("200") * Decimal(str(lote.cantidad)) * Decimal("2.20")
                    ).quantize(Decimal("0.01"))
                    total_ingresos += ingreso_estimado
            elif act.actividad_tipo == "ciclo":
                ciclo_res = await db.execute(
                    select(CicloAgricola).where(CicloAgricola.id == act.actividad_id)
                )
                ciclo = ciclo_res.scalar_one_or_none()
                # Estimate using reference yield 2.5 tn/ha × potrero ha × precio_venta_tn
                if (
                    ciclo
                    and ciclo.precio_venta_tn
                    and potrero.hectareas
                ):
                    tn_estimadas = Decimal("2.5") * Decimal(str(potrero.hectareas))
                    ingreso_estimado = await convertir_a_usd(
                        tn_estimadas * Decimal(str(ciclo.precio_venta_tn)),
                        ciclo.moneda,
                        hoy,
                        db,
                    )
                    total_ingresos += ingreso_estimado

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
