from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.producto import Producto
from app.models.user import User

router = APIRouter(prefix="/productos", tags=["productos"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ProductoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    tipo: str = "producto"
    precio: float
    moneda: str = "UYU"
    stock: Optional[int] = None

    @field_validator("nombre")
    @classmethod
    def nombre_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El nombre no puede estar vacío")
        return v

    @field_validator("tipo")
    @classmethod
    def tipo_valido(cls, v: str) -> str:
        if v not in ("producto", "servicio"):
            raise ValueError("El tipo debe ser 'producto' o 'servicio'")
        return v

    @field_validator("precio")
    @classmethod
    def precio_positive(cls, v: float) -> float:
        if v < 0:
            raise ValueError("El precio no puede ser negativo")
        return v

    @field_validator("moneda")
    @classmethod
    def moneda_valida(cls, v: str) -> str:
        if v not in ("UYU", "USD"):
            raise ValueError("La moneda debe ser 'UYU' o 'USD'")
        return v


class ProductoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    tipo: Optional[str] = None
    precio: Optional[float] = None
    moneda: Optional[str] = None
    stock: Optional[int] = None

    @field_validator("tipo")
    @classmethod
    def tipo_valido(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("producto", "servicio"):
            raise ValueError("El tipo debe ser 'producto' o 'servicio'")
        return v

    @field_validator("precio")
    @classmethod
    def precio_positive(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError("El precio no puede ser negativo")
        return v

    @field_validator("moneda")
    @classmethod
    def moneda_valida(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("UYU", "USD"):
            raise ValueError("La moneda debe ser 'UYU' o 'USD'")
        return v


class ProductoRead(BaseModel):
    id: int
    user_id: int
    nombre: str
    descripcion: Optional[str]
    tipo: str
    precio: float
    moneda: str
    stock: Optional[int]
    activo: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helper ────────────────────────────────────────────────────────────────────

async def _get_own_producto(producto_id: int, user_id: int, db: AsyncSession) -> Producto:
    result = await db.execute(select(Producto).where(Producto.id == producto_id))
    producto = result.scalar_one_or_none()
    if producto is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    if producto.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos sobre este producto")
    return producto


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ProductoRead])
async def list_productos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Producto]:
    result = await db.execute(
        select(Producto)
        .where(Producto.user_id == current_user.id)
        .order_by(Producto.nombre)
    )
    return list(result.scalars().all())


@router.post("", response_model=ProductoRead, status_code=status.HTTP_201_CREATED)
async def create_producto(
    payload: ProductoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Producto:
    producto = Producto(
        user_id=current_user.id,
        nombre=payload.nombre,
        descripcion=payload.descripcion,
        tipo=payload.tipo,
        precio=payload.precio,
        moneda=payload.moneda,
        stock=payload.stock,
        activo=True,
    )
    db.add(producto)
    await db.commit()
    await db.refresh(producto)
    return producto


@router.put("/{producto_id}", response_model=ProductoRead)
async def update_producto(
    producto_id: int,
    payload: ProductoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Producto:
    producto = await _get_own_producto(producto_id, current_user.id, db)
    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
        producto.nombre = nombre
    if payload.descripcion is not None:
        producto.descripcion = payload.descripcion
    if payload.tipo is not None:
        producto.tipo = payload.tipo
    if payload.precio is not None:
        producto.precio = payload.precio
    if payload.moneda is not None:
        producto.moneda = payload.moneda
    if payload.stock is not None:
        producto.stock = payload.stock
    await db.commit()
    await db.refresh(producto)
    return producto


@router.delete("/{producto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_producto(
    producto_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    producto = await _get_own_producto(producto_id, current_user.id, db)
    await db.delete(producto)
    await db.commit()


@router.patch("/{producto_id}/toggle", response_model=ProductoRead)
async def toggle_producto(
    producto_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Producto:
    producto = await _get_own_producto(producto_id, current_user.id, db)
    producto.activo = not producto.activo
    await db.commit()
    await db.refresh(producto)
    return producto
