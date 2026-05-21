"""Servicio de notificaciones y resúmenes diarios por WhatsApp via Twilio."""
import asyncio
import logging
from datetime import date, timedelta
from calendar import monthrange

from sqlalchemy import func as sqlfunc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.categoria import Categoria, TipoMovimiento
from app.models.cliente import CuentaCobrar, CuentaPagar
from app.models.cuaderno import NotaCuaderno, TareaCuaderno
from app.models.registro import Registro
from app.models.resumen_mensual import ResumenMensual
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


# ── Resumen mensual (1° de cada mes, 09:00) ───────────────────────────────────

async def _generar_resumen_mensual(user: User, year: int, month: int, db: AsyncSession) -> ResumenMensual:
    """Calcula y persiste el ResumenMensual de un usuario para el año/mes dados."""
    primer_dia = date(year, month, 1)
    ultimo_dia = date(year, month, monthrange(year, month)[1])

    # Ingresos y gastos
    def _suma(tipo: TipoMovimiento):
        return (
            select(sqlfunc.coalesce(sqlfunc.sum(Registro.monto), 0))
            .where(
                Registro.user_id == user.id,
                Registro.tipo == tipo,
                Registro.fecha >= primer_dia,
                Registro.fecha <= ultimo_dia,
            )
        )

    ingresos_q = await db.execute(_suma(TipoMovimiento.ingreso))
    gastos_q = await db.execute(_suma(TipoMovimiento.gasto))
    total_ingresos = float(ingresos_q.scalar() or 0)
    total_gastos = float(gastos_q.scalar() or 0)

    # Cobros del mes
    cobros_cobrados_q = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(CuentaCobrar.monto), 0)).where(
            CuentaCobrar.user_id == user.id,
            CuentaCobrar.pagado == True,  # noqa: E712
        )
    )
    cobros_pendientes_q = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(CuentaCobrar.monto), 0)).where(
            CuentaCobrar.user_id == user.id,
            CuentaCobrar.pagado == False,  # noqa: E712
        )
    )
    pagos_pagados_q = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(CuentaPagar.monto), 0)).where(
            CuentaPagar.user_id == user.id,
            CuentaPagar.pagado == True,  # noqa: E712
        )
    )
    pagos_pendientes_q = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(CuentaPagar.monto), 0)).where(
            CuentaPagar.user_id == user.id,
            CuentaPagar.pagado == False,  # noqa: E712
        )
    )

    # Cuaderno del mes
    notas_q = await db.execute(
        select(sqlfunc.count(NotaCuaderno.id)).where(
            NotaCuaderno.user_id == user.id,
            sqlfunc.date(NotaCuaderno.created_at) >= primer_dia,
            sqlfunc.date(NotaCuaderno.created_at) <= ultimo_dia,
        )
    )
    tareas_creadas_q = await db.execute(
        select(sqlfunc.count(TareaCuaderno.id)).where(
            TareaCuaderno.user_id == user.id,
            sqlfunc.date(TareaCuaderno.created_at) >= primer_dia,
            sqlfunc.date(TareaCuaderno.created_at) <= ultimo_dia,
        )
    )
    tareas_completadas_q = await db.execute(
        select(sqlfunc.count(TareaCuaderno.id)).where(
            TareaCuaderno.user_id == user.id,
            TareaCuaderno.completada == True,  # noqa: E712
            sqlfunc.date(TareaCuaderno.created_at) >= primer_dia,
            sqlfunc.date(TareaCuaderno.created_at) <= ultimo_dia,
        )
    )

    # Categoría top de gasto
    top_gasto_q = await db.execute(
        select(Categoria.nombre, sqlfunc.sum(Registro.monto).label("total"))
        .join(Categoria, Registro.categoria_id == Categoria.id)
        .where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.gasto,
            Registro.fecha >= primer_dia,
            Registro.fecha <= ultimo_dia,
        )
        .group_by(Categoria.nombre)
        .order_by(sqlfunc.sum(Registro.monto).desc())
        .limit(1)
    )
    top_gasto_row = top_gasto_q.first()

    # Categoría top de ingreso
    top_ingreso_q = await db.execute(
        select(Categoria.nombre, sqlfunc.sum(Registro.monto).label("total"))
        .join(Categoria, Registro.categoria_id == Categoria.id)
        .where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.ingreso,
            Registro.fecha >= primer_dia,
            Registro.fecha <= ultimo_dia,
        )
        .group_by(Categoria.nombre)
        .order_by(sqlfunc.sum(Registro.monto).desc())
        .limit(1)
    )
    top_ingreso_row = top_ingreso_q.first()

    resumen = ResumenMensual(
        user_id=user.id,
        year=year,
        month=month,
        total_ingresos=total_ingresos,
        total_gastos=total_gastos,
        balance=total_ingresos - total_gastos,
        cobros_cobrados=float(cobros_cobrados_q.scalar() or 0),
        cobros_pendientes=float(cobros_pendientes_q.scalar() or 0),
        pagos_pagados=float(pagos_pagados_q.scalar() or 0),
        pagos_pendientes=float(pagos_pendientes_q.scalar() or 0),
        notas_count=int(notas_q.scalar() or 0),
        tareas_creadas=int(tareas_creadas_q.scalar() or 0),
        tareas_completadas=int(tareas_completadas_q.scalar() or 0),
        categoria_top_gasto=top_gasto_row[0] if top_gasto_row else None,
        monto_top_gasto=float(top_gasto_row[1]) if top_gasto_row else None,
        categoria_top_ingreso=top_ingreso_row[0] if top_ingreso_row else None,
        monto_top_ingreso=float(top_ingreso_row[1]) if top_ingreso_row else None,
    )

    # Upsert — si ya existe para ese mes, actualizarlo
    existing_q = await db.execute(
        select(ResumenMensual).where(
            ResumenMensual.user_id == user.id,
            ResumenMensual.year == year,
            ResumenMensual.month == month,
        )
    )
    existing = existing_q.scalar_one_or_none()
    if existing:
        for field in [
            "total_ingresos", "total_gastos", "balance",
            "cobros_cobrados", "cobros_pendientes", "pagos_pagados", "pagos_pendientes",
            "notas_count", "tareas_creadas", "tareas_completadas",
            "categoria_top_gasto", "monto_top_gasto", "categoria_top_ingreso", "monto_top_ingreso",
        ]:
            setattr(existing, field, getattr(resumen, field))
        await db.commit()
        return existing

    db.add(resumen)
    await db.commit()
    await db.refresh(resumen)
    return resumen


