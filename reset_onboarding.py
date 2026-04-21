import asyncio
from app.database import AsyncSessionLocal
from app.models.user import User
from sqlalchemy import update

async def run():
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).values(onboarding_completado=False))
        await db.commit()
        print('OK')

asyncio.run(run())
