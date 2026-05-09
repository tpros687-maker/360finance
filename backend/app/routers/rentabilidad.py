import io
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.categoria import Categoria, TipoMovimiento
from app.models.mapa import Potrero
from app.models.produccion import CicloAgricola, LoteGanado
from app.models.registro import Registro
from app.models.user import User
from app.services.imputacion import sugerir_imputacion
from app.services.rentabilidad import (
    EscenarioProyeccion as SvcEscenario,
    PotreroRentabilidad,
    ProyeccionAnualResult,
    calcular_proyeccion_anual,
    calcular_rentabilidad_potrero,
    convertir_a_usd,
)

router = APIRouter(prefix="/rentabilidad", tags=["rentabilidad"])


class GastoResumen(BaseModel):
    id: int
    fecha: date
    descripcion: Optional[str]
    monto: Decimal
    moneda: str
    monto_usd: Decimal
    tipo_imputacion: Optional[str]
    actividad_tipo: Optional[str]
    actividad_id: Optional[int]


class PotreroRentabilidadDetalle(PotreroRentabilidad):
    top_gastos: list[GastoResumen]


@router.get("/potreros", response_model=list[PotreroRentabilidad])
async def listar_rentabilidad_potreros(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(Potrero).where(Potrero.user_id == current_user.id)
    )
    potreros = res.scalars().all()

    resultados: list[PotreroRentabilidad] = []
    for potrero in potreros:
        try:
            r = await calcular_rentabilidad_potrero(
                potrero_id=potrero.id,
                periodo_desde=fecha_desde,
                periodo_hasta=fecha_hasta,
                user_id=current_user.id,
                db=db,
            )
            resultados.append(r)
        except Exception:
            continue

    resultados.sort(
        key=lambda r: r.margen_neto_ha_anualizado_usd
        if r.margen_neto_ha_anualizado_usd is not None
        else r.margen_neto_usd,
        reverse=True,
    )

    return resultados


