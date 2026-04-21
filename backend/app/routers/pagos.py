import logging
from datetime import datetime, timedelta
from typing import Any

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


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    MercadoPago sends POST notifications for payment events.
    We only act on topic=payment with status=approved.
    """
    body: dict[str, Any] = await request.json()
    topic = body.get("type") or request.query_params.get("topic")
    payment_id = (body.get("data") or {}).get("id") or request.query_params.get("id")

    if topic != "payment" or not payment_id:
        return {"status": "ignored"}

    sdk = _mp_sdk()
    result = sdk.payment().get(payment_id)
    if result["status"] != 200:
        logger.warning("MP payment fetch failed: %s", result)
        return {"status": "error"}

    payment = result["response"]
    mp_status = payment.get("status")
    external_ref = payment.get("external_reference")
    transaction_amount = float(payment.get("transaction_amount", PRECIO_USD))
    currency = payment.get("currency_id", "USD")

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

    # Record payment in history (idempotent — skip if already stored)
    existing = await db.execute(
        select(PagoHistorial).where(PagoHistorial.mp_payment_id == str(payment_id))
    )
    if existing.scalar_one_or_none() is None:
        db.add(
            PagoHistorial(
                user_id=user_id,
                monto=transaction_amount,
                moneda=currency,
                estado=mp_status,
                mp_payment_id=str(payment_id),
            )
        )

    if mp_status == "approved":
        user.plan = "activo"
        user.trial_fin = datetime.utcnow() + timedelta(days=PLAN_DURACION_DIAS)

    await db.commit()
    return {"status": "ok"}


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
