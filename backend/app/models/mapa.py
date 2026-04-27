from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class TipoPotrero(str):
    agricultura = "agricultura"
    ganaderia = "ganaderia"
    mixto = "mixto"


class EstadoPasto(str):
    bueno = "bueno"
    regular = "regular"
    malo = "malo"


class EspecieAnimal(str):
    bovino = "bovino"
    ovino = "ovino"
    equino = "equino"
    porcino = "porcino"
    otro = "otro"


class TipoPunto(str):
    bebedero = "bebedero"
    casa = "casa"
    sombra = "sombra"
    comedero = "comedero"


class EstadoMovimiento(str):
    programado = "programado"
    ejecutado = "ejecutado"
    cancelado = "cancelado"


class Potrero(Base):
    __tablename__ = "potreros"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    geometria: Mapped[object] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326), nullable=False
    )
    tipo: Mapped[str] = mapped_column(
        SAEnum("agricultura", "ganaderia", "mixto", name="tipopotrero"), nullable=False
    )
    estado_pasto: Mapped[str] = mapped_column(
        SAEnum("bueno", "regular", "malo", name="estadopasto"), nullable=False
    )
    tiene_suplementacion: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    suplementacion_detalle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tiene_franjas: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cantidad_franjas: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    franjas_usadas: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    observaciones: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hectareas: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    en_descanso: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fecha_descanso: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    animales: Mapped[list["Animal"]] = relationship(
        "Animal", back_populates="potrero", cascade="all, delete-orphan", lazy="select"
    )
    puntos_interes: Mapped[list["PuntoInteres"]] = relationship(
        "PuntoInteres", back_populates="potrero", lazy="select"
    )


class Animal(Base):
    __tablename__ = "animales"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    potrero_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    especie: Mapped[str] = mapped_column(String(100), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    raza: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    potrero: Mapped["Potrero"] = relationship("Potrero", back_populates="animales")


class PuntoInteres(Base):
    __tablename__ = "puntos_interes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    potrero_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("potreros.id", ondelete="SET NULL"), nullable=True, index=True
    )
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str] = mapped_column(
        SAEnum("bebedero", "casa", "sombra", "comedero", name="tipopunto"), nullable=False
    )
    geometria: Mapped[object] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    potrero: Mapped[Optional["Potrero"]] = relationship("Potrero", back_populates="puntos_interes")


class MovimientoGanado(Base):
    __tablename__ = "movimientos_ganado"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    potrero_origen_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False, index=True
    )
    potrero_destino_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    especie: Mapped[str] = mapped_column(String(100), nullable=False)
    fecha_programada: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_ejecutada: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    estado: Mapped[str] = mapped_column(
        SAEnum("programado", "ejecutado", "cancelado", name="estadomovimiento"),
        nullable=False,
        default="programado",
    )
    notas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    potrero_origen: Mapped["Potrero"] = relationship(
        "Potrero", foreign_keys=[potrero_origen_id]
    )
    potrero_destino: Mapped["Potrero"] = relationship(
        "Potrero", foreign_keys=[potrero_destino_id]
    )
