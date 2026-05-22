"""Webhook de WhatsApp via Meta Cloud API — recibe mensajes y los procesa con IA."""
import base64
import json
import logging
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func as sqlfunc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.categoria import Categoria, TipoMovimiento
from app.models.cliente import Cliente, CuentaCobrar, Proveedor, CuentaPagar
from app.models.cuaderno import NotaCuaderno, TareaCuaderno
from app.models.mapa import FranjaEstado, MovimientoGanado, Potrero
from app.models.registro import Registro
from app.models.user import User
from app.services.notificaciones import _armar_resumen, _armar_resumen_semanal
from groq import Groq

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


async def _send_meta_message(to: str, text: str) -> None:
    """Envía un mensaje de texto via Meta Cloud API (WhatsApp Business)."""
    url = f"https://graph.facebook.com/v19.0/{settings.META_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {settings.META_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code >= 400:
            logger.error("Meta API error %s: %s", resp.status_code, resp.text)
        resp.raise_for_status()


def _groq_client() -> Groq:
    return Groq(api_key=settings.GROQ_API_KEY)


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _parse_monto(raw) -> Decimal | None:
    try:
        m = Decimal(str(raw)).quantize(Decimal("0.01"))
        return m if m > 0 else None
    except (InvalidOperation, ValueError, TypeError):
        return None


# ── Categorías ────────────────────────────────────────────────────────────────

async def _cargar_categorias(
    db: AsyncSession, user_id: int, tipo: TipoMovimiento
) -> list[Categoria]:
    result = await db.execute(
        select(Categoria)
        .where(
            Categoria.tipo == tipo,
            or_(Categoria.user_id == user_id, Categoria.user_id.is_(None)),
        )
        .order_by(Categoria.nombre)
    )
    return list(result.scalars().all())


async def _resolver_categoria(
    db: AsyncSession,
    user_id: int,
    tipo: TipoMovimiento,
    nombre_sugerido: str | None,
    categorias: list[Categoria],
) -> Categoria:
    if nombre_sugerido:
        lower = nombre_sugerido.lower().strip()
        for cat in categorias:
            if cat.nombre.lower() == lower:
                return cat
    for cat in categorias:
        if cat.nombre.lower() == "otros":
            return cat
    cat = Categoria(nombre="Otros", tipo=tipo, es_personalizada=True, user_id=user_id, color="#6b7280")
    db.add(cat)
    await db.flush()
    return cat


# ── Clientes / Proveedores ────────────────────────────────────────────────────

async def _get_or_create_cliente(db: AsyncSession, user_id: int, nombre: str) -> Cliente:
    result = await db.execute(
        select(Cliente).where(
            Cliente.user_id == user_id,
            sqlfunc.lower(Cliente.nombre) == nombre.lower().strip(),
        )
    )
    cliente = result.scalar_one_or_none()
    if cliente is None:
        cliente = Cliente(user_id=user_id, nombre=nombre.strip())
        db.add(cliente)
        await db.flush()
    return cliente


async def _marcar_cuenta_pagada(
    db: AsyncSession, user_id: int, nombre: str, monto_raw
) -> CuentaPagar | None:
    """Marca como pagada la CuentaPagar pendiente del proveedor. Filtra por monto si se provee."""
    q = (
        select(CuentaPagar)
        .join(Proveedor, CuentaPagar.proveedor_id == Proveedor.id)
        .where(
            CuentaPagar.user_id == user_id,
            CuentaPagar.pagado == False,  # noqa: E712
            sqlfunc.lower(Proveedor.nombre) == nombre.lower().strip(),
        )
    )
    monto = _parse_monto(monto_raw)
    if monto is not None:
        q = q.where(CuentaPagar.monto == float(monto))
    q = q.order_by(CuentaPagar.created_at.asc()).limit(1)
    result = await db.execute(q)
    cuenta = result.scalar_one_or_none()
    if cuenta is None:
        return None
    cuenta.pagado = True
    await db.commit()
    return cuenta


async def _marcar_cuenta_cobrada(
    db: AsyncSession, user_id: int, nombre: str, monto_raw
) -> CuentaCobrar | None:
    """Marca como pagada la CuentaCobrar pendiente del cliente. Filtra por monto si se provee."""
    q = (
        select(CuentaCobrar)
        .join(Cliente, CuentaCobrar.cliente_id == Cliente.id)
        .where(
            CuentaCobrar.user_id == user_id,
            CuentaCobrar.pagado == False,  # noqa: E712
            sqlfunc.lower(Cliente.nombre) == nombre.lower().strip(),
        )
    )
    monto = _parse_monto(monto_raw)
    if monto is not None:
        q = q.where(CuentaCobrar.monto == float(monto))
    q = q.order_by(CuentaCobrar.created_at.asc()).limit(1)
    result = await db.execute(q)
    cuenta = result.scalar_one_or_none()
    if cuenta is None:
        return None
    cuenta.pagado = True
    await db.commit()
    return cuenta


async def _get_or_create_proveedor(db: AsyncSession, user_id: int, nombre: str) -> Proveedor:
    result = await db.execute(
        select(Proveedor).where(
            Proveedor.user_id == user_id,
            sqlfunc.lower(Proveedor.nombre) == nombre.lower().strip(),
        )
    )
    proveedor = result.scalar_one_or_none()
    if proveedor is None:
        proveedor = Proveedor(user_id=user_id, nombre=nombre.strip())
        db.add(proveedor)
        await db.flush()
    return proveedor


# ── Visión: comprobantes desde imagen ────────────────────────────────────────

_EXTRACCION_PROMPT = (
    "Analizá esta factura o comprobante y extraé la información en JSON válido sin texto extra:\n"
    '{"monto": número o null, "proveedor": string o null, "fecha": "YYYY-MM-DD" o null, '
    '"descripcion": string breve o null, "categoria_sugerida": string o null}'
)


