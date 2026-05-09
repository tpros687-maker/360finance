import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import AsyncSessionLocal
from app.services.cotizacion import actualizar_cotizacion_hoy
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
from app.routers.produccion import router as produccion_router
from app.routers.rentabilidad import router as rentabilidad_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as db:
        try:
            await actualizar_cotizacion_hoy(db)
        except Exception:
            pass  # Nunca bloquear el arranque por fallo de cotización
    yield


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
app.include_router(produccion_router)
app.include_router(rentabilidad_router)

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
            text("SELECT id, fecha::text, usd_uyu::text, fuente, calculado_at::text FROM cotizaciones_diarias ORDER BY fecha DESC LIMIT 5")
        )
        rows = [dict(r._mapping) for r in result.all()]
    return rows
