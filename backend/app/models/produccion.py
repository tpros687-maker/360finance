from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LoteGanado(Base):
    """Registra entrada y salida de un lote de animales en un potrero.
    Permite calcular kg producidos y GDP real."""
    __tablename__ = "lotes_ganado"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    potrero_id: Mapped[int] = mapped_column(Integer, ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False)
    especie: Mapped[str] = mapped_column(String(100), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha_entrada: Mapped[date] = mapped_column(Date, nullable=False)
    peso_entrada_kg: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    fecha_salida: Mapped[date | None] = mapped_column(Date, nullable=True)
    peso_salida_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)


class EventoReproductivo(Base):
    """Tactos, pariciones y otros eventos reproductivos."""
    __tablename__ = "eventos_reproductivos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    potrero_id: Mapped[int] = mapped_column(Integer, ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    vientres_totales: Mapped[int] = mapped_column(Integer, nullable=False)
    resultado: Mapped[int] = mapped_column(Integer, nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)


class CicloAgricola(Base):
    """Un ciclo completo de un cultivo: desde siembra hasta cosecha."""
    __tablename__ = "ciclos_agricolas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    potrero_id: Mapped[int] = mapped_column(Integer, ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False)
    zafra: Mapped[str] = mapped_column(String(20), nullable=False)
    cultivo: Mapped[str] = mapped_column(String(100), nullable=False)
    fecha_siembra: Mapped[date | None] = mapped_column(Date, nullable=True)
    fecha_cosecha: Mapped[date | None] = mapped_column(Date, nullable=True)
    toneladas_cosechadas: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    precio_venta_tn: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
