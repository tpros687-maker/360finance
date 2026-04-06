from enum import Enum

from pydantic import BaseModel


class RoleMensaje(str, Enum):
    user = "user"
    assistant = "assistant"


class MensajeChat(BaseModel):
    role: RoleMensaje
    content: str


class ChatRequest(BaseModel):
    mensaje: str
    historial: list[MensajeChat] = []


class ChatResponse(BaseModel):
    respuesta: str
    historial: list[MensajeChat]
