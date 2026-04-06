from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.mapa import Animal, MovimientoGanado, Potrero
from app.models.user import User
from app.schemas.mapa import MovimientoCreate, MovimientoRead

router = APIRouter(prefix="/movimientos", tags=["movimientos"])


async def _assert_potrero_owned(potrero_id: int, user_id: int, db: AsyncSession) -> Potrero:
    result = await db.execute(select(Potrero).where(Potrero.id == potrero_id))
    potrero = result.scalar_one_or_none()
    if potrero is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Potrero no encontrado")
    if potrero.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos sobre el potrero")
    return potrero


async def _get_own_movimiento(mov_id: int, user_id: int, db: AsyncSession) -> MovimientoGanado:
    result = await db.execute(select(MovimientoGanado).where(MovimientoGanado.id == mov_id))
    mov = result.scalar_one_or_none()
    if mov is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movimiento no encontrado")
    if mov.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    return mov


async def _transferir_animales(mov: MovimientoGanado, user_id: int, db: AsyncSession) -> None:
    """Mueve `mov.cantidad` animales de la especie indicada entre potreros."""
    especie = mov.especie
    cantidad = mov.cantidad

    # ── Origen: restar (o eliminar) ──────────────────────────────────────────
    origen_q = await db.execute(
        select(Animal).where(
            Animal.potrero_id == mov.potrero_origen_id,
            func.lower(Animal.especie) == especie.lower(),
        )
    )
    animal_origen = origen_q.scalar_one_or_none()
    if animal_origen is not None:
        if animal_origen.cantidad <= cantidad:
            await db.delete(animal_origen)
        else:
            animal_origen.cantidad -= cantidad

    # ── Destino: sumar (o crear) ──────────────────────────────────────────────
    destino_q = await db.execute(
        select(Animal).where(
            Animal.potrero_id == mov.potrero_destino_id,
            func.lower(Animal.especie) == especie.lower(),
        )
    )
    animal_destino = destino_q.scalar_one_or_none()
    if animal_destino is not None:
        animal_destino.cantidad += cantidad
    else:
        db.add(Animal(
            potrero_id=mov.potrero_destino_id,
            user_id=user_id,
            especie=especie,
            cantidad=cantidad,
        ))

    # ── Origen en descanso si quedó vacío ────────────────────────────────────
    await db.flush()
    remaining_q = await db.execute(
        select(func.sum(Animal.cantidad)).where(Animal.potrero_id == mov.potrero_origen_id)
    )
    total_remaining = remaining_q.scalar() or 0
    if total_remaining == 0:
        potrero_origen = await db.get(Potrero, mov.potrero_origen_id)
        if potrero_origen is not None:
            potrero_origen.en_descanso = True
            potrero_origen.fecha_descanso = date.today()


def _mov_to_read(mov: MovimientoGanado, origen_nombre: str, destino_nombre: str) -> MovimientoRead:
    return MovimientoRead(
        id=mov.id,
        user_id=mov.user_id,
        potrero_origen_id=mov.potrero_origen_id,
        potrero_destino_id=mov.potrero_destino_id,
        potrero_origen_nombre=origen_nombre,
        potrero_destino_nombre=destino_nombre,
        cantidad=mov.cantidad,
        especie=mov.especie,
        fecha_programada=mov.fecha_programada,
        fecha_ejecutada=mov.fecha_ejecutada,
        estado=mov.estado,
        notas=mov.notas,
        created_at=mov.created_at,
    )


@router.get("", response_model=list[MovimientoRead])
async def list_movimientos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MovimientoRead]:
    result = await db.execute(
        select(MovimientoGanado)
        .where(MovimientoGanado.user_id == current_user.id)
        .order_by(MovimientoGanado.fecha_programada.desc())
    )
    movimientos = result.scalars().all()

    reads = []
    for mov in movimientos:
        origen = await db.get(Potrero, mov.potrero_origen_id)
        destino = await db.get(Potrero, mov.potrero_destino_id)
        reads.append(_mov_to_read(
            mov,
            origen.nombre if origen else "—",
            destino.nombre if destino else "—",
        ))
    return reads


@router.post("", response_model=MovimientoRead, status_code=status.HTTP_201_CREATED)
async def create_movimiento(
    payload: MovimientoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MovimientoRead:
    origen = await _assert_potrero_owned(payload.potrero_origen_id, current_user.id, db)
    destino = await _assert_potrero_owned(payload.potrero_destino_id, current_user.id, db)

    estado = "ejecutado" if payload.ejecutar_ahora else "programado"
    fecha_ejecutada = date.today() if payload.ejecutar_ahora else None

    mov = MovimientoGanado(
        user_id=current_user.id,
        potrero_origen_id=payload.potrero_origen_id,
        potrero_destino_id=payload.potrero_destino_id,
        cantidad=payload.cantidad,
        especie=payload.especie,
        fecha_programada=payload.fecha_programada,
        fecha_ejecutada=fecha_ejecutada,
        estado=estado,
        notas=payload.notas,
    )
    db.add(mov)
    await db.flush()  # obtener mov.id antes del commit

    if payload.ejecutar_ahora:
        await _transferir_animales(mov, current_user.id, db)

    await db.commit()
    await db.refresh(mov)
    return _mov_to_read(mov, origen.nombre, destino.nombre)


@router.put("/{mov_id}/ejecutar", response_model=MovimientoRead)
async def ejecutar_movimiento(
    mov_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MovimientoRead:
    mov = await _get_own_movimiento(mov_id, current_user.id, db)
    if mov.estado != "programado":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden ejecutar movimientos en estado 'programado'",
        )
    mov.estado = "ejecutado"
    mov.fecha_ejecutada = date.today()
    await _transferir_animales(mov, current_user.id, db)
    await db.commit()
    await db.refresh(mov)

    origen = await db.get(Potrero, mov.potrero_origen_id)
    destino = await db.get(Potrero, mov.potrero_destino_id)
    return _mov_to_read(
        mov,
        origen.nombre if origen else "—",
        destino.nombre if destino else "—",
    )


@router.delete("/{mov_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_movimiento(
    mov_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    mov = await _get_own_movimiento(mov_id, current_user.id, db)
    mov.estado = "cancelado"
    await db.commit()
