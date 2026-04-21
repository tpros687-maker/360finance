from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    apellido: Mapped[str] = mapped_column(String(100), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    perfil: Mapped[str] = mapped_column(String(20), nullable=False, server_default="productor")
    es_productor: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    es_negocio: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    onboarding_completado: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    nombre_campo: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    departamento: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    moneda: Mapped[str] = mapped_column(String(10), nullable=False, server_default="UYU")
    plan: Mapped[str] = mapped_column(String(20), nullable=False, server_default="trial")
    trial_inicio: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_fin: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    suscripcion_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
