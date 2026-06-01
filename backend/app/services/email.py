"""Servicio de envío de email vía Resend. Cambiar proveedor: solo tocar este módulo."""
import logging
from datetime import date, datetime
from typing import Union

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_RESEND_URL = "https://api.resend.com/emails"


async def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    """Envía un email vía Resend. Nunca propaga excepción."""
    if not settings.RESEND_API_KEY:
        logger.warning("Resend no configurado — saltando email a %s", to)
        return False
    payload: dict = {
        "from": settings.EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _RESEND_URL,
                json=payload,
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            )
            resp.raise_for_status()
        logger.info("Email enviado a %s — %s", to, subject)
        return True
    except Exception:
        logger.exception("Error al enviar email a %s — %s", to, subject)
        return False


_APP_URL = "https://finance.360rural.com"
_LOGO_URL = "https://finance.360rural.com/favicon.png"
_GREEN = "#2d6a4f"
_GREEN_LIGHT = "#b7e4c7"


def _email_layout(subtitle: str, body: str) -> str:
    """Envuelve el contenido en el layout base: header verde con logo + card blanca + footer."""
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#1a1a1a">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <tr>
          <td style="background:{_GREEN};padding:28px 32px;text-align:center">
            <img src="{_LOGO_URL}" alt="360 Agro Finance" height="60" style="display:block;margin:0 auto 12px">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:.5px">360 Agro Finance</h1>
            <p style="margin:6px 0 0;color:{_GREEN_LIGHT};font-size:13px">{subtitle}</p>
          </td>
        </tr>
        <tr><td style="padding:32px">{body}</td></tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;font-size:11px;color:#999;line-height:1.6">
              <a href="{_APP_URL}" style="color:{_GREEN}">{_APP_URL}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _btn(url: str, label: str) -> str:
    return (
        f'<p style="margin:24px 0 0;text-align:center">'
        f'<a href="{url}" style="display:inline-block;background:{_GREEN};color:#ffffff;'
        f'text-decoration:none;padding:13px 30px;border-radius:8px;font-size:15px;font-weight:700">'
        f'{label}</a></p>'
    )


async def send_email_bienvenida(*, to: str, nombre: str, verify_url: str) -> bool:
    body = (
        f'<p style="margin:0 0 8px;font-size:16px">¡Hola <strong>{nombre}</strong>! 👋</p>'
        f'<p style="margin:0 0 20px;font-size:15px;color:#444">Bienvenido a <strong>360 Agro Finance</strong>, '
        f'tu herramienta de gestión para el campo.</p>'
        f'<p style="margin:0 0 8px;font-size:14px;color:#444">Con tu cuenta podés:</p>'
        f'<ul style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#444;line-height:1.9">'
        f'<li>Registrar gastos e ingresos del campo</li>'
        f'<li>Gestionar potreros, franjas y movimientos de ganado</li>'
        f'<li>Consultar reportes financieros y flujo de caja</li>'
        f'<li>Usar el bot de WhatsApp para registrar todo desde el campo</li>'
        f'</ul>'
        f'<p style="margin:0 0 4px;font-size:14px;color:#444">Para activar tu cuenta hacé clic en el botón:</p>'
        f'{_btn(verify_url, "Verificar mi email")}'
        f'<p style="margin:16px 0 0;font-size:12px;color:#999;text-align:center">'
        f'Si no creaste esta cuenta, ignorá este email.</p>'
    )
    return await send_email(
        to=to,
        subject=f"¡Bienvenido a 360 Agro Finance, {nombre}! 🌿",
        html=_email_layout("Tu cuenta está lista", body),
    )


async def send_email_cambio_password(*, to: str, nombre: str, fecha_hora: str) -> bool:
    body = (
        f'<p style="margin:0 0 8px;font-size:16px">Hola <strong>{nombre}</strong>,</p>'
        f'<p style="margin:0 0 20px;font-size:15px;color:#444">'
        f'Tu contraseña fue actualizada correctamente el <strong>{fecha_hora}</strong>.</p>'
        f'<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px">'
        f'<p style="margin:0;font-size:14px;color:#c0392b;font-weight:600">⚠️ ¿No fuiste vos?</p>'
        f'<p style="margin:6px 0 0;font-size:13px;color:#555">'
        f'Si no realizaste este cambio, contactanos de inmediato respondiendo este email '
        f'o accedé a tu cuenta y cambiá la contraseña enseguida.</p>'
        f'</div>'
        f'{_btn(_APP_URL, "Ir a mi cuenta")}'
    )
    return await send_email(
        to=to,
        subject="Tu contraseña fue actualizada — 360 Agro Finance",
        html=_email_layout("Seguridad de cuenta", body),
    )


async def send_email_recuperar_password(*, to: str, nombre: str, reset_url: str) -> bool:
    body = (
        f'<p style="margin:0 0 8px;font-size:16px">Hola <strong>{nombre}</strong>,</p>'
        f'<p style="margin:0 0 20px;font-size:15px;color:#444">'
        f'Recibimos una solicitud para restablecer la contraseña de tu cuenta. '
        f'Hacé clic en el botón para crear una nueva contraseña:</p>'
        f'{_btn(reset_url, "Resetear contraseña")}'
        f'<p style="margin:20px 0 4px;font-size:13px;color:#888;text-align:center">'
        f'⏱ Este link expira en <strong>24 horas</strong>.</p>'
        f'<p style="margin:4px 0 0;font-size:13px;color:#aaa;text-align:center">'
        f'Si no pediste restablecer tu contraseña, podés ignorar este email con total tranquilidad.</p>'
    )
    return await send_email(
        to=to,
        subject="Recuperá tu acceso a 360 Agro Finance",
        html=_email_layout("Recuperación de contraseña", body),
    )


