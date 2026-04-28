from datetime import date, datetime
from decimal import Decimal
from typing import Optional

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


# ── Recomendaciones IA ────────────────────────────────────────────────────────

class RecomendacionIA(BaseModel):
    titulo: str
    detalle: str
    prioridad: str  # alta | media | baja
    categoria: str  # finanzas | campo | ganaderia | general


# ── Alertas ───────────────────────────────────────────────────────────────────

class AlertaItem(BaseModel):
    tipo: str
    nivel: str  # "danger" | "warning" | "info"
    titulo: str
    detalle: str


# ── Flujo de Caja ─────────────────────────────────────────────────────────────

class ItemFlujo(BaseModel):
    id: int
    tipo: str  # "cobro" | "pago"
    descripcion: Optional[str]
    contraparte: str
    monto: float
    moneda: str
    fecha_vencimiento: Optional[datetime]
    dias_restantes: Optional[int]
    vencido: bool


class SemanaFlujo(BaseModel):
    semana_label: str
    cobros: float
    pagos: float
    balance_semana: float
    balance_acumulado: float


class FlujoCajaResponse(BaseModel):
    total_por_cobrar: float
    total_por_pagar: float
    balance_proyectado: float
    alerta_liquidez: bool
    semanas: list[SemanaFlujo]
    cobros_pendientes: list[ItemFlujo]
    pagos_pendientes: list[ItemFlujo]
    cobros_vencidos: list[ItemFlujo]
    pagos_vencidos: list[ItemFlujo]


# ── Dashboard principal ────────────────────────────────────────────────────────

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
