"""Seed initial ReferenciaProductiva values for Uruguay (fuente: Plan Agropecuario 2023).

Run from backend/ directory:
    python -m app.scripts.seed_referencias
"""
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.referencia import ReferenciaProductiva

REFERENCIAS = [
    ("cria",     80,  140, 200),
    ("invernada", 100, 180, 260),
    ("soja",     150, 250, 380),
    ("maiz",     120, 210, 320),
    ("trigo",     80, 150, 230),
]


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        for actividad, bajo, medio, alto in REFERENCIAS:
            existing = await db.execute(
                select(ReferenciaProductiva).where(
                    ReferenciaProductiva.pais == "UY",
                    ReferenciaProductiva.actividad == actividad,
                    ReferenciaProductiva.anio == 2023,
                )
            )
            if existing.scalar_one_or_none() is not None:
                print(f"  skip {actividad} (ya existe)")
                continue

            db.add(ReferenciaProductiva(
                pais="UY",
                actividad=actividad,
                anio=2023,
                margen_neto_ha_usd_bajo=bajo,
                margen_neto_ha_usd_medio=medio,
                margen_neto_ha_usd_alto=alto,
                fuente="Plan Agropecuario 2023",
            ))
            print(f"  insert {actividad}: {bajo}/{medio}/{alto} USD/ha")

        await db.commit()
        print("Seed completado.")


if __name__ == "__main__":
    asyncio.run(seed())
