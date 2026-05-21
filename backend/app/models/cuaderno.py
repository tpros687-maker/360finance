from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class NotaCuaderno(Base):
    __tablename__ = "notas_cuaderno"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    potrero_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("potreros.id", ondelete="SET NULL"), nullable=True, index=True
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TareaCuaderno(Base):
    __tablename__ = "tareas_cuaderno"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    potrero_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("potreros.id", ondelete="SET NULL"), nullable=True, index=True
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    fecha_planificada: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completada: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notificar_dias_antes: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