async def _procesar_imagen_comprobante(
    media_url: str,
    media_content_type: str,
    user: User,
    db: AsyncSession,
) -> str:
    # Descargar imagen — Meta media URL requiere Authorization header
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                media_url,
                headers={"Authorization": f"Bearer {settings.META_ACCESS_TOKEN}"},
            )
            resp.raise_for_status()
            image_bytes = resp.content
    except Exception as exc:
        logger.exception("Error descargando imagen de Meta: %s", exc)
        return f"No pude descargar la imagen ({type(exc).__name__}: {exc}). Intentá de nuevo."

    if not image_bytes:
        return "La imagen llegó vacía. Intentá de nuevo."

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    mime = media_content_type or "image/jpeg"

    # Groq vision — modelo llama-4-scout
    try:
        groq = _groq_client()
        response = groq.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                        {"type": "text", "text": _EXTRACCION_PROMPT},
                    ],
                }
            ],
            max_tokens=512,
            temperature=0.1,
        )
    except Exception as exc:
        logger.exception("Error en Groq vision: %s", exc)
        return f"Error al analizar la imagen ({type(exc).__name__}: {exc}). Intentá de nuevo."

    raw = (response.choices[0].message.content or "").strip()
    logger.info("Groq vision raw response: %s", raw)

    if raw.startswith("```"):
        parts = raw.split("```", 2)
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        data: dict = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Groq vision JSON inválido: %s", raw)
        return f"No pude interpretar el comprobante (respuesta: {raw[:100]}). Registrá el gasto manualmente."

    monto = _parse_monto(data.get("monto"))
    if monto is None:
        return "No pude leer el monto del comprobante. Registralo manualmente."

    descripcion = data.get("descripcion") or data.get("proveedor") or "Comprobante WhatsApp"
    fecha = _parse_date(data.get("fecha")) or date.today()
    cat_sugerida = data.get("categoria_sugerida")

    cats_gasto = await _cargar_categorias(db, user.id, TipoMovimiento.gasto)
    categoria = await _resolver_categoria(db, user.id, TipoMovimiento.gasto, cat_sugerida, cats_gasto)

    db.add(Registro(
        user_id=user.id,
        categoria_id=categoria.id,
        tipo=TipoMovimiento.gasto,
        monto=monto,
        moneda=user.moneda,
        fecha=fecha,
        descripcion=descripcion,
    ))
    await db.commit()

    return f"✅ Comprobante procesado: gasto de ${monto:,.2f} en {descripcion}"


# ── Estado de conversación (menú guiado) ─────────────────────────────────────

# { telefono: {"estado": str, "expires": datetime} }
_estados: dict[str, dict] = {}

_TIMEOUT_MENU = 5  # minutos sin actividad → estado se resetea


def _get_estado(telefono: str) -> str | None:
    s = _estados.get(telefono)
    if s and s["expires"] > datetime.utcnow():
        return s["estado"]
    _estados.pop(telefono, None)
    return None


def _get_estado_data(telefono: str) -> dict:
    s = _estados.get(telefono)
    if s and s["expires"] > datetime.utcnow():
        return s.get("data", {})
    return {}


def _set_estado(telefono: str, estado: str, data: dict | None = None) -> None:
    _estados[telefono] = {
        "estado": estado,
        "data": data or {},
        "expires": datetime.utcnow() + timedelta(minutes=_TIMEOUT_MENU),
    }


def _clear_estado(telefono: str) -> None:
    _estados.pop(telefono, None)


_MENU_TEXTO = (
    "📋 *Menú 360 Agro Finance*\n\n"
    "1️⃣  Guardar nota\n"
    "2️⃣  Guardar tarea\n"
    "3️⃣  Marcar tarea como hecha\n"
    "4️⃣  Registrar gasto\n"
    "5️⃣  Registrar ingreso\n"
    "6️⃣  Ver tareas pendientes\n"
    "7️⃣  Balance del mes\n"
    "8️⃣  Resumen últimos 7 días\n"
    "9️⃣  Mover ganado\n\n"
    "Respondé con el número de la opción."
)

_MENU_OPCIONES = {
    "1": ("esperando_nota",    "📝 ¿Qué querés anotar?\nPodés escribir varias en líneas separadas."),
    "2": ("esperando_tarea",   "📅 ¿Qué tarea/s querés agregar?\nEscribí una por línea si son varias."),
    "3": ("esperando_realizada", "☑️ ¿Qué tarea/s completaste?\nEscribí parte del nombre, una por línea si son varias."),
    "4": ("esperando_gasto",   "💸 Describí el gasto (ej: 1500 en nafta)"),
    "5": ("esperando_ingreso", "💰 Describí el ingreso (ej: vendí un novillo en 45000)"),
    "9": ("esperando_tipo_mov", "🐄 ¿Qué tipo de movimiento?\n1️⃣ Mover entre franjas (mismo potrero)\n2️⃣ Mover entre potreros"),
}


# ── Comandos rápidos (sin Groq) ───────────────────────────────────────────────

_COMANDOS = {"resumen", "tareas", "gastos", "balance", "ayuda", "menu", "menú", "mover"}

# Palabras interrogativas en español — si el mensaje empieza con alguna → consulta
_INTERROGATIVAS = (
    "qué", "que", "cuánto", "cuanto", "cuánta", "cuanta",
    "cuántos", "cuantos", "cuántas", "cuantas", "cómo", "como",
    "cuándo", "cuando", "dónde", "donde", "cuál", "cual",
    "cuáles", "cuales", "por qué", "por que", "quién", "quien",
    "puedo", "puedes", "podés", "podes", "tengo", "tienes", "tenés",
    "hay", "existe", "muéstrame", "muestrame", "dame", "dime",
    "decime", "mostrame", "explicame", "explicame",
)


def _detectar_tipo_rapido(mensaje: str) -> str | None:
    """
    Detecta el tipo de mensaje sin usar Groq.
    Retorna 'nota', 'tarea', 'tarea_realizada' o 'consulta' si hay certeza, None si hay que usar Groq.
    """
    lower = mensaje.lower().strip()

    # Prefijos largos
    if lower.startswith("nota:") or lower.startswith("nota "):
        return "nota"
    if lower.startswith("tarea:") or lower.startswith("tarea "):
        return "tarea"

    # Prefijos cortos
    if lower.startswith("n:") or lower.startswith("n "):
        return "nota"
    if lower.startswith("t:") or lower.startswith("t "):
        return "tarea"

    # Símbolos rápidos
    if mensaje.startswith("!"):
        return "nota"
    if mensaje.startswith("*"):
        return "tarea"

    # Marcar tarea como realizada
    for prefijo in ("tarea realizada:", "tarea realizada ", "realizada:", "hice:", "completé:", "complete:", "listo:"):
        if lower.startswith(prefijo):
            return "tarea_realizada"

    # Mensaje con signo de pregunta → siempre consulta
    if "?" in mensaje:
        return "consulta"

    # Empieza con palabra interrogativa → consulta
    for palabra in _INTERROGATIVAS:
        if lower.startswith(palabra + " ") or lower == palabra:
            return "consulta"

    return None


def _extraer_texto_prefijo(mensaje: str, tipo: str) -> str:
    """Quita el prefijo del mensaje y devuelve el texto limpio."""
    lower = mensaje.lower().strip()
    prefijos = {
        "nota": ("nota:", "nota ", "n:", "n "),
        "tarea": ("tarea:", "tarea ", "t:", "t "),
        "tarea_realizada": (
            "tarea realizada:", "tarea realizada ", "realizada:",
            "hice:", "completé:", "complete:", "listo:",
        ),
    }
    for p in prefijos.get(tipo, ()):
        if lower.startswith(p):
            # quitar el símbolo ! o * también
            return mensaje[len(p):].strip()
    # Símbolos de un caracter
    if mensaje.startswith("!") or mensaje.startswith("*"):
        return mensaje[1:].strip()
    return mensaje.strip()


