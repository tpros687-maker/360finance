from typing import Optional
from datetime import datetime
from sqlalchemy import Integer, ForeignKey, String, Text, Numeric, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.database import Base


class Producto(Base):
    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)  # "producto" o "servicio"
    precio: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, server_default="UYU")
    stock: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
