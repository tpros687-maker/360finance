from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.categoria import Categoria, TipoMovimiento
from app.models.mapa import AplicacionPotrero, Potrero
from app.models.registro import Registro
from app.models.user import User
from app.schemas.mapa import AplicacionCreate, AplicacionRead

router = APIRouter(tags=["aplicaciones"])


async def _get_own_potrero(potrero_id: int, user_id: int, db: AsyncSession) -> Potrero:
    result = await db.execute(select(Potrero).where(Potrero.id == potrero_id))
    potrero = result.scalar_one_or_none()
    if potrero is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Potrero no encontrado")
    if potrero.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos sobre este potrero")
    return potrero


@router.get("/potreros/{potrero_id}/aplicaciones", response_model=list[AplicacionRead])
async def list_aplicaciones(
    potrero_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AplicacionRead]:
    await _get_own_potrero(potrero_id, current_user.id, db)
    result = await db.execute(
        select(AplicacionPotrero)
        .where(
            AplicacionPotrero.potrero_id == potrero_id,
            AplicacionPotrero.user_id == current_user.id,
        )
        .order_by(AplicacionPotrero.fecha_aplicacion.desc())
    )
    return list(result.scalars().all())


@router.post("/potreros/{potrero_id}/aplicaciones", response_model=AplicacionRead, status_code=status.HTTP_201_CREATED)
async def create_aplicacion(
    potrero_id: int,
    payload: AplicacionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AplicacionRead:
    await _get_own_potrero(potrero_id, current_user.id, db)

    aplicacion = AplicacionPotrero(
        potrero_id=potrero_id,
        user_id=current_user.id,
        producto=payload.producto,
        fecha_aplicacion=payload.fecha_aplicacion,
        costo=payload.costo,
        moneda=payload.moneda,
        observaciones=payload.observaciones,
    )
    db.add(aplicacion)
    await db.flush()

    if payload.costo is not None and payload.costo > 0:
        cat_result = await db.execute(
            select(Categoria)
            .where(
                Categoria.nombre == "Insumos agrícolas",
                Categoria.tipo == TipoMovimiento.gasto,
                or_(Categoria.user_id == current_user.id, Categoria.es_personalizada == False),
            )
            .limit(1)
        )
        categoria = cat_result.scalar_one_or_none()
        if categoria is None:
            categoria = Categoria(
                nombre="Insumos agrícolas",
                tipo=TipoMovimiento.gasto,
                es_personalizada=False,
                color="#f59e0b",
            )
            db.add(categoria)
            await db.flush()

        registro = Registro(
            user_id=current_user.id,
            categoria_id=categoria.id,
            potrero_id=potrero_id,
            tipo=TipoMovimiento.gasto,
            monto=payload.costo,
            moneda=payload.moneda,
            fecha=payload.fecha_aplicacion,
            descripcion=f"Aplicación: {payload.producto}",
        )
        db.add(registro)
        await db.flush()
        aplicacion.registro_id = registro.id

    await db.commit()
    await db.refresh(aplicacion)
    return aplicacion


@router.delete("/aplicaciones/{aplicacion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_aplicacion(
    aplicacion_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(AplicacionPotrero).where(AplicacionPotrero.id == aplicacion_id)
    )
    aplicacion = result.scalar_one_or_none()
    if aplicacion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aplicación no encontrada")
    if aplicacion.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    await db.delete(aplicacion)
    await db.commit()
