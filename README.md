# 360 Finance

Sistema de gestión financiera agropecuaria con soporte geoespacial.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI · SQLAlchemy async · PostgreSQL + PostGIS · Alembic · Pydantic v2 |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui · Zustand · TanStack Query |
| Infra | Docker · Docker Compose |

---

## Levantar con Docker (recomendado)

```bash
# 1. Clonar y entrar al directorio
cd 360-finance

# 2. Copiar variables de entorno (ya hay un .env de desarrollo listo)
# Editá backend/.env si necesitás cambiar la SECRET_KEY

# 3. Levantar servicios
docker compose up --build
```

Servicios disponibles:
- **API**: http://localhost:8000
- **Docs Swagger**: http://localhost:8000/docs
- **DB** (PostgreSQL + PostGIS): localhost:5432

---

## Desarrollo local sin Docker

### Backend

```bash
cd backend

# Crear entorno virtual
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt

# Variables de entorno (ajustar DATABASE_URL para apuntar a Postgres local)
cp .env.example .env

# Correr migraciones
alembic upgrade head

# Iniciar servidor
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

Frontend disponible en http://localhost:5173

---

## Variables de entorno (backend)

| Variable | Descripción | Default dev |
|----------|-------------|-------------|
| `DATABASE_URL` | URL de conexión asyncpg | `postgresql+asyncpg://...` |
| `SECRET_KEY` | Clave para firmar JWT (min 32 chars) | ⚠️ cambiar en producción |
| `ALGORITHM` | Algoritmo JWT | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Duración del access token | `30` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Duración del refresh token | `7` |
| `CORS_ORIGINS` | Origins permitidos (separados por coma) | `http://localhost:5173` |

---

## Endpoints de autenticación

```
POST   /auth/register   → Crear cuenta
POST   /auth/login      → Login (devuelve access + refresh token)
POST   /auth/refresh    → Renovar tokens
GET    /auth/me         → Datos del usuario autenticado
GET    /health          → Health check
```

---

## Estructura del proyecto

```
360-finance/
├── backend/
│   ├── app/
│   │   ├── auth/          # JWT helpers
│   │   ├── models/        # SQLAlchemy ORM
│   │   ├── routers/       # FastAPI routers
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── alembic/           # Migraciones
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/    # UI components + layout
│   │   ├── hooks/
│   │   ├── lib/           # axios, authApi, utils
│   │   ├── pages/         # Login, Register, Dashboard, ...
│   │   ├── store/         # Zustand auth store
│   │   └── types/
│   ├── vite.config.ts
│   └── package.json
├── docker-compose.yml
└── README.md
```
