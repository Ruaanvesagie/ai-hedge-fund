"""Global rate limiting helpers using SlowAPI."""

from __future__ import annotations

from typing import List, Optional

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.backend.core.config import get_settings

settings = get_settings()


def _build_limits() -> List[str]:
    limits: List[str] = []
    if settings.rate_limit_per_minute > 0:
        limits.append(f"{settings.rate_limit_per_minute}/minute")
    if settings.rate_limit_burst_per_second > 0:
        limits.append(f"{settings.rate_limit_burst_per_second}/second")
    return limits


def _create_limiter() -> Optional[Limiter]:
    limits = _build_limits()
    if not settings.rate_limit_enabled or not limits:
        return None
    return Limiter(key_func=get_remote_address, default_limits=limits, enabled=True)


limiter = _create_limiter()
rate_limit_enabled = limiter is not None

__all__ = ["limiter", "rate_limit_enabled"]
