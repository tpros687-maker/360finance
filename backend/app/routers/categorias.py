from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.categoria import Categoria
from app.models.user import User
from app.schemas.registro import CategoriaCreate, CategoriaRead

router = APIRouter(prefix="/categorias", tags=["categorias"])


@router.get("", response_model=list[CategoriaRead])
async def list_categorias(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Categoria]:
    """Devuelve categorías fijas (user_id IS NULL) + personalizadas del usuario."""
    result = await db.execute(
        select(Categoria)
        .where(or_(Categoria.user_id.is_(None), Categoria.user_id == current_user.id))
        .order_by(Categoria.tipo, Categoria.nombre)
    )
    return list(result.scalars().all())


@router.post("", response_model=CategoriaRead, status_code=status.HTTP_201_CREATED)
async def create_categoria(
    payload: CategoriaCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Categoria:
    categoria = Categoria(
        nombre=payload.nombre,
        tipo=payload.tipo,
        color=payload.color,
        es_personalizada=True,
        user_id=current_user.id,
    )
    db.add(categoria)
    await db.commit()
    await db.refresh(categoria)
    return categoria


@router.delete("/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_categoria(
    categoria_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(select(Categoria).where(Categoria.id == categoria_id))
    categoria = result.scalar_one_or_none()

    if categoria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoría no encontrada")
    if not categoria.es_personalizada or categoria.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo podés eliminar tus categorías personalizadas",
        )

    await db.delete(categoria)
    await db.commit()
