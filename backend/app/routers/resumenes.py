"""Endpoints para resúmenes financieros mensuales."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.resumen_mensual import ResumenMensual
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.notificaciones import _generar_resumen_mensual

router = APIRouter(prefix="/resumenes", tags=["resumenes"])


class ResumenMensualOut(BaseModel):
    id: int
    year: int
    month: int
    total_ingresos: float
    total_gastos: float
    balance: float
    cobros_cobrados: float
    cobros_pendientes: float
    pagos_pagados: float
    pagos_pendientes: float
    notas_count: int
    tareas_creadas: int
    tareas_completadas: int
    categoria_top_gasto: Optional[str]
    monto_top_gasto: Optional[float]
    categoria_top_ingreso: Optional[str]
    monto_top_ingreso: Optional[float]

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ResumenMensualOut])
async def listar_resumenes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista todos los resúmenes mensuales del usuario, del más reciente al más antiguo."""
    result = await db.execute(
        select(ResumenMensual)
        .where(ResumenMensual.user_id == current_user.id)
        .order_by(ResumenMensual.year.desc(), ResumenMensual.month.desc())
    )
    return list(result.scalars().all())


@router.post("/generar", response_model=ResumenMensualOut)
async def generar_resumen(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Genera (o regenera) el resumen del mes indicado.
    Si no se pasa year/month, usa el mes actual.
    """
    hoy = date.today()
    if year is None or month is None:
        year = year or hoy.year
        month = month or hoy.month

    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Mes inválido (1-12)")

    resumen = await _generar_resumen_mensual(current_user, year, month, db)
    return resumen
