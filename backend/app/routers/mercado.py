"""
Router: /mercado
Predicciones de precios de ganado bovino para productores uruguayos.
"""
from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.models.user import User
from app.services import mercado as svc

router = APIRouter(prefix="/mercado", tags=["mercado"])


@router.get("/predicciones")
async def get_predicciones(
    _: User = Depends(get_current_user),
):
    """
    Devuelve predicciones de precios para todas las categorías de ganado.
    Resultado cacheado en memoria, se actualiza semanalmente.
    """
    data = svc.get_predicciones()
    return {
        "actualizado": svc.get_timestamp(),
        "categorias": list(data.values()),
    }


@router.get("/predicciones/{categoria_id}")
async def get_prediccion_categoria(
    categoria_id: str,
    _: User = Depends(get_current_user),
):
    """Devuelve la predicción para una categoría específica."""
    data = svc.get_predicciones()
    if categoria_id not in data:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return data[categoria_id]


@router.post("/actualizar")
async def actualizar_predicciones(
    _: User = Depends(get_current_user),
):
    """Fuerza la reconstrucción del cache de predicciones."""
    svc.get_predicciones(forzar=True)
    return {"ok": True, "actualizado": svc.get_timestamp()}
