"""Webhook de WhatsApp via Twilio — recibe mensajes y los procesa con IA."""
import json
import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Form
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.cuaderno import NotaCuaderno, TareaCuaderno
from app.models.user import User
from groq import Groq
from app.config import settings

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


async def _clasificar(mensaje: str, nombre_usuario: str) -> dict:
    """Llama a Groq para clasificar el mensaje como nota, tarea o consulta."""
    client = _groq_client()
    hoy = date.today().isoformat()

    system = (
        "Sos un asistente de campo agrícola. "
        "El usuario te manda un mensaje por WhatsApp. "
        "Clasificá el mensaje en uno de estos intents: nota, tarea, consulta.\n"
        "- nota: el usuario quiere registrar algo que ya ocurrió o una observación\n"
        "- tarea: el usuario quiere recordar hacer algo (puede incluir fecha)\n"
        "- consulta: el usuario hace una pregunta o pide información\n\n"
        f"Hoy es {hoy}. El usuario se llama {nombre_usuario}.\n\n"
        "Respondé SOLO con un JSON válido con esta estructura (sin markdown, sin texto extra):\n"
        '{"intent": "nota|tarea|consulta", "texto": "<texto limpio para guardar>", '
        '"fecha": "<YYYY-MM-DD o null>"}'
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": mensaje},
        ],
        max_tokens=256,
        temperature=0.1,
    )

    raw = (response.choices[0].message.content or "").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: tratar como consulta
        return {"intent": "consulta", "texto": mensaje, "fecha": None}


async def _responder_consulta(mensaje: str, user: User, db: AsyncSession) -> str:
    """Responde una consulta usando el cuaderno del usuario como contexto."""
    # Cargar últimas notas y tareas pendientes para dar contexto
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

    contexto_lines = [f"Usuario: {user.nombre} {user.apellido}", f"Fecha hoy: {date.today().isoformat()}"]

    if notas:
        contexto_lines.append("\nÚltimas notas del cuaderno:")
        for n in notas:
            fecha = n.created_at.strftime("%d/%m/%Y") if n.created_at else "?"
            contexto_lines.append(f"  [{fecha}] {n.texto}")

    if tareas:
        contexto_lines.append("\nTareas pendientes:")
        for t in tareas:
            fecha = t.fecha_planificada.strftime("%d/%m/%Y") if t.fecha_planificada else "sin fecha"
            contexto_lines.append(f"  [{fecha}] {t.texto}")

    contexto = "\n".join(contexto_lines)

    client = _groq_client()
    system = (
        "Sos un asistente de campo para productores rurales. "
        "Respondés preguntas usando el cuaderno del usuario como contexto. "
        "Respondé en español rioplatense, de forma corta y directa (máximo 3 líneas). "
        "Si no tenés datos suficientes para responder, decilo claro."
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system + "\n\n" + contexto},
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
    # Extraer número de teléfono (Twilio envía "whatsapp:+XXXXXXXXX")
    telefono = From.replace("whatsapp:", "").strip()

    # Buscar usuario por teléfono
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
        clasificacion = await _clasificar(mensaje, user.nombre)
    except Exception as e:
        logger.exception("Error al clasificar mensaje WhatsApp: %s", e)
        return _twiml("Hubo un error procesando tu mensaje. Intentá de nuevo.")

    intent = clasificacion.get("intent", "consulta")
    texto = clasificacion.get("texto", mensaje)
    fecha_str = clasificacion.get("fecha")

    if intent == "nota":
        nota = NotaCuaderno(user_id=user.id, texto=texto)
        db.add(nota)
        await db.commit()
        return _twiml("✅ Nota guardada en tu cuaderno.")

    elif intent == "tarea":
        fecha_planificada = None
        if fecha_str:
            try:
                fecha_planificada = date.fromisoformat(fecha_str)
            except ValueError:
                pass

        tarea = TareaCuaderno(
            user_id=user.id,
            texto=texto,
            fecha_planificada=fecha_planificada,
        )
        db.add(tarea)
        await db.commit()

        if fecha_planificada:
            fecha_display = fecha_planificada.strftime("%d/%m/%Y")
            return _twiml(f"✅ Tarea guardada para el {fecha_display}.")
        return _twiml("✅ Tarea guardada en tu cuaderno.")

    else:  # consulta
        try:
            respuesta = await _responder_consulta(mensaje, user, db)
        except Exception as e:
            logger.exception("Error al responder consulta WhatsApp: %s", e)
            respuesta = "No pude procesar tu consulta. Intentá desde la app."
        return _twiml(respuesta)
