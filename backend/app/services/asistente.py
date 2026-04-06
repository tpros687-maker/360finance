"""Servicio de Asistente IA usando Google Gemini 2.0 Flash."""
from datetime import date, timedelta
from decimal import Decimal

from geoalchemy2 import Geography
from google import genai
from google.genai import types
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.config import settings
from app.models.categoria import Categoria, TipoMovimiento
from app.models.mapa import Animal, MovimientoGanado, Potrero
from app.models.registro import Registro
from app.models.user import User
from app.schemas.asistente import MensajeChat

SYSTEM_PROMPT = (
    "Sos un asistente agropecuario experto en ganadería, agricultura y gestión de campo "
    "para Uruguay y Argentina. Tenés acceso a los datos reales del productor que se te "
    "proporcionan como contexto. Respondé siempre en español, de forma clara y práctica. "
    "Cuando el productor te pregunte sobre sus datos, utilizá la información del contexto "
    "para dar respuestas precisas y útiles. Si no tenés información suficiente para responder "
    "algo específico, indicalo claramente."
)


def _get_client() -> genai.Client:
    return genai.Client(api_key=settings.GEMINI_API_KEY)


async def construir_contexto(user: User, db: AsyncSession) -> str:
    """Consulta la BD y arma un resumen del productor para inyectar como contexto."""
    uid = user.id
    hoy = date.today()

    # ── Finanzas último año ───────────────────────────────────────────────────
    hace_un_anio = hoy.replace(day=1) - timedelta(days=365)

    gastos_q = await db.execute(
        select(func.coalesce(func.sum(Registro.monto), 0)).where(
            Registro.user_id == uid,
            Registro.tipo == TipoMovimiento.gasto,
            Registro.fecha >= hace_un_anio,
        )
    )
    ingresos_q = await db.execute(
        select(func.coalesce(func.sum(Registro.monto), 0)).where(
            Registro.user_id == uid,
            Registro.tipo == TipoMovimiento.ingreso,
            Registro.fecha >= hace_un_anio,
        )
    )
    total_gastos = Decimal(str(gastos_q.scalar()))
    total_ingresos = Decimal(str(ingresos_q.scalar()))
    balance = total_ingresos - total_gastos

    # Top 5 categorías de gasto
    cat_q = await db.execute(
        select(
            Categoria.nombre,
            Categoria.tipo,
            func.sum(Registro.monto).label("total"),
        )
        .join(Categoria, Registro.categoria_id == Categoria.id)
        .where(
            Registro.user_id == uid,
            Registro.tipo == TipoMovimiento.gasto,
            Registro.fecha >= hace_un_anio,
        )
        .group_by(Categoria.nombre, Categoria.tipo)
        .order_by(func.sum(Registro.monto).desc())
        .limit(5)
    )
    top_gastos = cat_q.all()

    # ── Campo ─────────────────────────────────────────────────────────────────
    total_potreros_q = await db.execute(
        select(func.count()).select_from(Potrero).where(Potrero.user_id == uid)
    )
    total_potreros = total_potreros_q.scalar() or 0

    hectareas_q = await db.execute(
        select(
            func.coalesce(
                func.sum(func.ST_Area(cast(Potrero.geometria, Geography()))) / 10000,
                0,
            )
        ).where(Potrero.user_id == uid)
    )
    hectareas_totales = round(float(hectareas_q.scalar() or 0), 2)

    especie_q = await db.execute(
        select(
            Animal.especie,
            func.sum(Animal.cantidad).label("total"),
        )
        .where(Animal.user_id == uid)
        .group_by(Animal.especie)
        .order_by(func.sum(Animal.cantidad).desc())
    )
    animales_por_especie = especie_q.all()

    # ── Movimientos próximos 7 días ───────────────────────────────────────────
    proxima_semana = hoy + timedelta(days=7)
    PotreroOrigen = aliased(Potrero)
    PotreroDestino = aliased(Potrero)

    mov_q = await db.execute(
        select(
            MovimientoGanado.cantidad,
            MovimientoGanado.especie,
            MovimientoGanado.fecha_programada,
            PotreroOrigen.nombre.label("origen"),
            PotreroDestino.nombre.label("destino"),
        )
        .join(PotreroOrigen, MovimientoGanado.potrero_origen_id == PotreroOrigen.id)
        .join(PotreroDestino, MovimientoGanado.potrero_destino_id == PotreroDestino.id)
        .where(
            MovimientoGanado.user_id == uid,
            MovimientoGanado.estado == "programado",
            MovimientoGanado.fecha_programada >= hoy,
            MovimientoGanado.fecha_programada <= proxima_semana,
        )
        .order_by(MovimientoGanado.fecha_programada)
    )
    movimientos_proximos = mov_q.all()

    # ── Armar texto de contexto ───────────────────────────────────────────────
    lineas = [
        f"DATOS DEL PRODUCTOR: {user.nombre} {user.apellido}",
        f"Fecha actual: {hoy.strftime('%d/%m/%Y')}",
        "",
        "=== RESUMEN FINANCIERO (último año) ===",
        f"- Total gastos: ${total_gastos:,.2f}",
        f"- Total ingresos: ${total_ingresos:,.2f}",
        f"- Balance: ${balance:,.2f} ({'positivo' if balance >= 0 else 'negativo'})",
    ]

    if top_gastos:
        lineas.append("")
        lineas.append("Top 5 categorías de gasto:")
        for row in top_gastos:
            lineas.append(f"  • {row.nombre}: ${Decimal(str(row.total)):,.2f}")

    lineas += [
        "",
        "=== CAMPO ===",
        f"- Potreros registrados: {total_potreros}",
        f"- Superficie total: {hectareas_totales} ha",
    ]

    if animales_por_especie:
        lineas.append("- Animales por especie:")
        for row in animales_por_especie:
            lineas.append(f"  • {row.especie}: {int(row.total)} cabezas")
    else:
        lineas.append("- Sin animales registrados")

    if movimientos_proximos:
        lineas.append("")
        lineas.append("=== MOVIMIENTOS PROGRAMADOS (próximos 7 días) ===")
        for mov in movimientos_proximos:
            fecha_str = mov.fecha_programada.strftime("%d/%m/%Y")
            lineas.append(
                f"  • {fecha_str}: {mov.cantidad} {mov.especie} de '{mov.origen}' a '{mov.destino}'"
            )
    else:
        lineas.append("")
        lineas.append("=== MOVIMIENTOS PRÓXIMOS ===")
        lineas.append("  • Sin movimientos programados para los próximos 7 días")

    return "\n".join(lineas)


async def chat(
    mensaje: str,
    historial: list[MensajeChat],
    contexto: str,
) -> str:
    """Llama a Gemini con el historial y contexto del productor. Retorna la respuesta."""
    client = _get_client()

    # Construir contents con contexto inyectado al inicio
    contents: list[types.Content] = []

    # Primer mensaje del sistema: contexto del productor como primer turno de usuario
    if not historial:
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part(text=f"[CONTEXTO DEL PRODUCTOR]\n{contexto}")],
            )
        )
        contents.append(
            types.Content(
                role="model",
                parts=[types.Part(text="Entendido. Tengo acceso a tus datos y estoy listo para ayudarte.")],
            )
        )
    else:
        # Reconstituir historial previo (que ya incluye el contexto inicial)
        for msg in historial:
            role = "user" if msg.role == "user" else "model"
            contents.append(
                types.Content(role=role, parts=[types.Part(text=msg.content)])
            )

    # Agregar mensaje actual
    contents.append(
        types.Content(role="user", parts=[types.Part(text=mensaje)])
    )

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            max_output_tokens=2048,
            temperature=0.7,
        ),
    )

    return response.text or "Lo siento, no pude generar una respuesta. Intentá de nuevo."
