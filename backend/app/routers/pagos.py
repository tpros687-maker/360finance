import logging
from datetime import datetime, timedelta
from typing import Any

import httpx
import mercadopago
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.pago import PagoHistorial
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pagos", tags=["pagos"])

PRECIO_UYU = 280.0
PLAN_DURACION_DIAS = 30


def _mp_sdk() -> mercadopago.SDK:
    return mercadopago.SDK(settings.MP_ACCESS_TOKEN)


# ── Schemas ──────────────────────────────────────────────────────────────────

class PreferenciaResponse(BaseModel):
    init_point: str
    preference_id: str


class PagoRead(BaseModel):
    id: int
    monto: float
    moneda: str
    estado: str
    mp_payment_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers internos ──────────────────────────────────────────────────────────

def _extender_plan(user: User) -> None:
    """Extiende trial_fin 30 días desde el vencimiento actual (o desde ahora si ya venció)."""
    now = datetime.utcnow()
    base = max(user.trial_fin, now) if user.trial_fin else now
    user.trial_fin = base + timedelta(days=PLAN_DURACION_DIAS)
    user.plan = "activo"


async def _resolver_user(db: AsyncSession, external_ref: str | None) -> User | None:
    if not external_ref:
        return None
    try:
        user_id = int(external_ref)
    except (ValueError, TypeError):
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/crear-preferencia", response_model=PreferenciaResponse)
async def crear_preferencia(
    current_user: User = Depends(get_current_user),
) -> PreferenciaResponse:
    sdk = _mp_sdk()
    base_url = settings.FRONTEND_URL.rstrip("/")

    preference_data = {
        "items": [
            {
                "title": "360 Finance — Plan Pro",
                "quantity": 1,
                "unit_price": PRECIO_UYU,
                "currency_id": "UYU",
            }
        ],
        "external_reference": str(current_user.id),
        "back_urls": {
            "success": f"{base_url}/pago/exitoso",
            "pending": f"{base_url}/pago/pendiente",
            "failure": f"{base_url}/pago/fallido",
        },
        "statement_descriptor": "360 Finance",
    }

    result = sdk.preference().create(preference_data)
    if result["status"] not in (200, 201):
        logger.error("MP preference error: %s", result)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo crear la preferencia de pago",
        )

    resp = result["response"]
    return PreferenciaResponse(
        init_point=resp["init_point"],
        preference_id=resp["id"],
    )


