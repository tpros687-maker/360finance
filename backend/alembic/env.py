import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

from app.database import Base
import app.models  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    raw = os.environ.get("DATABASE_URL", "")
    # Quitar query string (?ssl=require, etc.)
    raw = raw.split("?")[0]
    # Supabase: usar psycopg2 síncrono
    if "supabase.com" in raw:
        raw = raw.replace("postgresql+asyncpg://", "postgresql://")
        raw = raw.replace("postgres://", "postgresql://")
        return raw
    # Railway / otros: usar asyncpg
    if raw.startswith("postgres://"):
        return raw.replace("postgres://", "postgresql+asyncpg://", 1)
    if raw.startswith("postgresql://") and "+asyncpg" not in raw:
        return raw.replace("postgresql://", "postgresql+asyncpg://", 1)
    return raw


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = get_url()

    if "supabase.com" in url:
        # Supabase pooler: conexión síncrona con psycopg2 + SSL
        from sqlalchemy import create_engine
        engine = create_engine(
            url,
            poolclass=pool.NullPool,
            connect_args={"sslmode": "require"},
        )
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata)
            with context.begin_transaction():
                context.run_migrations()
        engine.dispose()
    else:
        # Railway / local: conexión asíncrona con asyncpg
        async def _run() -> None:
            engine = create_async_engine(url, poolclass=pool.NullPool)
            async with engine.connect() as connection:
                await connection.run_sync(do_run_migrations)
            await engine.dispose()

        asyncio.run(_run())


run_migrations_online()
