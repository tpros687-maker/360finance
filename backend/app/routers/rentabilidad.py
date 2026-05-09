from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.categoria import TipoMovimiento
from app.models.mapa import Potrero
from app.models.registro import Registro
from app.models.user import User
from app.services.rentabilidad import (
    PotreroRentabilidad,
    calcular_rentabilidad_potrero,
    convertir_a_usd,
)

router = APIRouter(prefix="/rentabilidad", tags=["rentabilidad"])


class GastoResumen(BaseModel):
    id: int
    fecha: date
    descripcion: Optional[str]
    monto: Decimal
    moneda: str
    monto_usd: Decimal
    tipo_imputacion: Optional[str]
    actividad_tipo: Optional[str]
    actividad_id: Optional[int]


class PotreroRentabilidadDetalle(PotreroRentabilidad):
    top_gastos: list[GastoResumen]


@router.get("/potreros", response_model=list[PotreroRentabilidad])
async def listar_rentabilidad_potreros(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(Potrero).where(Potrero.user_id == current_user.id)
    )
    potreros = res.scalars().all()

    resultados: list[PotreroRentabilidad] = []
    for potrero in potreros:
        try:
            r = await calcular_rentabilidad_potrero(
                potrero_id=potrero.id,
                periodo_desde=fecha_desde,
                periodo_hasta=fecha_hasta,
                user_id=current_user.id,
                db=db,
            )
            resultados.append(r)
        except Exception:
            continue

    resultados.sort(
        key=lambda r: r.margen_neto_ha_anualizado_usd
        if r.margen_neto_ha_anualizado_usd is not None
        else r.margen_neto_usd,
        reverse=True,
    )

    return resultados


@router.get("/potreros/{potrero_id}", response_model=PotreroRentabilidadDetalle)
async def detalle_rentabilidad_potrero(
    potrero_id: int,
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        base = await calcular_rentabilidad_potrero(
            potrero_id=potrero_id,
            periodo_desde=fecha_desde,
            periodo_hasta=fecha_hasta,
            user_id=current_user.id,
            db=db,
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Potrero no encontrado")

    # Top 5 gastos del período para ese potrero (directos + imputados a sus actividades)
    filtros = [
        Registro.tipo == TipoMovimiento.gasto,
        Registro.user_id == current_user.id,
        Registro.potrero_id == potrero_id,
    ]
    if fecha_desde:
        filtros.append(Registro.fecha >= fecha_desde)
    if fecha_hasta:
        filtros.append(Registro.fecha <= fecha_hasta)

    g_res = await db.execute(
        select(Registro).where(*filtros).order_by(Registro.monto.desc()).limit(5)
    )
    registros_top = g_res.scalars().all()

    top_gastos: list[GastoResumen] = []
    for reg in registros_top:
        monto_usd = await convertir_a_usd(
            Decimal(str(reg.monto)), reg.moneda, reg.fecha, db
        )
        top_gastos.append(GastoResumen(
            id=reg.id,
            fecha=reg.fecha,
            descripcion=reg.descripcion,
            monto=reg.monto,
            moneda=reg.moneda,
            monto_usd=monto_usd,
            tipo_imputacion=reg.tipo_imputacion,
            actividad_tipo=reg.actividad_tipo,
            actividad_id=reg.actividad_id,
        ))

    return PotreroRentabilidadDetalle(**base.model_dump(), top_gastos=top_gastos)


class EscenarioProyeccion(BaseModel):
    ingresos_esperados_usd: Decimal
    gastos_esperados_usd: Decimal
    margen_esperado_usd: Decimal
    margen_ha_esperado_usd: Optional[Decimal]


class ProyeccionAnual(BaseModel):
    periodo_analizado_dias: int
    total_ha: Optional[Decimal]
    pesimista: EscenarioProyeccion
    base: EscenarioProyeccion
    optimista: EscenarioProyeccion


@router.get("/proyeccion", response_model=ProyeccionAnual)
async def proyeccion_anual(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hoy = date.today()
    inicio_anio = date(hoy.year, 1, 1)
    dias_transcurridos = max((hoy - inicio_anio).days, 1)
    factor_anual = Decimal("365") / Decimal(str(dias_transcurridos))

    res = await db.execute(
        select(Potrero).where(Potrero.user_id == current_user.id)
    )
    potreros = res.scalars().all()

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
                user_id=current_user.id,
                db=db,
            )
        except Exception:
            continue

        ingresos_p = sum(
            (act.ingresos_usd for act in r.actividades), Decimal("0")
        )
        # gastos totales del potrero = ingresos - margen_neto
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
            ingresos_esperados_usd=ing,
            gastos_esperados_usd=gas,
            margen_esperado_usd=mar,
            margen_ha_esperado_usd=mar_ha,
        )

    return ProyeccionAnual(
        periodo_analizado_dias=dias_transcurridos,
        total_ha=ha_ref,
        pesimista=escenario(Decimal("0.85")),
        base=escenario(Decimal("1")),
        optimista=escenario(Decimal("1.15")),
    )
