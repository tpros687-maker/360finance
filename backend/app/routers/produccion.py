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
from app.models.produccion import CicloAgricola, EventoReproductivo, LoteGanado
from app.models.user import User
from app.services.rentabilidad import invalidar_cache_potrero

router = APIRouter(prefix="/produccion", tags=["produccion"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class LoteCreate(BaseModel):
    potrero_id: int
    especie: str
    cantidad: int
    fecha_entrada: date
    peso_entrada_kg: float
    fecha_salida: Optional[date] = None
    peso_salida_kg: Optional[float] = None
    notas: Optional[str] = None

class LoteUpdate(BaseModel):
    fecha_salida: Optional[date] = None
    peso_salida_kg: Optional[float] = None
    notas: Optional[str] = None

class LoteRead(BaseModel):
    id: int
    potrero_id: int
    especie: str
    cantidad: int
    fecha_entrada: date
    peso_entrada_kg: float
    fecha_salida: Optional[date]
    peso_salida_kg: Optional[float]
    notas: Optional[str]
    dias_en_potrero: Optional[int]
    kg_producidos: Optional[float]
    gdp_kg_dia: Optional[float]

    model_config = {"from_attributes": True}

class EventoCreate(BaseModel):
    potrero_id: int
    tipo: str
    fecha: date
    vientres_totales: int
    resultado: int
    notas: Optional[str] = None

class EventoRead(BaseModel):
    id: int
    potrero_id: int
    tipo: str
    fecha: date
    vientres_totales: int
    resultado: int
    tasa_pct: float
    notas: Optional[str]

    model_config = {"from_attributes": True}

class CicloCreate(BaseModel):
    potrero_id: int
    zafra: str
    cultivo: str
    fecha_siembra: Optional[date] = None
    fecha_cosecha: Optional[date] = None
    toneladas_cosechadas: Optional[float] = None
    precio_venta_tn: Optional[float] = None
    moneda: str = "USD"
    notas: Optional[str] = None

class CicloUpdate(BaseModel):
    fecha_cosecha: Optional[date] = None
    toneladas_cosechadas: Optional[float] = None
    precio_venta_tn: Optional[float] = None
    notas: Optional[str] = None

class CicloRead(BaseModel):
    id: int
    potrero_id: int
    zafra: str
    cultivo: str
    fecha_siembra: Optional[date]
    fecha_cosecha: Optional[date]
    toneladas_cosechadas: Optional[float]
    precio_venta_tn: Optional[float]
    moneda: str
    notas: Optional[str]
    rinde_tn_ha: Optional[float]
    ingreso_bruto: Optional[float]

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_potrero(potrero_id: int, user_id: int, db: AsyncSession) -> Potrero:
    r = await db.execute(select(Potrero).where(Potrero.id == potrero_id))
    p = r.scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="Potrero no encontrado")
    if p.user_id != user_id:
        raise HTTPException(status_code=403, detail="Sin permisos")
    return p

def _lote_to_read(l: LoteGanado) -> LoteRead:
    dias = None
    kg_prod = None
    gdp = None
    if l.fecha_salida and l.peso_salida_kg is not None:
        dias = (l.fecha_salida - l.fecha_entrada).days
        kg_prod = float(l.peso_salida_kg) - float(l.peso_entrada_kg)
        if dias > 0 and l.cantidad > 0:
            gdp = kg_prod / dias / l.cantidad
    return LoteRead(
        id=l.id,
        potrero_id=l.potrero_id,
        especie=l.especie,
        cantidad=l.cantidad,
        fecha_entrada=l.fecha_entrada,
        peso_entrada_kg=float(l.peso_entrada_kg),
        fecha_salida=l.fecha_salida,
        peso_salida_kg=float(l.peso_salida_kg) if l.peso_salida_kg is not None else None,
        notas=l.notas,
        dias_en_potrero=dias,
        kg_producidos=kg_prod,
        gdp_kg_dia=round(gdp, 3) if gdp is not None else None,
    )

def _evento_to_read(e: EventoReproductivo) -> EventoRead:
    tasa = (e.resultado / e.vientres_totales * 100) if e.vientres_totales > 0 else 0.0
    return EventoRead(
        id=e.id,
        potrero_id=e.potrero_id,
        tipo=e.tipo,
        fecha=e.fecha,
        vientres_totales=e.vientres_totales,
        resultado=e.resultado,
        tasa_pct=round(tasa, 1),
        notas=e.notas,
    )

def _ciclo_to_read(c: CicloAgricola, ha: float | None) -> CicloRead:
    rinde = None
    ingreso = None
    if c.toneladas_cosechadas is not None and ha and ha > 0:
        rinde = float(c.toneladas_cosechadas) / ha
    if c.toneladas_cosechadas is not None and c.precio_venta_tn is not None:
        ingreso = float(c.toneladas_cosechadas) * float(c.precio_venta_tn)
    return CicloRead(
        id=c.id,
        potrero_id=c.potrero_id,
        zafra=c.zafra,
        cultivo=c.cultivo,
        fecha_siembra=c.fecha_siembra,
        fecha_cosecha=c.fecha_cosecha,
        toneladas_cosechadas=float(c.toneladas_cosechadas) if c.toneladas_cosechadas is not None else None,
        precio_venta_tn=float(c.precio_venta_tn) if c.precio_venta_tn is not None else None,
        moneda=c.moneda,
        notas=c.notas,
        rinde_tn_ha=round(rinde, 3) if rinde is not None else None,
        ingreso_bruto=round(ingreso, 2) if ingreso is not None else None,
    )


# ── Lotes de ganado ───────────────────────────────────────────────────────────

@router.get("/potreros/{potrero_id}/lotes", response_model=list[LoteRead])
async def list_lotes(potrero_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_potrero(potrero_id, current_user.id, db)
    r = await db.execute(select(LoteGanado).where(LoteGanado.potrero_id == potrero_id).order_by(LoteGanado.fecha_entrada.desc()))
    return [_lote_to_read(l) for l in r.scalars().all()]

@router.post("/potreros/{potrero_id}/lotes", response_model=LoteRead, status_code=201)
async def create_lote(potrero_id: int, payload: LoteCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_potrero(potrero_id, current_user.id, db)
    lote = LoteGanado(user_id=current_user.id, potrero_id=potrero_id, **payload.model_dump(exclude={"potrero_id"}))
    db.add(lote)
    await db.commit()
    await invalidar_cache_potrero(potrero_id, db)
    await db.refresh(lote)
    return _lote_to_read(lote)

@router.put("/lotes/{lote_id}", response_model=LoteRead)
async def update_lote(lote_id: int, payload: LoteUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(LoteGanado).where(LoteGanado.id == lote_id))
    lote = r.scalar_one_or_none()
    if lote is None or lote.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(lote, k, v)
    await db.commit()
    await invalidar_cache_potrero(lote.potrero_id, db)
    await db.refresh(lote)
    return _lote_to_read(lote)

@router.delete("/lotes/{lote_id}", status_code=204)
async def delete_lote(lote_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(LoteGanado).where(LoteGanado.id == lote_id))
    lote = r.scalar_one_or_none()
    if lote is None or lote.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    potrero_id = lote.potrero_id
    await db.delete(lote)
    await db.commit()
    await invalidar_cache_potrero(potrero_id, db)


# ── Eventos reproductivos ─────────────────────────────────────────────────────

@router.get("/potreros/{potrero_id}/eventos", response_model=list[EventoRead])
async def list_eventos(potrero_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_potrero(potrero_id, current_user.id, db)
    r = await db.execute(select(EventoReproductivo).where(EventoReproductivo.potrero_id == potrero_id).order_by(EventoReproductivo.fecha.desc()))
    return [_evento_to_read(e) for e in r.scalars().all()]

@router.post("/potreros/{potrero_id}/eventos", response_model=EventoRead, status_code=201)
async def create_evento(potrero_id: int, payload: EventoCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_potrero(potrero_id, current_user.id, db)
    ev = EventoReproductivo(user_id=current_user.id, potrero_id=potrero_id, **payload.model_dump(exclude={"potrero_id"}))
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return _evento_to_read(ev)

@router.delete("/eventos/{evento_id}", status_code=204)
async def delete_evento(evento_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(EventoReproductivo).where(EventoReproductivo.id == evento_id))
    ev = r.scalar_one_or_none()
    if ev is None or ev.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    await db.delete(ev)
    await db.commit()


# ── Ciclos agrícolas ──────────────────────────────────────────────────────────

@router.get("/potreros/{potrero_id}/ciclos", response_model=list[CicloRead])
async def list_ciclos(potrero_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    potrero = await _get_potrero(potrero_id, current_user.id, db)
    r = await db.execute(select(CicloAgricola).where(CicloAgricola.potrero_id == potrero_id).order_by(CicloAgricola.zafra.desc()))
    ha = float(potrero.hectareas) if potrero.hectareas else None
    return [_ciclo_to_read(c, ha) for c in r.scalars().all()]

@router.post("/potreros/{potrero_id}/ciclos", response_model=CicloRead, status_code=201)
async def create_ciclo(potrero_id: int, payload: CicloCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    potrero = await _get_potrero(potrero_id, current_user.id, db)
    ciclo = CicloAgricola(user_id=current_user.id, potrero_id=potrero_id, **payload.model_dump(exclude={"potrero_id"}))
    db.add(ciclo)
    await db.commit()
    await invalidar_cache_potrero(potrero_id, db)
    await db.refresh(ciclo)
    ha = float(potrero.hectareas) if potrero.hectareas else None
    return _ciclo_to_read(ciclo, ha)

@router.put("/ciclos/{ciclo_id}", response_model=CicloRead)
async def update_ciclo(ciclo_id: int, payload: CicloUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(CicloAgricola).where(CicloAgricola.id == ciclo_id))
    ciclo = r.scalar_one_or_none()
    if ciclo is None or ciclo.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Ciclo no encontrado")
    potrero_r = await db.execute(select(Potrero).where(Potrero.id == ciclo.potrero_id))
    potrero = potrero_r.scalar_one_or_none()
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(ciclo, k, v)
    await db.commit()
    await invalidar_cache_potrero(ciclo.potrero_id, db)
    await db.refresh(ciclo)
    ha = float(potrero.hectareas) if potrero and potrero.hectareas else None
    return _ciclo_to_read(ciclo, ha)

@router.delete("/ciclos/{ciclo_id}", status_code=204)
async def delete_ciclo(ciclo_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(CicloAgricola).where(CicloAgricola.id == ciclo_id))
    ciclo = r.scalar_one_or_none()
    if ciclo is None or ciclo.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Ciclo no encontrado")
    potrero_id = ciclo.potrero_id
    await db.delete(ciclo)
    await db.commit()
    await invalidar_cache_potrero(potrero_id, db)
