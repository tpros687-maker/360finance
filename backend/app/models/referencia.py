from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class ReferenciaProductiva(Base):
    __tablename__ = "referencias_productivas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pais: Mapped[str] = mapped_column(String(20), nullable=False)
    zona: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    actividad: Mapped[str] = mapped_column(String(50), nullable=False)
    anio: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    margen_neto_ha_usd_bajo: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    margen_neto_ha_usd_medio: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    margen_neto_ha_usd_alto: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    fuente: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class CotizacionDiaria(Base):
    __tablename__ = "cotizaciones_diarias"
    __table_args__ = (UniqueConstraint("fecha", name="uq_cotizacion_fecha"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    usd_uyu: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    usd_ars: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    fuente: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)


class RentabilidadCache(Base):
    __tablename__ = "rentabilidad_cache"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "potrero_id", "periodo_desde", "periodo_hasta",
            name="uq_rent_cache",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    potrero_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False, index=True
    )
    periodo_desde: Mapped[date] = mapped_column(Date, nullable=False)
    periodo_hasta: Mapped[date] = mapped_column(Date, nullable=False)
    resultado_json: Mapped[str] = mapped_column(Text, nullable=False)
    calculado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    valido: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
