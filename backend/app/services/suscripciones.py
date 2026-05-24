"""Recordatorios de vencimiento de plan para usuarios sin renovación automática."""
import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.services.email import send_aviso_vencimiento

logger = logging.getLogger(__name__)


async def enviar_recordatorios_vencimiento(db: AsyncSession) -> None:
    """Avisa por email a usuarios cuyo plan vence en exactamente 3 o 1 días
    y que NO tienen renovación automática (suscripcion_id IS NULL)."""
    if not settings.RESEND_API_KEY:
        logger.warning("Resend no configurado — saltando recordatorios de vencimiento")
        return

    hoy = date.today()

    result = await db.execute(
        select(User).where(
            User.trial_fin.isnot(None),
            User.suscripcion_id.is_(None),
        )
    )
    usuarios = list(result.scalars().all())

    enviados = 0
    for user in usuarios:
        venc = user.trial_fin.date() if hasattr(user.trial_fin, "date") else user.trial_fin
        dias = (venc - hoy).days
        if dias in (3, 1):
            ok = await send_aviso_vencimiento(
                to=user.email,
                nombre=user.nombre,
                dias=dias,
                fecha_venc=user.trial_fin,
            )
            if ok:
                enviados += 1

    logger.info(
        "Job recordatorios vencimiento: %d avisos enviados de %d usuarios",
        enviados,
        len(usuarios),
    )
