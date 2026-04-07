from __future__ import annotations

from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.backend.database.models import ApiKey
from app.backend.security.encryption import encryption_service


class ApiKeyRepository:
    """Repository for API key database operations."""

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _encrypt(value: Optional[str]) -> Optional[str]:
        return encryption_service.encrypt(value)

    @staticmethod
    def _decrypt_model(api_key: Optional[ApiKey]) -> Optional[ApiKey]:
        if api_key and api_key.key_value:
            api_key.key_value = encryption_service.decrypt(api_key.key_value)
        return api_key

    def _decrypt_collection(self, api_keys: List[ApiKey]) -> List[ApiKey]:
        return [self._decrypt_model(api_key) for api_key in api_keys if api_key]

    def create_or_update_api_key(
        self,
        provider: str,
        key_value: str,
        description: str | None = None,
        is_active: bool = True,
    ) -> ApiKey:
        """Create a new API key or update an existing one."""

        encrypted_value = self._encrypt(key_value)
        existing_key = self.db.query(ApiKey).filter(ApiKey.provider == provider).first()

        if existing_key:
            existing_key.key_value = encrypted_value
            existing_key.description = description
            existing_key.is_active = is_active
            existing_key.updated_at = func.now()
            self.db.commit()
            self.db.refresh(existing_key)
            return self._decrypt_model(existing_key)

        api_key = ApiKey(
            provider=provider,
            key_value=encrypted_value,
            description=description,
            is_active=is_active,
        )
        self.db.add(api_key)
        self.db.commit()
        self.db.refresh(api_key)
        return self._decrypt_model(api_key)

    def get_api_key_by_provider(self, provider: str) -> Optional[ApiKey]:
        api_key = (
            self.db.query(ApiKey)
            .filter(ApiKey.provider == provider, ApiKey.is_active.is_(True))
            .first()
        )
        return self._decrypt_model(api_key)

    def get_all_api_keys(self, include_inactive: bool = False) -> List[ApiKey]:
        query = self.db.query(ApiKey)
        if not include_inactive:
            query = query.filter(ApiKey.is_active.is_(True))
        api_keys = query.order_by(ApiKey.provider).all()
        return self._decrypt_collection(api_keys)

    def update_api_key(
        self,
        provider: str,
        key_value: Optional[str] = None,
        description: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Optional[ApiKey]:
        api_key = self.db.query(ApiKey).filter(ApiKey.provider == provider).first()
        if not api_key:
            return None

        if key_value is not None:
            api_key.key_value = self._encrypt(key_value)
        if description is not None:
            api_key.description = description
        if is_active is not None:
            api_key.is_active = is_active

        api_key.updated_at = func.now()
        self.db.commit()
        self.db.refresh(api_key)
        return self._decrypt_model(api_key)

    def delete_api_key(self, provider: str) -> bool:
        api_key = self.db.query(ApiKey).filter(ApiKey.provider == provider).first()
        if not api_key:
            return False
        self.db.delete(api_key)
        self.db.commit()
        return True

    def deactivate_api_key(self, provider: str) -> bool:
        api_key = self.db.query(ApiKey).filter(ApiKey.provider == provider).first()
        if not api_key:
            return False
        api_key.is_active = False
        api_key.updated_at = func.now()
        self.db.commit()
        return True

    def update_last_used(self, provider: str) -> bool:
        api_key = (
            self.db.query(ApiKey)
            .filter(ApiKey.provider == provider, ApiKey.is_active.is_(True))
            .first()
        )
        if not api_key:
            return False
        api_key.last_used = func.now()
        self.db.commit()
        return True

    def bulk_create_or_update(self, api_keys_data: List[dict]) -> List[ApiKey]:
        results = []
        for data in api_keys_data:
            api_key = self.create_or_update_api_key(
                provider=data["provider"],
                key_value=data["key_value"],
                description=data.get("description"),
                is_active=data.get("is_active", True),
            )
            results.append(api_key)
        return results
