from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.mapa import Potrero
from app.models.produccion import DivisionLote, Lote, MovimientoLote, VentaLote
from app.models.user import User
from app.services.rentabilidad import invalidar_cache_potrero

router = APIRouter(prefix="/lotes", tags=["lotes"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class LoteCreate(BaseModel):
    potrero_id: int
    categoria: str
    cantidad: int
    fecha_entrada: date
    peso_total_entrada_kg: float
    precio_kg_compra: Optional[float] = None
    lote_padre_id: Optional[int] = None
    notas: Optional[str] = None


class LoteRead(BaseModel):
    id: int
    potrero_id: int
    potrero_nombre: Optional[str]
    categoria: str
    cantidad: int
    fecha_entrada: date
    peso_total_entrada_kg: float
    precio_kg_compra: Optional[float]
    lote_padre_id: Optional[int]
    cerrado: bool
    notas: Optional[str]

    model_config = {"from_attributes": True}


class MovimientoRead(BaseModel):
    id: int
    fecha: date
    potrero_origen_id: int
    potrero_destino_id: int
    notas: Optional[str]

    model_config = {"from_attributes": True}


class DivisionRead(BaseModel):
    id: int
    fecha: date
    lote_hijo_id: int
    cantidad_separada: int
    motivo: Optional[str]

    model_config = {"from_attributes": True}


class VentaRead(BaseModel):
    id: int
    fecha: date
    cantidad_vendida: int
    peso_total_kg: float
    precio_kg: float
    moneda: str
    notas: Optional[str]

    model_config = {"from_attributes": True}


class LoteDetalle(LoteRead):
    movimientos: list[MovimientoRead]
    divisiones: list[DivisionRead]
    ventas: list[VentaRead]


class MoverLotePayload(BaseModel):
    potrero_destino_id: int
    fecha: date
    notas: Optional[str] = None


class DividirLotePayload(BaseModel):
    cantidad_separada: int
    potrero_destino_id: int
    categoria: Optional[str] = None
    fecha: date
    motivo: Optional[str] = None
    notas_hijo: Optional[str] = None


class VenderLotePayload(BaseModel):
    fecha: date
    cantidad_vendida: int
    peso_total_kg: float
    precio_kg: float
    moneda: str = "USD"
    notas: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_lote(lote_id: int, user_id: int, db: AsyncSession) -> Lote:
    res = await db.execute(select(Lote).where(Lote.id == lote_id))
    lote = res.scalar_one_or_none()
    if lote is None or lote.user_id != user_id:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    return lote


async def _get_potrero(potrero_id: int, user_id: int, db: AsyncSession) -> Potrero:
    res = await db.execute(select(Potrero).where(Potrero.id == potrero_id))
    p = res.scalar_one_or_none()
    if p is None or p.user_id != user_id:
        raise HTTPException(status_code=404, detail="Potrero no encontrado")
    return p


def _lote_to_read(lote: Lote, potrero_nombre: Optional[str] = None) -> LoteRead:
    return LoteRead(
        id=lote.id,
        potrero_id=lote.potrero_id,
        potrero_nombre=potrero_nombre,
        categoria=lote.categoria,
        cantidad=lote.cantidad,
        fecha_entrada=lote.fecha_entrada,
        peso_total_entrada_kg=float(lote.peso_total_entrada_kg),
        precio_kg_compra=float(lote.precio_kg_compra) if lote.precio_kg_compra is not None else None,
        lote_padre_id=lote.lote_padre_id,
        cerrado=lote.cerrado,
        notas=lote.notas,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[LoteRead])
async def list_lotes(
    cerrado: Optional[bool] = None,
    potrero_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Lote).where(Lote.user_id == current_user.id)
    if cerrado is not None:
        stmt = stmt.where(Lote.cerrado == cerrado)
    else:
        stmt = stmt.where(Lote.cerrado == False)  # noqa: E712  default: solo activos
    if potrero_id is not None:
        stmt = stmt.where(Lote.potrero_id == potrero_id)
    stmt = stmt.order_by(Lote.fecha_entrada.desc())
    lotes = (await db.execute(stmt)).scalars().all()

    # Batch-fetch potrero names
    potrero_ids = list({l.potrero_id for l in lotes})
    pot_res = await db.execute(select(Potrero).where(Potrero.id.in_(potrero_ids)))
    pot_map: dict[int, str] = {p.id: p.nombre for p in pot_res.scalars().all()}

    return [_lote_to_read(l, pot_map.get(l.potrero_id)) for l in lotes]


@router.post("", response_model=LoteRead, status_code=status.HTTP_201_CREATED)
async def create_lote(
    payload: LoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_potrero(payload.potrero_id, current_user.id, db)
    if payload.lote_padre_id is not None:
        await _get_lote(payload.lote_padre_id, current_user.id, db)

    lote = Lote(
        user_id=current_user.id,
        potrero_id=payload.potrero_id,
        categoria=payload.categoria,
        cantidad=payload.cantidad,
        fecha_entrada=payload.fecha_entrada,
        peso_total_entrada_kg=Decimal(str(payload.peso_total_entrada_kg)),
        precio_kg_compra=Decimal(str(payload.precio_kg_compra)) if payload.precio_kg_compra is not None else None,
        lote_padre_id=payload.lote_padre_id,
        cerrado=False,
        notas=payload.notas,
    )
    db.add(lote)
    await db.commit()
    await invalidar_cache_potrero(payload.potrero_id, db)
    await db.refresh(lote)
    pot_res = await db.execute(select(Potrero).where(Potrero.id == lote.potrero_id))
    potrero = pot_res.scalar_one_or_none()
    return _lote_to_read(lote, potrero.nombre if potrero else None)


@router.get("/{lote_id}", response_model=LoteDetalle)
async def get_lote(
    lote_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lote = await _get_lote(lote_id, current_user.id, db)
    pot_res = await db.execute(select(Potrero).where(Potrero.id == lote.potrero_id))
    potrero = pot_res.scalar_one_or_none()

    mov_res = await db.execute(
        select(MovimientoLote)
        .where(MovimientoLote.lote_id == lote_id)
        .order_by(MovimientoLote.fecha)
    )
    movimientos = [
        MovimientoRead(
            id=m.id,
            fecha=m.fecha,
            potrero_origen_id=m.potrero_origen_id,
            potrero_destino_id=m.potrero_destino_id,
            notas=m.notas,
        )
        for m in mov_res.scalars().all()
    ]

    div_res = await db.execute(
        select(DivisionLote)
        .where(DivisionLote.lote_padre_id == lote_id)
        .order_by(DivisionLote.fecha)
    )
    divisiones = [
        DivisionRead(
            id=d.id,
            fecha=d.fecha,
            lote_hijo_id=d.lote_hijo_id,
            cantidad_separada=d.cantidad_separada,
            motivo=d.motivo,
        )
        for d in div_res.scalars().all()
    ]

    ven_res = await db.execute(
        select(VentaLote)
        .where(VentaLote.lote_id == lote_id)
        .order_by(VentaLote.fecha)
    )
    ventas = [
        VentaRead(
            id=v.id,
            fecha=v.fecha,
            cantidad_vendida=v.cantidad_vendida,
            peso_total_kg=float(v.peso_total_kg),
            precio_kg=float(v.precio_kg),
            moneda=v.moneda,
            notas=v.notas,
        )
        for v in ven_res.scalars().all()
    ]

    base = _lote_to_read(lote, potrero.nombre if potrero else None)
    return LoteDetalle(**base.model_dump(), movimientos=movimientos, divisiones=divisiones, ventas=ventas)


@router.post("/{lote_id}/mover", response_model=LoteRead)
async def mover_lote(
    lote_id: int,
    payload: MoverLotePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lote = await _get_lote(lote_id, current_user.id, db)
    if lote.cerrado:
        raise HTTPException(status_code=400, detail="El lote está cerrado")
    destino = await _get_potrero(payload.potrero_destino_id, current_user.id, db)

    mov = MovimientoLote(
        user_id=current_user.id,
        lote_id=lote_id,
        fecha=payload.fecha,
        potrero_origen_id=lote.potrero_id,
        potrero_destino_id=payload.potrero_destino_id,
        notas=payload.notas,
    )
    db.add(mov)

    old_potrero_id = lote.potrero_id
    lote.potrero_id = payload.potrero_destino_id
    await db.commit()

    await invalidar_cache_potrero(old_potrero_id, db)
    await invalidar_cache_potrero(payload.potrero_destino_id, db)

    await db.refresh(lote)
    return _lote_to_read(lote, destino.nombre)


@router.post("/{lote_id}/dividir", response_model=LoteRead, status_code=status.HTTP_201_CREATED)
async def dividir_lote(
    lote_id: int,
    payload: DividirLotePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    padre = await _get_lote(lote_id, current_user.id, db)
    if padre.cerrado:
        raise HTTPException(status_code=400, detail="El lote está cerrado")
    if payload.cantidad_separada <= 0 or payload.cantidad_separada >= padre.cantidad:
        raise HTTPException(
            status_code=400,
            detail=f"cantidad_separada debe estar entre 1 y {padre.cantidad - 1}",
        )
    destino = await _get_potrero(payload.potrero_destino_id, current_user.id, db)

    # Peso proporcional al hijo
    fraccion = Decimal(str(payload.cantidad_separada)) / Decimal(str(padre.cantidad))
    peso_hijo = (Decimal(str(padre.peso_total_entrada_kg)) * fraccion).quantize(Decimal("0.01"))

    hijo = Lote(
        user_id=current_user.id,
        potrero_id=payload.potrero_destino_id,
        categoria=payload.categoria or padre.categoria,
        cantidad=payload.cantidad_separada,
        fecha_entrada=payload.fecha,
        peso_total_entrada_kg=peso_hijo,
        precio_kg_compra=padre.precio_kg_compra,
        lote_padre_id=padre.id,
        cerrado=False,
        notas=payload.notas_hijo,
    )
    db.add(hijo)
    await db.flush()  # get hijo.id

    division = DivisionLote(
        user_id=current_user.id,
        lote_padre_id=padre.id,
        lote_hijo_id=hijo.id,
        fecha=payload.fecha,
        cantidad_separada=payload.cantidad_separada,
        motivo=payload.motivo,
    )
    db.add(division)

    # Reduce padre
    padre.cantidad -= payload.cantidad_separada
    padre.peso_total_entrada_kg = (
        Decimal(str(padre.peso_total_entrada_kg)) - peso_hijo
    ).quantize(Decimal("0.01"))

    await db.commit()
    await invalidar_cache_potrero(padre.potrero_id, db)
    if payload.potrero_destino_id != padre.potrero_id:
        await invalidar_cache_potrero(payload.potrero_destino_id, db)

    await db.refresh(hijo)
    return _lote_to_read(hijo, destino.nombre)


@router.post("/{lote_id}/vender", response_model=LoteRead)
async def vender_lote(
    lote_id: int,
    payload: VenderLotePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lote = await _get_lote(lote_id, current_user.id, db)
    if lote.cerrado:
        raise HTTPException(status_code=400, detail="El lote está cerrado")
    if payload.cantidad_vendida <= 0 or payload.cantidad_vendida > lote.cantidad:
        raise HTTPException(
            status_code=400,
            detail=f"cantidad_vendida debe estar entre 1 y {lote.cantidad}",
        )

    venta = VentaLote(
        user_id=current_user.id,
        lote_id=lote_id,
        fecha=payload.fecha,
        cantidad_vendida=payload.cantidad_vendida,
        peso_total_kg=Decimal(str(payload.peso_total_kg)),
        precio_kg=Decimal(str(payload.precio_kg)),
        moneda=payload.moneda,
        notas=payload.notas,
    )
    db.add(venta)

    lote.cantidad -= payload.cantidad_vendida
    if lote.cantidad == 0:
        lote.cerrado = True

    await db.commit()
    await invalidar_cache_potrero(lote.potrero_id, db)

    pot_res = await db.execute(select(Potrero).where(Potrero.id == lote.potrero_id))
    potrero = pot_res.scalar_one_or_none()
    await db.refresh(lote)
    return _lote_to_read(lote, potrero.nombre if potrero else None)
