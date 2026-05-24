import os
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import AsyncSessionLocal
from app.services.cotizacion import actualizar_cotizacion_hoy
from app.services.notificaciones import enviar_notificaciones_tareas, enviar_resumen_diario, generar_resumenes_mensuales
from app.services.suscripciones import enviar_recordatorios_vencimiento
from app.routers.auth import router as auth_router
from app.routers.categorias import router as categorias_router
from app.routers.registros import router as registros_router
from app.routers.potreros import router as potreros_router
from app.routers.animales import router as animales_router
from app.routers.puntos_interes import router as puntos_interes_router
from app.routers.movimientos import router as movimientos_router
from app.routers.dashboard import router as dashboard_router
from app.routers.asistente import router as asistente_router
from app.routers.clientes import router as clientes_router
from app.routers.proveedores import router as proveedores_router
from app.routers.productos import router as productos_router
from app.routers.pagos import router as pagos_router
from app.routers.aplicaciones import router as aplicaciones_router
from app.routers.rentabilidad import router as rentabilidad_router
from app.routers.cuaderno import router as cuaderno_router
from app.routers.whatsapp import router as whatsapp_router
from app.routers.resumenes import router as resumenes_router


async def _job_notificaciones() -> None:
    async with AsyncSessionLocal() as db:
        try:
            await enviar_notificaciones_tareas(db)
        except Exception:
            pass


async def _job_resumen_diario() -> None:
    async with AsyncSessionLocal() as db:
        try:
            await enviar_resumen_diario(db)
        except Exception:
            pass


async def _job_resumen_mensual() -> None:
    async with AsyncSessionLocal() as db:
        try:
            await generar_resumenes_mensuales(db)
        except Exception:
            pass


async def _job_recordatorios_vencimiento() -> None:
    async with AsyncSessionLocal() as db:
        try:
            await enviar_recordatorios_vencimiento(db)
        except Exception:
            pass


_scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as db:
        try:
            await actualizar_cotizacion_hoy(db)
        except Exception:
            pass  # Nunca bloquear el arranque por fallo de cotización

    _scheduler.add_job(
        _job_resumen_diario,
        CronTrigger(hour=7, minute=0, timezone="America/Montevideo"),
        id="resumen_diario",
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_notificaciones,
        CronTrigger(hour=8, minute=0, timezone="America/Montevideo"),
        id="notificaciones_tareas",
        replace_existing=True,
    )
    # Día 1 de cada mes a las 09:00 — resumen financiero mensual
    _scheduler.add_job(
        _job_resumen_mensual,
        CronTrigger(day=1, hour=9, minute=0, timezone="America/Montevideo"),
        id="resumen_mensual",
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_recordatorios_vencimiento,
        CronTrigger(hour=10, minute=0, timezone="America/Montevideo"),
        id="recordatorios_vencimiento",
        replace_existing=True,
    )
    _scheduler.start()
    yield
    _scheduler.shutdown(wait=False)


app = FastAPI(
    title="360 Finance API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(categorias_router)
app.include_router(registros_router)
app.include_router(potreros_router)
app.include_router(animales_router)
app.include_router(puntos_interes_router)
app.include_router(movimientos_router)
app.include_router(dashboard_router)
app.include_router(asistente_router)
app.include_router(clientes_router)
app.include_router(proveedores_router)
app.include_router(productos_router)
app.include_router(pagos_router)
app.include_router(aplicaciones_router)
app.include_router(rentabilidad_router)
app.include_router(cuaderno_router)
app.include_router(whatsapp_router)
app.include_router(resumenes_router)

# Serve uploaded files
_uploads_dir = "/app/uploads"
os.makedirs(_uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/debug/cotizaciones")
async def debug_cotizaciones():
    from sqlalchemy import text
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("SELECT id, fecha::text, usd_uyu::text, usd_ars::text, fuente FROM cotizaciones_diarias ORDER BY fecha DESC LIMIT 5")
        )
        rows = [dict(r._mapping) for r in result.all()]
    return rows
