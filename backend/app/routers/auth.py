import logging
import secrets
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt as jose_jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.services.email import send_email, send_email_bienvenida, send_email_cambio_password, send_email_recuperar_password
from app.deps import get_current_user
from app.models.user import User
from app.schemas.user import LoginRequest, OnboardingRequest, PlanRead, ProfileUpdate, RefreshRequest, TokenPair, UserCreate, UserRead


class SSORequest(BaseModel):
    token: str

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> User:
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El email ya está registrado")

    ahora = datetime.utcnow()
    token_ver = secrets.token_urlsafe(32)
    user = User(
        email=payload.email,
        nombre=payload.nombre,
        apellido=payload.apellido,
        hashed_password=hash_password(payload.password),
        perfil=payload.perfil,
        plan="trial",
        trial_inicio=ahora,
        trial_fin=ahora + timedelta(days=30),
        email_verificado=False,
        token_verificacion=token_ver,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("RESEND_API_KEY presente: %s", bool(settings.RESEND_API_KEY))
    verify_url = f"https://finance.360rural.com/verificar-email?token={token_ver}"
    await send_email_bienvenida(to=user.email, nombre=user.nombre, verify_url=verify_url)
    return user


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
        )

    if not user.email_verificado:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verificá tu email antes de ingresar",
        )

    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/verificar-email")
async def verificar_email(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(User).where(User.token_verificacion == token))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token inválido o ya utilizado")
    user.email_verificado = True
    user.token_verificacion = None
    await db.commit()
    return {"ok": True}


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    try:
        user_id = decode_token(payload.refresh_token, expected_type="refresh")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido o expirado",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    return TokenPair(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


def _compute_plan_fields(user: User) -> dict:
    ahora = datetime.utcnow()
    if user.trial_fin:
        delta = user.trial_fin.replace(tzinfo=None) - ahora
        dias_restantes = max(delta.days, 0)
        vencido = ahora > user.trial_fin.replace(tzinfo=None)
    else:
        dias_restantes = None
        vencido = False
    return {"dias_restantes": dias_restantes, "vencido": vencido}


@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)) -> UserRead:
    data = {c.key: getattr(current_user, c.key) for c in current_user.__table__.columns}
    data.update(_compute_plan_fields(current_user))
    return UserRead(**data)


@router.get("/plan", response_model=PlanRead)
async def plan(current_user: User = Depends(get_current_user)) -> PlanRead:
    fields = _compute_plan_fields(current_user)
    return PlanRead(
        plan=current_user.plan,
        trial_inicio=current_user.trial_inicio,
        trial_fin=current_user.trial_fin,
        **fields,
    )


@router.put("/me", response_model=UserRead)
async def update_me(
    body: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    if body.email is not None and body.email != current_user.email:
        existing = await db.execute(select(User).where(User.email == body.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El email ya está en uso")
        current_user.email = body.email

    if body.telefono is not None:
        tel = body.telefono.strip() or None
        if tel and tel != current_user.telefono:
            existing = await db.execute(select(User).where(User.telefono == tel))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El teléfono ya está en uso")
        current_user.telefono = tel

    if body.nombre is not None:
        current_user.nombre = body.nombre
    if body.apellido is not None:
        current_user.apellido = body.apellido

    await db.commit()
    await db.refresh(current_user)
    data = {c.key: getattr(current_user, c.key) for c in current_user.__table__.columns}
    data.update(_compute_plan_fields(current_user))
    return UserRead(**data)


@router.patch("/onboarding", response_model=UserRead)
async def onboarding(
    body: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    current_user.es_productor = body.es_productor
    current_user.es_negocio = body.es_negocio
    current_user.nombre_campo = body.nombre_campo
    current_user.departamento = body.departamento
    current_user.moneda = body.moneda
    current_user.onboarding_completado = True
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/sso", response_model=TokenPair)
async def sso_login(body: SSORequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    try:
        payload = jose_jwt.decode(body.token, settings.SSO_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token SSO inválido o expirado")

    email = payload.get("email")
    nombre = payload.get("nombre", "")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token SSO sin email")

    tipo = payload.get("tipoUsuario", "productor")
    perfil = "negocio" if tipo == "proveedor" else "productor"

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            nombre=nombre,
            apellido="",
            hashed_password=hash_password(secrets.token_hex(32)),
            perfil=perfil,
            plan="sso",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif user.perfil != perfil:
        user.perfil = perfil
        await db.commit()
        await db.refresh(user)

    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


class CambiarPasswordRequest(BaseModel):
    password_actual: str
    password_nueva: str


class RecuperarPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password_nueva: str


@router.put("/cambiar-password")
async def cambiar_password(
    body: CambiarPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not verify_password(body.password_actual, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contraseña actual incorrecta")
    current_user.hashed_password = hash_password(body.password_nueva)
    await db.commit()
    fecha_hora = datetime.utcnow().strftime("%d/%m/%Y a las %H:%M UTC")
    await send_email_cambio_password(to=current_user.email, nombre=current_user.nombre, fecha_hora=fecha_hora)
    return {"ok": True}


@router.post("/recuperar-password")
async def recuperar_password(
    body: RecuperarPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is not None:
        token = secrets.token_urlsafe(32)
        user.token_reset_password = token
        await db.commit()
        reset_url = f"https://finance.360rural.com/reset-password?token={token}"
        await send_email_recuperar_password(to=user.email, nombre=user.nombre, reset_url=reset_url)
    return {"ok": True}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(User).where(User.token_reset_password == body.token))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token inválido o ya utilizado")
    user.hashed_password = hash_password(body.password_nueva)
    user.token_reset_password = None
    await db.commit()
    return {"ok": True}
