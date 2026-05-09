from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.mapa import Potrero
from app.models.user import User
from app.services.rentabilidad import PotreroRentabilidad, calcular_rentabilidad_potrero

router = APIRouter(prefix="/rentabilidad", tags=["rentabilidad"])


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
