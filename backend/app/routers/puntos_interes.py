from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping, shape as shapely_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.mapa import PuntoInteres
from app.models.user import User
from app.schemas.mapa import PuntoInteresCreate, PuntoInteresRead

router = APIRouter(prefix="/puntos-interes", tags=["puntos-interes"])


def _punto_to_read(p: PuntoInteres) -> PuntoInteresRead:
    return PuntoInteresRead(
        id=p.id,
        user_id=p.user_id,
        potrero_id=p.potrero_id,
        nombre=p.nombre,
        tipo=p.tipo,
        geometria=mapping(to_shape(p.geometria)),
        created_at=p.created_at,
    )


async def _get_own_punto(punto_id: int, user_id: int, db: AsyncSession) -> PuntoInteres:
    result = await db.execute(select(PuntoInteres).where(PuntoInteres.id == punto_id))
    punto = result.scalar_one_or_none()
    if punto is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Punto de interés no encontrado")
    if punto.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    return punto


@router.get("", response_model=list[PuntoInteresRead])
async def list_puntos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PuntoInteresRead]:
    result = await db.execute(
        select(PuntoInteres)
        .where(PuntoInteres.user_id == current_user.id)
        .order_by(PuntoInteres.created_at.desc())
    )
    return [_punto_to_read(p) for p in result.scalars().all()]


@router.post("", response_model=PuntoInteresRead, status_code=status.HTTP_201_CREATED)
async def create_punto(
    payload: PuntoInteresCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PuntoInteresRead:
    punto = PuntoInteres(
        user_id=current_user.id,
        potrero_id=payload.potrero_id,
        nombre=payload.nombre,
        tipo=payload.tipo,
        geometria=from_shape(shapely_shape(payload.geometria), srid=4326),
    )
    db.add(punto)
    await db.commit()
    await db.refresh(punto)
    return _punto_to_read(punto)


@router.delete("/{punto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_punto(
    punto_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    punto = await _get_own_punto(punto_id, current_user.id, db)
    await db.delete(punto)
    await db.commit()
