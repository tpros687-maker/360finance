"""Modelo para resúmenes financieros mensuales generados automáticamente."""
from datetime import datetime

from sqlalchemy import (
    Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class ResumenMensual(Base):
    __tablename__ = "resumenes_mensuales"
    __table_args__ = (
        UniqueConstraint("user_id", "year", "month", name="uq_resumen_user_mes"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)   # 1–12

    # Financiero
    total_ingresos = Column(Float, default=0.0, nullable=False)
    total_gastos = Column(Float, default=0.0, nullable=False)
    balance = Column(Float, default=0.0, nullable=False)

    # Cobros / pagos
    cobros_cobrados = Column(Float, default=0.0, nullable=False)
    cobros_pendientes = Column(Float, default=0.0, nullable=False)
    pagos_pagados = Column(Float, default=0.0, nullable=False)
    pagos_pendientes = Column(Float, default=0.0, nullable=False)

    # Cuaderno
    notas_count = Column(Integer, default=0, nullable=False)
    tareas_creadas = Column(Integer, default=0, nullable=False)
    tareas_completadas = Column(Integer, default=0, nullable=False)

    # Categoría con más gasto ese mes (nombre)
    categoria_top_gasto = Column(String, nullable=True)
    monto_top_gasto = Column(Float, nullable=True)

    # Categoría con más ingreso ese mes (nombre)
    categoria_top_ingreso = Column(String, nullable=True)
    monto_top_ingreso = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="resumenes_mensuales")
