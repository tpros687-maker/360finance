from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    nombre: str
    apellido: str
    password: str
    perfil: str = "productor"

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v

    @field_validator("nombre", "apellido")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El campo no puede estar vacío")
        return v

    @field_validator("perfil")
    @classmethod
    def perfil_valido(cls, v: str) -> str:
        if v not in ("productor", "negocio"):
            raise ValueError("Perfil debe ser 'productor' o 'negocio'")
        return v


class UserRead(BaseModel):
    id: int
    email: str
    nombre: str
    apellido: str
    perfil: str
    es_productor: bool
    es_negocio: bool
    onboarding_completado: bool
    nombre_campo: Optional[str]
    departamento: Optional[str]
    moneda: str
    plan: str
    trial_inicio: Optional[datetime]
    trial_fin: Optional[datetime]
    suscripcion_id: Optional[str]
    created_at: datetime
    dias_restantes: Optional[int] = None
    vencido: bool = False

    model_config = {"from_attributes": True}


class PlanRead(BaseModel):
    plan: str
    trial_inicio: Optional[datetime]
    trial_fin: Optional[datetime]
    dias_restantes: Optional[int]
    vencido: bool


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class OnboardingRequest(BaseModel):
    es_productor: bool = True
    es_negocio: bool = True
    nombre_campo: Optional[str] = None
    departamento: Optional[str] = None
    moneda: str = "UYU"

    @field_validator("moneda")
    @classmethod
    def moneda_valida(cls, v: str) -> str:
        if v not in ("UYU", "USD"):
            raise ValueError("Moneda debe ser 'UYU' o 'USD'")
        return v
