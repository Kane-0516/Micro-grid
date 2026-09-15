"""按收件人邮箱判断报告受众（内部 vs 客户）."""

from __future__ import annotations

from app.core import config as cfg


def is_internal_email(email: str) -> bool:
    """Return whether the email belongs to an internal (non-customer) user.

    Args:
        email: The recipient email address to check.

    Returns:
        True if the address or its domain is on the internal allowlist.
    """
    normalized = (email or "").strip().lower()
    if not normalized or "@" not in normalized:
        return False
    if normalized in cfg.INTERNAL_REPORT_EMAILS:
        return True
    domain = normalized.split("@", 1)[1]
    return domain in cfg.INTERNAL_REPORT_EMAIL_DOMAINS
