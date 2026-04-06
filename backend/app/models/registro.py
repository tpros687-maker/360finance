from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.categoria import TipoMovimiento


class Registro(Base):
    __tablename__ = "registros"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    categoria_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("categorias.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    potrero_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("potreros.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tipo: Mapped[TipoMovimiento] = mapped_column(
        SAEnum(TipoMovimiento, name="tipomovimiento"), nullable=False
    )
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comprobante_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    categoria: Mapped["Categoria"] = relationship(  # type: ignore[name-defined]
        "Categoria", back_populates="registros", lazy="joined"
    )
    potrero: Mapped[Optional["Potrero"]] = relationship(  # type: ignore[name-defined]
        "Potrero", lazy="joined", foreign_keys=[potrero_id]
    )