@router.get("/potreros/{potrero_id}", response_model=PotreroRentabilidadDetalle)
async def detalle_rentabilidad_potrero(
    potrero_id: int,
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        base = await calcular_rentabilidad_potrero(
            potrero_id=potrero_id,
            periodo_desde=fecha_desde,
            periodo_hasta=fecha_hasta,
            user_id=current_user.id,
            db=db,
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Potrero no encontrado")

    # Top 5 gastos del período para ese potrero (directos + imputados a sus actividades)
    filtros = [
        Registro.tipo == TipoMovimiento.gasto,
        Registro.user_id == current_user.id,
        Registro.potrero_id == potrero_id,
    ]
    if fecha_desde:
        filtros.append(Registro.fecha >= fecha_desde)
    if fecha_hasta:
        filtros.append(Registro.fecha <= fecha_hasta)

    g_res = await db.execute(
        select(Registro).where(*filtros).order_by(Registro.monto.desc()).limit(5)
    )
    registros_top = g_res.scalars().all()

    top_gastos: list[GastoResumen] = []
    for reg in registros_top:
        monto_usd = await convertir_a_usd(
            Decimal(str(reg.monto)), reg.moneda, reg.fecha, db
        )
        top_gastos.append(GastoResumen(
            id=reg.id,
            fecha=reg.fecha,
            descripcion=reg.descripcion,
            monto=reg.monto,
            moneda=reg.moneda,
            monto_usd=monto_usd,
            tipo_imputacion=reg.tipo_imputacion,
            actividad_tipo=reg.actividad_tipo,
            actividad_id=reg.actividad_id,
        ))

    return PotreroRentabilidadDetalle(**base.model_dump(), top_gastos=top_gastos)


class PotreroRentabilidadAnio(PotreroRentabilidad):
    anio: int


@router.get("/potreros/{potrero_id}/historico", response_model=list[PotreroRentabilidadAnio])
async def historico_rentabilidad_potrero(
    potrero_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hoy = date.today()
    anio_actual = hoy.year

    periodos = [
        (anio_actual - 3, date(anio_actual - 3, 1, 1), date(anio_actual - 3, 12, 31)),
        (anio_actual - 2, date(anio_actual - 2, 1, 1), date(anio_actual - 2, 12, 31)),
        (anio_actual - 1, date(anio_actual - 1, 1, 1), date(anio_actual - 1, 12, 31)),
        (anio_actual,     date(anio_actual, 1, 1),     hoy),
    ]

    resultados: list[PotreroRentabilidadAnio] = []
    for anio, desde, hasta in periodos:
        try:
            r = await calcular_rentabilidad_potrero(
                potrero_id=potrero_id,
                periodo_desde=desde,
                periodo_hasta=hasta,
                user_id=current_user.id,
                db=db,
            )
            resultados.append(PotreroRentabilidadAnio(**r.model_dump(), anio=anio))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Potrero no encontrado")
        except Exception:
            continue

    return resultados


@router.get("/potreros/{potrero_id}/gastos", response_model=list[GastoResumen])
async def gastos_potrero(
    potrero_id: int,
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify ownership
    pot_res = await db.execute(
        select(Potrero).where(Potrero.id == potrero_id, Potrero.user_id == current_user.id)
    )
    if pot_res.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Potrero no encontrado")

    filtros = [
        Registro.tipo == TipoMovimiento.gasto,
        Registro.user_id == current_user.id,
        Registro.potrero_id == potrero_id,
    ]
    if fecha_desde:
        filtros.append(Registro.fecha >= fecha_desde)
    if fecha_hasta:
        filtros.append(Registro.fecha <= fecha_hasta)

    res = await db.execute(
        select(Registro).where(*filtros).order_by(Registro.monto.desc())
    )
    registros = res.scalars().all()

    resultado: list[GastoResumen] = []
    for reg in registros:
        monto_usd = await convertir_a_usd(
            Decimal(str(reg.monto)), reg.moneda, reg.fecha, db
        )
        resultado.append(GastoResumen(
            id=reg.id,
            fecha=reg.fecha,
            descripcion=reg.descripcion,
            monto=reg.monto,
            moneda=reg.moneda,
            monto_usd=monto_usd,
            tipo_imputacion=reg.tipo_imputacion,
            actividad_tipo=reg.actividad_tipo,
            actividad_id=reg.actividad_id,
        ))

    return resultado


@router.get("/proyeccion", response_model=ProyeccionAnualResult)
async def proyeccion_anual(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await calcular_proyeccion_anual(user_id=current_user.id, db=db)


@router.get("/exportar-pdf")
async def exportar_rentabilidad_pdf(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    potrero_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from reportlab.lib import colors as rl_colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    hoy = date.today()
    desde_str = fecha_desde.strftime("%d/%m/%Y") if fecha_desde else f"01/01/{hoy.year}"
    hasta_str = fecha_hasta.strftime("%d/%m/%Y") if fecha_hasta else hoy.strftime("%d/%m/%Y")

    # ── Data gathering ───────────────────────────────────────────────────────
    if potrero_id is not None:
        chk = await db.execute(
            select(Potrero).where(Potrero.id == potrero_id, Potrero.user_id == current_user.id)
        )
        if chk.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Potrero no encontrado")
        pot_res = await db.execute(select(Potrero).where(Potrero.id == potrero_id))
    else:
        pot_res = await db.execute(select(Potrero).where(Potrero.user_id == current_user.id))
    potreros_list = pot_res.scalars().all()

    rentabilidades: list[PotreroRentabilidad] = []
    for p in potreros_list:
        try:
            r = await calcular_rentabilidad_potrero(
                potrero_id=p.id,
                periodo_desde=fecha_desde,
                periodo_hasta=fecha_hasta,
                user_id=current_user.id,
                db=db,
            )
            rentabilidades.append(r)
        except Exception:
            continue
    rentabilidades.sort(
        key=lambda r: r.margen_neto_ha_anualizado_usd
        if r.margen_neto_ha_anualizado_usd is not None
        else r.margen_neto_usd,
        reverse=True,
    )

    # Gastos agrupados por categoría
    filtros_cat = [
        Registro.tipo == TipoMovimiento.gasto,
        Registro.user_id == current_user.id,
    ]
    if potrero_id is not None:
        filtros_cat.append(Registro.potrero_id == potrero_id)
    if fecha_desde:
        filtros_cat.append(Registro.fecha >= fecha_desde)
    if fecha_hasta:
        filtros_cat.append(Registro.fecha <= fecha_hasta)

    cat_res = await db.execute(
        select(Categoria.nombre, func.sum(Registro.monto).label("total"))
        .join(Categoria, Registro.categoria_id == Categoria.id)
        .where(*filtros_cat)
        .group_by(Categoria.nombre)
        .order_by(func.sum(Registro.monto).desc())
    )
    gastos_cat = cat_res.all()

    # Proyección solo para establecimiento completo
    proyeccion = None
    if potrero_id is None:
        try:
            proyeccion = await calcular_proyeccion_anual(user_id=current_user.id, db=db)
        except Exception:
            pass

    # ── PDF layout helpers ───────────────────────────────────────────────────
    C_DARK = rl_colors.HexColor("#1E293B")
    C_GREEN = rl_colors.HexColor("#10B981")
    C_RED = rl_colors.HexColor("#EF4444")
    C_YELLOW = rl_colors.HexColor("#F59E0B")
    C_LIGHT = rl_colors.HexColor("#F8FAFC")
    C_BORDER = rl_colors.HexColor("#CBD5E1")
    C_MID = rl_colors.HexColor("#64748B")

    pw = A4[0] - 30 * mm

    s_title = ParagraphStyle("s_title", fontSize=14, textColor=rl_colors.white, fontName="Helvetica-Bold")
    s_sub   = ParagraphStyle("s_sub",   fontSize=8,  textColor=rl_colors.HexColor("#94A3B8"), fontName="Helvetica")
    s_h2    = ParagraphStyle("s_h2",    fontSize=10, textColor=C_DARK, fontName="Helvetica-Bold", spaceBefore=4*mm, spaceAfter=2*mm)
    s_note  = ParagraphStyle("s_note",  fontSize=7,  textColor=C_MID,  fontName="Helvetica")

    def fmt(v: Optional[Decimal]) -> str:
        return "—" if v is None else f"USD {float(v):,.0f}"

    def sematext(v: Optional[Decimal]) -> str:
        if v is None:
            return "—"
        return "● ALTO" if v >= 150 else ("● MEDIO" if v >= 80 else "● BAJO")

    def semacolor(v: Optional[Decimal]):
        if v is None:
            return C_MID
        return C_GREEN if v >= 150 else (C_YELLOW if v >= 80 else C_RED)

    _base_grid = [
        ("BACKGROUND",    (0, 0), (-1,  0), C_DARK),
        ("TEXTCOLOR",     (0, 0), (-1,  0), rl_colors.white),
        ("FONTNAME",      (0, 0), (-1,  0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1,  0), 8),
        ("FONTSIZE",      (0, 1), (-1, -1), 7.5),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [rl_colors.white, C_LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.4, C_BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN",         (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN",         (0, 0), ( 0, -1), "LEFT"),
        ("LEFTPADDING",   (0, 0), ( 0, -1), 3*mm),
    ]

    els = []

    # ── Header ───────────────────────────────────────────────────────────────
    hdr = Table(
        [[
            Paragraph("Reporte de Rentabilidad", s_title),
            Paragraph(
                f"Período: {desde_str} – {hasta_str}<br/>Generado: {hoy.strftime('%d/%m/%Y')}",
                s_sub,
            ),
        ]],
        colWidths=[pw * 0.6, pw * 0.4],
    )
    hdr.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_DARK),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5*mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5*mm),
        ("LEFTPADDING",   (0, 0), ( 0, -1), 6*mm),
        ("RIGHTPADDING",  (-1, 0),(-1, -1), 6*mm),
        ("ALIGN",         (1, 0), ( 1,  0), "RIGHT"),
    ]))
    els.append(hdr)
    els.append(Spacer(1, 4*mm))

    # ── KPI summary ──────────────────────────────────────────────────────────
    total_ha = sum((r.hectareas for r in rentabilidades if r.hectareas), Decimal("0"))
    total_margen = sum((r.margen_neto_usd for r in rentabilidades), Decimal("0"))
    margen_ha_total = (total_margen / total_ha).quantize(Decimal("0.01")) if total_ha > 0 else None
    any_proyectado = any(r.es_proyectado for r in rentabilidades)

    kpi = Table(
        [
            ["Total ha", "Margen neto total", "Margen neto / ha", "Datos proyectados"],
            [
                f"{float(total_ha):,.0f} ha",
                fmt(total_margen),
                fmt(margen_ha_total),
                "Sí" if any_proyectado else "No",
            ],
        ],
        colWidths=[pw / 4] * 4,
    )
    kpi.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), C_LIGHT),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica"),
        ("FONTSIZE",      (0, 0), (-1, 0), 7),
        ("TEXTCOLOR",     (0, 0), (-1, 0), C_MID),
        ("FONTNAME",      (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 1), (-1, 1), 10),
        ("TEXTCOLOR",     (0, 1), (-1, 1), C_DARK),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 3*mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3*mm),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
        ("INNERGRID",     (0, 0), (-1, -1), 0.3, C_BORDER),
    ]))
    els.append(kpi)

    # ── Tabla comparativa de potreros ────────────────────────────────────────
    els.append(Paragraph("Rentabilidad por Potrero", s_h2))

    if rentabilidades:
        pot_rows = [["Potrero", "Ha", "Ingresos USD", "Gastos USD", "Margen USD", "Margen/ha", "Nivel"]]
        for r in rentabilidades:
            ingresos_p = sum((a.ingresos_usd for a in r.actividades), Decimal("0"))
            gastos_p = ingresos_p - r.margen_neto_usd
            pot_rows.append([
                r.nombre,
                f"{float(r.hectareas):,.0f}" if r.hectareas else "—",
                f"{float(ingresos_p):,.0f}",
                f"{float(gastos_p):,.0f}",
                f"{float(r.margen_neto_usd):,.0f}",
                fmt(r.margen_neto_ha_usd),
                sematext(r.margen_neto_ha_usd),
            ])
        cw = [pw*0.22, pw*0.07, pw*0.14, pw*0.14, pw*0.14, pw*0.14, pw*0.15]
        pot_ts = TableStyle(list(_base_grid) + [
            ("ALIGN", (6, 0), (6, -1), "CENTER"),
        ])
        for i, r in enumerate(rentabilidades, 1):
            pot_ts.add("TEXTCOLOR", (6, i), (6, i), semacolor(r.margen_neto_ha_usd))
            pot_ts.add("FONTNAME",  (6, i), (6, i), "Helvetica-Bold")
        pot_t = Table(pot_rows, colWidths=cw, repeatRows=1)
        pot_t.setStyle(pot_ts)
        els.append(pot_t)
    else:
        els.append(Paragraph("Sin datos de potreros para el período.", s_note))

    els.append(Spacer(1, 4*mm))

    # ── Desglose de gastos por categoría ─────────────────────────────────────
    els.append(Paragraph("Desglose de Gastos por Categoría", s_h2))

    if gastos_cat:
        total_gc = sum(Decimal(str(row.total)) for row in gastos_cat)
        cat_rows = [["Categoría", "Monto (moneda orig.)", "% del total"]]
        for row in gastos_cat:
            v = Decimal(str(row.total))
            pct = (v / total_gc * 100).quantize(Decimal("0.1")) if total_gc > 0 else Decimal("0")
            cat_rows.append([row.nombre, f"{float(v):,.2f}", f"{pct}%"])
        cat_t = Table(cat_rows, colWidths=[pw*0.5, pw*0.3, pw*0.2], repeatRows=1)
        cat_t.setStyle(TableStyle(_base_grid))
        els.append(cat_t)
    else:
        els.append(Paragraph("Sin gastos registrados para el período.", s_note))

    # ── Proyección anual ─────────────────────────────────────────────────────
    if proyeccion is not None:
        els.append(Spacer(1, 4*mm))
        els.append(Paragraph("Proyección al Cierre del Año", s_h2))

        proy_rows = [
            ["", "Pesimista (×0.85)", "Base (×1.00)", "Optimista (×1.15)"],
            ["Ingresos",    fmt(proyeccion.pesimista.ingresos_usd), fmt(proyeccion.base.ingresos_usd), fmt(proyeccion.optimista.ingresos_usd)],
            ["Gastos",      fmt(proyeccion.pesimista.gastos_usd),   fmt(proyeccion.base.gastos_usd),   fmt(proyeccion.optimista.gastos_usd)],
            ["Margen",      fmt(proyeccion.pesimista.margen_usd),   fmt(proyeccion.base.margen_usd),   fmt(proyeccion.optimista.margen_usd)],
            ["Margen / ha", fmt(proyeccion.pesimista.margen_ha_usd),fmt(proyeccion.base.margen_ha_usd),fmt(proyeccion.optimista.margen_ha_usd)],
        ]
        proy_ts = TableStyle([
            ("BACKGROUND",    (0, 0), (-1,  0), C_DARK),
            ("TEXTCOLOR",     (0, 0), (-1,  0), rl_colors.white),
            ("FONTNAME",      (0, 0), (-1,  0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1,  0), 8),
            ("FONTSIZE",      (0, 1), (-1, -1), 7.5),
            ("FONTNAME",      (0, 1), ( 0, -1), "Helvetica-Bold"),
            ("TEXTCOLOR",     (0, 1), ( 0, -1), C_MID),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [rl_colors.white, C_LIGHT]),
            ("GRID",          (0, 0), (-1, -1), 0.4, C_BORDER),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN",         (1, 0), (-1, -1), "CENTER"),
            ("ALIGN",         (0, 0), ( 0, -1), "LEFT"),
            ("LEFTPADDING",   (0, 0), ( 0, -1), 3*mm),
        ])
        for col_i, esc in enumerate([proyeccion.pesimista, proyeccion.base, proyeccion.optimista], 1):
            c = semacolor(esc.margen_ha_usd)
            proy_ts.add("TEXTCOLOR", (col_i, 3), (col_i, 3), c)
            proy_ts.add("TEXTCOLOR", (col_i, 4), (col_i, 4), c)
            proy_ts.add("FONTNAME",  (col_i, 3), (col_i, 4), "Helvetica-Bold")
        proy_t = Table(proy_rows, colWidths=[pw*0.20, pw*0.265, pw*0.265, pw*0.27])
        proy_t.setStyle(proy_ts)
        els.append(proy_t)
        els.append(Spacer(1, 2*mm))
        els.append(Paragraph(
            f"Proyección extrapolada de {proyeccion.periodo_analizado_dias} días transcurridos al año completo.",
            s_note,
        ))

    # ── Build & return ───────────────────────────────────────────────────────
    buffer = io.BytesIO()
    SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=15*mm, leftMargin=15*mm,
        topMargin=15*mm,   bottomMargin=15*mm,
    ).build(els)
    buffer.seek(0)

    fname = f"rentabilidad_{desde_str.replace('/', '-')}_{hasta_str.replace('/', '-')}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


