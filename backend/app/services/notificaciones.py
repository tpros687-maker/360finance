"""Servicio de notificaciones de tareas por WhatsApp via Twilio."""
import asyncio
import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.cuaderno import TareaCuaderno
from app.models.user import User

logger = logging.getLogger(__name__)


def _send_whatsapp(to_number: str, body: str) -> None:
    """Llama a Twilio de forma síncrona (se ejecuta en thread pool)."""
    from twilio.rest import Client
    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    client.messages.create(
        from_=settings.TWILIO_WHATSAPP_FROM,
        to=f"whatsapp:{to_number}",
        body=body,
    )


async def enviar_notificaciones_tareas(db: AsyncSession) -> None:
    """Envía recordatorios WhatsApp para tareas próximas a vencer."""
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.warning("Twilio no configurado — saltando notificaciones")
        return

    hoy = date.today()

    result = await db.execute(
        select(TareaCuaderno, User)
        .join(User, TareaCuaderno.user_id == User.id)
        .where(
            TareaCuaderno.completada == False,  # noqa: E712
            TareaCuaderno.fecha_planificada.isnot(None),
            User.telefono.isnot(None),
        )
    )
    rows = result.all()

    enviados = 0
    for tarea, user in rows:
        dias_antes = tarea.notificar_dias_antes if tarea.notificar_dias_antes is not None else 1
        if tarea.fecha_planificada - hoy == timedelta(days=dias_antes):
            cuerpo = f"📅 Recordatorio: mañana tenés planificado: {tarea.texto}"
            try:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _send_whatsapp, user.telefono, cuerpo)
                enviados += 1
                logger.info("Notificación enviada a usuario %d, tarea %d", user.id, tarea.id)
            except Exception as exc:
                logger.error(
                    "Error enviando notificación a usuario %d, tarea %d: %s",
                    user.id, tarea.id, exc,
                )

    logger.info(
        "Job notificaciones: %d enviadas, %d tareas evaluadas",
        enviados, len(rows),
    )
