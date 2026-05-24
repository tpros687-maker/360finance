"""Servicio de envío de email vía Resend. Cambiar proveedor: solo tocar este módulo."""
import asyncio
import logging

from app.config import settings

logger = logging.getLogger(__name__)


def _send_email_sync(to: str, subject: str, html: str, text: str | None = None) -> None:
    if not settings.RESEND_API_KEY:
        logger.warning("Resend no configurado — saltando email a %s", to)
        return
    import resend  # importación diferida para no fallar si el paquete no está instalado
    resend.api_key = settings.RESEND_API_KEY
    params: dict = {
        "from": settings.EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        params["text"] = text
    if settings.EMAIL_REPLY_TO:
        params["reply_to"] = settings.EMAIL_REPLY_TO
    resend.Emails.send(params)


async def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    """Envía un email sin bloquear el event loop. Nunca propaga excepción."""
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, _send_email_sync, to, subject, html, text)
        logger.info("Email enviado a %s — %s", to, subject)
        return True
    except Exception:
        logger.exception("Error al enviar email a %s — %s", to, subject)
        return False
