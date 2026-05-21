"""Webhook de WhatsApp via Twilio — recibe mensajes y los procesa con IA."""
import json
import logging
from datetime import date
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, Form
from fastapi.responses import Response
from sqlalchemy import select
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

_WHATSAPP_BOT_CAT = "WhatsApp Bot"


def _twiml(mensaje: str) -> Response:
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>{mensaje}</Message>
</Response>"""
    return Response(content=xml, media_type="application/xml")


def _groq_client() -> Groq:
    return Groq(api_key=settings.GROQ_API_KEY)


async def _clasificar(mensaje: str, nombre_usuario: str, moneda_usuario: str) -> dict:
    """Llama a Groq para clasificar el mensaje y extraer datos estructurados."""
    client = _groq_client()
    hoy = date.today().isoformat()

    system = (
        "Sos un asistente de campo agrícola. "
        "El usuario te manda un mensaje por WhatsApp. "
        "Clasificá el mensaje en uno de estos tipos: nota, tarea, consulta, gasto, ingreso.\n"
        "- nota: el usuario registra algo que ya ocurrió o una observación\n"
        "- tarea: el usuario quiere recordar hacer algo (puede incluir fecha futura)\n"
        "- consulta: el usuario hace una pregunta o pide información\n"
        "- gasto: el usuario menciona que gastó, pagó, compró o egresos de dinero\n"
        "- ingreso: el usuario menciona que cobró, vendió, recibió o entró dinero\n\n"
        f"Hoy es {hoy}. El usuario se llama {nombre_usuario}. "
        f"Moneda por defecto del usuario: {moneda_usuario}.\n\n"
        "Respondé SOLO con un JSON válido (sin markdown, sin texto extra):\n"
        '{"tipo": "nota|tarea|consulta|gasto|ingreso", '
        '"texto": "<descripción limpia>", '
        '"fecha": "<YYYY-MM-DD o null>", '
        '"monto": <número o null>, '
        '"moneda": "<UYU|USD>"}'
        "\n\nPara gasto/ingreso: extraé el monto numérico si está mencionado, "
        "inferí la moneda del contexto ($ sin aclaración = moneda del usuario), "
        "la fecha es hoy si no se especifica otra."
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
    # Groq a veces envuelve en ```json ... ```, lo limpiamos
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        return {"tipo": "consulta", "texto": mensaje, "fecha": None, "monto": None, "moneda": moneda_usuario}


async def _get_or_create_categoria(
    db: AsyncSession, user_id: int, tipo: TipoMovimiento
) -> Categoria:
    """Devuelve la categoría 'WhatsApp Bot' del tipo indicado, creándola si no existe."""
    result = await db.execute(
        select(Categoria).where(
            Categoria.nombre == _WHATSAPP_BOT_CAT,
            Categoria.tipo == tipo,
            Categoria.user_id == user_id,
        )
    )
    cat = result.scalar_one_or_none()
    if cat is None:
        cat = Categoria(
            nombre=_WHATSAPP_BOT_CAT,
            tipo=tipo,
            es_personalizada=True,
            user_id=user_id,
            color="#6b7280",
        )
        db.add(cat)
        await db.flush()  # necesitamos el id antes del commit
    return cat


async def _responder_consulta(mensaje: str, user: User, db: AsyncSession) -> str:
    """Responde una consulta usando el cuaderno del usuario como contexto."""
    notas_q = await db.execute(
        select(NotaCuaderno)
        .where(NotaCuaderno.user_id == user.id)
        .order_by(NotaCuaderno.created_at.desc())
        .limit(10)
    )
    notas = notas_q.scalars().all()

    tareas_q = await db.execute(
        select(TareaCuaderno)
        .where(TareaCuaderno.user_id == user.id, TareaCuaderno.completada == False)  # noqa: E712
        .order_by(TareaCuaderno.fecha_planificada.asc().nulls_last())
        .limit(10)
    )
    tareas = tareas_q.scalars().all()

    lineas = [
        f"Usuario: {user.nombre} {user.apellido}",
        f"Fecha hoy: {date.today().isoformat()}",
    ]
    if notas:
        lineas.append("\nÚltimas notas del cuaderno:")
        for n in notas:
            fecha = n.created_at.strftime("%d/%m/%Y") if n.created_at else "?"
            lineas.append(f"  [{fecha}] {n.texto}")
    if tareas:
        lineas.append("\nTareas pendientes:")
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
                    "Respondés preguntas usando el cuaderno del usuario como contexto. "
                    "Respondé en español rioplatense, de forma corta y directa (máximo 3 líneas). "
                    "Si no tenés datos suficientes para responder, decilo claro.\n\n"
                    + "\n".join(lineas)
                ),
            },
            {"role": "user", "content": mensaje},
        ],
        max_tokens=512,
        temperature=0.5,
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

    try:
        datos = await _clasificar(mensaje, user.nombre, user.moneda)
    except Exception as exc:
        logger.exception("Error clasificando mensaje WhatsApp: %s", exc)
        return _twiml("Hubo un error procesando tu mensaje. Intentá de nuevo.")

    tipo = datos.get("tipo", "consulta")
    texto = datos.get("texto") or mensaje
    fecha_str = datos.get("fecha")
    monto_raw = datos.get("monto")
    moneda = datos.get("moneda") or user.moneda

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
        # Validar monto
        try:
            monto = Decimal(str(monto_raw)).quantize(Decimal("0.01"))
            if monto <= 0:
                raise ValueError("monto no positivo")
        except (InvalidOperation, ValueError, TypeError):
            return _twiml(
                f"No pude identificar el monto en tu mensaje. "
                f"Intentá con algo como: 'Gasté 1500 en combustible'."
            )

        # Fecha del registro
        fecha_registro = date.today()
        if fecha_str:
            try:
                fecha_registro = date.fromisoformat(fecha_str)
            except ValueError:
                pass

        tipo_mov = TipoMovimiento.gasto if tipo == "gasto" else TipoMovimiento.ingreso
        categoria = await _get_or_create_categoria(db, user.id, tipo_mov)

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
        return _twiml(f"✅ {etiqueta} de {moneda} ${monto:,.2f} registrado: {texto}")

    # ── Consulta (default) ────────────────────────────────────────────────────
    try:
        respuesta = await _responder_consulta(mensaje, user, db)
    except Exception as exc:
        logger.exception("Error respondiendo consulta WhatsApp: %s", exc)
        respuesta = "No pude procesar tu consulta. Intentá desde la app."
    return _twiml(respuesta)
