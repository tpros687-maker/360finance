"""Sugerencia automática de imputación para registros de gasto."""
from dataclasses import dataclass
from typing import Optional

# Cada regla: (palabras_clave, tipo_imputacion, actividad_tipo_sugerida)
_REGLAS: list[tuple[list[str], str, Optional[str]]] = [
    (
        ["semilla", "fertilizante", "herbicida", "fungicida", "agroquímico", "agroquimico"],
        "directo",
        "ciclo",
    ),
    (
        ["sanidad", "vacuna", "suplemento", "sal", "minerales", "mineral"],
        "directo",
        "lote",
    ),
    (
        ["combustible", "gasoil", "energía", "energia", "luz", "mantenimiento", "reparación", "reparacion"],
        "prorrateo",
        None,
    ),
    (
        ["honorarios", "contador", "administración", "administracion", "seguro", "arrendamiento", "impuesto"],
        "estructural",
        None,
    ),
]


@dataclass
class SugerenciaImputacion:
    tipo_imputacion: str
    actividad_tipo: Optional[str]
    actividad_id: Optional[int]


def sugerir_imputacion(
    categoria_nombre: str,
    potreros_activos: list[int],
    lotes_activos: list[tuple[int, int]],   # [(lote_id, potrero_id), ...]
    ciclos_activos: list[tuple[int, int]],  # [(ciclo_id, potrero_id), ...]
) -> Optional[SugerenciaImputacion]:
    """
    Devuelve una sugerencia de imputación basada en el nombre de categoría.
    Si hay una sola actividad activa del tipo correspondiente, preselecciona su id.
    """
    nombre = categoria_nombre.lower()

    for keywords, tipo_imputacion, actividad_tipo in _REGLAS:
        if not any(kw in nombre for kw in keywords):
            continue

        actividad_id: Optional[int] = None

        if actividad_tipo == "ciclo" and len(ciclos_activos) == 1:
            actividad_id = ciclos_activos[0][0]
        elif actividad_tipo == "lote" and len(lotes_activos) == 1:
            actividad_id = lotes_activos[0][0]

        return SugerenciaImputacion(
            tipo_imputacion=tipo_imputacion,
            actividad_tipo=actividad_tipo,
            actividad_id=actividad_id,
        )

    return None
