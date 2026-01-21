"""Database module for QuantLab.

This module provides SQLModel/SQLAlchemy database management:
- SQLite database at storage/alerts.db
- Session management with context manager
- Automatic table creation on startup

Usage:
    from app.db import get_session, create_db_and_tables
    
    # At startup
    create_db_and_tables()
    
    # In route handlers
    with get_session() as session:
        alerts = session.exec(select(Alert)).all()
"""
from __future__ import annotations
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

from sqlmodel import SQLModel, Session, create_engine


# =============================================================================
# Database Configuration
# =============================================================================

# Database path: storage/alerts.db (relative to repo root)
_REPO_ROOT = Path(__file__).parent.parent
_STORAGE_DIR = _REPO_ROOT / "storage"
_DB_PATH = _STORAGE_DIR / "alerts.db"

# Ensure storage directory exists
_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# SQLite connection URL
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_DB_PATH}")

# Create engine with SQLite-specific settings
# check_same_thread=False is required for FastAPI's async context
engine = create_engine(
    DATABASE_URL,
    echo=False,  # Set to True for SQL query logging
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)


# =============================================================================
# Database Management Functions
# =============================================================================

def create_db_and_tables() -> None:
    """Create all SQLModel tables in the database.
    
    This should be called once at application startup.
    Safe to call multiple times - will only create tables that don't exist.
    """
    # Import models to register them with SQLModel.metadata
    from . import models  # noqa: F401
    
    SQLModel.metadata.create_all(engine)


@contextmanager
def get_session() -> Generator[Session, None, None]:
    """Get a database session context manager.
    
    Usage:
        with get_session() as session:
            alerts = session.exec(select(Alert)).all()
            session.add(new_alert)
            session.commit()
    
    The session is automatically committed on success and rolled back on error.
    """
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