@router.post("/crear-suscripcion", response_model=PreferenciaResponse)
async def crear_suscripcion(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PreferenciaResponse:
    sdk = _mp_sdk()
    base_url = settings.FRONTEND_URL.rstrip("/")

    preapproval_data = {
        "reason": "360 Agro Finance — Plan Pro (suscripción mensual)",
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "transaction_amount": PRECIO_UYU,
            "currency_id": "UYU",
        },
        "back_url": f"{base_url}/pago/exitoso",
        "payer_email": current_user.email,
        "external_reference": str(current_user.id),
        "status": "pending",
    }

    result = sdk.preapproval().create(preapproval_data)
    if result["status"] not in (200, 201):
        logger.error("MP preapproval error: %s", result)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo crear la suscripción",
        )

    resp = result["response"]
    current_user.suscripcion_id = resp["id"]
    await db.commit()

    return PreferenciaResponse(
        init_point=resp["init_point"],
        preference_id=resp["id"],
    )


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    MercadoPago sends POST notifications for payment and subscription events.
    Routes by topic:
      - payment                        → pago único (Checkout Pro)
      - subscription_preapproval       → suscripción autorizada/cancelada
      - subscription_authorized_payment / authorized_payment → cobro recurrente
    """
    body: dict[str, Any] = await request.json()
    topic = body.get("type") or request.query_params.get("topic")
    data_id = (body.get("data") or {}).get("id") or request.query_params.get("id")

    if not topic or not data_id:
        return {"status": "ignored"}

    sdk = _mp_sdk()

    if topic == "payment":
        return await _handle_payment(db, sdk, data_id)

    if topic == "subscription_preapproval":
        return await _handle_preapproval(db, sdk, data_id)

    if topic in ("subscription_authorized_payment", "authorized_payment"):
        return await _handle_authorized_payment(db, sdk, data_id)

    logger.debug("Webhook topic no manejado: %s", topic)
    return {"status": "ignored"}


# ── Handlers de webhook ───────────────────────────────────────────────────────

async def _handle_payment(
    db: AsyncSession, sdk: mercadopago.SDK, payment_id: Any
) -> dict[str, str]:
    """Pago único via Checkout Pro — flujo original sin cambios."""
    result = sdk.payment().get(payment_id)
    if result["status"] != 200:
        logger.warning("MP payment fetch failed: %s", result)
        return {"status": "error"}

    payment = result["response"]
    mp_status = payment.get("status")
    external_ref = payment.get("external_reference")
    transaction_amount = float(payment.get("transaction_amount", PRECIO_UYU))
    currency = payment.get("currency_id", "UYU")

    if not external_ref:
        return {"status": "ignored"}

    try:
        user_id = int(external_ref)
    except ValueError:
        return {"status": "ignored"}

    result_user = await db.execute(select(User).where(User.id == user_id))
    user = result_user.scalar_one_or_none()
    if user is None:
        return {"status": "ignored"}

    existing = await db.execute(
        select(PagoHistorial).where(PagoHistorial.mp_payment_id == str(payment_id))
    )
    es_nuevo = existing.scalar_one_or_none() is None
    if es_nuevo:
        db.add(PagoHistorial(
            user_id=user_id,
            monto=transaction_amount,
            moneda=currency,
            estado=mp_status,
            mp_payment_id=str(payment_id),
        ))

    if mp_status == "approved":
        user.plan = "activo"
        user.trial_fin = datetime.utcnow() + timedelta(days=PLAN_DURACION_DIAS)

    await db.commit()

    if es_nuevo and mp_status == "approved":
        from app.services.email import send_recibo_pago
        await send_recibo_pago(
            to=user.email,
            nombre=user.nombre,
            monto=transaction_amount,
            moneda=currency,
            payment_id=str(payment_id),
            fecha=datetime.utcnow(),
            vencimiento=user.trial_fin,
        )

    return {"status": "ok"}


async def _handle_preapproval(
    db: AsyncSession, sdk: mercadopago.SDK, preapproval_id: Any
) -> dict[str, str]:
    """Suscripción autorizada, pausada o cancelada por el usuario."""
    try:
        result = sdk.preapproval().get(preapproval_id)
        pre = result.get("response", {})
    except Exception:
        logger.exception("Error al obtener preapproval %s", preapproval_id)
        return {"status": "error"}

    pre_status = pre.get("status")
    user = await _resolver_user(db, pre.get("external_reference"))
    if user is None:
        return {"status": "ignored"}

    if pre_status == "authorized":
        user.suscripcion_id = str(preapproval_id)
        _extender_plan(user)
        logger.info("Suscripción autorizada para user %s hasta %s", user.id, user.trial_fin)
    elif pre_status in ("cancelled", "paused"):
        # El plan no se baja aquí; vence solo cuando trial_fin expire
        logger.info("Suscripción %s → %s para user %s", preapproval_id, pre_status, user.id)

    await db.commit()
    return {"status": "ok"}


async def _handle_authorized_payment(
    db: AsyncSession, sdk: mercadopago.SDK, auth_payment_id: Any
) -> dict[str, str]:
    """Cobro recurrente ejecutado automáticamente por MercadoPago.

    IMPORTANTE — verificar en sandbox los nombres exactos de campos de
    GET /authorized_payments/{id} antes de ir a producción:
      - "preapproval_id"     → id de la suscripción padre
      - "status"             → estado del cobro (¿"approved"? ¿"authorized"? ¿"processed"?)
      - "transaction_amount" → monto cobrado
    Alternativamente el status puede venir anidado en un objeto "payment".
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.mercadopago.com/authorized_payments/{auth_payment_id}",
                headers={"Authorization": f"Bearer {settings.MP_ACCESS_TOKEN}"},
            )
        if resp.status_code != 200:
            logger.warning(
                "MP authorized_payments fetch failed: %s %s", resp.status_code, resp.text[:200]
            )
            return {"status": "error"}
        auth_payment = resp.json()
    except Exception:
        logger.exception("Error al obtener authorized_payment %s", auth_payment_id)
        return {"status": "error"}

    # NOTA: verificar campos reales en sandbox antes de producción
    preapproval_id = auth_payment.get("preapproval_id")
    pay_status = (
        auth_payment.get("status")
        or (auth_payment.get("payment") or {}).get("status")
    )
    transaction_amount = float(
        auth_payment.get("transaction_amount")
        or (auth_payment.get("payment") or {}).get("transaction_amount")
        or PRECIO_UYU
    )

    if not preapproval_id:
        logger.warning("authorized_payment %s sin preapproval_id — ignorado", auth_payment_id)
        return {"status": "ignored"}

    # Resolvé el usuario a través de la preapproval padre
    try:
        pre_result = sdk.preapproval().get(preapproval_id)
        pre = pre_result.get("response", {})
    except Exception:
        logger.exception("Error al obtener preapproval %s", preapproval_id)
        return {"status": "error"}

    user = await _resolver_user(db, pre.get("external_reference"))
    if user is None:
        return {"status": "ignored"}

    # NOTA: verificar el valor exacto de status para cobros aprobados en sandbox
    pago_aprobado = pay_status in ("approved", "authorized", "processed")
    if not pago_aprobado:
        logger.info(
            "authorized_payment %s con status=%s — sin acción", auth_payment_id, pay_status
        )
        return {"status": "ok"}

    existing = await db.execute(
        select(PagoHistorial).where(PagoHistorial.mp_payment_id == str(auth_payment_id))
    )
    es_nuevo = existing.scalar_one_or_none() is None
    if es_nuevo:
        db.add(PagoHistorial(
            user_id=user.id,
            monto=transaction_amount,
            moneda="UYU",
            estado="approved",
            mp_payment_id=str(auth_payment_id),
        ))

    _extender_plan(user)
    await db.commit()

    if es_nuevo:
        from app.services.email import send_recibo_pago
        await send_recibo_pago(
            to=user.email,
            nombre=user.nombre,
            monto=transaction_amount,
            moneda="UYU",
            payment_id=str(auth_payment_id),
            fecha=datetime.utcnow(),
            vencimiento=user.trial_fin,
        )

    return {"status": "ok"}


# ── Historial ─────────────────────────────────────────────────────────────────

@router.get("/historial", response_model=list[PagoRead])
async def historial(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PagoHistorial]:
    result = await db.execute(
        select(PagoHistorial)
        .where(PagoHistorial.user_id == current_user.id)
        .order_by(PagoHistorial.created_at.desc())
    )
    return list(result.scalars().all())
