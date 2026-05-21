"""Servicio de notificaciones y resúmenes diarios por WhatsApp via Twilio."""
import asyncio
import logging
from datetime import date, timedelta

from sqlalchemy import func as sqlfunc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.categoria import TipoMovimiento
from app.models.cliente import CuentaCobrar
from app.models.cuaderno import TareaCuaderno
from app.models.registro import Registro
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


async def _usuarios_con_telefono(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).where(User.telefono.isnot(None)))
    return list(result.scalars().all())


# ── Recordatorios de tareas (08:00) ──────────────────────────────────────────

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

    logger.info("Job notificaciones: %d enviadas, %d tareas evaluadas", enviados, len(rows))


# ── Resumen diario (07:00) ────────────────────────────────────────────────────

async def _armar_resumen(user: User, db: AsyncSession) -> str:
    hoy = date.today()
    primer_dia_mes = hoy.replace(day=1)
    en_3_dias = hoy + timedelta(days=3)
    moneda = user.moneda

    # Balance del mes
    gastos_q = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Registro.monto), 0)).where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.gasto,
            Registro.fecha >= primer_dia_mes,
        )
    )
    ingresos_q = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Registro.monto), 0)).where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.ingreso,
            Registro.fecha >= primer_dia_mes,
        )
    )
    total_gastos = float(gastos_q.scalar() or 0)
    total_ingresos = float(ingresos_q.scalar() or 0)
    balance = total_ingresos - total_gastos

    # Cuentas por cobrar vencidas o que vencen hoy
    cobros_q = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(CuentaCobrar.monto), 0),
            sqlfunc.count(CuentaCobrar.id),
        ).where(
            CuentaCobrar.user_id == user.id,
            CuentaCobrar.pagado == False,  # noqa: E712
            CuentaCobrar.fecha_vencimiento.isnot(None),
            CuentaCobrar.fecha_vencimiento <= sqlfunc.current_date(),
        )
    )
    cobros_row = cobros_q.one()
    total_cobros = float(cobros_row[0] or 0)
    n_cobros = int(cobros_row[1] or 0)

    # Tareas para hoy y próximos 3 días
    tareas_q = await db.execute(
        select(TareaCuaderno).where(
            TareaCuaderno.user_id == user.id,
            TareaCuaderno.completada == False,  # noqa: E712
            TareaCuaderno.fecha_planificada.isnot(None),
            TareaCuaderno.fecha_planificada >= hoy,
            TareaCuaderno.fecha_planificada <= en_3_dias,
        ).order_by(TareaCuaderno.fecha_planificada.asc())
    )
    tareas = tareas_q.scalars().all()

    # Armar mensaje
    bal_sign = "+" if balance >= 0 else ""
    lineas = [
        "📊 *Resumen del día — 360 Agro Finance*",
        "",
        f"💰 Balance del mes: {moneda} {bal_sign}${balance:,.2f}",
    ]

    if n_cobros > 0:
        clientes_str = f"{n_cobros} cliente{'s' if n_cobros > 1 else ''}"
        lineas.append(f"⚠️ Cobros vencidos: {moneda} ${total_cobros:,.2f} ({clientes_str})")

    if tareas:
        lineas.append("")
        lineas.append("📅 *Tareas próximas:*")
        for t in tareas:
            if t.fecha_planificada == hoy:
                etiqueta = "Hoy"
            elif t.fecha_planificada == hoy + timedelta(days=1):
                etiqueta = "Mañana"
            else:
                etiqueta = t.fecha_planificada.strftime("%d/%m")
            lineas.append(f"- {etiqueta}: {t.texto}")

    lineas += [
        "",
        "Respondé este mensaje para registrar gastos, notas o consultar datos.",
    ]

    return "\n".join(lineas)


async def enviar_resumen_diario(db: AsyncSession) -> None:
    """Envía el resumen diario a todos los usuarios con teléfono registrado."""
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.warning("Twilio no configurado — saltando resumen diario")
        return

    usuarios = await _usuarios_con_telefono(db)
    loop = asyncio.get_event_loop()
    enviados = 0

    for user in usuarios:
        try:
            cuerpo = await _armar_resumen(user, db)
            await loop.run_in_executor(None, _send_whatsapp, user.telefono, cuerpo)
            enviados += 1
            logger.info("Resumen diario enviado a usuario %d", user.id)
        except Exception as exc:
            logger.error("Error enviando resumen a usuario %d: %s", user.id, exc)

    logger.info("Job resumen diario: %d enviados de %d usuarios", enviados, len(usuarios))
