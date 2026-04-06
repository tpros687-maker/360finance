import enum
from typing import Optional
from sqlalchemy import String, Boolean, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TipoMovimiento(str, enum.Enum):
    gasto = "gasto"
    ingreso = "ingreso"


class Categoria(Base):
    __tablename__ = "categorias"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    tipo: Mapped[TipoMovimiento] = mapped_column(
        SAEnum(TipoMovimiento, name="tipomovimiento"), nullable=False
    )
    es_personalizada: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    color: Mapped[str] = mapped_column(String(7), default="#6b7280", nullable=False)

    registros: Mapped[list["Registro"]] = relationship(  # type: ignore[name-defined]
        "Registro", back_populates="categoria", lazy="select"
    )
