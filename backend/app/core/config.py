"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
PRODUCTS_YAML = BASE_DIR / "products.yaml"


def database_url_from_env() -> str:
    """Return the configured database URL without embedding credentials."""
    return os.getenv(
        "DATABASE_URL", "postgresql://localhost:5432/microgrid_products"
    )


DATABASE_URL = database_url_from_env()

API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
API_PORT: int = int(os.getenv("API_PORT", "6001"))
DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

CORS_ORIGINS: list[str] = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:8081,http://localhost:5173,http://localhost:4173,http://localhost:3000",
).split(",")

GEOCODER_API_URL: str = os.getenv(
    "GEOCODER_API_URL", "http://localhost:4000/v1/search"
)
GEOCODER_REVERSE_API_URL: str = os.getenv(
    "GEOCODER_REVERSE_API_URL", "http://localhost:4000/v1/reverse"
)
GEOCODER_DEFAULT_REGION: str = os.getenv(
    "GEOCODER_DEFAULT_REGION", "us"
).lower()
GEOCODER_API_URL_CN: str = os.getenv("GEOCODER_API_URL_CN", GEOCODER_API_URL)
GEOCODER_REVERSE_API_URL_CN: str = os.getenv(
    "GEOCODER_REVERSE_API_URL_CN", GEOCODER_REVERSE_API_URL
)
GEOCODER_API_URL_US: str = os.getenv("GEOCODER_API_URL_US", GEOCODER_API_URL)
GEOCODER_REVERSE_API_URL_US: str = os.getenv(
    "GEOCODER_REVERSE_API_URL_US", GEOCODER_REVERSE_API_URL
)

SMTP_HOST: str = os.getenv("SMTP_HOST", "")
SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER: str = os.getenv("SMTP_USER", "")
SMTP_PASS: str = os.getenv("SMTP_PASS", "")
SMTP_FROM: str = os.getenv("SMTP_FROM", SMTP_USER)


def _csv_env(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip().lower() for item in raw.split(",") if item.strip()]


INTERNAL_REPORT_EMAIL_DOMAINS: list[str] = _csv_env(
    "INTERNAL_REPORT_EMAIL_DOMAINS",
    "voltageenergy.com",
)
INTERNAL_REPORT_EMAILS: list[str] = _csv_env("INTERNAL_REPORT_EMAILS", "")
