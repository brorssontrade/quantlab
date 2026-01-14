"""Database module - stub."""
from contextlib import contextmanager
from typing import Generator, Any


def create_db_and_tables():
    """Create database tables."""
    pass


@contextmanager
def get_session() -> Generator[Any, None, None]:
    """Get database session context manager."""
    yield None