_MESES = [
    "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


async def generar_resumenes_mensuales(db: AsyncSession) -> None:
    """
    Job del 1° de cada mes — genera el resumen del mes anterior
    y envía WhatsApp a cada usuario con teléfono.
    """
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.warning("Twilio no configurado — saltando resumen mensual")
        return

    hoy = date.today()
    # Mes anterior
    primer_dia_mes_actual = hoy.replace(day=1)
    ultimo_mes = primer_dia_mes_actual - timedelta(days=1)
    year, month = ultimo_mes.year, ultimo_mes.month
    nombre_mes = _MESES[month]

    usuarios = await _usuarios_con_telefono(db)
    loop = asyncio.get_event_loop()
    enviados = 0

    for user in usuarios:
        try:
            r = await _generar_resumen_mensual(user, year, month, db)
            moneda = user.moneda
            bal_sign = "+" if r.balance >= 0 else ""
            frontend_url = settings.FRONTEND_URL.rstrip("/")

            cuerpo_lineas = [
                f"📊 *Resumen financiero — {nombre_mes} {year}*",
                f"Hola {user.nombre}, acá está tu cierre del mes:",
                "",
                f"💰 Ingresos:  {moneda} ${r.total_ingresos:,.2f}",
                f"💸 Gastos:    {moneda} ${r.total_gastos:,.2f}",
                f"📈 Balance:   {moneda} {bal_sign}${r.balance:,.2f}",
            ]

            if r.categoria_top_gasto:
                cuerpo_lineas.append(f"🔺 Mayor gasto: {r.categoria_top_gasto} (${r.monto_top_gasto:,.2f})")
            if r.categoria_top_ingreso:
                cuerpo_lineas.append(f"🟢 Mayor ingreso: {r.categoria_top_ingreso} (${r.monto_top_ingreso:,.2f})")
            if r.cobros_pendientes > 0:
                cuerpo_lineas.append(f"⚠️ Cobros pendientes: {moneda} ${r.cobros_pendientes:,.2f}")
            if r.pagos_pendientes > 0:
                cuerpo_lineas.append(f"⚠️ Pagos pendientes: {moneda} ${r.pagos_pendientes:,.2f}")

            cuerpo_lineas += [
                "",
                f"📋 Notas: {r.notas_count} · Tareas: {r.tareas_creadas} creadas, {r.tareas_completadas} completadas",
                "",
                f"Ver historial completo: {frontend_url}/resumenes",
            ]

            cuerpo = "\n".join(cuerpo_lineas)
            await loop.run_in_executor(None, _send_whatsapp, user.telefono, cuerpo)
            enviados += 1
            logger.info("Resumen mensual enviado a usuario %d (%s %d)", user.id, nombre_mes, year)
        except Exception as exc:
            logger.error("Error generando/enviando resumen mensual a usuario %d: %s", user.id, exc)

    logger.info("Job resumen mensual: %d enviados de %d usuarios", enviados, len(usuarios))
