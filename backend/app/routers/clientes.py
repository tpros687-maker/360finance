from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.cliente import Cliente, CuentaCobrar
from app.models.user import User

router = APIRouter(prefix="/clientes", tags=["clientes"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ClienteCreate(BaseModel):
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


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    notas: Optional[str] = None


class ClienteRead(BaseModel):
    id: int
    user_id: int
    nombre: str
    telefono: Optional[str]
    email: Optional[str]
    notas: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class CuentaCobrarCreate(BaseModel):
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


class CuentaCobrarRead(BaseModel):
    id: int
    user_id: int
    cliente_id: int
    monto: float
    moneda: str
    descripcion: Optional[str]
    fecha_vencimiento: Optional[datetime]
    pagado: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_own_cliente(cliente_id: int, user_id: int, db: AsyncSession) -> Cliente:
    result = await db.execute(select(Cliente).where(Cliente.id == cliente_id))
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    if cliente.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos sobre este cliente")
    return cliente


async def _get_own_cuenta(cuenta_id: int, user_id: int, db: AsyncSession) -> CuentaCobrar:
    result = await db.execute(select(CuentaCobrar).where(CuentaCobrar.id == cuenta_id))
    cuenta = result.scalar_one_or_none()
    if cuenta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta por cobrar no encontrada")
    if cuenta.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos sobre esta cuenta")
    return cuenta


# ── Clientes CRUD ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[ClienteRead])
async def list_clientes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Cliente]:
    result = await db.execute(
        select(Cliente)
        .where(Cliente.user_id == current_user.id)
        .order_by(Cliente.nombre)
    )
    return list(result.scalars().all())


@router.post("", response_model=ClienteRead, status_code=status.HTTP_201_CREATED)
async def create_cliente(
    payload: ClienteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Cliente:
    cliente = Cliente(
        user_id=current_user.id,
        nombre=payload.nombre,
        telefono=payload.telefono,
        email=payload.email,
        notas=payload.notas,
    )
    db.add(cliente)
    await db.commit()
    await db.refresh(cliente)
    return cliente


@router.put("/{cliente_id}", response_model=ClienteRead)
async def update_cliente(
    cliente_id: int,
    payload: ClienteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Cliente:
    cliente = await _get_own_cliente(cliente_id, current_user.id, db)
    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
        cliente.nombre = nombre
    if payload.telefono is not None:
        cliente.telefono = payload.telefono
    if payload.email is not None:
        cliente.email = payload.email
    if payload.notas is not None:
        cliente.notas = payload.notas
    await db.commit()
    await db.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cliente(
    cliente_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    cliente = await _get_own_cliente(cliente_id, current_user.id, db)
    await db.delete(cliente)
    await db.commit()


# ── Cuentas por cobrar ────────────────────────────────────────────────────────

@router.get("/{cliente_id}/cuentas", response_model=list[CuentaCobrarRead])
async def list_cuentas(
    cliente_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CuentaCobrar]:
    await _get_own_cliente(cliente_id, current_user.id, db)
    result = await db.execute(
        select(CuentaCobrar)
        .where(CuentaCobrar.cliente_id == cliente_id)
        .order_by(CuentaCobrar.fecha_vencimiento.asc().nulls_last(), CuentaCobrar.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{cliente_id}/cuentas", response_model=CuentaCobrarRead, status_code=status.HTTP_201_CREATED)
async def create_cuenta(
    cliente_id: int,
    payload: CuentaCobrarCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CuentaCobrar:
    await _get_own_cliente(cliente_id, current_user.id, db)
    cuenta = CuentaCobrar(
        user_id=current_user.id,
        cliente_id=cliente_id,
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


@router.patch("/cuentas/{cuenta_id}/pagar", response_model=CuentaCobrarRead)
async def marcar_pagada(
    cuenta_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CuentaCobrar:
    cuenta = await _get_own_cuenta(cuenta_id, current_user.id, db)
    cuenta.pagado = True
    await db.commit()
    await db.refresh(cuenta)
    return cuenta
