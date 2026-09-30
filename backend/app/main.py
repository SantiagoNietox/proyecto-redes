from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import catalogo, compras, dashboard, despensa
from app.database import Base, engine
from app import models  # noqa: F401 - registra los modelos antes de crear las tablas


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="SmartPantry API",
    description="API para catálogo, despensa, compras y métricas de SmartPantry.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://192.168.56.10",
        "http://smartpantry.local",
        "http://localhost",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(catalogo.router, prefix="/api")
app.include_router(despensa.router, prefix="/api")
app.include_router(compras.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.get("/api/health", tags=["Salud"])
def health():
    return {"status": "ok", "service": "smartpantry-api"}
