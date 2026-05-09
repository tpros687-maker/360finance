from datetime import date
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Lote(Base):
    __tablename__ = "lotes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    potrero_id: Mapped[int] = mapped_column(Integer, ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False)
    categoria: Mapped[str] = mapped_column(String(50), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha_entrada: Mapped[date] = mapped_column(Date, nullable=False)
    peso_total_entrada_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    precio_kg_compra: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    lote_padre_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("lotes.id"), nullable=True)
    cerrado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)


class MovimientoLote(Base):
    __tablename__ = "movimientos_lote"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lote_id: Mapped[int] = mapped_column(Integer, ForeignKey("lotes.id", ondelete="CASCADE"), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    potrero_origen_id: Mapped[int] = mapped_column(Integer, ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False)
    potrero_destino_id: Mapped[int] = mapped_column(Integer, ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)


class DivisionLote(Base):
    __tablename__ = "divisiones_lote"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lote_padre_id: Mapped[int] = mapped_column(Integer, ForeignKey("lotes.id", ondelete="CASCADE"), nullable=False)
    lote_hijo_id: Mapped[int] = mapped_column(Integer, ForeignKey("lotes.id", ondelete="CASCADE"), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    cantidad_separada: Mapped[int] = mapped_column(Integer, nullable=False)
    motivo: Mapped[str | None] = mapped_column(String(100), nullable=True)


class VentaLote(Base):
    __tablename__ = "ventas_lote"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lote_id: Mapped[int] = mapped_column(Integer, ForeignKey("lotes.id", ondelete="CASCADE"), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    cantidad_vendida: Mapped[int] = mapped_column(Integer, nullable=False)
    peso_total_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    precio_kg: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)


class EventoReproductivo(Base):
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
