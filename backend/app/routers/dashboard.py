from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from geoalchemy2 import Geography
from sqlalchemy import case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.database import get_db
from app.deps import get_current_user
from app.models.categoria import Categoria, TipoMovimiento
from app.models.mapa import Animal, MovimientoGanado, Potrero
from app.models.registro import Registro
from app.models.user import User
from app.schemas.dashboard import (
    AnimalEspecie,
    DashboardResumen,
    MovimientoProximo,
)
from app.schemas.registro import ResumenCategoria, ResumenMes

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/resumen", response_model=DashboardResumen)
async def get_dashboard_resumen(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardResumen:
    """Resumen completo para el Dashboard: finanzas, campo y movimientos próximos."""
    uid = current_user.id

    # ── Finanzas ─────────────────────────────────────────────────────────────

    gastos_q = await db.execute(
        select(func.coalesce(func.sum(Registro.monto), 0)).where(
            Registro.user_id == uid, Registro.tipo == TipoMovimiento.gasto
        )
    )
    ingresos_q = await db.execute(
        select(func.coalesce(func.sum(Registro.monto), 0)).where(
            Registro.user_id == uid, Registro.tipo == TipoMovimiento.ingreso
        )
    )
    total_gastos = Decimal(str(gastos_q.scalar()))
    total_ingresos = Decimal(str(ingresos_q.scalar()))

    # Por categoría
    cat_q = await db.execute(
        select(
            Registro.categoria_id,
            Categoria.nombre,
            Categoria.tipo,
            Categoria.color,
            func.sum(Registro.monto).label("total"),
        )
        .join(Categoria, Registro.categoria_id == Categoria.id)
        .where(Registro.user_id == uid)
        .group_by(Registro.categoria_id, Categoria.nombre, Categoria.tipo, Categoria.color)
        .order_by(func.sum(Registro.monto).desc())
    )
    por_categoria = [
        ResumenCategoria(
            categoria_id=row.categoria_id,
            nombre=row.nombre,
            tipo=row.tipo,
            color=row.color,
            total=Decimal(str(row.total)),
        )
        for row in cat_q.all()
    ]

    # Por mes — últimos 12 meses
    mes_q = await db.execute(
        select(
            func.to_char(Registro.fecha, "YYYY-MM").label("mes"),
            func.sum(
                case((Registro.tipo == TipoMovimiento.gasto, Registro.monto), else_=0)
            ).label("gastos"),
            func.sum(
                case((Registro.tipo == TipoMovimiento.ingreso, Registro.monto), else_=0)
            ).label("ingresos"),
        )
        .where(
            Registro.user_id == uid,
            Registro.fecha >= date.today().replace(day=1) - timedelta(days=365),
        )
        .group_by("mes")
        .order_by("mes")
    )
    por_mes = [
        ResumenMes(
            mes=row.mes,
            gastos=Decimal(str(row.gastos)),
            ingresos=Decimal(str(row.ingresos)),
        )
        for row in mes_q.all()
    ]

    # ── Campo ─────────────────────────────────────────────────────────────────

    total_potreros_q = await db.execute(
        select(func.count()).select_from(Potrero).where(Potrero.user_id == uid)
    )
    total_potreros = total_potreros_q.scalar() or 0

    total_animales_q = await db.execute(
        select(func.coalesce(func.sum(Animal.cantidad), 0)).where(Animal.user_id == uid)
    )
    total_animales = int(total_animales_q.scalar() or 0)

    # Hectáreas: ST_Area sobre geography devuelve m², dividir por 10000
    hectareas_q = await db.execute(
        select(
            func.coalesce(
                func.sum(func.ST_Area(cast(Potrero.geometria, Geography()))) / 10000,
                0,
            )
        ).where(Potrero.user_id == uid)
    )
    hectareas_totales = Decimal(str(round(float(hectareas_q.scalar() or 0), 2)))

    # Animales por especie
    especie_q = await db.execute(
        select(
            Animal.especie,
            func.sum(Animal.cantidad).label("total"),
        )
        .where(Animal.user_id == uid)
        .group_by(Animal.especie)
        .order_by(func.sum(Animal.cantidad).desc())
    )
    animales_por_especie = [
        AnimalEspecie(especie=row.especie, total=int(row.total))
        for row in especie_q.all()
    ]

    # ── Movimientos próximos (7 días) ─────────────────────────────────────────

    today = date.today()
    next_week = today + timedelta(days=7)

    PotreroOrigen = aliased(Potrero)
    PotreroDestino = aliased(Potrero)

    mov_q = await db.execute(
        select(
            MovimientoGanado.id,
            MovimientoGanado.cantidad,
            MovimientoGanado.especie,
            MovimientoGanado.fecha_programada,
            PotreroOrigen.nombre.label("origen_nombre"),
            PotreroDestino.nombre.label("destino_nombre"),
        )
        .join(PotreroOrigen, MovimientoGanado.potrero_origen_id == PotreroOrigen.id)
        .join(PotreroDestino, MovimientoGanado.potrero_destino_id == PotreroDestino.id)
        .where(
            MovimientoGanado.user_id == uid,
            MovimientoGanado.estado == "programado",
            MovimientoGanado.fecha_programada >= today,
            MovimientoGanado.fecha_programada <= next_week,
        )
        .order_by(MovimientoGanado.fecha_programada)
    )
    movimientos_proximos = [
        MovimientoProximo(
            id=row.id,
            potrero_origen_nombre=row.origen_nombre,
            potrero_destino_nombre=row.destino_nombre,
            cantidad=row.cantidad,
            especie=row.especie,
            fecha_programada=row.fecha_programada,
        )
        for row in mov_q.all()
    ]

    return DashboardResumen(
        total_gastos=total_gastos,
        total_ingresos=total_ingresos,
        balance=total_ingresos - total_gastos,
        por_mes=por_mes,
        por_categoria=por_categoria,
        total_potreros=total_potreros,
        total_animales=total_animales,
        hectareas_totales=hectareas_totales,
        animales_por_especie=animales_por_especie,
        movimientos_proximos=movimientos_proximos,
    )
