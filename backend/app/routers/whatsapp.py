"""Webhook de WhatsApp via Twilio — recibe mensajes y los procesa con IA."""
import json
import logging
from datetime import date
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, Form
from fastapi.responses import Response
from sqlalchemy import func as sqlfunc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.categoria import Categoria, TipoMovimiento
from app.models.cuaderno import NotaCuaderno, TareaCuaderno
from app.models.registro import Registro
from app.models.user import User
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


async def _cargar_categorias(
    db: AsyncSession, user_id: int, tipo: TipoMovimiento
) -> list[Categoria]:
    """Carga categorías del sistema + personales del usuario para un tipo dado."""
    result = await db.execute(
        select(Categoria)
        .where(
            Categoria.tipo == tipo,
            or_(Categoria.user_id == user_id, Categoria.user_id.is_(None)),
        )
        .order_by(Categoria.nombre)
    )
    return list(result.scalars().all())


async def _clasificar(
    mensaje: str,
    nombre_usuario: str,
    moneda_usuario: str,
    cats_gasto: list[str],
    cats_ingreso: list[str],
) -> dict:
    """Llama a Groq para clasificar el mensaje y extraer datos estructurados."""
    client = _groq_client()
    hoy = date.today().isoformat()

    cats_gasto_str = ", ".join(cats_gasto) if cats_gasto else "Otros"
    cats_ingreso_str = ", ".join(cats_ingreso) if cats_ingreso else "Otros"

    system = (
        "Sos un asistente de campo agrícola. "
        "El usuario te manda un mensaje por WhatsApp. "
        "Clasificá en uno de estos tipos: nota, tarea, consulta, gasto, ingreso.\n"
        "- nota: registra algo que ya ocurrió o una observación\n"
        "- tarea: quiere recordar hacer algo (puede incluir fecha futura)\n"
        "- consulta: hace una pregunta o pide información\n"
        "- gasto: gastó, pagó, compró o egresó dinero\n"
        "- ingreso: cobró, vendió, recibió o entró dinero\n\n"
        f"Hoy es {hoy}. Usuario: {nombre_usuario}. Moneda por defecto: {moneda_usuario}.\n\n"
        f"Categorías de gasto disponibles: {cats_gasto_str}\n"
        f"Categorías de ingreso disponibles: {cats_ingreso_str}\n\n"
        "Para gasto/ingreso elegí la categoría más apropiada de la lista. "
        "Si ninguna encaja, usá 'Otros'.\n\n"
        "Respondé SOLO con JSON válido (sin markdown, sin texto extra):\n"
        '{"tipo": "nota|tarea|consulta|gasto|ingreso", '
        '"texto": "<descripción limpia>", '
        '"fecha": "<YYYY-MM-DD o null>", '
        '"monto": <número o null>, '
        '"moneda": "<UYU|USD>", '
        '"categoria": "<nombre exacto de la lista o Otros>"}'
        "\n\nPara gasto/ingreso: extraé monto numérico, "
        "inferí moneda del contexto ($ sin aclaración = moneda del usuario), "
        "fecha es hoy si no se especifica."
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": mensaje},
        ],
        max_tokens=300,
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
        }


async def _resolver_categoria(
    db: AsyncSession,
    user_id: int,
    tipo: TipoMovimiento,
    nombre_sugerido: str | None,
    categorias: list[Categoria],
) -> Categoria:
    """Devuelve la categoría que Groq sugirió; si no coincide, usa/crea 'Otros'."""
    if nombre_sugerido:
        lower = nombre_sugerido.lower().strip()
        for cat in categorias:
            if cat.nombre.lower() == lower:
                return cat

    # Buscar "Otros" en la lista ya cargada
    for cat in categorias:
        if cat.nombre.lower() == "otros":
            return cat

    # Crear "Otros" como última opción
    cat = Categoria(
        nombre="Otros",
        tipo=tipo,
        es_personalizada=True,
        user_id=user_id,
        color="#6b7280",
    )
    db.add(cat)
    await db.flush()
    return cat


