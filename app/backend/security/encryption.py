"""Utility for encrypting and decrypting sensitive values such as API keys."""

from __future__ import annotations

import logging
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.backend.core.config import get_settings

logger = logging.getLogger(__name__)


class EncryptionService:
    """Thin wrapper around Fernet symmetric encryption."""

    def __init__(
        self,
        key: Optional[str],
        *,
        require_key: bool = False,
        context: str = "API_KEY_ENCRYPTION_KEY",
    ) -> None:
        self._fernet: Optional[Fernet] = None
        self._context = context

        if key:
            try:
                key_bytes = key.encode("utf-8") if isinstance(key, str) else key
                self._fernet = Fernet(key_bytes)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.error("Failed to initialize encryption service: %s", exc)
                raise
        else:
            if require_key:
                raise RuntimeError(
                    f"{context} must be configured before starting the service in this environment."
                )
            logger.warning(
                "%s is not set. Values will be stored in plaintext until a key is provided.",
                context,
            )

    def encrypt(self, plaintext: Optional[str]) -> Optional[str]:
        if plaintext is None:
            return None
        if not self._fernet:
            return plaintext
        token = self._fernet.encrypt(plaintext.encode("utf-8"))
        return token.decode("utf-8")

    def decrypt(self, ciphertext: Optional[str]) -> Optional[str]:
        if ciphertext is None:
            return None
        if not self._fernet:
            return ciphertext
        try:
            value = self._fernet.decrypt(ciphertext.encode("utf-8"))
            return value.decode("utf-8")
        except InvalidToken:
            logger.error("Invalid encryption token encountered while decrypting API key.")
            raise


# Singleton
settings = get_settings()
encryption_service = EncryptionService(
    settings.api_key_encryption_key,
    require_key=settings.is_production,
)
