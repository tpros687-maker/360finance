from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.asistente import ChatRequest, ChatResponse, MensajeChat, RoleMensaje
from app.services.asistente import chat, construir_contexto

router = APIRouter(prefix="/asistente", tags=["asistente"])


@router.post("/chat", response_model=ChatResponse)
async def asistente_chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Recibe un mensaje del usuario y devuelve la respuesta del asistente IA."""
    try:
        contexto = await construir_contexto(current_user, db)
        respuesta = await chat(body.mensaje, body.historial, contexto)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al comunicarse con el servicio de IA: {exc}",
        ) from exc

    historial_actualizado = list(body.historial) + [
        MensajeChat(role=RoleMensaje.user, content=body.mensaje),
        MensajeChat(role=RoleMensaje.assistant, content=respuesta),
    ]

    return ChatResponse(respuesta=respuesta, historial=historial_actualizado)
