"""Tests that DATABASE_URL never leaks credentials via defaults."""

from urllib.parse import urlsplit

from app.core.config import database_url_from_env


def test_database_url_default_contains_no_credentials(monkeypatch):
    """Default DATABASE_URL should not embed a username or password."""
    monkeypatch.delenv("DATABASE_URL", raising=False)

    parsed = urlsplit(database_url_from_env())

    assert parsed.username is None
    assert parsed.password is None


def test_database_url_uses_environment_override(monkeypatch):
    """An explicit DATABASE_URL env var should be used as-is."""
    expected = "postgresql://db.example.test/microgrid"
    monkeypatch.setenv("DATABASE_URL", expected)

    assert database_url_from_env() == expected
