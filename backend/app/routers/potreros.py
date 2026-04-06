from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping, shape as shapely_shape
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.mapa import MovimientoGanado, Potrero
from app.models.user import User
from app.schemas.mapa import MovimientoRead, PotreroCreate, PotreroRead, PotreroUpdate

router = APIRouter(prefix="/potreros", tags=["potreros"])


def _geom_to_geojson(geom: Any) -> dict:
    """Convert WKBElement to GeoJSON dict."""
    return mapping(to_shape(geom))


def _geojson_to_geom(geojson: dict) -> Any:
    """Convert GeoJSON dict to WKBElement (SRID 4326)."""
    return from_shape(shapely_shape(geojson), srid=4326)


def _potrero_to_read(p: Potrero) -> PotreroRead:
    return PotreroRead(
        id=p.id,
        user_id=p.user_id,
        nombre=p.nombre,
        geometria=_geom_to_geojson(p.geometria),
        tipo=p.tipo,
        estado_pasto=p.estado_pasto,
        hectareas=p.hectareas,
        tiene_suplementacion=p.tiene_suplementacion,
        suplementacion_detalle=p.suplementacion_detalle,
        tiene_franjas=p.tiene_franjas,
        cantidad_franjas=p.cantidad_franjas,
        franjas_usadas=p.franjas_usadas,
        observaciones=p.observaciones,
        en_descanso=p.en_descanso,
        fecha_descanso=p.fecha_descanso,
        created_at=p.created_at,
    )


async def _get_own_potrero(potrero_id: int, user_id: int, db: AsyncSession) -> Potrero:
    result = await db.execute(select(Potrero).where(Potrero.id == potrero_id))
    potrero = result.scalar_one_or_none()
    if potrero is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Potrero no encontrado")
    if potrero.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos sobre este potrero")
    return potrero


@router.get("", response_model=list[PotreroRead])
async def list_potreros(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PotreroRead]:
    result = await db.execute(
        select(Potrero).where(Potrero.user_id == current_user.id).order_by(Potrero.created_at.desc())
    )
    potreros = result.scalars().all()
    return [_potrero_to_read(p) for p in potreros]


@router.post("", response_model=PotreroRead, status_code=status.HTTP_201_CREATED)
async def create_potrero(
    payload: PotreroCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PotreroRead:
    potrero = Potrero(
        user_id=current_user.id,
        nombre=payload.nombre,
        geometria=_geojson_to_geom(payload.geometria),
        tipo=payload.tipo,
        estado_pasto=payload.estado_pasto,
        hectareas=payload.hectareas,
        tiene_suplementacion=payload.tiene_suplementacion,
        suplementacion_detalle=payload.suplementacion_detalle,
        tiene_franjas=payload.tiene_franjas,
        cantidad_franjas=payload.cantidad_franjas,
        franjas_usadas=payload.franjas_usadas,
        observaciones=payload.observaciones,
    )
    db.add(potrero)
    await db.commit()
    await db.refresh(potrero)
    return _potrero_to_read(potrero)


@router.put("/{potrero_id}", response_model=PotreroRead)
async def update_potrero(
    potrero_id: int,
    payload: PotreroUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PotreroRead:
    potrero = await _get_own_potrero(potrero_id, current_user.id, db)

    if payload.nombre is not None:
        potrero.nombre = payload.nombre
    if payload.geometria is not None:
        potrero.geometria = _geojson_to_geom(payload.geometria)
    if payload.tipo is not None:
        potrero.tipo = payload.tipo
    if payload.estado_pasto is not None:
        potrero.estado_pasto = payload.estado_pasto
    if payload.hectareas is not None:
        potrero.hectareas = payload.hectareas
    if payload.tiene_suplementacion is not None:
        potrero.tiene_suplementacion = payload.tiene_suplementacion
    if payload.suplementacion_detalle is not None:
        potrero.suplementacion_detalle = payload.suplementacion_detalle
    if payload.tiene_franjas is not None:
        potrero.tiene_franjas = payload.tiene_franjas
    if payload.cantidad_franjas is not None:
        potrero.cantidad_franjas = payload.cantidad_franjas
    if payload.franjas_usadas is not None:
        potrero.franjas_usadas = payload.franjas_usadas
    if payload.observaciones is not None:
        potrero.observaciones = payload.observaciones

    await db.commit()
    await db.refresh(potrero)
    return _potrero_to_read(potrero)


@router.get("/{potrero_id}/movimientos", response_model=list[MovimientoRead])
async def get_movimientos_potrero(
    potrero_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MovimientoRead]:
    """Historial de movimientos donde este potrero fue origen o destino."""
    await _get_own_potrero(potrero_id, current_user.id, db)

    result = await db.execute(
        select(MovimientoGanado)
        .where(
            MovimientoGanado.user_id == current_user.id,
            or_(
                MovimientoGanado.potrero_origen_id == potrero_id,
                MovimientoGanado.potrero_destino_id == potrero_id,
            ),
        )
        .order_by(MovimientoGanado.fecha_programada.desc())
    )
    movimientos = result.scalars().all()

    reads = []
    for mov in movimientos:
        origen = await db.get(Potrero, mov.potrero_origen_id)
        destino = await db.get(Potrero, mov.potrero_destino_id)
        reads.append(
            MovimientoRead(
                id=mov.id,
                user_id=mov.user_id,
                potrero_origen_id=mov.potrero_origen_id,
                potrero_destino_id=mov.potrero_destino_id,
                potrero_origen_nombre=origen.nombre if origen else "—",
                potrero_destino_nombre=destino.nombre if destino else "—",
                cantidad=mov.cantidad,
                especie=mov.especie,
                fecha_programada=mov.fecha_programada,
                fecha_ejecutada=mov.fecha_ejecutada,
                estado=mov.estado,
                notas=mov.notas,
                created_at=mov.created_at,
            )
        )
    return reads


@router.delete("/{potrero_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_potrero(
    potrero_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    potrero = await _get_own_potrero(potrero_id, current_user.id, db)
    await db.delete(potrero)
    await db.commit()
