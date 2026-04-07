"""CLI utility to rotate stored API key encryption."""

from __future__ import annotations

import argparse
from typing import Optional

from sqlalchemy import func

from app.backend.database.connection import SessionLocal
from app.backend.database.models import ApiKey
from app.backend.security.encryption import EncryptionService


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Re-encrypt stored API keys with a new Fernet key")
    parser.add_argument(
        "--new-key",
        required=True,
        help="Base64-encoded Fernet key to encrypt all API keys with",
    )
    parser.add_argument(
        "--old-key",
        required=False,
        default=None,
        help="Previous Fernet key. Leave blank if values are plaintext or already decrypted.",
    )
    return parser


def rotate_encryption(old_key: Optional[str], new_key: str) -> int:
    old_service = EncryptionService(old_key, require_key=False, context="OLD_API_KEY_ENCRYPTION_KEY")
    new_service = EncryptionService(new_key, require_key=True)

    session = SessionLocal()
    updated = 0
    try:
        api_keys = session.query(ApiKey).all()
        for record in api_keys:
            plaintext = old_service.decrypt(record.key_value)
            record.key_value = new_service.encrypt(plaintext)
            record.updated_at = func.now()
            updated += 1
        session.commit()
    finally:
        session.close()
    return updated


def main() -> None:
    args = _build_parser().parse_args()
    updated = rotate_encryption(args.old_key, args.new_key)
    print(f"Re-encrypted {updated} API keys with the new key.")


if __name__ == "__main__":  # pragma: no cover
    main()