def _fmt_fecha(d: Union[datetime, date, None]) -> str:
    if d is None:
        return "—"
    if isinstance(d, datetime):
        d = d.date()
    return d.strftime("%d/%m/%Y")


async def send_recibo_pago(
    *,
    to: str,
    nombre: str,
    monto: float,
    moneda: str,
    payment_id: str,
    fecha: Union[datetime, date, None],
    vencimiento: Union[datetime, date, None],
) -> bool:
    """Envía recibo de pago simple. No constituye CFE/factura DGI."""
    fecha_str = _fmt_fecha(fecha)
    venc_str = _fmt_fecha(vencimiento)
    monto_str = f"{moneda} ${monto:,.2f}"
    app_url = settings.FRONTEND_URL.rstrip("/")

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#1a1a1a">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:#2d6a4f;padding:28px 32px;text-align:center">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:.5px">360 Agro Finance</h1>
            <p style="margin:6px 0 0;color:#b7e4c7;font-size:13px">Comprobante de pago</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 8px;font-size:16px">Hola <strong>{nombre}</strong>,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#444">Recibimos tu pago correctamente. A continuación el detalle:</p>

            <!-- Tabla detalle -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:14px">
              <tr style="background:#f8fafc">
                <td style="padding:12px 16px;color:#666;width:45%">Concepto</td>
                <td style="padding:12px 16px;font-weight:600">Plan Pro (30 días)</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;color:#666;border-top:1px solid #e2e8f0">Monto</td>
                <td style="padding:12px 16px;font-weight:700;color:#2d6a4f;border-top:1px solid #e2e8f0">{monto_str}</td>
              </tr>
              <tr style="background:#f8fafc">
                <td style="padding:12px 16px;color:#666;border-top:1px solid #e2e8f0">Fecha de pago</td>
                <td style="padding:12px 16px;border-top:1px solid #e2e8f0">{fecha_str}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;color:#666;border-top:1px solid #e2e8f0">Válido hasta</td>
                <td style="padding:12px 16px;font-weight:600;border-top:1px solid #e2e8f0">{venc_str}</td>
              </tr>
              <tr style="background:#f8fafc">
                <td style="padding:12px 16px;color:#666;border-top:1px solid #e2e8f0">Referencia de pago</td>
                <td style="padding:12px 16px;font-family:monospace;font-size:13px;color:#555;border-top:1px solid #e2e8f0">{payment_id}</td>
              </tr>
            </table>

            <p style="margin:24px 0 0;text-align:center">
              <a href="{app_url}" style="display:inline-block;background:#2d6a4f;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">Ir a mi cuenta</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;font-size:11px;color:#999;line-height:1.6">
              Este es un comprobante de pago, no constituye factura electrónica (CFE) de DGI.<br>
              Si tenés preguntas, respondé este correo o visitá <a href="{app_url}" style="color:#2d6a4f">{app_url}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    text = (
        f"360 Agro Finance — Recibo de pago\n"
        f"{'='*40}\n"
        f"Hola {nombre},\n\n"
        f"Recibimos tu pago correctamente.\n\n"
        f"Concepto        : Plan Pro (30 días)\n"
        f"Monto           : {monto_str}\n"
        f"Fecha de pago   : {fecha_str}\n"
        f"Válido hasta    : {venc_str}\n"
        f"Referencia      : {payment_id}\n\n"
        f"Accedé a tu cuenta: {app_url}\n\n"
        f"Este comprobante no constituye factura electrónica (CFE) de DGI."
    )

    return await send_email(
        to=to,
        subject="Recibo de pago — 360 Agro Finance",
        html=html,
        text=text,
    )


async def send_aviso_vencimiento(
    *,
    to: str,
    nombre: str,
    dias: int,
    fecha_venc: Union[datetime, date, None],
) -> bool:
    """Aviso 'tu plan vence en N días'. Para usuarios sin renovación automática."""
    fecha_str = _fmt_fecha(fecha_venc)
    dias_label = f"{dias} día{'s' if dias != 1 else ''}"
    planes_url = f"{settings.FRONTEND_URL.rstrip('/')}/planes"
    app_url = settings.FRONTEND_URL.rstrip("/")

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#1a1a1a">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:#2d6a4f;padding:28px 32px;text-align:center">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:.5px">360 Agro Finance</h1>
            <p style="margin:6px 0 0;color:#b7e4c7;font-size:13px">Aviso de vencimiento</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 8px;font-size:16px">Hola <strong>{nombre}</strong>,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#444">
              Tu plan de 360 Agro Finance vence el <strong>{fecha_str}</strong>
              ({dias_label} restante{'s' if dias != 1 else ''}).
              Renová para no perder el acceso a tus datos del campo.
            </p>

            <p style="margin:0;text-align:center">
              <a href="{planes_url}" style="display:inline-block;background:#2d6a4f;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700">Renovar mi plan</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;font-size:11px;color:#999;line-height:1.6">
              Si ya renovaste, ignorá este mensaje.<br>
              <a href="{app_url}" style="color:#2d6a4f">{app_url}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    text = (
        f"360 Agro Finance — Aviso de vencimiento\n"
        f"{'='*40}\n"
        f"Hola {nombre},\n\n"
        f"Tu plan de 360 Agro Finance vence el {fecha_str} ({dias_label} restante{'s' if dias != 1 else ''}).\n"
        f"Renová para no perder el acceso.\n\n"
        f"Renovar: {planes_url}\n\n"
        f"Si ya renovaste, ignorá este mensaje."
    )

    return await send_email(
        to=to,
        subject=f"Tu plan vence en {dias_label} — 360 Agro Finance",
        html=html,
        text=text,
    )
