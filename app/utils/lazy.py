"""Lazy import utilities for heavy dependencies."""


def lazy_pandas():
    """Return pandas module lazily imported."""
    import pandas as pd
    return pd
