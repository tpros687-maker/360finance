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
