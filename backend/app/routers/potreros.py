from datetime import date
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping, shape as shapely_shape
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.categoria import TipoMovimiento
from app.models.mapa import Animal, FranjaEstado, MovimientoGanado, Potrero
from app.models.registro import Registro
from app.models.user import User
from app.schemas.mapa import AplicacionRead, FranjaEstadoRead, FranjaMoverRequest, MovimientoRead, PotreroCreate, PotreroRead, PotreroUpdate, RentabilidadPotrero
from app.services.rentabilidad import invalidar_cache_potrero

router = APIRouter(prefix="/potreros", tags=["potreros"])


def _geom_to_geojson(geom: Any) -> dict:
    """Convert WKBElement to GeoJSON dict."""
    return mapping(to_shape(geom))


def _geojson_to_geom(geojson: dict) -> Any:
    """Convert GeoJSON dict to WKBElement (SRID 4326)."""
    return from_shape(shapely_shape(geojson), srid=4326)


def _potrero_to_read(p: Potrero) -> PotreroRead:
    return PotreroRead(
        id=p.id,
        user_id=p.user_id,
        nombre=p.nombre,
        geometria=_geom_to_geojson(p.geometria),
        tipo=p.tipo,
        estado_pasto=p.estado_pasto,
        hectareas=p.hectareas,
        tiene_suplementacion=p.tiene_suplementacion,
        suplementacion_detalle=p.suplementacion_detalle,
        tiene_franjas=p.tiene_franjas,
        cantidad_franjas=p.cantidad_franjas,
        franjas_usadas=p.franjas_usadas,
        dias_por_franja=p.dias_por_franja,
        observaciones=p.observaciones,
        en_descanso=p.en_descanso,
        fecha_descanso=p.fecha_descanso,
        cultivo=p.cultivo,
        es_primera=p.es_primera,
        fecha_siembra=p.fecha_siembra,
        coneat=p.coneat,
        kg_producidos_anio=p.kg_producidos_anio,
        created_at=p.created_at,
    )


async def _get_own_potrero(potrero_id: int, user_id: int, db: AsyncSession) -> Potrero:
    result = await db.execute(select(Potrero).where(Potrero.id == potrero_id))
    potrero = result.scalar_one_or_none()
    if potrero is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Potrero no encontrado")
    if potrero.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos sobre este potrero")
    return potrero


@router.get("", response_model=list[PotreroRead])
async def list_potreros(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PotreroRead]:
    result = await db.execute(
        select(Potrero).where(Potrero.user_id == current_user.id).order_by(Potrero.created_at.desc())
    )
    potreros = result.scalars().all()
    return [_potrero_to_read(p) for p in potreros]