class SugerirImputacionRequest(BaseModel):
    categoria_id: int
    fecha: date


class SugerenciaImputacionOut(BaseModel):
    tipo_imputacion: str
    actividad_tipo: Optional[str]
    actividad_id: Optional[int]


@router.post("/sugerir-imputacion", response_model=Optional[SugerenciaImputacionOut])
async def sugerir_imputacion_endpoint(
    body: SugerirImputacionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat_res = await db.execute(select(Categoria).where(Categoria.id == body.categoria_id))
    categoria = cat_res.scalar_one_or_none()
    if categoria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoría no encontrada")

    # Potreros del usuario
    pot_res = await db.execute(
        select(Potrero.id).where(Potrero.user_id == current_user.id)
    )
    potrero_ids = [r for (r,) in pot_res.all()]

    # Lotes activos en la fecha (entrada <= fecha, salida es null o >= fecha)
    lotes_res = await db.execute(
        select(LoteGanado.id, LoteGanado.potrero_id).where(
            LoteGanado.potrero_id.in_(potrero_ids),
            LoteGanado.fecha_entrada <= body.fecha,
            (LoteGanado.fecha_salida.is_(None)) | (LoteGanado.fecha_salida >= body.fecha),
        )
    )
    lotes_activos = [(lid, pid) for lid, pid in lotes_res.all()]

    # Ciclos activos en la fecha (siembra <= fecha, cosecha es null o >= fecha)
    ciclos_res = await db.execute(
        select(CicloAgricola.id, CicloAgricola.potrero_id).where(
            CicloAgricola.potrero_id.in_(potrero_ids),
            CicloAgricola.fecha_siembra <= body.fecha,
            (CicloAgricola.fecha_cosecha.is_(None)) | (CicloAgricola.fecha_cosecha >= body.fecha),
        )
    )
    ciclos_activos = [(cid, pid) for cid, pid in ciclos_res.all()]

    return sugerir_imputacion(
        categoria_nombre=categoria.nombre,
        potreros_activos=potrero_ids,
        lotes_activos=lotes_activos,
        ciclos_activos=ciclos_activos,
    )
