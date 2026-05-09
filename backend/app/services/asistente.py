"""Servicio de Asistente IA usando Groq (llama-3.3-70b-versatile)."""
from datetime import date, timedelta
from decimal import Decimal

from geoalchemy2 import Geography
from groq import Groq
from sqlalchemy import case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.config import settings
from app.models.categoria import Categoria, TipoMovimiento
from app.models.cliente import CuentaCobrar, CuentaPagar
from app.models.mapa import Animal, MovimientoGanado, Potrero
from app.models.registro import Registro
from app.models.user import User
from app.schemas.asistente import MensajeChat
from app.services.rentabilidad import calcular_proyeccion_anual, calcular_rentabilidad_potrero

SYSTEM_PROMPT = (
    "Sos un asesor financiero rural y agrónomo experto en ganadería, agricultura y gestión "
    "de campo para Uruguay y Argentina. Hablás en español rioplatense, de forma directa y sin rodeos. "
    "Tus respuestas son cortas, accionables y van al grano — si hay un problema lo decís claro, "
    "si hay una oportunidad la señalás con números concretos. "
    "\n\n"
    "Tenés acceso a los datos reales del productor: registros financieros, estado de cada potrero, "
    "rentabilidad por potrero y actividad (margen neto/ha/año), semáforo de rentabilidad "
    "(🟢 verde ≥ USD 150/ha, 🟡 amarillo USD 80-150/ha, 🔴 rojo < USD 80/ha), "
    "y proyección al cierre del año en tres escenarios (pesimista, base, optimista). "
    "\n\n"
    "Podés responder preguntas como: "
    "'¿Cuál es mi potrero más rentable?', "
    "'¿Por qué el potrero X tiene semáforo rojo?', "
    "'¿Cómo voy a cerrar el año?', "
    "'¿Cuánto perdí en el potrero X este mes?', "
    "'¿Qué actividad me conviene más: ganadería o agricultura?'. "
    "\n\n"
    "Cuando el productor pregunta algo sobre sus datos, usá la información del contexto para "
    "dar respuestas precisas con los números reales. Si los datos son proyectados o parciales, "
    "aclaralo. Si no tenés información suficiente, decilo directo."
)


def _semaforo(val: "Decimal | None") -> str:
    if val is None:
        return "⬜ sin datos"
    if val >= 150:
        return "🟢 verde"
    if val >= 80:
        return "🟡 amarillo"
    return "🔴 rojo"


async def _contexto_rentabilidad(user: User, db: AsyncSession) -> str:
    """Agrega rentabilidad por potrero y proyección anual al contexto del asistente."""
    hoy = date.today()
    inicio_anio = date(hoy.year, 1, 1)

    lineas: list[str] = ["", "=== RENTABILIDAD POR POTRERO (año en curso) ==="]

    pot_res = await db.execute(select(Potrero).where(Potrero.user_id == user.id))
    potreros = pot_res.scalars().all()

    for potrero in potreros:
        try:
            r = await calcular_rentabilidad_potrero(
                potrero_id=potrero.id,
                periodo_desde=inicio_anio,
                periodo_hasta=hoy,
                user_id=user.id,
                db=db,
            )
            sem = _semaforo(r.margen_neto_ha_anualizado_usd)
            acts = ", ".join(a.nombre for a in r.actividades) or "sin actividades registradas"
            margen_ha = f"${r.margen_neto_ha_anualizado_usd:,.0f}" if r.margen_neto_ha_anualizado_usd is not None else "—"
            lineas.append(
                f"  • {r.nombre} {sem}: MB/ha/año={margen_ha} USD, "
                f"margen total=${r.margen_neto_usd:,.0f} USD"
                + (", datos parciales/proyectados" if r.es_proyectado else "")
            )
            lineas.append(f"    Actividades: {acts}")
            lineas.append(
                f"    Gastos prorrateados: ${r.gastos_prorrateados_usd:,.0f} USD, "
                f"estructurales: ${r.gastos_estructurales_usd:,.0f} USD"
            )
        except Exception:
            continue

    if len(lineas) == 2:
        lineas.append("  • Sin datos de rentabilidad disponibles para el año en curso")

    try:
        proy = await calcular_proyeccion_anual(user_id=user.id, db=db)
        lineas += [
            "",
            "=== PROYECCIÓN AL CIERRE DEL AÑO ===",
            f"  Basado en {proy.periodo_analizado_dias} días de datos reales",
            (
                f"  Pesimista: margen ${proy.pesimista.margen_usd:,.0f} USD"
                + (f" · ${proy.pesimista.margen_ha_usd:,.0f}/ha" if proy.pesimista.margen_ha_usd else "")
            ),
            (
                f"  Base:      margen ${proy.base.margen_usd:,.0f} USD"
                + (f" · ${proy.base.margen_ha_usd:,.0f}/ha" if proy.base.margen_ha_usd else "")
            ),
            (
                f"  Optimista: margen ${proy.optimista.margen_usd:,.0f} USD"
                + (f" · ${proy.optimista.margen_ha_usd:,.0f}/ha" if proy.optimista.margen_ha_usd else "")
            ),
        ]
    except Exception:
        pass

    return "\n".join(lineas)


