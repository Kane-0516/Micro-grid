from __future__ import annotations

from app.schemas.report import SendReportRequest

__all__ = ["build_solution_report", "get_report_file_name"]


def build_solution_report(req: SendReportRequest) -> bytes:
    from .generator import build_solution_report as _build_solution_report

    return _build_solution_report(req)


def get_report_file_name(email: str) -> str:
    from .generator import get_report_file_name as _get_report_file_name

    return _get_report_file_name(email)