async def _cmd_tareas(user: User, db: AsyncSession) -> str:
    hoy = date.today()
    result = await db.execute(
        select(TareaCuaderno)
        .where(TareaCuaderno.user_id == user.id, TareaCuaderno.completada == False)  # noqa: E712
        .order_by(TareaCuaderno.fecha_planificada.asc().nulls_last())
        .limit(10)
    )
    tareas = result.scalars().all()
    if not tareas:
        return "✅ No tenés tareas pendientes."
    lineas = ["📅 *Tareas pendientes:*"]
    for t in tareas:
        if t.fecha_planificada:
            diff = (t.fecha_planificada - hoy).days
            if diff < 0:
                etiqueta = f"⚠️ Vencida ({t.fecha_planificada.strftime('%d/%m')})"
            elif diff == 0:
                etiqueta = "Hoy"
            elif diff == 1:
                etiqueta = "Mañana"
            else:
                etiqueta = t.fecha_planificada.strftime("%d/%m")
        else:
            etiqueta = "Sin fecha"
        lineas.append(f"- {etiqueta}: {t.texto}")
    return "\n".join(lineas)


async def _cmd_gastos(user: User, db: AsyncSession) -> str:
    hoy = date.today()
    primer_dia = hoy.replace(day=1)
    moneda = user.moneda
    q = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Registro.monto), 0)).where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.gasto,
            Registro.fecha >= primer_dia,
        )
    )
    total = float(q.scalar() or 0)
    return f"💸 Gastos de {hoy.strftime('%m/%Y')}: {moneda} ${total:,.2f}"


async def _cmd_balance(user: User, db: AsyncSession) -> str:
    hoy = date.today()
    primer_dia = hoy.replace(day=1)
    moneda = user.moneda
    gq = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Registro.monto), 0)).where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.gasto,
            Registro.fecha >= primer_dia,
        )
    )
    iq = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Registro.monto), 0)).where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.ingreso,
            Registro.fecha >= primer_dia,
        )
    )
    gastos = float(gq.scalar() or 0)
    ingresos = float(iq.scalar() or 0)
    balance = ingresos - gastos
    signo = "+" if balance >= 0 else ""
    return (
        f"📊 Balance {hoy.strftime('%m/%Y')} ({moneda})\n"
        f"- Ingresos: ${ingresos:,.2f}\n"
        f"- Gastos:   ${gastos:,.2f}\n"
        f"- Balance:  {signo}${balance:,.2f}"
    )


def _cmd_ayuda() -> str:
    return (
        "🌾 *360 Agro Finance — Guía rápida*\n\n"
        "📋 *Guardar nota (cualquiera de estas):*\n"
        "  nota: revisé el alambrado\n"
        "  n: revisé el alambrado\n"
        "  ! revisé el alambrado\n\n"
        "✅ *Guardar tarea:*\n"
        "  tarea: comprar sal el lunes\n"
        "  t: comprar sal el lunes\n"
        "  * comprar sal el lunes\n\n"
        "☑️ *Marcar tarea como hecha:*\n"
        "  listo: comprar sal\n"
        "  hice: comprar sal\n\n"
        "💰 *Registrar movimientos:*\n"
        "  gasté 1500 en nafta\n"
        "  vendí 3 novillos en 90000\n"
        "  Juan me debe 5000\n\n"
        "❓ *Preguntas — usá ?:*\n"
        "  cuánto gasté este mes?\n\n"
        "📊 *Comandos:*\n"
        "  resumen · tareas · gastos · balance · ayuda"
    )


# ── Helpers movimiento de ganado ─────────────────────────────────────────────

_MAPA_ESPECIE: dict[str, str] = {
    "bovino": "bovino", "novillo": "bovino", "novillos": "bovino",
    "vaca": "bovino", "vacas": "bovino", "toro": "bovino", "toros": "bovino",
    "ternero": "bovino", "terneros": "bovino", "ternera": "bovino", "terneras": "bovino",
    "vaquillona": "bovino", "vaquillonas": "bovino",
    "ovino": "ovino", "oveja": "ovino", "ovejas": "ovino",
    "cordero": "ovino", "corderos": "ovino", "borrego": "ovino",
    "equino": "equino", "caballo": "equino", "caballos": "equino",
    "yegua": "equino", "yeguas": "equino", "potro": "equino", "potros": "equino",
    "porcino": "porcino", "cerdo": "porcino", "cerdos": "porcino",
    "chancho": "porcino", "chanchos": "porcino",
}


def _parse_especie_cantidad(texto: str) -> tuple[int, str] | None:
    """'50 novillos' o 'novillos 50' → (50, 'bovino')."""
    lower = texto.lower().strip()
    m = re.search(r'(\d+)\s+(\w+)', lower) or re.search(r'(\w+)\s+(\d+)', lower)
    if not m:
        return None
    a, b = m.groups()
    try:
        cantidad, palabra = int(a), b
    except ValueError:
        try:
            cantidad, palabra = int(b), a
        except ValueError:
            return None
    especie = _MAPA_ESPECIE.get(palabra, palabra)
    return (cantidad, especie)


def _parse_multiples_especies(texto: str) -> list[tuple[int, str]]:
    """'30 vaquillonas, 20 terneros' → [(30, 'bovino'), (20, 'bovino')]."""
    partes = re.split(r'[,y]', texto)
    resultados = []
    for parte in partes:
        parsed = _parse_especie_cantidad(parte.strip())
        if parsed:
            resultados.append(parsed)
    return resultados


def _parse_franjas(texto: str) -> tuple[int, int] | None:
    """'F1 a F2', '1 a 2', 'de 1 a 2' → (1, 2)."""
    lower = re.sub(r'f(\d+)', r'\1', texto.lower().strip())
    m = re.search(r'(\d+)\s+a\s+(\d+)', lower) or re.search(r'(\d+)\D+(\d+)', lower)
    if m:
        return (int(m.group(1)), int(m.group(2)))
    return None


async def _buscar_potrero(db: AsyncSession, user_id: int, nombre: str) -> Potrero | None:
    """Busca potrero por nombre exacto o por coincidencia de palabras completas."""
    result = await db.execute(select(Potrero).where(Potrero.user_id == user_id))
    potreros = list(result.scalars().all())
    lower = nombre.lower().strip()

    def _word_boundary(pat: str, text: str) -> bool:
        """True si `pat` aparece como token completo en `text` (no como substring de otra palabra)."""
        return bool(re.search(r'(?<![a-z0-9áéíóúñ])' + re.escape(pat) + r'(?![a-z0-9áéíóúñ])', text))

    # 1. Coincidencia exacta
    for p in potreros:
        if p.nombre.lower() == lower:
            return p
    # 2. El nombre completo del potrero aparece como palabras completas en el texto enviado
    #    (ordenar desc por longitud para preferir el más específico)
    for p in sorted(potreros, key=lambda x: len(x.nombre), reverse=True):
        if _word_boundary(p.nombre.lower(), lower):
            return p
    # 3. El texto enviado aparece como palabras completas en el nombre del potrero
    for p in sorted(potreros, key=lambda x: len(x.nombre), reverse=True):
        if _word_boundary(lower, p.nombre.lower()):
            return p
    return None


