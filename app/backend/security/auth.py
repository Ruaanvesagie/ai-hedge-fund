"""API authentication helpers (signed API-key verification)."""

from __future__ import annotations

import hashlib
import logging
from typing import Optional

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader
from starlette import status

from app.backend.core.config import get_settings

logger = logging.getLogger(__name__)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def _normalize_digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def require_admin_api_key(api_key: Optional[str] = Security(_api_key_header)) -> None:
    """FastAPI dependency that enforces API-key authentication."""

    settings = get_settings()

    if not settings.admin_api_key_hashes:
        if settings.is_production:
            logger.error("ADMIN_API_KEYS is empty in production mode.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="API authentication is not configured",
            )
        # Development fallback – allow access but warn loudly
        logger.warning("ADMIN_API_KEYS not configured; allowing request (development mode only).")
        return

    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing API key")

    digest = _normalize_digest(api_key)
    if digest not in settings.admin_api_key_hashes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")

    # Success – no return value required
    return None
