from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.categoria import TipoMovimiento


# ── Categorías ──────────────────────────────────────────────────────────────

class CategoriaRead(BaseModel):
    id: int
    nombre: str
    tipo: TipoMovimiento
    es_personalizada: bool
    user_id: Optional[int]
    color: str

    model_config = {"from_attributes": True}


class CategoriaCreate(BaseModel):
    nombre: str
    tipo: TipoMovimiento
    color: str = "#6b7280"

    @field_validator("nombre")
    @classmethod
    def nombre_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El nombre no puede estar vacío")
        return v

    @field_validator("color")
    @classmethod
    def color_hex(cls, v: str) -> str:
        if not v.startswith("#") or len(v) not in (4, 7):
            raise ValueError("El color debe ser un valor hex (#RGB o #RRGGBB)")
        return v


# ── Potrero simple (para embeber en RegistroRead) ────────────────────────────

class PotreroSimpleRead(BaseModel):
    id: int
    nombre: str

    model_config = {"from_attributes": True}


# ── Registros ────────────────────────────────────────────────────────────────

class RegistroCreate(BaseModel):
    categoria_id: int
    tipo: TipoMovimiento
    monto: Decimal
    moneda: str = "UYU"
    fecha: date
    descripcion: Optional[str] = None
    comprobante_url: Optional[str] = None
    potrero_id: Optional[int] = None
    tipo_imputacion: Optional[str] = None
    actividad_tipo: Optional[str] = None
    actividad_id: Optional[int] = None

    @field_validator("monto")
    @classmethod
    def monto_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("El monto debe ser mayor a cero")
        return v


class RegistroUpdate(BaseModel):
    categoria_id: Optional[int] = None
    tipo: Optional[TipoMovimiento] = None
    monto: Optional[Decimal] = None
    moneda: Optional[str] = None
    fecha: Optional[date] = None
    descripcion: Optional[str] = None
    comprobante_url: Optional[str] = None
    potrero_id: Optional[int] = None
    tipo_imputacion: Optional[str] = None
    actividad_tipo: Optional[str] = None
    actividad_id: Optional[int] = None

    @field_validator("monto")
    @classmethod
    def monto_positive(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v <= 0:
            raise ValueError("El monto debe ser mayor a cero")
        return v


class RegistroRead(BaseModel):
    id: int
    user_id: int
    categoria_id: int
    categoria: CategoriaRead
    potrero_id: Optional[int]
    potrero: Optional[PotreroSimpleRead]
    tipo: TipoMovimiento
    monto: Decimal
    moneda: str
    fecha: date
    descripcion: Optional[str]
    comprobante_url: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedRegistros(BaseModel):
    items: list[RegistroRead]
    total: int
    page: int
    limit: int
    pages: int


# ── Resumen ──────────────────────────────────────────────────────────────────

class ResumenCategoria(BaseModel):
    categoria_id: int
    nombre: str
    tipo: TipoMovimiento
    color: str
    total: Decimal


class ResumenMes(BaseModel):
    mes: str  # "YYYY-MM"
    gastos: Decimal
    ingresos: Decimal


class ResumenResponse(BaseModel):
    total_gastos: Decimal
    total_ingresos: Decimal
    balance: Decimal
    por_categoria: list[ResumenCategoria]
    por_mes: list[ResumenMes]


# ── Extracción de comprobante ─────────────────────────────────────────────────

class ExtraerComprobanteResponse(BaseModel):
    monto: Optional[float]
    proveedor: Optional[str]
    fecha: Optional[str]
    descripcion: Optional[str]
    categoria_sugerida: Optional[str]
    confianza: str  # "alta" | "media" | "baja"