async def _listar_potreros(db: AsyncSession, user_id: int) -> str:
    result = await db.execute(
        select(Potrero).where(Potrero.user_id == user_id).order_by(Potrero.nombre)
    )
    potreros = list(result.scalars().all())
    if not potreros:
        return "(sin potreros registrados)"
    return ", ".join(p.nombre for p in potreros)


async def _ejecutar_mover_franjas(
    db: AsyncSession, potrero: Potrero, desde: int, hasta: int
) -> str:
    """Mueve el ganado de franja `desde` a franja `hasta` en el mismo potrero."""
    res_d = await db.execute(
        select(FranjaEstado).where(
            FranjaEstado.potrero_id == potrero.id,
            FranjaEstado.numero == desde,
        )
    )
    res_h = await db.execute(
        select(FranjaEstado).where(
            FranjaEstado.potrero_id == potrero.id,
            FranjaEstado.numero == hasta,
        )
    )
    f_desde = res_d.scalar_one_or_none()
    f_hasta = res_h.scalar_one_or_none()

    if not f_desde:
        return f"No existe la franja {desde} en {potrero.nombre}."
    if not f_hasta:
        return f"No existe la franja {hasta} en {potrero.nombre}."
    if not f_desde.en_uso:
        return f"F{desde} no está en uso actualmente. Verificá el estado en la app."

    hoy = date.today()
    f_desde.en_uso = False
    f_desde.fecha_inicio_descanso = hoy
    f_hasta.en_uso = True
    f_hasta.fecha_entrada = hoy
    f_hasta.fecha_inicio_descanso = None

    await db.commit()
    return (
        f"✅ Ganado movido en *{potrero.nombre}*\n"
        f"F{desde} → inicia descanso 💤\n"
        f"F{hasta} → en uso 🟢\n"
        "Mandá *menu* para seguir."
    )


async def _ejecutar_mover_potrero(
    db: AsyncSession,
    user: User,
    potrero_origen: Potrero,
    potrero_destino: Potrero,
    cantidad: int,
    especie: str,
) -> str:
    """Crea un MovimientoGanado entre dos potreros y lo ejecuta hoy."""
    mov = MovimientoGanado(
        user_id=user.id,
        potrero_origen_id=potrero_origen.id,
        potrero_destino_id=potrero_destino.id,
        cantidad=cantidad,
        especie=especie,
        fecha_programada=date.today(),
        fecha_ejecutada=date.today(),
        estado="ejecutado",
    )
    db.add(mov)
    await db.commit()
    return f"✅ {cantidad} {especie}: *{potrero_origen.nombre}* → *{potrero_destino.nombre}*"


async def _handle_comando(cmd: str, user: User, db: AsyncSession) -> str | None:
    """Devuelve la respuesta si el mensaje es un comando rápido, None si no."""
    if cmd == "resumen":
        return await _armar_resumen(user, db)
    if cmd == "tareas":
        return await _cmd_tareas(user, db)
    if cmd == "gastos":
        return await _cmd_gastos(user, db)
    if cmd == "balance":
        return await _cmd_balance(user, db)
    if cmd == "ayuda":
        return _cmd_ayuda()
    if cmd in ("menu", "menú"):
        return _MENU_TEXTO
    return None


# ── Clasificación con Groq ────────────────────────────────────────────────────

