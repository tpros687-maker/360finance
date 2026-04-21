from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, ForeignKey, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    telefono: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    cuentas: Mapped[list["CuentaCobrar"]] = relationship(
        "CuentaCobrar", back_populates="cliente", cascade="all, delete-orphan"
    )


class CuentaCobrar(Base):
    __tablename__ = "cuentas_cobrar"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cliente_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    monto: Mapped[float] = mapped_column(nullable=False)
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, server_default="UYU")
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fecha_vencimiento: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pagado: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    cliente: Mapped["Cliente"] = relationship("Cliente", back_populates="cuentas")


class Proveedor(Base):
    __tablename__ = "proveedores"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    telefono: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    cuentas_pagar: Mapped[list["CuentaPagar"]] = relationship(
        "CuentaPagar", back_populates="proveedor", cascade="all, delete-orphan"
    )


class CuentaPagar(Base):
    __tablename__ = "cuentas_pagar"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    proveedor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("proveedores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    monto: Mapped[float] = mapped_column(nullable=False)
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, server_default="UYU")
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fecha_vencimiento: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pagado: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    proveedor: Mapped["Proveedor"] = relationship("Proveedor", back_populates="cuentas_pagar")
