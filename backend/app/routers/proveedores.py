from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.cliente import Proveedor, CuentaPagar
from app.models.user import User

router = APIRouter(prefix="/proveedores", tags=["proveedores"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ProveedorCreate(BaseModel):
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    notas: Optional[str] = None

    @field_validator("nombre")
    @classmethod
    def nombre_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El nombre no puede estar vacío")
        return v


class ProveedorUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    notas: Optional[str] = None


class ProveedorRead(BaseModel):
    id: int
    user_id: int
    nombre: str
    telefono: Optional[str]
    email: Optional[str]
    notas: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class CuentaPagarCreate(BaseModel):
    monto: float
    moneda: str = "UYU"
    descripcion: Optional[str] = None
    fecha_vencimiento: Optional[datetime] = None

    @field_validator("monto")
    @classmethod
    def monto_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("El monto debe ser mayor a cero")
        return v

    @field_validator("moneda")
    @classmethod
    def moneda_valida(cls, v: str) -> str:
        if v not in ("UYU", "USD"):
            raise ValueError("La moneda debe ser 'UYU' o 'USD'")
        return v


class CuentaPagarRead(BaseModel):
    id: int
    user_id: int
    proveedor_id: int
    monto: float
    moneda: str
    descripcion: Optional[str]
    fecha_vencimiento: Optional[datetime]
    pagado: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_own_proveedor(proveedor_id: int, user_id: int, db: AsyncSession) -> Proveedor:
    result = await db.execute(select(Proveedor).where(Proveedor.id == proveedor_id))
    proveedor = result.scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    if proveedor.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos sobre este proveedor")
    return proveedor


async def _get_own_cuenta(cuenta_id: int, user_id: int, db: AsyncSession) -> CuentaPagar:
    result = await db.execute(select(CuentaPagar).where(CuentaPagar.id == cuenta_id))
    cuenta = result.scalar_one_or_none()
    if cuenta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta por pagar no encontrada")
    if cuenta.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos sobre esta cuenta")
    return cuenta


# ── Proveedores CRUD ──────────────────────────────────────────────────────────

@router.get("", response_model=list[ProveedorRead])
async def list_proveedores(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Proveedor]:
    result = await db.execute(
        select(Proveedor)
        .where(Proveedor.user_id == current_user.id)
        .order_by(Proveedor.nombre)
    )
    return list(result.scalars().all())


@router.post("", response_model=ProveedorRead, status_code=status.HTTP_201_CREATED)
async def create_proveedor(
    payload: ProveedorCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Proveedor:
    proveedor = Proveedor(
        user_id=current_user.id,
        nombre=payload.nombre,
        telefono=payload.telefono,
        email=payload.email,
        notas=payload.notas,
    )
    db.add(proveedor)
    await db.commit()
    await db.refresh(proveedor)
    return proveedor


@router.put("/{proveedor_id}", response_model=ProveedorRead)
async def update_proveedor(
    proveedor_id: int,
    payload: ProveedorUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Proveedor:
    proveedor = await _get_own_proveedor(proveedor_id, current_user.id, db)
    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
        proveedor.nombre = nombre
    if payload.telefono is not None:
        proveedor.telefono = payload.telefono
    if payload.email is not None:
        proveedor.email = payload.email
    if payload.notas is not None:
        proveedor.notas = payload.notas
    await db.commit()
    await db.refresh(proveedor)
    return proveedor


@router.delete("/{proveedor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_proveedor(
    proveedor_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    proveedor = await _get_own_proveedor(proveedor_id, current_user.id, db)
    await db.delete(proveedor)
    await db.commit()


# ── Cuentas por pagar ─────────────────────────────────────────────────────────

@router.get("/{proveedor_id}/cuentas", response_model=list[CuentaPagarRead])
async def list_cuentas(
    proveedor_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CuentaPagar]:
    await _get_own_proveedor(proveedor_id, current_user.id, db)
    result = await db.execute(
        select(CuentaPagar)
        .where(CuentaPagar.proveedor_id == proveedor_id)
        .order_by(CuentaPagar.fecha_vencimiento.asc().nulls_last(), CuentaPagar.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{proveedor_id}/cuentas", response_model=CuentaPagarRead, status_code=status.HTTP_201_CREATED)
async def create_cuenta(
    proveedor_id: int,
    payload: CuentaPagarCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CuentaPagar:
    await _get_own_proveedor(proveedor_id, current_user.id, db)
    cuenta = CuentaPagar(
        user_id=current_user.id,
        proveedor_id=proveedor_id,
        monto=payload.monto,
        moneda=payload.moneda,
        descripcion=payload.descripcion,
        fecha_vencimiento=payload.fecha_vencimiento,
        pagado=False,
    )
    db.add(cuenta)
    await db.commit()
    await db.refresh(cuenta)
    return cuenta


@router.patch("/cuentas/{cuenta_id}/pagar", response_model=CuentaPagarRead)
async def marcar_pagada(
    cuenta_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CuentaPagar:
    cuenta = await _get_own_cuenta(cuenta_id, current_user.id, db)
    cuenta.pagado = True
    await db.commit()
    await db.refresh(cuenta)
    return cuenta
