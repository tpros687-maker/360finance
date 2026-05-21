"""Webhook de WhatsApp via Twilio — recibe mensajes y los procesa con IA."""
import base64
import json
import logging
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Form
from fastapi.responses import Response
from sqlalchemy import func as sqlfunc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.categoria import Categoria, TipoMovimiento
from app.models.cliente import Cliente, CuentaCobrar, Proveedor, CuentaPagar
from app.models.cuaderno import NotaCuaderno, TareaCuaderno
from app.models.registro import Registro
from app.models.user import User
from app.services.notificaciones import _armar_resumen
from groq import Groq

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


def _twiml(mensaje: str) -> Response:
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>{mensaje}</Message>
</Response>"""
    return Response(content=xml, media_type="application/xml")


def _groq_client() -> Groq:
    return Groq(api_key=settings.GROQ_API_KEY)


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _parse_monto(raw) -> Decimal | None:
    try:
        m = Decimal(str(raw)).quantize(Decimal("0.01"))
        return m if m > 0 else None
    except (InvalidOperation, ValueError, TypeError):
        return None


# ── Categorías ────────────────────────────────────────────────────────────────

async def _cargar_categorias(
    db: AsyncSession, user_id: int, tipo: TipoMovimiento
) -> list[Categoria]:
    result = await db.execute(
        select(Categoria)
        .where(
            Categoria.tipo == tipo,
            or_(Categoria.user_id == user_id, Categoria.user_id.is_(None)),
        )
        .order_by(Categoria.nombre)
    )
    return list(result.scalars().all())


async def _resolver_categoria(
    db: AsyncSession,
    user_id: int,
    tipo: TipoMovimiento,
    nombre_sugerido: str | None,
    categorias: list[Categoria],
) -> Categoria:
    if nombre_sugerido:
        lower = nombre_sugerido.lower().strip()
        for cat in categorias:
            if cat.nombre.lower() == lower:
                return cat
    for cat in categorias:
        if cat.nombre.lower() == "otros":
            return cat
    cat = Categoria(nombre="Otros", tipo=tipo, es_personalizada=True, user_id=user_id, color="#6b7280")
    db.add(cat)
    await db.flush()
    return cat


# ── Clientes / Proveedores ────────────────────────────────────────────────────

async def _get_or_create_cliente(db: AsyncSession, user_id: int, nombre: str) -> Cliente:
    result = await db.execute(
        select(Cliente).where(
            Cliente.user_id == user_id,
            sqlfunc.lower(Cliente.nombre) == nombre.lower().strip(),
        )
    )
    cliente = result.scalar_one_or_none()
    if cliente is None:
        cliente = Cliente(user_id=user_id, nombre=nombre.strip())
        db.add(cliente)
        await db.flush()
    return cliente


async def _marcar_cuenta_pagada(
    db: AsyncSession, user_id: int, nombre: str, monto_raw
) -> CuentaPagar | None:
    """Marca como pagada la CuentaPagar pendiente del proveedor. Filtra por monto si se provee."""
    q = (
        select(CuentaPagar)
        .join(Proveedor, CuentaPagar.proveedor_id == Proveedor.id)
        .where(
            CuentaPagar.user_id == user_id,
            CuentaPagar.pagado == False,  # noqa: E712
            sqlfunc.lower(Proveedor.nombre) == nombre.lower().strip(),
        )
    )
    monto = _parse_monto(monto_raw)
    if monto is not None:
        q = q.where(CuentaPagar.monto == float(monto))
    q = q.order_by(CuentaPagar.created_at.asc()).limit(1)
    result = await db.execute(q)
    cuenta = result.scalar_one_or_none()
    if cuenta is None:
        return None
    cuenta.pagado = True
    await db.commit()
    return cuenta


async def _marcar_cuenta_cobrada(
    db: AsyncSession, user_id: int, nombre: str, monto_raw
) -> CuentaCobrar | None:
    """Marca como pagada la CuentaCobrar pendiente del cliente. Filtra por monto si se provee."""
    q = (
        select(CuentaCobrar)
        .join(Cliente, CuentaCobrar.cliente_id == Cliente.id)
        .where(
            CuentaCobrar.user_id == user_id,
            CuentaCobrar.pagado == False,  # noqa: E712
            sqlfunc.lower(Cliente.nombre) == nombre.lower().strip(),
        )
    )
    monto = _parse_monto(monto_raw)
    if monto is not None:
        q = q.where(CuentaCobrar.monto == float(monto))
    q = q.order_by(CuentaCobrar.created_at.asc()).limit(1)
    result = await db.execute(q)
    cuenta = result.scalar_one_or_none()
    if cuenta is None:
        return None
    cuenta.pagado = True
    await db.commit()
    return cuenta


async def _get_or_create_proveedor(db: AsyncSession, user_id: int, nombre: str) -> Proveedor:
    result = await db.execute(
        select(Proveedor).where(
            Proveedor.user_id == user_id,
            sqlfunc.lower(Proveedor.nombre) == nombre.lower().strip(),
        )
    )
    proveedor = result.scalar_one_or_none()
    if proveedor is None:
        proveedor = Proveedor(user_id=user_id, nombre=nombre.strip())
        db.add(proveedor)
        await db.flush()
    return proveedor


# ── Visión: comprobantes desde imagen ────────────────────────────────────────

_EXTRACCION_PROMPT = (
    "Analizá esta factura o comprobante y extraé la información en JSON válido sin texto extra:\n"
    '{"monto": número o null, "proveedor": string o null, "fecha": "YYYY-MM-DD" o null, '
    '"descripcion": string breve o null, "categoria_sugerida": string o null}'
)


async def _procesar_imagen_comprobante(
    media_url: str,
    media_content_type: str,
    user: User,
    db: AsyncSession,
) -> str:
    # Descargar imagen — Twilio sandbox requiere autenticación básica
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                media_url,
                auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
            )
            resp.raise_for_status()
            image_bytes = resp.content
    except Exception as exc:
        logger.exception("Error descargando imagen de Twilio: %s", exc)
        return f"No pude descargar la imagen ({type(exc).__name__}: {exc}). Intentá de nuevo."

    if not image_bytes:
        return "La imagen llegó vacía. Intentá de nuevo."

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    mime = media_content_type or "image/jpeg"

    # Groq vision — modelo llama-4-scout
    try:
        groq = _groq_client()
        response = groq.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                        {"type": "text", "text": _EXTRACCION_PROMPT},
                    ],
                }
            ],
            max_tokens=512,
            temperature=0.1,
        )
    except Exception as exc:
        logger.exception("Error en Groq vision: %s", exc)
        return f"Error al analizar la imagen ({type(exc).__name__}: {exc}). Intentá de nuevo."

    raw = (response.choices[0].message.content or "").strip()
    logger.info("Groq vision raw response: %s", raw)

    if raw.startswith("```"):
        parts = raw.split("```", 2)
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        data: dict = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Groq vision JSON inválido: %s", raw)
        return f"No pude interpretar el comprobante (respuesta: {raw[:100]}). Registrá el gasto manualmente."

    monto = _parse_monto(data.get("monto"))
    if monto is None:
        return "No pude leer el monto del comprobante. Registralo manualmente."

    descripcion = data.get("descripcion") or data.get("proveedor") or "Comprobante WhatsApp"
    fecha = _parse_date(data.get("fecha")) or date.today()
    cat_sugerida = data.get("categoria_sugerida")

    cats_gasto = await _cargar_categorias(db, user.id, TipoMovimiento.gasto)
    categoria = await _resolver_categoria(db, user.id, TipoMovimiento.gasto, cat_sugerida, cats_gasto)

    db.add(Registro(
        user_id=user.id,
        categoria_id=categoria.id,
        tipo=TipoMovimiento.gasto,
        monto=monto,
        moneda=user.moneda,
        fecha=fecha,
        descripcion=descripcion,
    ))
    await db.commit()

    return f"✅ Comprobante procesado: gasto de ${monto:,.2f} en {descripcion}"


# ── Comandos rápidos (sin Groq) ───────────────────────────────────────────────

_COMANDOS = {"resumen", "tareas", "gastos", "balance"}


async def _cmd_tareas(user: User, db: AsyncSession) -> str:
    hoy = date.today()
    result = await db.execute(
        select(TareaCuaderno)
        .where(TareaCuaderno.user_id == user.id, TareaCuaderno.completada == False)  # noqa: E712
        .order_by(TareaCuaderno.fecha_planificada.asc().nulls_last())
        .limit(10)
    )
    tareas = result.scalars().all()
    if not tareas:
        return "✅ No tenés tareas pendientes."
    lineas = ["📅 *Tareas pendientes:*"]
    for t in tareas:
        if t.fecha_planificada:
            diff = (t.fecha_planificada - hoy).days
            if diff < 0:
                etiqueta = f"⚠️ Vencida ({t.fecha_planificada.strftime('%d/%m')})"
            elif diff == 0:
                etiqueta = "Hoy"
            elif diff == 1:
                etiqueta = "Mañana"
            else:
                etiqueta = t.fecha_planificada.strftime("%d/%m")
        else:
            etiqueta = "Sin fecha"
        lineas.append(f"- {etiqueta}: {t.texto}")
    return "\n".join(lineas)


async def _cmd_gastos(user: User, db: AsyncSession) -> str:
    hoy = date.today()
    primer_dia = hoy.replace(day=1)
    moneda = user.moneda
    q = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Registro.monto), 0)).where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.gasto,
            Registro.fecha >= primer_dia,
        )
    )
    total = float(q.scalar() or 0)
    return f"💸 Gastos de {hoy.strftime('%m/%Y')}: {moneda} ${total:,.2f}"


async def _cmd_balance(user: User, db: AsyncSession) -> str:
    hoy = date.today()
    primer_dia = hoy.replace(day=1)
    moneda = user.moneda
    gq = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Registro.monto), 0)).where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.gasto,
            Registro.fecha >= primer_dia,
        )
    )
    iq = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Registro.monto), 0)).where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.ingreso,
            Registro.fecha >= primer_dia,
        )
    )
    gastos = float(gq.scalar() or 0)
    ingresos = float(iq.scalar() or 0)
    balance = ingresos - gastos
    signo = "+" if balance >= 0 else ""
    return (
        f"📊 Balance {hoy.strftime('%m/%Y')} ({moneda})\n"
        f"- Ingresos: ${ingresos:,.2f}\n"
        f"- Gastos:   ${gastos:,.2f}\n"
        f"- Balance:  {signo}${balance:,.2f}"
    )


async def _handle_comando(cmd: str, user: User, db: AsyncSession) -> str | None:
    """Devuelve la respuesta si el mensaje es un comando rápido, None si no."""
    if cmd == "resumen":
        return await _armar_resumen(user, db)
    if cmd == "tareas":
        return await _cmd_tareas(user, db)
    if cmd == "gastos":
        return await _cmd_gastos(user, db)
    if cmd == "balance":
        return await _cmd_balance(user, db)
    return None


# ── Clasificación con Groq ────────────────────────────────────────────────────

async def _clasificar(
    mensaje: str,
    nombre_usuario: str,
    moneda_usuario: str,
    cats_gasto: list[str],
    cats_ingreso: list[str],
) -> dict:
    client = _groq_client()
    hoy = date.today().isoformat()

    cats_gasto_str = ", ".join(cats_gasto) if cats_gasto else "Otros"
    cats_ingreso_str = ", ".join(cats_ingreso) if cats_ingreso else "Otros"

    system = (
        "Sos un asistente de campo agrícola. "
        "El usuario te manda un mensaje por WhatsApp. "
        "Clasificá en uno de estos tipos: nota, tarea, consulta, gasto, ingreso, cobro, pago, marcar_pagado, marcar_cobrado.\n"
        "- nota: registra algo que ocurrió o una observación\n"
        "- tarea: quiere recordar hacer algo (puede incluir fecha futura)\n"
        "- consulta: hace una pregunta o pide información\n"
        "- gasto: gastó, pagó, compró o egresó dinero (sin contraparte específica)\n"
        "- ingreso: cobró, vendió, recibió dinero (sin contraparte específica)\n"
        "- cobro: alguien le debe dinero — registra cuenta por cobrar a un cliente (NUEVO cobro pendiente)\n"
        "- pago: debe pagarle a alguien — registra deuda con un proveedor (NUEVA deuda pendiente)\n"
        "- marcar_pagado: YA pagó algo que estaba pendiente — 'le pagué al veterinario', 'pagué la deuda con AgroInsumos'\n"
        "- marcar_cobrado: un cliente YA le pagó algo pendiente — 'me pagó Juan', 'cobré la factura de Pedro'\n\n"
        f"Hoy es {hoy}. Usuario: {nombre_usuario}. Moneda por defecto: {moneda_usuario}.\n\n"
        f"Categorías de gasto disponibles: {cats_gasto_str}\n"
        f"Categorías de ingreso disponibles: {cats_ingreso_str}\n\n"
        "Para gasto/ingreso elegí la categoría más apropiada. Si ninguna encaja, usá 'Otros'.\n"
        "Para cobro/pago extraé el nombre de la contraparte (cliente o proveedor).\n\n"
        "Respondé SOLO con JSON válido (sin markdown, sin texto extra):\n"
        '{"tipo": "nota|tarea|consulta|gasto|ingreso|cobro|pago|marcar_pagado|marcar_cobrado", '
        '"texto": "<descripción limpia>", '
        '"fecha": "<YYYY-MM-DD o null>", '
        '"monto": <número o null>, '
        '"moneda": "<UYU|USD>", '
        '"categoria": "<nombre de la lista o Otros o null>", '
        '"nombre_contraparte": "<nombre del cliente/proveedor o null>", '
        '"fecha_vencimiento": "<YYYY-MM-DD o null>"}'
        "\n\nPara gasto/ingreso: fecha es hoy si no se especifica. "
        "Para cobro/pago: fecha_vencimiento es la fecha límite de pago si se menciona."
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": mensaje},
        ],
        max_tokens=350,
        temperature=0.1,
    )

    raw = (response.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        return {
            "tipo": "consulta", "texto": mensaje, "fecha": None,
            "monto": None, "moneda": moneda_usuario, "categoria": None,
            "nombre_contraparte": None, "fecha_vencimiento": None,
        }


# ── Consulta ──────────────────────────────────────────────────────────────────

async def _responder_consulta(mensaje: str, user: User, db: AsyncSession) -> str:
    hoy = date.today()
    primer_dia_mes = hoy.replace(day=1)

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

    notas_q = await db.execute(
        select(NotaCuaderno)
        .where(NotaCuaderno.user_id == user.id)
        .order_by(NotaCuaderno.created_at.desc())
        .limit(8)
    )
    notas = notas_q.scalars().all()

    tareas_q = await db.execute(
        select(TareaCuaderno)
        .where(TareaCuaderno.user_id == user.id, TareaCuaderno.completada == False)  # noqa: E712
        .order_by(TareaCuaderno.fecha_planificada.asc().nulls_last())
        .limit(8)
    )
    tareas = tareas_q.scalars().all()

    moneda = user.moneda
    lineas = [
        f"Usuario: {user.nombre} {user.apellido}",
        f"Fecha hoy: {hoy.isoformat()}",
        "",
        f"=== FINANZAS DEL MES ({hoy.strftime('%m/%Y')}) ===",
        f"- Gastos:   {moneda} ${total_gastos:,.2f}",
        f"- Ingresos: {moneda} ${total_ingresos:,.2f}",
        f"- Balance:  {moneda} ${balance:,.2f} ({'positivo' if balance >= 0 else 'negativo'})",
    ]
    if notas:
        lineas.append("\n=== NOTAS DEL CUADERNO ===")
        for n in notas:
            fecha = n.created_at.strftime("%d/%m/%Y") if n.created_at else "?"
            lineas.append(f"  [{fecha}] {n.texto}")
    if tareas:
        lineas.append("\n=== TAREAS PENDIENTES ===")
        for t in tareas:
            fecha = t.fecha_planificada.strftime("%d/%m/%Y") if t.fecha_planificada else "sin fecha"
            lineas.append(f"  [{fecha}] {t.texto}")

    client = _groq_client()
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "Sos un asistente de campo para productores rurales. "
                    "Respondés preguntas usando los datos financieros y el cuaderno del usuario. "
                    "Respondé en español rioplatense, de forma directa y concisa (máximo 4 líneas). "
                    "Si la consulta es sobre gastos/ingresos del mes, usá los datos de FINANZAS DEL MES. "
                    "Si no tenés datos suficientes, decilo claro.\n\n"
                    + "\n".join(lineas)
                ),
            },
            {"role": "user", "content": mensaje},
        ],
        max_tokens=512,
        temperature=0.4,
    )
    return (response.choices[0].message.content or "No pude procesar tu consulta.").strip()


# ── Webhook ───────────────────────────────────────────────────────────────────

@router.post("/webhook")
async def whatsapp_webhook(
    From: str = Form(...),
    Body: str = Form(""),
    MediaUrl0: Optional[str] = Form(None),
    MediaContentType0: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    telefono = From.replace("whatsapp:", "").strip()

    result = await db.execute(select(User).where(User.telefono == telefono))
    user = result.scalar_one_or_none()

    if user is None:
        return _twiml(
            "No encontré una cuenta asociada a este número. "
            "Registrate en finance.360rural.com"
        )

    # Imagen adjunta — procesar como comprobante
    if MediaUrl0:
        try:
            respuesta = await _procesar_imagen_comprobante(
                MediaUrl0, MediaContentType0 or "image/jpeg", user, db
            )
        except Exception as exc:
            logger.exception("Error procesando imagen WhatsApp: %s", exc)
            respuesta = "Hubo un error procesando la imagen. Intentá de nuevo."
        return _twiml(respuesta)

    mensaje = Body.strip()
    if not mensaje:
        return _twiml("No recibí ningún mensaje. Intentá de nuevo.")

    # Comandos rápidos — detección por palabra exacta, sin Groq
    cmd = mensaje.lower().strip()
    if cmd in _COMANDOS:
        try:
            respuesta = await _handle_comando(cmd, user, db)
            if respuesta:
                return _twiml(respuesta)
        except Exception as exc:
            logger.exception("Error en comando rápido '%s': %s", cmd, exc)
            return _twiml("Hubo un error procesando tu consulta. Intentá de nuevo.")

    cats_gasto = await _cargar_categorias(db, user.id, TipoMovimiento.gasto)
    cats_ingreso = await _cargar_categorias(db, user.id, TipoMovimiento.ingreso)

    try:
        datos = await _clasificar(
            mensaje, user.nombre, user.moneda,
            [c.nombre for c in cats_gasto],
            [c.nombre for c in cats_ingreso],
        )
    except Exception as exc:
        logger.exception("Error clasificando mensaje WhatsApp: %s", exc)
        return _twiml("Hubo un error procesando tu mensaje. Intentá de nuevo.")

    tipo = datos.get("tipo", "consulta")
    texto = datos.get("texto") or mensaje
    fecha_str = datos.get("fecha")
    monto_raw = datos.get("monto")
    moneda = datos.get("moneda") or user.moneda
    cat_sugerida = datos.get("categoria")
    contraparte = (datos.get("nombre_contraparte") or "").strip()
    vencimiento_str = datos.get("fecha_vencimiento")

    # ── Nota ─────────────────────────────────────────────────────────────────
    if tipo == "nota":
        db.add(NotaCuaderno(user_id=user.id, texto=texto))
        await db.commit()
        return _twiml("✅ Nota guardada en tu cuaderno.")

    # ── Tarea ─────────────────────────────────────────────────────────────────
    if tipo == "tarea":
        db.add(TareaCuaderno(
            user_id=user.id,
            texto=texto,
            fecha_planificada=_parse_date(fecha_str),
        ))
        await db.commit()
        fp = _parse_date(fecha_str)
        if fp:
            return _twiml(f"✅ Tarea guardada para el {fp.strftime('%d/%m/%Y')}.")
        return _twiml("✅ Tarea guardada en tu cuaderno.")

    # ── Gasto / Ingreso ───────────────────────────────────────────────────────
    if tipo in ("gasto", "ingreso"):
        monto = _parse_monto(monto_raw)
        if monto is None:
            return _twiml("No pude identificar el monto. Intentá: 'Gasté 1500 en combustible'.")

        tipo_mov = TipoMovimiento.gasto if tipo == "gasto" else TipoMovimiento.ingreso
        cats_lista = cats_gasto if tipo_mov == TipoMovimiento.gasto else cats_ingreso
        categoria = await _resolver_categoria(db, user.id, tipo_mov, cat_sugerida, cats_lista)

        db.add(Registro(
            user_id=user.id,
            categoria_id=categoria.id,
            tipo=tipo_mov,
            monto=monto,
            moneda=moneda,
            fecha=_parse_date(fecha_str) or date.today(),
            descripcion=texto,
        ))
        await db.commit()
        etiqueta = "Gasto" if tipo == "gasto" else "Ingreso"
        return _twiml(f"✅ {etiqueta} de {moneda} ${monto:,.2f} registrado en '{categoria.nombre}': {texto}")

    # ── Cobro ─────────────────────────────────────────────────────────────────
    if tipo == "cobro":
        monto = _parse_monto(monto_raw)
        if monto is None:
            return _twiml("No pude identificar el monto. Intentá: 'Juan me debe 5000'.")
        if not contraparte:
            return _twiml("No pude identificar el nombre del cliente. Intentá: 'Pedro me debe 3000'.")

        fecha_venc = _parse_date(vencimiento_str)
        cliente = await _get_or_create_cliente(db, user.id, contraparte)
        db.add(CuentaCobrar(
            user_id=user.id,
            cliente_id=cliente.id,
            monto=float(monto),
            moneda=moneda,
            descripcion=texto or None,
            fecha_vencimiento=datetime.combine(fecha_venc, datetime.min.time()) if fecha_venc else None,
        ))
        await db.commit()
        venc_str = f" (vence {fecha_venc.strftime('%d/%m/%Y')})" if fecha_venc else ""
        return _twiml(f"✅ Cobro de {moneda} ${monto:,.2f} registrado para {cliente.nombre}{venc_str}.")

    # ── Pago ──────────────────────────────────────────────────────────────────
    if tipo == "pago":
        monto = _parse_monto(monto_raw)
        if monto is None:
            return _twiml("No pude identificar el monto. Intentá: 'Debo 8000 a AgroInsumos'.")
        if not contraparte:
            return _twiml("No pude identificar el nombre del proveedor. Intentá: 'Debo 8000 a AgroInsumos'.")

        fecha_venc = _parse_date(vencimiento_str)
        proveedor = await _get_or_create_proveedor(db, user.id, contraparte)
        db.add(CuentaPagar(
            user_id=user.id,
            proveedor_id=proveedor.id,
            monto=float(monto),
            moneda=moneda,
            descripcion=texto or None,
            fecha_vencimiento=datetime.combine(fecha_venc, datetime.min.time()) if fecha_venc else None,
        ))
        await db.commit()
        venc_str = f" (vence {fecha_venc.strftime('%d/%m/%Y')})" if fecha_venc else ""
        return _twiml(f"✅ Pago de {moneda} ${monto:,.2f} registrado para {proveedor.nombre}{venc_str}.")

    # ── Marcar pagado (CuentaPagar → pagado) ─────────────────────────────────
    if tipo == "marcar_pagado":
        if not contraparte:
            return _twiml("No pude identificar el proveedor. Intentá: 'Le pagué a AgroInsumos'.")
        cuenta = await _marcar_cuenta_pagada(db, user.id, contraparte, monto_raw)
        if cuenta is None:
            return _twiml(
                f"No encontré un pago pendiente con '{contraparte}'. "
                "Verificá el nombre o registralo primero."
            )
        monto_fmt = f"{user.moneda} ${cuenta.monto:,.2f}"
        return _twiml(f"✅ Pago a {contraparte} por {monto_fmt} marcado como realizado.")

    # ── Marcar cobrado (CuentaCobrar → pagado) ────────────────────────────────
    if tipo == "marcar_cobrado":
        if not contraparte:
            return _twiml("No pude identificar el cliente. Intentá: 'Me pagó Juan Pérez'.")
        cuenta = await _marcar_cuenta_cobrada(db, user.id, contraparte, monto_raw)
        if cuenta is None:
            return _twiml(
                f"No encontré un cobro pendiente con '{contraparte}'. "
                "Verificá el nombre o registralo primero."
            )
        monto_fmt = f"{user.moneda} ${cuenta.monto:,.2f}"
        return _twiml(f"✅ Cobro de {contraparte} por {monto_fmt} marcado como recibido.")

    # ── Consulta (default) ────────────────────────────────────────────────────
    try:
        respuesta = await _responder_consulta(mensaje, user, db)
    except Exception as exc:
        logger.exception("Error respondiendo consulta WhatsApp: %s", exc)
        respuesta = "No pude procesar tu consulta. Intentá desde la app."
    return _twiml(respuesta)