async def _clasificar(
    mensaje: str,
    nombre_usuario: str,
    moneda_usuario: str,
    cats_gasto: list[str],
    cats_ingreso: list[str],
) -> dict:
    client = _groq_client()
    hoy = date.today().isoformat()

    cats_gasto_str = ", ".join(cats_gasto) if cats_gasto else "Otros"
    cats_ingreso_str = ", ".join(cats_ingreso) if cats_ingreso else "Otros"

    system = (
        "Sos un asistente de campo agrícola. El usuario te manda un mensaje por WhatsApp.\n\n"
        "REGLA PRINCIPAL: Si el mensaje es una PREGUNTA (contiene '?', empieza con 'qué', 'cómo', "
        "'cuánto', 'cuándo', 'hay', 'puedo', 'tengo', 'dame', 'dime', 'mostrame', etc.) → "
        "SIEMPRE clasificá como 'consulta'. NUNCA guardes una pregunta como nota o tarea.\n\n"
        "Tipos disponibles:\n"
        "- nota: el usuario declara que OCURRIÓ algo o quiere REGISTRAR una observación. "
        "Ejemplos: 'vacuné los terneros', 'llovió 30mm', 'el toro está cojo'\n"
        "- tarea: el usuario quiere RECORDAR hacer algo en el futuro. "
        "Ejemplos: 'llamar al veterinario mañana', 'comprar alambrado el viernes'\n"
        "- consulta: pregunta, solicitud de información, o cualquier mensaje ambiguo. "
        "En caso de duda entre nota y consulta → elegí consulta\n"
        "- gasto: PAGÓ o COMPRÓ algo con monto. Ejemplos: 'gasté 500 en nafta', 'compré hilo 1200'\n"
        "- ingreso: COBRÓ o VENDIÓ con monto. Ejemplos: 'vendí un novillo en 45000'\n"
        "- cobro: un cliente le DEBE dinero (cuenta por cobrar nueva). "
        "Ejemplo: 'Juan me debe 5000'\n"
        "- pago: él le DEBE a un proveedor (cuenta por pagar nueva). "
        "Ejemplo: 'debo 8000 a AgroInsumos'\n"
        "- marcar_pagado: YA pagó una deuda pendiente. Ejemplos: 'le pagué al veterinario', "
        "'pagué AgroInsumos'\n"
        "- marcar_cobrado: un cliente YA le pagó. Ejemplos: 'me pagó Juan', 'cobré a Pedro'\n\n"
        f"Hoy es {hoy}. Usuario: {nombre_usuario}. Moneda: {moneda_usuario}.\n"
        f"Categorías de gasto: {cats_gasto_str}\n"
        f"Categorías de ingreso: {cats_ingreso_str}\n\n"
        "Respondé SOLO con JSON válido (sin markdown, sin texto extra):\n"
        '{"tipo": "nota|tarea|consulta|gasto|ingreso|cobro|pago|marcar_pagado|marcar_cobrado", '
        '"texto": "<descripción limpia>", '
        '"fecha": "<YYYY-MM-DD o null>", '
        '"monto": <número o null>, '
        '"moneda": "<UYU|USD>", '
        '"categoria": "<nombre de la lista o Otros o null>", '
        '"nombre_contraparte": "<nombre del cliente/proveedor o null>", '
        '"fecha_vencimiento": "<YYYY-MM-DD o null>"}\n\n'
        "Para gasto/ingreso: fecha es hoy si no se especifica. "
        "Para cobro/pago: fecha_vencimiento es la fecha límite si se menciona."
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": mensaje},
        ],
        max_tokens=350,
        temperature=0.1,
    )

    raw = (response.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        return {
            "tipo": "consulta", "texto": mensaje, "fecha": None,
            "monto": None, "moneda": moneda_usuario, "categoria": None,
            "nombre_contraparte": None, "fecha_vencimiento": None,
        }


# ── Consulta ──────────────────────────────────────────────────────────────────

async def _responder_consulta(mensaje: str, user: User, db: AsyncSession) -> str:
    hoy = date.today()
    primer_dia_mes = hoy.replace(day=1)

    gastos_q = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Registro.monto), 0)).where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.gasto,
            Registro.fecha >= primer_dia_mes,
        )
    )
    ingresos_q = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Registro.monto), 0)).where(
            Registro.user_id == user.id,
            Registro.tipo == TipoMovimiento.ingreso,
            Registro.fecha >= primer_dia_mes,
        )
    )
    total_gastos = float(gastos_q.scalar() or 0)
    total_ingresos = float(ingresos_q.scalar() or 0)
    balance = total_ingresos - total_gastos

    notas_q = await db.execute(
        select(NotaCuaderno)
        .where(NotaCuaderno.user_id == user.id)
        .order_by(NotaCuaderno.created_at.desc())
        .limit(8)
    )
    notas = notas_q.scalars().all()

    tareas_q = await db.execute(
        select(TareaCuaderno)
        .where(TareaCuaderno.user_id == user.id, TareaCuaderno.completada == False)  # noqa: E712
        .order_by(TareaCuaderno.fecha_planificada.asc().nulls_last())
        .limit(8)
    )
    tareas = tareas_q.scalars().all()

    moneda = user.moneda
    lineas = [
        f"Usuario: {user.nombre} {user.apellido}",
        f"Fecha hoy: {hoy.isoformat()}",
        "",
        f"=== FINANZAS DEL MES ({hoy.strftime('%m/%Y')}) ===",
        f"- Gastos:   {moneda} ${total_gastos:,.2f}",
        f"- Ingresos: {moneda} ${total_ingresos:,.2f}",
        f"- Balance:  {moneda} ${balance:,.2f} ({'positivo' if balance >= 0 else 'negativo'})",
    ]
    if notas:
        lineas.append("\n=== NOTAS DEL CUADERNO ===")
        for n in notas:
            fecha = n.created_at.strftime("%d/%m/%Y") if n.created_at else "?"
            lineas.append(f"  [{fecha}] {n.texto}")
    if tareas:
        lineas.append("\n=== TAREAS PENDIENTES ===")
        for t in tareas:
            fecha = t.fecha_planificada.strftime("%d/%m/%Y") if t.fecha_planificada else "sin fecha"
            lineas.append(f"  [{fecha}] {t.texto}")

    client = _groq_client()
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "Sos un asistente de campo para productores rurales. "
                    "Respondés preguntas usando los datos financieros y el cuaderno del usuario. "
                    "Respondé en español rioplatense, de forma directa y concisa (máximo 4 líneas). "
                    "Si la consulta es sobre gastos/ingresos del mes, usá los datos de FINANZAS DEL MES. "
                    "Si no tenés datos suficientes, decilo claro.\n\n"
                    + "\n".join(lineas)
                ),
            },
            {"role": "user", "content": mensaje},
        ],
        max_tokens=512,
        temperature=0.4,
    )
    return (response.choices[0].message.content or "No pude procesar tu consulta.").strip()


# ── Webhook ───────────────────────────────────────────────────────────────────

