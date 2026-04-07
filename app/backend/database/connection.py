"""Database connection helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Dict

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.backend.core.config import get_settings

BACKEND_DIR = Path(__file__).parent.parent
_default_db_path = BACKEND_DIR / "hedge_fund.db"
settings = get_settings()

DATABASE_URL = settings.database_url or f"sqlite:///{_default_db_path}"
_connect_args: Dict[str, object] = {}
engine_kwargs = {"pool_pre_ping": True}

if DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False
else:
    # Give Postgres/MySQL connections a modest pool suitable for small deployments
    engine_kwargs.update({"pool_size": 5, "max_overflow": 5})

engine = create_engine(DATABASE_URL, connect_args=_connect_args, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency – yields a DB session and ensures cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