async def _responder_consulta(mensaje: str, user: User, db: AsyncSession) -> str:
    """Responde una consulta con datos financieros del mes + cuaderno del usuario."""
    hoy = date.today()
    primer_dia_mes = hoy.replace(day=1)

    # Totales del mes actual
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

    # Cuaderno
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


@router.post("/webhook")
async def whatsapp_webhook(
    From: str = Form(...),
    Body: str = Form(...),
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

    mensaje = Body.strip()
    if not mensaje:
        return _twiml("No recibí ningún mensaje. Intentá de nuevo.")

    # Cargar categorías antes de llamar a Groq para incluirlas en el prompt
    cats_gasto = await _cargar_categorias(db, user.id, TipoMovimiento.gasto)
    cats_ingreso = await _cargar_categorias(db, user.id, TipoMovimiento.ingreso)
    cats_gasto_nombres = [c.nombre for c in cats_gasto]
    cats_ingreso_nombres = [c.nombre for c in cats_ingreso]

    try:
        datos = await _clasificar(
            mensaje, user.nombre, user.moneda,
            cats_gasto_nombres, cats_ingreso_nombres,
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

    # ── Nota ─────────────────────────────────────────────────────────────────
    if tipo == "nota":
        db.add(NotaCuaderno(user_id=user.id, texto=texto))
        await db.commit()
        return _twiml("✅ Nota guardada en tu cuaderno.")

    # ── Tarea ─────────────────────────────────────────────────────────────────
    if tipo == "tarea":
        fecha_planificada = None
        if fecha_str:
            try:
                fecha_planificada = date.fromisoformat(fecha_str)
            except ValueError:
                pass
        db.add(TareaCuaderno(user_id=user.id, texto=texto, fecha_planificada=fecha_planificada))
        await db.commit()
        if fecha_planificada:
            return _twiml(f"✅ Tarea guardada para el {fecha_planificada.strftime('%d/%m/%Y')}.")
        return _twiml("✅ Tarea guardada en tu cuaderno.")

    # ── Gasto / Ingreso ───────────────────────────────────────────────────────
    if tipo in ("gasto", "ingreso"):
        try:
            monto = Decimal(str(monto_raw)).quantize(Decimal("0.01"))
            if monto <= 0:
                raise ValueError
        except (InvalidOperation, ValueError, TypeError):
            return _twiml(
                "No pude identificar el monto. "
                "Intentá: 'Gasté 1500 en combustible'."
            )

        fecha_registro = date.today()
        if fecha_str:
            try:
                fecha_registro = date.fromisoformat(fecha_str)
            except ValueError:
                pass

        tipo_mov = TipoMovimiento.gasto if tipo == "gasto" else TipoMovimiento.ingreso
        cats_lista = cats_gasto if tipo_mov == TipoMovimiento.gasto else cats_ingreso
        categoria = await _resolver_categoria(db, user.id, tipo_mov, cat_sugerida, cats_lista)

        db.add(Registro(
            user_id=user.id,
            categoria_id=categoria.id,
            tipo=tipo_mov,
            monto=monto,
            moneda=moneda,
            fecha=fecha_registro,
            descripcion=texto,
        ))
        await db.commit()

        etiqueta = "Gasto" if tipo == "gasto" else "Ingreso"
        return _twiml(
            f"✅ {etiqueta} de {moneda} ${monto:,.2f} registrado en '{categoria.nombre}': {texto}"
        )

    # ── Consulta (default) ────────────────────────────────────────────────────
    try:
        respuesta = await _responder_consulta(mensaje, user, db)
    except Exception as exc:
        logger.exception("Error respondiendo consulta WhatsApp: %s", exc)
        respuesta = "No pude procesar tu consulta. Intentá desde la app."
    return _twiml(respuesta)