@router.post("", response_model=PotreroRead, status_code=status.HTTP_201_CREATED)
async def create_potrero(
    payload: PotreroCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PotreroRead:
    potrero = Potrero(
        user_id=current_user.id,
        nombre=payload.nombre,
        geometria=_geojson_to_geom(payload.geometria),
        tipo=payload.tipo,
        estado_pasto=payload.estado_pasto,
        hectareas=payload.hectareas,
        tiene_suplementacion=payload.tiene_suplementacion,
        suplementacion_detalle=payload.suplementacion_detalle,
        tiene_franjas=payload.tiene_franjas,
        cantidad_franjas=payload.cantidad_franjas,
        franjas_usadas=payload.franjas_usadas,
        dias_por_franja=payload.dias_por_franja,
        observaciones=payload.observaciones,
        coneat=payload.coneat,
        kg_producidos_anio=payload.kg_producidos_anio,
    )
    db.add(potrero)
    await db.commit()
    await db.refresh(potrero)
    return _potrero_to_read(potrero)


@router.get("/rentabilidad", response_model=list[RentabilidadPotrero])
async def get_rentabilidad(
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RentabilidadPotrero]:
    """Rentabilidad por potrero: ingresos, gastos, balance y % en una sola query."""
    animals_sq = (
        select(
            Animal.potrero_id,
            func.sum(Animal.cantidad).label("total_animales"),
        )
        .where(Animal.user_id == current_user.id)
        .group_by(Animal.potrero_id)
        .subquery()
    )

    reg_join: list = [
        Registro.potrero_id == Potrero.id,
        Registro.user_id == current_user.id,
    ]
    if fecha_desde:
        reg_join.append(Registro.fecha >= fecha_desde)
    if fecha_hasta:
        reg_join.append(Registro.fecha <= fecha_hasta)

    ingresos_col = func.coalesce(
        func.sum(case((Registro.tipo == TipoMovimiento.ingreso, Registro.monto), else_=Decimal("0"))),
        Decimal("0"),
    )
    gastos_col = func.coalesce(
        func.sum(case((Registro.tipo == TipoMovimiento.gasto, Registro.monto), else_=Decimal("0"))),
        Decimal("0"),
    )

    stmt = (
        select(
            Potrero.id.label("potrero_id"),
            Potrero.nombre,
            Potrero.hectareas,
            Potrero.coneat,
            Potrero.kg_producidos_anio,
            ingresos_col.label("total_ingresos"),
            gastos_col.label("total_gastos"),
            func.coalesce(animals_sq.c.total_animales, 0).label("cantidad_animales"),
        )
        .outerjoin(Registro, and_(*reg_join))
        .outerjoin(animals_sq, animals_sq.c.potrero_id == Potrero.id)
        .where(Potrero.user_id == current_user.id)
        .group_by(
            Potrero.id, Potrero.nombre, Potrero.hectareas,
            Potrero.coneat, Potrero.kg_producidos_anio,
            animals_sq.c.total_animales,
        )
        .order_by((ingresos_col - gastos_col).desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    Q2 = Decimal("0.01")
    out: list[RentabilidadPotrero] = []
    for row in rows:
        ingresos = Decimal(str(row.total_ingresos))
        gastos = Decimal(str(row.total_gastos))
        balance = ingresos - gastos
        rent_pct = (balance / gastos * 100).quantize(Q2) if gastos > 0 else None
        ha = Decimal(str(row.hectareas)) if row.hectareas else None
        animales = int(row.cantidad_animales)
        kg_anio = Decimal(str(row.kg_producidos_anio)) if row.kg_producidos_anio else None

        margen_bruto_ha = (balance / ha).quantize(Q2) if ha and ha > 0 else None
        carga_animal_ug_ha = (Decimal(str(animales)) * Decimal("0.8") / ha).quantize(Q2) if ha and ha > 0 else None
        produccion_kg_ha = (kg_anio / ha).quantize(Q2) if kg_anio and ha and ha > 0 else None

        out.append(
            RentabilidadPotrero(
                potrero_id=row.potrero_id,
                nombre=row.nombre,
                hectareas=row.hectareas,
                total_ingresos=ingresos,
                total_gastos=gastos,
                balance=balance,
                rentabilidad_pct=rent_pct,
                cantidad_animales=animales,
                margen_bruto_ha=margen_bruto_ha,
                carga_animal_ug_ha=carga_animal_ug_ha,
                produccion_kg_ha=produccion_kg_ha,
                coneat=row.coneat,
            )
        )
    return out


@router.put("/{potrero_id}", response_model=PotreroRead)
async def update_potrero(
    potrero_id: int,
    payload: PotreroUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PotreroRead:
    potrero = await _get_own_potrero(potrero_id, current_user.id, db)

    if payload.nombre is not None:
        potrero.nombre = payload.nombre
    if payload.geometria is not None:
        potrero.geometria = _geojson_to_geom(payload.geometria)
    if payload.tipo is not None:
        potrero.tipo = payload.tipo
    if payload.estado_pasto is not None:
        potrero.estado_pasto = payload.estado_pasto
    if payload.hectareas is not None:
        potrero.hectareas = payload.hectareas
    if payload.tiene_suplementacion is not None:
        potrero.tiene_suplementacion = payload.tiene_suplementacion
    if payload.suplementacion_detalle is not None:
        potrero.suplementacion_detalle = payload.suplementacion_detalle
    if payload.tiene_franjas is not None:
        potrero.tiene_franjas = payload.tiene_franjas
    if payload.cantidad_franjas is not None:
        potrero.cantidad_franjas = payload.cantidad_franjas
    if payload.franjas_usadas is not None:
        potrero.franjas_usadas = payload.franjas_usadas
    if payload.dias_por_franja is not None:
        potrero.dias_por_franja = payload.dias_por_franja
    if payload.observaciones is not None:
        potrero.observaciones = payload.observaciones
    if payload.cultivo is not None:
        potrero.cultivo = payload.cultivo
    if payload.es_primera is not None:
        potrero.es_primera = payload.es_primera
    if payload.fecha_siembra is not None:
        potrero.fecha_siembra = payload.fecha_siembra
    if payload.coneat is not None:
        potrero.coneat = payload.coneat
    if payload.kg_producidos_anio is not None:
        potrero.kg_producidos_anio = payload.kg_producidos_anio

    await db.commit()
    await invalidar_cache_potrero(potrero_id, db)
    await db.refresh(potrero)
    return _potrero_to_read(potrero)


@router.get("/{potrero_id}/movimientos", response_model=list[MovimientoRead])
async def get_movimientos_potrero(
    potrero_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MovimientoRead]:
    """Historial de movimientos donde este potrero fue origen o destino."""
    await _get_own_potrero(potrero_id, current_user.id, db)

    result = await db.execute(
        select(MovimientoGanado)
        .where(
            MovimientoGanado.user_id == current_user.id,
            or_(
                MovimientoGanado.potrero_origen_id == potrero_id,
                MovimientoGanado.potrero_destino_id == potrero_id,
            ),
        )
        .order_by(MovimientoGanado.fecha_programada.desc())
    )
    movimientos = result.scalars().all()

    reads = []
    for mov in movimientos:
        origen = await db.get(Potrero, mov.potrero_origen_id)
        destino = await db.get(Potrero, mov.potrero_destino_id)
        reads.append(
            MovimientoRead(
                id=mov.id,
                user_id=mov.user_id,
                potrero_origen_id=mov.potrero_origen_id,
                potrero_destino_id=mov.potrero_destino_id,
                potrero_origen_nombre=origen.nombre if origen else "—",
                potrero_destino_nombre=destino.nombre if destino else "—",
                cantidad=mov.cantidad,
                especie=mov.especie,
                fecha_programada=mov.fecha_programada,
                fecha_ejecutada=mov.fecha_ejecutada,
                estado=mov.estado,
                notas=mov.notas,
                created_at=mov.created_at,
            )
        )
    return reads


@router.delete("/{potrero_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_potrero(
    potrero_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    potrero = await _get_own_potrero(potrero_id, current_user.id, db)
    await db.delete(potrero)
    await db.commit()


# ── Franjas de rotación ───────────────────────────────────────────────────────

def _franja_to_read(f: FranjaEstado, dias_en_franja: int | None, total_franjas: int) -> FranjaEstadoRead:
    """
    Convierte FranjaEstado ORM → schema con campos calculados.
    dias_en_franja: días que el lote permanece en cada franja.
    dias_descanso = (total_franjas - 1) * dias_en_franja
    """
    hoy = date.today()
    d_en_franja = dias_en_franja or 2
    d_descanso = max(1, (total_franjas - 1) * d_en_franja)

    if f.en_uso:
        estado = "en_uso"
        dias = (hoy - f.fecha_entrada).days if f.fecha_entrada else 0
        pct = min(100, int(dias / d_en_franja * 100))
    elif f.fecha_inicio_descanso:
        dias = (hoy - f.fecha_inicio_descanso).days
        pct = min(100, int(dias / d_descanso * 100))
        estado = "lista" if dias >= d_descanso else "descansando"
    else:
        estado = "libre"
        dias = 0
        pct = 0

    return FranjaEstadoRead(
        id=f.id,
        potrero_id=f.potrero_id,
        numero=f.numero,
        en_uso=f.en_uso,
        fecha_entrada=f.fecha_entrada,
        fecha_inicio_descanso=f.fecha_inicio_descanso,
        dias_descanso_objetivo=d_descanso,
        dias_en_estado=dias,
        estado=estado,
        descanso_pct=pct,
    )


async def _ensure_franjas(potrero: Potrero, db: AsyncSession) -> list[FranjaEstado]:
    """Crea registros de franja si no existen para el total configurado."""
    if not potrero.tiene_franjas or not potrero.cantidad_franjas:
        return []
    result = await db.execute(
        select(FranjaEstado)
        .where(FranjaEstado.potrero_id == potrero.id)
        .order_by(FranjaEstado.numero)
    )
    existentes = list(result.scalars().all())
    nums_existentes = {f.numero for f in existentes}

    nuevas = []
    for n in range(1, potrero.cantidad_franjas + 1):
        if n not in nums_existentes:
            nueva = FranjaEstado(
                potrero_id=potrero.id,
                numero=n,
                en_uso=False,
                dias_descanso_objetivo=potrero.dias_por_franja,
            )
            db.add(nueva)
            nuevas.append(nueva)

    if nuevas:
        await db.flush()
        existentes = existentes + nuevas
        existentes.sort(key=lambda f: f.numero)

    return existentes


@router.get("/{potrero_id}/franjas", response_model=list[FranjaEstadoRead])
async def get_franjas(
    potrero_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    potrero = await _get_own_potrero(potrero_id, current_user.id, db)
    franjas = await _ensure_franjas(potrero, db)
    if franjas:
        await db.commit()
    return [_franja_to_read(f, potrero.dias_por_franja, len(franjas)) for f in franjas]


@router.post("/{potrero_id}/franjas/mover", response_model=list[FranjaEstadoRead])
async def mover_franja(
    potrero_id: int,
    body: FranjaMoverRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mueve el lote de una franja a otra: la origen entra en descanso, la destino se activa."""
    potrero = await _get_own_potrero(potrero_id, current_user.id, db)
    franjas = await _ensure_franjas(potrero, db)

    hoy = date.today()
    franja_desde = next((f for f in franjas if f.numero == body.desde_franja), None)
    franja_hacia = next((f for f in franjas if f.numero == body.hacia_franja), None)

    if not franja_desde or not franja_hacia:
        raise HTTPException(status_code=404, detail="Número de franja no encontrado")

    # La franja origen entra en descanso
    franja_desde.en_uso = False
    franja_desde.fecha_inicio_descanso = hoy

    # La franja destino se activa
    franja_hacia.en_uso = True
    franja_hacia.fecha_entrada = hoy
    franja_hacia.fecha_inicio_descanso = None

    await db.commit()
    await db.refresh(franja_desde)
    await db.refresh(franja_hacia)

    return [_franja_to_read(f, potrero.dias_por_franja, len(franjas)) for f in franjas]


@router.put("/{potrero_id}/franjas/{numero}", response_model=FranjaEstadoRead)
async def update_franja(
    potrero_id: int,
    numero: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza el estado de una franja individual (para activarla/desactivarla manualmente)."""
    potrero = await _get_own_potrero(potrero_id, current_user.id, db)
    result = await db.execute(
        select(FranjaEstado).where(
            FranjaEstado.potrero_id == potrero_id,
            FranjaEstado.numero == numero,
        )
    )
    franja = result.scalar_one_or_none()
    if not franja:
        raise HTTPException(status_code=404, detail="Franja no encontrada")

    hoy = date.today()
    accion = body.get("accion")  # "activar" | "iniciar_descanso" | "resetear"

    if accion == "activar":
        franja.en_uso = True
        franja.fecha_entrada = hoy
        franja.fecha_inicio_descanso = None
    elif accion == "iniciar_descanso":
        franja.en_uso = False
        franja.fecha_inicio_descanso = hoy
    elif accion == "resetear":
        franja.en_uso = False
        franja.fecha_entrada = None
        franja.fecha_inicio_descanso = None

    await db.commit()
    await db.refresh(franja)
    total = potrero.cantidad_franjas or 1
    return _franja_to_read(franja, potrero.dias_por_franja, total)
