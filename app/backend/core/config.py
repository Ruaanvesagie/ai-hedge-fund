"""Centralized application configuration using Pydantic settings."""

from __future__ import annotations

import hashlib
import logging
from functools import lru_cache
from typing import List, Optional

from pydantic import Field, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Strongly typed runtime configuration."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = Field(default="development", alias="ENVIRONMENT")
    database_url: Optional[str] = Field(default=None, alias="DATABASE_URL")
    cors_extra_origins: List[str] = Field(default_factory=list, alias="CORS_EXTRA_ORIGINS")
    api_key_encryption_key: Optional[str] = Field(default=None, alias="API_KEY_ENCRYPTION_KEY")
    admin_api_keys_raw: List[str] = Field(default_factory=list, alias="ADMIN_API_KEYS")
    enable_api_docs: bool = Field(default=False, alias="ENABLE_API_DOCS")
    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    rate_limit_per_minute: int = Field(default=60, alias="RATE_LIMIT_PER_MINUTE")
    rate_limit_burst_per_second: int = Field(default=10, alias="RATE_LIMIT_BURST_PER_SECOND")

    @field_validator("cors_extra_origins", mode="before")
    @classmethod
    def split_csv(cls, value: str | List[str] | None) -> List[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("admin_api_keys_raw", mode="before")
    @classmethod
    def split_admin_keys(cls, value: str | List[str] | None) -> List[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @computed_field
    @property
    def admin_api_key_hashes(self) -> List[str]:
        """Return normalized SHA-256 hashes for admin API keys."""
        hashes: List[str] = []
        for entry in self.admin_api_keys_raw:
            normalized = entry.strip()
            if not normalized:
                continue
            if normalized.startswith("sha256:"):
                hashes.append(normalized.split("sha256:", 1)[1])
                continue
            # Treat as plaintext and hash it for in-memory comparison
            hashed = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
            hashes.append(hashed)
            logger.warning(
                "ADMIN_API_KEYS entry provided in plaintext. Consider using sha256:<hash> instead."
            )
        return hashes

    @computed_field
    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
