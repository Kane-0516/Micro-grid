from __future__ import annotations

from app.core import config as cfg


def is_internal_email(email: str) -> bool:
    normalized = (email or "").strip().lower()
    if not normalized or "@" not in normalized:
        return False
    if normalized in cfg.INTERNAL_REPORT_EMAILS:
        return True
    domain = normalized.split("@", 1)[1]
    return domain in cfg.INTERNAL_REPORT_EMAIL_DOMAINS
