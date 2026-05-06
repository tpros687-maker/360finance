from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


# ── Shared enums as literals ──────────────────────────────────────────────────

TipoPotrero = str  # "agricultura" | "ganaderia" | "mixto"
EstadoPasto = str  # "bueno" | "regular" | "malo"
EspecieAnimal = str  # "bovino" | "ovino" | "equino" | "porcino" | "otro"
TipoPunto = str  # "bebedero" | "casa" | "sombra" | "comedero"
EstadoMovimiento = str  # "programado" | "ejecutado" | "cancelado"


# ── Potrero ───────────────────────────────────────────────────────────────────

class PotreroCreate(BaseModel):
    nombre: str
    geometria: dict[str, Any]  # GeoJSON Polygon
    tipo: str
    estado_pasto: str
    hectareas: Optional[Decimal] = None
    tiene_suplementacion: bool = False
    suplementacion_detalle: Optional[str] = None
    tiene_franjas: bool = False
    cantidad_franjas: Optional[int] = None
    franjas_usadas: Optional[int] = None
    dias_por_franja: Optional[int] = None
    observaciones: Optional[str] = None
    cultivo: Optional[str] = None
    es_primera: Optional[bool] = None
    fecha_siembra: Optional[date] = None
    coneat: Optional[Decimal] = None
    kg_producidos_anio: Optional[Decimal] = None


class PotreroUpdate(BaseModel):
    nombre: Optional[str] = None
    geometria: Optional[dict[str, Any]] = None
    tipo: Optional[str] = None
    estado_pasto: Optional[str] = None
    hectareas: Optional[Decimal] = None
    tiene_suplementacion: Optional[bool] = None
    suplementacion_detalle: Optional[str] = None
    tiene_franjas: Optional[bool] = None
    cantidad_franjas: Optional[int] = None
    franjas_usadas: Optional[int] = None
    dias_por_franja: Optional[int] = None
    observaciones: Optional[str] = None
    cultivo: Optional[str] = None
    es_primera: Optional[bool] = None
    fecha_siembra: Optional[date] = None
    coneat: Optional[Decimal] = None
    kg_producidos_anio: Optional[Decimal] = None


class PotreroRead(BaseModel):
    id: int
    user_id: int
    nombre: str
    geometria: dict[str, Any]  # GeoJSON
    tipo: str
    estado_pasto: str
    hectareas: Optional[Decimal]
    tiene_suplementacion: bool
    suplementacion_detalle: Optional[str]
    tiene_franjas: bool
    cantidad_franjas: Optional[int]
    franjas_usadas: Optional[int]
    dias_por_franja: Optional[int]
    observaciones: Optional[str]
    en_descanso: bool
    fecha_descanso: Optional[date]
    cultivo: Optional[str] = None
    es_primera: Optional[bool] = None
    fecha_siembra: Optional[date] = None
    coneat: Optional[Decimal] = None
    kg_producidos_anio: Optional[Decimal] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Animal ────────────────────────────────────────────────────────────────────

class AnimalCreate(BaseModel):
    especie: str
    cantidad: int
    raza: Optional[str] = None


class AnimalUpdate(BaseModel):
    especie: Optional[str] = None
    cantidad: Optional[int] = None
    raza: Optional[str] = None


class AnimalRead(BaseModel):
    id: int
    potrero_id: int
    user_id: int
    especie: str
    cantidad: int
    raza: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── PuntoInteres ──────────────────────────────────────────────────────────────

class PuntoInteresCreate(BaseModel):
    nombre: str
    tipo: str
    geometria: dict[str, Any]  # GeoJSON Point
    potrero_id: Optional[int] = None


class PuntoInteresRead(BaseModel):
    id: int
    user_id: int
    potrero_id: Optional[int]
    nombre: str
    tipo: str
    geometria: dict[str, Any]  # GeoJSON Point
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── MovimientoGanado ──────────────────────────────────────────────────────────

class MovimientoCreate(BaseModel):
    potrero_origen_id: int
    potrero_destino_id: int
    cantidad: int
    especie: str
    fecha_programada: date
    ejecutar_ahora: bool = False
    notas: Optional[str] = None


class MovimientoRead(BaseModel):
    id: int
    user_id: int
    potrero_origen_id: int
    potrero_destino_id: int
    potrero_origen_nombre: str
    potrero_destino_nombre: str
    cantidad: int
    especie: str
    fecha_programada: date
    fecha_ejecutada: Optional[date]
    estado: str
    notas: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── AplicacionPotrero ─────────────────────────────────────────────────────────

class AplicacionCreate(BaseModel):
    producto: str
    fecha_aplicacion: date
    costo: Optional[Decimal] = None
    moneda: str = "UYU"
    observaciones: Optional[str] = None


class AplicacionRead(BaseModel):
    id: int
    potrero_id: int
    producto: str
    fecha_aplicacion: date
    costo: Optional[Decimal]
    moneda: str
    observaciones: Optional[str]
    registro_id: Optional[int]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Rentabilidad ──────────────────────────────────────────────────────────────

class RentabilidadPotrero(BaseModel):
    potrero_id: int
    nombre: str
    hectareas: Optional[Decimal]
    total_ingresos: Decimal
    total_gastos: Decimal
    balance: Decimal
    rentabilidad_pct: Optional[Decimal]
    cantidad_animales: int
    margen_bruto_ha: Optional[Decimal]
    carga_animal_ug_ha: Optional[Decimal]
    produccion_kg_ha: Optional[Decimal]
    coneat: Optional[Decimal] = None
