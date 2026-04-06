from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.registro import ResumenCategoria, ResumenMes


class AnimalEspecie(BaseModel):
    especie: str
    total: int


class MovimientoProximo(BaseModel):
    id: int
    potrero_origen_nombre: str
    potrero_destino_nombre: str
    cantidad: int
    especie: str
    fecha_programada: date


class DashboardResumen(BaseModel):
    # Financiero
    total_gastos: Decimal
    total_ingresos: Decimal
    balance: Decimal
    por_mes: list[ResumenMes]
    por_categoria: list[ResumenCategoria]
    # Campo
    total_potreros: int
    total_animales: int
    hectareas_totales: Decimal
    animales_por_especie: list[AnimalEspecie]
    # Próximos 7 días
    movimientos_proximos: list[MovimientoProximo]