def _get_client() -> Groq:
    return Groq(api_key=settings.GROQ_API_KEY)


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

    # ── Mes actual vs mismo mes año anterior ─────────────────────────────────
    primer_mes = hoy.replace(day=1)
    mismo_mes_ant = f"{hoy.year - 1}-{hoy.month:02d}"

    gm_q = await db.execute(
        select(func.coalesce(func.sum(Registro.monto), 0)).where(
            Registro.user_id == uid, Registro.tipo == TipoMovimiento.gasto, Registro.fecha >= primer_mes,
        )
    )
    im_q = await db.execute(
        select(func.coalesce(func.sum(Registro.monto), 0)).where(
            Registro.user_id == uid, Registro.tipo == TipoMovimiento.ingreso, Registro.fecha >= primer_mes,
        )
    )
    gm_ant_q = await db.execute(
        select(func.coalesce(func.sum(Registro.monto), 0)).where(
            Registro.user_id == uid, Registro.tipo == TipoMovimiento.gasto,
            func.to_char(Registro.fecha, "YYYY-MM") == mismo_mes_ant,
        )
    )
    im_ant_q = await db.execute(
        select(func.coalesce(func.sum(Registro.monto), 0)).where(
            Registro.user_id == uid, Registro.tipo == TipoMovimiento.ingreso,
            func.to_char(Registro.fecha, "YYYY-MM") == mismo_mes_ant,
        )
    )
    gastos_mes = float(gm_q.scalar() or 0)
    ingresos_mes = float(im_q.scalar() or 0)
    gastos_mes_ant = float(gm_ant_q.scalar() or 0)
    ingresos_mes_ant = float(im_ant_q.scalar() or 0)

    # ── Cuentas pendientes ───────────────────────────────────────────────────
    tc_q = await db.execute(
        select(func.coalesce(func.sum(CuentaCobrar.monto), 0)).where(
            CuentaCobrar.user_id == uid, CuentaCobrar.pagado == False  # noqa: E712
        )
    )
    tp_q = await db.execute(
        select(func.coalesce(func.sum(CuentaPagar.monto), 0)).where(
            CuentaPagar.user_id == uid, CuentaPagar.pagado == False  # noqa: E712
        )
    )
    cv_q = await db.execute(
        select(func.count(CuentaCobrar.id)).where(
            CuentaCobrar.user_id == uid, CuentaCobrar.pagado == False,  # noqa: E712
            CuentaCobrar.fecha_vencimiento.isnot(None),
            CuentaCobrar.fecha_vencimiento < func.current_date(),
        )
    )
    pv_q = await db.execute(
        select(func.count(CuentaPagar.id)).where(
            CuentaPagar.user_id == uid, CuentaPagar.pagado == False,  # noqa: E712
            CuentaPagar.fecha_vencimiento.isnot(None),
            CuentaPagar.fecha_vencimiento < func.current_date(),
        )
    )
    total_cobrar = float(tc_q.scalar() or 0)
    total_pagar = float(tp_q.scalar() or 0)
    cobrar_venc = int(cv_q.scalar() or 0)
    pagar_venc = int(pv_q.scalar() or 0)

    # ── Potreros resumen (últimos 90 días) ───────────────────────────────────
    cutoff_90 = hoy - timedelta(days=90)

    potr_q = await db.execute(
        select(
            Potrero.id,
            Potrero.nombre,
            Potrero.hectareas,
            func.coalesce(func.sum(Animal.cantidad), 0).label("animales"),
        )
        .outerjoin(Animal, Animal.potrero_id == Potrero.id)
        .where(Potrero.user_id == uid)
        .group_by(Potrero.id, Potrero.nombre, Potrero.hectareas)
        .order_by(Potrero.nombre)
    )
    potreros_lista = potr_q.all()

    reg_pot_q = await db.execute(
        select(
            Registro.potrero_id,
            func.sum(case((Registro.tipo == TipoMovimiento.gasto, Registro.monto), else_=0)).label("gastos"),
            func.sum(case((Registro.tipo == TipoMovimiento.ingreso, Registro.monto), else_=0)).label("ingresos"),
        )
        .where(
            Registro.user_id == uid,
            Registro.potrero_id.isnot(None),
            Registro.fecha >= cutoff_90,
        )
        .group_by(Registro.potrero_id)
    )
    reg_por_potrero: dict[int, object] = {row.potrero_id: row for row in reg_pot_q.all()}

    # ── Alertas activas ──────────────────────────────────────────────────────
    alertas_ctx: list[str] = []

    # Descanso excesivo
    des_q = await db.execute(
        select(Potrero.nombre, Potrero.fecha_descanso).where(
            Potrero.user_id == uid,
            Potrero.en_descanso == True,  # noqa: E712
            Potrero.fecha_descanso.isnot(None),
            Potrero.fecha_descanso <= hoy - timedelta(days=45),
        )
    )
    for nombre_p, fd in des_q.all():
        alertas_ctx.append(f"Potrero «{nombre_p}» lleva {(hoy - fd).days} días en descanso")

    if cobrar_venc:
        alertas_ctx.append(f"{cobrar_venc} cuenta(s) por cobrar vencida(s)")
    if pagar_venc:
        alertas_ctx.append(f"{pagar_venc} pago(s) a proveedor vencido(s)")

    # Gasto elevado (vs promedio anual mensualizado)
    avg_mensual = float(total_gastos) / 12 if total_gastos > 0 else 0
    if avg_mensual > 0 and gastos_mes > avg_mensual * 1.30:
        pct_el = (gastos_mes / avg_mensual - 1) * 100
        alertas_ctx.append(f"Gastos del mes {pct_el:.0f}% por encima del promedio mensual")

    # Potreros con animales sin ingresos en 90 días
    ingr_ids_q = await db.execute(
        select(Registro.potrero_id).where(
            Registro.user_id == uid, Registro.tipo == TipoMovimiento.ingreso,
            Registro.potrero_id.isnot(None), Registro.fecha >= cutoff_90,
        ).distinct()
    )
    ingr_ids = {r[0] for r in ingr_ids_q.all()}
    anim_ids = {row.id for row in potreros_lista if int(row.animales) > 0}  # type: ignore[arg-type]
    for pid in anim_ids - ingr_ids:
        nombre_p = next((r.nombre for r in potreros_lista if r.id == pid), str(pid))
        alertas_ctx.append(f"Potrero «{nombre_p}» tiene animales sin ingresos en 90 días")

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

    # ── Mes actual ────────────────────────────────────────────────────────────
    lineas += [
        "",
        f"=== MES ACTUAL ({hoy.strftime('%m/%Y')}) ===",
        f"- Gastos: ${gastos_mes:,.2f}",
        f"- Ingresos: ${ingresos_mes:,.2f}",
        f"- Balance del mes: ${ingresos_mes - gastos_mes:,.2f}",
        f"  Comparación mismo mes año anterior ({mismo_mes_ant}):",
        f"  Gastos ant.: ${gastos_mes_ant:,.2f}" + (
            f" ({((gastos_mes / gastos_mes_ant - 1) * 100):+.0f}%)" if gastos_mes_ant > 0 else ""
        ),
        f"  Ingresos ant.: ${ingresos_mes_ant:,.2f}" + (
            f" ({((ingresos_mes / ingresos_mes_ant - 1) * 100):+.0f}%)" if ingresos_mes_ant > 0 else ""
        ),
    ]

    # ── Cuentas pendientes ────────────────────────────────────────────────────
    lineas += [
        "",
        "=== CUENTAS PENDIENTES ===",
        f"- Por cobrar: ${total_cobrar:,.2f}" + (f" ({cobrar_venc} vencida(s))" if cobrar_venc else ""),
        f"- Por pagar:  ${total_pagar:,.2f}" + (f" ({pagar_venc} vencida(s))" if pagar_venc else ""),
    ]

    # ── Potreros resumen ──────────────────────────────────────────────────────
    if potreros_lista:
        lineas.append("")
        lineas.append("=== POTREROS — RESUMEN (últimos 90 días) ===")
        for row in potreros_lista:
            reg = reg_por_potrero.get(row.id)  # type: ignore[union-attr]
            g = float(reg.gastos) if reg else 0  # type: ignore[union-attr]
            i = float(reg.ingresos) if reg else 0  # type: ignore[union-attr]
            ha = f"{float(row.hectareas):.1f} ha" if row.hectareas else "sin ha registradas"
            lineas.append(
                f"  • {row.nombre} ({ha}, {int(row.animales)} animales): "
                f"gastos ${g:,.0f}, ingresos ${i:,.0f}"
            )

    # ── Alertas activas ───────────────────────────────────────────────────────
    lineas.append("")
    lineas.append("=== ALERTAS ACTIVAS ===")
    if alertas_ctx:
        for a in alertas_ctx:
            lineas.append(f"  ⚠ {a}")
    else:
        lineas.append("  • Sin alertas activas")

    # ── Rentabilidad y proyección ─────────────────────────────────────────────
    try:
        rent_ctx = await _contexto_rentabilidad(user, db)
        lineas.append(rent_ctx)
    except Exception:
        pass

    return "\n".join(lineas)


async def chat(
    mensaje: str,
    historial: list[MensajeChat],
    contexto: str,
) -> str:
    client = _get_client()

    messages = [{"role": "system", "content": SYSTEM_PROMPT + "\n\n" + contexto}]

    for msg in historial:
        role = "user" if msg.role == "user" else "assistant"
        messages.append({"role": role, "content": msg.content})

    messages.append({"role": "user", "content": mensaje})

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=2048,
        temperature=0.7,
    )

    return response.choices[0].message.content or "Lo siento, no pude generar una respuesta."
