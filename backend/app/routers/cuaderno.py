from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.cuaderno import NotaCuaderno, TareaCuaderno
from app.models.user import User

router = APIRouter(prefix="/cuaderno", tags=["cuaderno"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class NotaCreate(BaseModel):
    texto: str
    potrero_id: Optional[int] = None


class NotaRead(BaseModel):
    id: int
    user_id: int
    potrero_id: Optional[int]
    texto: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TareaCreate(BaseModel):
    texto: str
    fecha_planificada: Optional[date] = None
    potrero_id: Optional[int] = None
    notificar_dias_antes: Optional[int] = 1


class TareaRead(BaseModel):
    id: int
    user_id: int
    potrero_id: Optional[int]
    texto: str
    fecha_planificada: Optional[date]
    completada: bool
    completed_at: Optional[datetime]
    notificar_dias_antes: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_own_nota(nota_id: int, user_id: int, db: AsyncSession) -> NotaCuaderno:
    result = await db.execute(select(NotaCuaderno).where(NotaCuaderno.id == nota_id))
    nota = result.scalar_one_or_none()
    if nota is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota no encontrada")
    if nota.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos sobre esta nota")
    return nota


async def _get_own_tarea(tarea_id: int, user_id: int, db: AsyncSession) -> TareaCuaderno:
    result = await db.execute(select(TareaCuaderno).where(TareaCuaderno.id == tarea_id))
    tarea = result.scalar_one_or_none()
    if tarea is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")
    if tarea.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos sobre esta tarea")
    return tarea


# ── Notas ─────────────────────────────────────────────────────────────────────

@router.get("/notas", response_model=list[NotaRead])
async def list_notas(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[NotaCuaderno]:
    result = await db.execute(
        select(NotaCuaderno)
        .where(NotaCuaderno.user_id == current_user.id)
        .order_by(NotaCuaderno.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/notas", response_model=NotaRead, status_code=status.HTTP_201_CREATED)
async def create_nota(
    payload: NotaCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotaCuaderno:
    if not payload.texto.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El texto no puede estar vacío")
    nota = NotaCuaderno(
        user_id=current_user.id,
        potrero_id=payload.potrero_id,
        texto=payload.texto.strip(),
    )
    db.add(nota)
    await db.commit()
    await db.refresh(nota)
    return nota


@router.delete("/notas/{nota_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_nota(
    nota_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    nota = await _get_own_nota(nota_id, current_user.id, db)
    await db.delete(nota)
    await db.commit()


# ── Tareas ────────────────────────────────────────────────────────────────────

@router.get("/tareas", response_model=list[TareaRead])
async def list_tareas(
    completada: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TareaCuaderno]:
    stmt = select(TareaCuaderno).where(TareaCuaderno.user_id == current_user.id)
    if completada is not None:
        stmt = stmt.where(TareaCuaderno.completada == completada)
    stmt = stmt.order_by(TareaCuaderno.fecha_planificada.asc().nulls_last(), TareaCuaderno.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/tareas", response_model=TareaRead, status_code=status.HTTP_201_CREATED)
async def create_tarea(
    payload: TareaCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TareaCuaderno:
    if not payload.texto.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El texto no puede estar vacío")
    tarea = TareaCuaderno(
        user_id=current_user.id,
        potrero_id=payload.potrero_id,
        texto=payload.texto.strip(),
        fecha_planificada=payload.fecha_planificada,
        notificar_dias_antes=payload.notificar_dias_antes,
    )
    db.add(tarea)
    await db.commit()
    await db.refresh(tarea)
    return tarea


@router.patch("/tareas/{tarea_id}/completar", response_model=TareaRead)
async def completar_tarea(
    tarea_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TareaCuaderno:
    tarea = await _get_own_tarea(tarea_id, current_user.id, db)
    tarea.completada = True
    tarea.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(tarea)
    return tarea


@router.delete("/tareas/{tarea_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tarea(
    tarea_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    tarea = await _get_own_tarea(tarea_id, current_user.id, db)
    await db.delete(tarea)
    await db.commit()
