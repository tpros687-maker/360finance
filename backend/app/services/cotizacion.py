"""Actualiza la cotización USD/UYU del día consultando el BCU.

Fuente primaria : SOAP del BCU (cotizaciones.bcu.gub.uy)
Fallback        : open.er-api.com (JSON, sin autenticación)
"""
from datetime import date
from decimal import Decimal
from xml.etree import ElementTree as ET

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.referencia import CotizacionDiaria

_BCU_URL = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/wsbcucotizaciones"
_ER_URL  = "https://open.er-api.com/v6/latest/USD"


def _bcu_envelope(fecha: str) -> bytes:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Execute xmlns="http://www.bcu.gub.uy/">
      <Moneda>2225</Moneda>
      <FechaDesde>{fecha}</FechaDesde>
      <FechaHasta>{fecha}</FechaHasta>
      <Grupo>0</Grupo>
    </Execute>
  </soap:Body>
</soap:Envelope>""".encode("utf-8")


async def _fetch_bcu() -> Decimal | None:
    fecha = date.today().strftime("%d/%m/%Y")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                _BCU_URL,
                content=_bcu_envelope(fecha),
                headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": "Execute"},
            )
            resp.raise_for_status()
        root = ET.fromstring(resp.text)
        # El XML de respuesta incluye elementos <Venta> con el tipo de cambio
        for elem in root.iter():
            if elem.tag.endswith("Venta") and elem.text:
                return Decimal(elem.text.strip().replace(",", "."))
    except Exception:
        pass
    return None


async def _fetch_er_api() -> Decimal | None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(_ER_URL)
            resp.raise_for_status()
        uyu = resp.json().get("rates", {}).get("UYU")
        if uyu:
            return Decimal(str(uyu))
    except Exception:
        pass
    return None


async def actualizar_cotizacion_hoy(db: AsyncSession) -> None:
    hoy = date.today()

    result = await db.execute(
        select(CotizacionDiaria).where(CotizacionDiaria.fecha == hoy)
    )
    cotizacion = result.scalar_one_or_none()

    usd_uyu = await _fetch_bcu()
    fuente = "BCU"

    if usd_uyu is None:
        usd_uyu = await _fetch_er_api()
        fuente = "open.er-api.com"

    if usd_uyu is None:
        return  # Ambas fuentes fallaron, no bloqueamos el arranque

    if cotizacion is None:
        db.add(CotizacionDiaria(fecha=hoy, usd_uyu=usd_uyu, fuente=fuente))
    else:
        cotizacion.usd_uyu = usd_uyu
        cotizacion.fuente = fuente

    await db.commit()
