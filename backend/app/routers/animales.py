from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.mapa import Animal, Potrero
from app.models.user import User
from app.schemas.mapa import AnimalCreate, AnimalRead, AnimalUpdate

router = APIRouter(tags=["animales"])


async def _assert_potrero_owned(potrero_id: int, user_id: int, db: AsyncSession) -> Potrero:
    result = await db.execute(select(Potrero).where(Potrero.id == potrero_id))
    potrero = result.scalar_one_or_none()
    if potrero is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Potrero no encontrado")
    if potrero.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    return potrero


async def _get_own_animal(animal_id: int, user_id: int, db: AsyncSession) -> Animal:
    result = await db.execute(select(Animal).where(Animal.id == animal_id))
    animal = result.scalar_one_or_none()
    if animal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Animal no encontrado")
    if animal.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    return animal


@router.get("/potreros/{potrero_id}/animales", response_model=list[AnimalRead])
async def list_animales(
    potrero_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Animal]:
    await _assert_potrero_owned(potrero_id, current_user.id, db)
    result = await db.execute(
        select(Animal).where(Animal.potrero_id == potrero_id).order_by(Animal.created_at)
    )
    return list(result.scalars().all())


@router.post(
    "/potreros/{potrero_id}/animales",
    response_model=AnimalRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_animal(
    potrero_id: int,
    payload: AnimalCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Animal:
    await _assert_potrero_owned(potrero_id, current_user.id, db)
    animal = Animal(
        potrero_id=potrero_id,
        user_id=current_user.id,
        especie=payload.especie,
        cantidad=payload.cantidad,
        raza=payload.raza,
    )
    db.add(animal)
    await db.commit()
    await db.refresh(animal)
    return animal


@router.put("/animales/{animal_id}", response_model=AnimalRead)
async def update_animal(
    animal_id: int,
    payload: AnimalUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Animal:
    animal = await _get_own_animal(animal_id, current_user.id, db)
    if payload.especie is not None:
        animal.especie = payload.especie
    if payload.cantidad is not None:
        animal.cantidad = payload.cantidad
    if payload.raza is not None:
        animal.raza = payload.raza
    await db.commit()
    await db.refresh(animal)
    return animal


@router.delete("/animales/{animal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_animal(
    animal_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    animal = await _get_own_animal(animal_id, current_user.id, db)
    await db.delete(animal)
    await db.commit()
