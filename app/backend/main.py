from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette import status as http_status

from app.backend.core.config import get_settings
from app.backend.database.connection import engine
from app.backend.database.models import Base
from app.backend.routes import api_router
from app.backend.security.rate_limit import limiter, rate_limit_enabled
from app.backend.services.ollama_service import ollama_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""

    try:
        logger.info("Checking Ollama availability...")
        status = await ollama_service.check_ollama_status()
        if status["installed"]:
            if status["running"]:
                logger.info("✓ Ollama is installed and running at %s", status["server_url"])
                if status["available_models"]:
                    logger.info("✓ Available models: %s", ", ".join(status["available_models"]))
                else:
                    logger.info("ℹ No models are currently downloaded")
            else:
                logger.info("ℹ Ollama is installed but not running")
                logger.info("ℹ You can start it from the Settings page or manually with 'ollama serve'")
        else:
            logger.info("ℹ Ollama is not installed. Visit https://ollama.com to install it if needed.")
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.warning("Could not check Ollama status: %s", exc)
        logger.info("ℹ Ollama integration is available if you install it later")

    yield
    logger.info("Application shutting down.")


def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=http_status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": "Rate limit exceeded. Please wait and try again."},
    )


docs_url = "/docs" if settings.enable_api_docs else None
redoc_url = "/redoc" if settings.enable_api_docs else None
openapi_url = "/openapi.json" if settings.enable_api_docs else None

app = FastAPI(
    title="NGC AI Exchange API",
    description="Backend API for NGC AI Exchange – AI-powered hedge fund analysis",
    version="0.2.0",
    lifespan=lifespan,
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
)

if rate_limit_enabled and limiter:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
    app.add_middleware(SlowAPIMiddleware)

Base.metadata.create_all(bind=engine)

_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://smartkonnect.co.uk",
    "https://www.smartkonnect.co.uk",
]
_allowed_origins = _default_origins + settings.cors_extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