@router.get("/webhook")
async def whatsapp_webhook_verify(request: Request):
    """Verificación del webhook de Meta (challenge handshake)."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    if mode == "subscribe" and token == settings.META_VERIFY_TOKEN:
        logger.info("Meta webhook verificado OK")
        return JSONResponse(content=int(challenge), status_code=200)
    logger.warning("Meta webhook verify failed: mode=%s token=%s", mode, token)
    return JSONResponse(content={"error": "Forbidden"}, status_code=403)


@router.post("/webhook")
async def whatsapp_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Recibe mensajes de WhatsApp via Meta Cloud API."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(content={"status": "ok"})

    # Extraer el primer mensaje del payload
    try:
        entry = body.get("entry", [{}])[0]
        change = entry.get("changes", [{}])[0]
        value = change.get("value", {})
        messages = value.get("messages", [])
        if not messages:
            return JSONResponse(content={"status": "ok"})
        msg = messages[0]
        telefono = msg.get("from", "")
        msg_type = msg.get("type", "text")
    except Exception as exc:
        logger.exception("Error parseando payload Meta: %s", exc)
        return JSONResponse(content={"status": "ok"})

    if not telefono:
        return JSONResponse(content={"status": "ok"})

    # Buscar usuario — Meta envía número sin +, nuestra DB puede tener con o sin +
    result = await db.execute(select(User).where(User.telefono == "+" + telefono.lstrip("+")))
    user = result.scalar_one_or_none()
    if user is None:
        result2 = await db.execute(select(User).where(User.telefono == telefono))
        user = result2.scalar_one_or_none()

    if user is None:
        await _send_meta_message(
            telefono,
            "No encontré una cuenta asociada a este número. "
            "Registrate en finance.360rural.com",
        )
        return JSONResponse(content={"status": "ok"})

    # Imagen adjunta
    if msg_type == "image":
        try:
            media_id = msg.get("image", {}).get("id", "")
            mime = msg.get("image", {}).get("mime_type", "image/jpeg")
            async with httpx.AsyncClient(timeout=30) as client:
                meta_resp = await client.get(
                    f"https://graph.facebook.com/v19.0/{media_id}",
                    headers={"Authorization": f"Bearer {settings.META_ACCESS_TOKEN}"},
                )
                meta_resp.raise_for_status()
                media_url = meta_resp.json().get("url", "")
            respuesta = await _procesar_imagen_comprobante(media_url, mime, user, db)
        except Exception as exc:
            logger.exception("Error procesando imagen Meta: %s", exc)
            respuesta = "Hubo un error procesando la imagen. Intentá de nuevo."
        await _send_meta_message(telefono, respuesta)
        return JSONResponse(content={"status": "ok"})

    # Texto
    mensaje = ""
    if msg_type == "text":
        mensaje = msg.get("text", {}).get("body", "").strip()
    if not mensaje:
        return JSONResponse(content={"status": "ok"})

    logger.info("Webhook Meta: telefono=%s mensaje='%s'", telefono, mensaje[:50])

    try:
        respuesta = await _procesar_mensaje(mensaje, telefono, user, db)
        await _send_meta_message(telefono, respuesta)
    except Exception as exc:
        logger.exception("Error no capturado en webhook WhatsApp: %s", exc)
        _clear_estado(telefono)
        await _send_meta_message(
            telefono,
            "Ocurrió un error inesperado. Estado reiniciado. Mandá *menu* para continuar.",
        )
    return JSONResponse(content={"status": "ok"})


async def _procesar_mensaje(mensaje: str, telefono: str, user: User, db: AsyncSession) -> str:
    """Lógica principal del webhook — devuelve el texto a enviar al usuario."""

    # ── Comandos directos — PRIMERO, antes de cualquier otra lógica ───────────
    cmd_directo = mensaje.lower().strip()
    if cmd_directo in _COMANDOS:
        try:
            respuesta_cmd = await _handle_comando(cmd_directo, user, db)
            if respuesta_cmd is not None:
                return respuesta_cmd
        except Exception as exc:
            logger.exception("Error en _handle_comando '%s': %s", cmd_directo, exc)
            return f"Hubo un error procesando '{cmd_directo}'. Intentá de nuevo."

    # ── Manejo de estados del menú guiado ─────────────────────────────────────
    estado_actual = _get_estado(telefono)

    _ESCAPE_CMDS = {"menu", "menú", "salir", "cancelar", "cancel", "reset", "mover", "0"}

    if estado_actual:
        cmd_escape = mensaje.lower().strip()
        if cmd_escape in _ESCAPE_CMDS and cmd_escape not in ("mover",):
            _clear_estado(telefono)
            return _MENU_TEXTO

        estado_data = _get_estado_data(telefono)  # guardar datos ANTES de limpiar
        _clear_estado(telefono)  # consumir estado

        if estado_actual == "esperando_nota":
            lineas = [l.strip().lstrip("-•*").strip() for l in mensaje.splitlines() if l.strip()]
            for linea in lineas:
                db.add(NotaCuaderno(user_id=user.id, texto=linea))
            await db.commit()
            if len(lineas) == 1:
                return "✅ Nota guardada. Mandá *menu* para seguir."
            return f"✅ {len(lineas)} notas guardadas. Mandá *menu* para seguir."

        if estado_actual == "esperando_tarea":
            lineas = [l.strip().lstrip("-•*").strip() for l in mensaje.splitlines() if l.strip()]
            for linea in lineas:
                db.add(TareaCuaderno(user_id=user.id, texto=linea))
            await db.commit()
            if len(lineas) == 1:
                return "✅ Tarea guardada. Mandá *menu* para seguir."
            return f"✅ {len(lineas)} tareas guardadas. Mandá *menu* para seguir."

        if estado_actual == "esperando_realizada":
            lineas = [l.strip().lstrip("-•*").strip() for l in mensaje.splitlines() if l.strip()]
            result_t = await db.execute(
                select(TareaCuaderno).where(
                    TareaCuaderno.user_id == user.id,
                    TareaCuaderno.completada == False,  # noqa: E712
                ).order_by(TareaCuaderno.created_at.desc())
            )
            tareas_p = result_t.scalars().all()

            completadas = []
            no_encontradas = []
            for buscar in lineas:
                encontrada = next((t for t in tareas_p if buscar.lower() in t.texto.lower()), None)
                if encontrada:
                    encontrada.completada = True
                    encontrada.completed_at = datetime.utcnow()
                    completadas.append(encontrada.texto)
                else:
                    no_encontradas.append(buscar)

            if completadas:
                await db.commit()

            respuesta_lineas = []
            if completadas:
                respuesta_lineas.append(f"✅ Completadas ({len(completadas)}):")
                for t in completadas:
                    respuesta_lineas.append(f"  - {t}")
            if no_encontradas:
                respuesta_lineas.append(f"⚠️ No encontradas ({len(no_encontradas)}):")
                for t in no_encontradas:
                    respuesta_lineas.append(f"  - {t}")
            respuesta_lineas.append("Mandá *menu* para seguir.")
            return "\n".join(respuesta_lineas)

        # ── Flujo mover ganado ────────────────────────────────────────────────

        if estado_actual == "esperando_tipo_mov":
            if cmd_escape == "1":
                potreros_str = await _listar_potreros(db, user.id)
                _set_estado(telefono, "esperando_potrero_franja")
                return f"¿En qué potrero?\nTus potreros: {potreros_str}"
            if cmd_escape == "2":
                potreros_str = await _listar_potreros(db, user.id)
                _set_estado(telefono, "esperando_potrero_origen")
                return f"¿De qué potrero *sale* el ganado?\nTus potreros: {potreros_str}"
            return "Respondé 1 (entre franjas) o 2 (entre potreros)."

        if estado_actual == "esperando_potrero_franja":
            potrero = await _buscar_potrero(db, user.id, mensaje)
            if not potrero:
                potreros_str = await _listar_potreros(db, user.id)
                _set_estado(telefono, "esperando_potrero_franja")
                return f"No encontré '{mensaje}'. Tus potreros: {potreros_str}"
            if not potrero.tiene_franjas or not potrero.cantidad_franjas:
                return f"{potrero.nombre} no tiene franjas configuradas."
            _set_estado(telefono, "esperando_desde_hasta_franja", {"potrero_id": potrero.id, "potrero_nombre": potrero.nombre})
            return (
                f"*{potrero.nombre}* — {potrero.cantidad_franjas} franjas\n"
                "¿De qué franja a qué franja? (ej: *F1 a F2*)"
            )

        if estado_actual == "esperando_desde_hasta_franja":
            data = estado_data
            franjas = _parse_franjas(mensaje)
            if not franjas:
                _set_estado(telefono, "esperando_desde_hasta_franja", data)
                return "No entendí. Escribí el formato: *F1 a F2* o *1 a 2*"
            desde, hasta = franjas
            potrero = await _buscar_potrero(db, user.id, data.get("potrero_nombre", ""))
            if not potrero:
                _set_estado(telefono, "esperando_desde_hasta_franja", data)
                return "Error al buscar el potrero. Intentá de nuevo."
            respuesta = await _ejecutar_mover_franjas(db, potrero, desde, hasta)
            if not respuesta.startswith("✅"):
                _set_estado(telefono, "esperando_desde_hasta_franja", data)
            return respuesta

        if estado_actual == "esperando_potrero_origen":
            potrero_origen = await _buscar_potrero(db, user.id, mensaje)
            if not potrero_origen:
                potreros_str = await _listar_potreros(db, user.id)
                _set_estado(telefono, "esperando_potrero_origen")
                return f"No encontré '{mensaje}'. Tus potreros: {potreros_str}"
            potreros_str = await _listar_potreros(db, user.id)
            _set_estado(telefono, "esperando_potrero_destino", {"origen_id": potrero_origen.id, "origen_nombre": potrero_origen.nombre})
            return f"¿A qué potrero *llega* el ganado?\nTus potreros: {potreros_str}"

        if estado_actual == "esperando_potrero_destino":
            data = estado_data
            potrero_destino = await _buscar_potrero(db, user.id, mensaje)
            if not potrero_destino:
                potreros_str = await _listar_potreros(db, user.id)
                _set_estado(telefono, "esperando_potrero_destino", data)
                return f"No encontré '{mensaje}'. Tus potreros: {potreros_str}"
            if potrero_destino.id == data.get("origen_id"):
                _set_estado(telefono, "esperando_potrero_destino", data)
                return "El destino debe ser diferente al origen. ¿A qué potrero va el ganado?"
            _set_estado(telefono, "esperando_especie_cantidad", {
                **data,
                "destino_id": potrero_destino.id,
                "destino_nombre": potrero_destino.nombre,
            })
            return (
                f"*{data.get('origen_nombre')}* → *{potrero_destino.nombre}*\n"
                "¿Cuántos animales y de qué especie?\n(ej: *50 novillos*, *30 ovejas*)"
            )

        if estado_actual == "esperando_especie_cantidad":
            data = estado_data
            lista_parsed = _parse_multiples_especies(mensaje)
            if not lista_parsed:
                _set_estado(telefono, "esperando_especie_cantidad", data)
                return "No entendí. Escribí así: *50 novillos* o *30 ovejas, 20 terneros*"
            potrero_origen = await _buscar_potrero(db, user.id, data.get("origen_nombre", ""))
            potrero_destino = await _buscar_potrero(db, user.id, data.get("destino_nombre", ""))
            if not potrero_origen or not potrero_destino:
                _set_estado(telefono, "esperando_especie_cantidad", data)
                return "Error al buscar los potreros. Intentá de nuevo."
            respuestas = []
            for cantidad, especie in lista_parsed:
                r = await _ejecutar_mover_potrero(db, user, potrero_origen, potrero_destino, cantidad, especie)
                respuestas.append(r)
            respuestas.append("Mandá *menu* para seguir.")
            return "\n".join(respuestas)

        # Fallback — estado desconocido o no manejado
        if estado_actual not in (
            "esperando_nota", "esperando_tarea", "esperando_realizada",
            "esperando_gasto", "esperando_ingreso",
            "esperando_tipo_mov", "esperando_potrero_franja", "esperando_desde_hasta_franja",
            "esperando_potrero_origen", "esperando_potrero_destino", "esperando_especie_cantidad",
        ):
            return f"Estado inesperado '{estado_actual}' reiniciado. Mandá *menu* para continuar."

        if estado_actual in ("esperando_gasto", "esperando_ingreso"):
            tipo_forzado = "gasto" if estado_actual == "esperando_gasto" else "ingreso"
            cats_g = await _cargar_categorias(db, user.id, TipoMovimiento.gasto)
            cats_i = await _cargar_categorias(db, user.id, TipoMovimiento.ingreso)
            try:
                datos = await _clasificar(
                    mensaje, user.nombre, user.moneda,
                    [c.nombre for c in cats_g], [c.nombre for c in cats_i],
                )
                # Forzar el tipo según el estado
                datos["tipo"] = tipo_forzado
            except Exception:
                return "No pude procesar el movimiento. Intentá de nuevo."

            monto = _parse_monto(datos.get("monto"))
            if monto is None:
                return (
                    f"No pude leer el monto. Intentá así: '1500 en nafta' o '45000 venta novillo'."
                )
            tipo_mov = TipoMovimiento.gasto if tipo_forzado == "gasto" else TipoMovimiento.ingreso
            cats_lista = cats_g if tipo_mov == TipoMovimiento.gasto else cats_i
            categoria = await _resolver_categoria(db, user.id, tipo_mov, datos.get("categoria"), cats_lista)
            db.add(Registro(
                user_id=user.id,
                categoria_id=categoria.id,
                tipo=tipo_mov,
                monto=monto,
                moneda=datos.get("moneda") or user.moneda,
                fecha=_parse_date(datos.get("fecha")) or date.today(),
                descripcion=datos.get("texto") or mensaje,
            ))
            await db.commit()
            etiqueta = "Gasto" if tipo_forzado == "gasto" else "Ingreso"
            return (
                f"✅ {etiqueta} de {user.moneda} ${monto:,.2f} registrado en '{categoria.nombre}'.\n"
                "Mandá *menu* para seguir."
            )

    # ── Comandos rápidos — detección por palabra exacta, sin Groq ─────────────
    cmd = mensaje.lower().strip()

    if cmd == "mover":
        _set_estado(telefono, "esperando_tipo_mov")
        return (
            "🐄 ¿Qué tipo de movimiento?\n"
            "1️⃣ Mover entre franjas (mismo potrero)\n"
            "2️⃣ Mover entre potreros"
        )

    if cmd == "6":
        return await _cmd_tareas(user, db)
    if cmd == "7":
        return await _cmd_balance(user, db)
    if cmd == "8":
        return await _armar_resumen_semanal(user, db)
    if cmd == "9":
        potreros_str = await _listar_potreros(db, user.id)
        _set_estado(telefono, "esperando_tipo_mov")
        return (
            "🐄 ¿Qué tipo de movimiento?\n"
            "1️⃣ Mover entre franjas (mismo potrero)\n"
            "2️⃣ Mover entre potreros\n\n"
            f"Tus potreros: {potreros_str}"
        )

    if cmd in _MENU_OPCIONES:
        nuevo_estado, pregunta = _MENU_OPCIONES[cmd]
        _set_estado(telefono, nuevo_estado)
        return pregunta

    tipo_rapido = _detectar_tipo_rapido(mensaje)

    if tipo_rapido == "nota":
        texto_nota = _extraer_texto_prefijo(mensaje, "nota")
        db.add(NotaCuaderno(user_id=user.id, texto=texto_nota))
        await db.commit()
        return "✅ Nota guardada en tu cuaderno."

    if tipo_rapido == "tarea":
        texto_tarea = _extraer_texto_prefijo(mensaje, "tarea")
        db.add(TareaCuaderno(user_id=user.id, texto=texto_tarea))
        await db.commit()
        return "✅ Tarea guardada en tu cuaderno."

    if tipo_rapido == "tarea_realizada":
        texto_buscar = _extraer_texto_prefijo(mensaje, "tarea_realizada").lower()
        result_t = await db.execute(
            select(TareaCuaderno).where(
                TareaCuaderno.user_id == user.id,
                TareaCuaderno.completada == False,  # noqa: E712
            ).order_by(TareaCuaderno.created_at.desc())
        )
        tareas_pendientes = result_t.scalars().all()
        tarea_encontrada = None
        for t in tareas_pendientes:
            if texto_buscar and texto_buscar in t.texto.lower():
                tarea_encontrada = t
                break
        if tarea_encontrada is None and tareas_pendientes:
            if len(texto_buscar) < 4:
                tarea_encontrada = tareas_pendientes[0]
        if tarea_encontrada:
            from datetime import datetime as dt
            tarea_encontrada.completada = True
            tarea_encontrada.completed_at = dt.utcnow()
            await db.commit()
            return f"✅ Tarea completada: {tarea_encontrada.texto}"
        return (
            f"No encontré una tarea pendiente que coincida con '{texto_buscar}'. "
            "Revisá tus tareas con el comando tareas."
        )

    cats_gasto = await _cargar_categorias(db, user.id, TipoMovimiento.gasto)
    cats_ingreso = await _cargar_categorias(db, user.id, TipoMovimiento.ingreso)

    if tipo_rapido == "consulta":
        try:
            respuesta = await _responder_consulta(mensaje, user, db)
        except Exception as exc:
            logger.exception("Error respondiendo consulta WhatsApp: %s", exc)
            respuesta = "No pude procesar tu consulta. Intentá desde la app."
        return respuesta

    try:
        datos = await _clasificar(
            mensaje, user.nombre, user.moneda,
            [c.nombre for c in cats_gasto],
            [c.nombre for c in cats_ingreso],
        )
    except Exception as exc:
        logger.exception("Error clasificando mensaje WhatsApp: %s", exc)
        return "Hubo un error procesando tu mensaje. Intentá de nuevo."

    tipo = datos.get("tipo", "consulta")
    texto = datos.get("texto") or mensaje
    fecha_str = datos.get("fecha")
    monto_raw = datos.get("monto")
    moneda = datos.get("moneda") or user.moneda
    cat_sugerida = datos.get("categoria")
    contraparte = (datos.get("nombre_contraparte") or "").strip()
    vencimiento_str = datos.get("fecha_vencimiento")

    if tipo == "nota":
        db.add(NotaCuaderno(user_id=user.id, texto=texto))
        await db.commit()
        return "✅ Nota guardada en tu cuaderno."

    if tipo == "tarea":
        db.add(TareaCuaderno(
            user_id=user.id,
            texto=texto,
            fecha_planificada=_parse_date(fecha_str),
        ))
        await db.commit()
        fp = _parse_date(fecha_str)
        if fp:
            return f"✅ Tarea guardada para el {fp.strftime('%d/%m/%Y')}."
        return "✅ Tarea guardada en tu cuaderno."

    if tipo in ("gasto", "ingreso"):
        monto = _parse_monto(monto_raw)
        if monto is None:
            return "No pude identificar el monto. Intentá: 'Gasté 1500 en combustible'."
        tipo_mov = TipoMovimiento.gasto if tipo == "gasto" else TipoMovimiento.ingreso
        cats_lista = cats_gasto if tipo_mov == TipoMovimiento.gasto else cats_ingreso
        categoria = await _resolver_categoria(db, user.id, tipo_mov, cat_sugerida, cats_lista)
        db.add(Registro(
            user_id=user.id,
            categoria_id=categoria.id,
            tipo=tipo_mov,
            monto=monto,
            moneda=moneda,
            fecha=_parse_date(fecha_str) or date.today(),
            descripcion=texto,
        ))
        await db.commit()
        etiqueta = "Gasto" if tipo == "gasto" else "Ingreso"
        return f"✅ {etiqueta} de {moneda} ${monto:,.2f} registrado en '{categoria.nombre}': {texto}"

    if tipo == "cobro":
        monto = _parse_monto(monto_raw)
        if monto is None:
            return "No pude identificar el monto. Intentá: 'Juan me debe 5000'."
        if not contraparte:
            return "No pude identificar el nombre del cliente. Intentá: 'Pedro me debe 3000'."
        fecha_venc = _parse_date(vencimiento_str)
        cliente = await _get_or_create_cliente(db, user.id, contraparte)
        db.add(CuentaCobrar(
            user_id=user.id,
            cliente_id=cliente.id,
            monto=float(monto),
            moneda=moneda,
            descripcion=texto or None,
            fecha_vencimiento=datetime.combine(fecha_venc, datetime.min.time()) if fecha_venc else None,
        ))
        await db.commit()
        venc_str = f" (vence {fecha_venc.strftime('%d/%m/%Y')})" if fecha_venc else ""
        return f"✅ Cobro de {moneda} ${monto:,.2f} registrado para {cliente.nombre}{venc_str}."

    if tipo == "pago":
        monto = _parse_monto(monto_raw)
        if monto is None:
            return "No pude identificar el monto. Intentá: 'Debo 8000 a AgroInsumos'."
        if not contraparte:
            return "No pude identificar el nombre del proveedor. Intentá: 'Debo 8000 a AgroInsumos'."
        fecha_venc = _parse_date(vencimiento_str)
        proveedor = await _get_or_create_proveedor(db, user.id, contraparte)
        db.add(CuentaPagar(
            user_id=user.id,
            proveedor_id=proveedor.id,
            monto=float(monto),
            moneda=moneda,
            descripcion=texto or None,
            fecha_vencimiento=datetime.combine(fecha_venc, datetime.min.time()) if fecha_venc else None,
        ))
        await db.commit()
        venc_str = f" (vence {fecha_venc.strftime('%d/%m/%Y')})" if fecha_venc else ""
        return f"✅ Pago de {moneda} ${monto:,.2f} registrado para {proveedor.nombre}{venc_str}."

    if tipo == "marcar_pagado":
        if not contraparte:
            return "No pude identificar el proveedor. Intentá: 'Le pagué a AgroInsumos'."
        cuenta = await _marcar_cuenta_pagada(db, user.id, contraparte, monto_raw)
        if cuenta is None:
            return (
                f"No encontré un pago pendiente con '{contraparte}'. "
                "Verificá el nombre o registralo primero."
            )
        monto_fmt = f"{user.moneda} ${cuenta.monto:,.2f}"
        return f"✅ Pago a {contraparte} por {monto_fmt} marcado como realizado."

    if tipo == "marcar_cobrado":
        if not contraparte:
            return "No pude identificar el cliente. Intentá: 'Me pagó Juan Pérez'."
        cuenta = await _marcar_cuenta_cobrada(db, user.id, contraparte, monto_raw)
        if cuenta is None:
            return (
                f"No encontré un cobro pendiente con '{contraparte}'. "
                "Verificá el nombre o registralo primero."
            )
        monto_fmt = f"{user.moneda} ${cuenta.monto:,.2f}"
        return f"✅ Cobro de {contraparte} por {monto_fmt} marcado como recibido."

    try:
        respuesta = await _responder_consulta(mensaje, user, db)
    except Exception as exc:
        logger.exception("Error respondiendo consulta WhatsApp: %s", exc)
        respuesta = "No pude procesar tu consulta. Intentá desde la app."
