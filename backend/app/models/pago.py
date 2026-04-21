from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, ForeignKey, String, Numeric, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.database import Base


class PagoHistorial(Base):
    __tablename__ = "pagos_historial"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    monto: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, server_default="USD")
    estado: Mapped[str] = mapped_column(String(30), nullable=False)  # approved / pending / rejected
    mp_payment_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
