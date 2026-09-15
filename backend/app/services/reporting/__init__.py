"""方案报告生成：构建 Excel 报告并推导报告文件名."""

from __future__ import annotations

from app.schemas.report import SendReportRequest

__all__ = ["build_solution_report", "get_report_file_name"]


def build_solution_report(req: SendReportRequest) -> bytes:
    """Build the solution Excel report as bytes.

    Args:
        req: The report request, including contact and solution data.

    Returns:
        The generated .xlsx file content.
    """
    from .generator import build_solution_report as _build_solution_report

    return _build_solution_report(req)


def get_report_file_name(email: str) -> str:
    """Derive the report file name from the recipient's email.

    Args:
        email: Recipient email address.

    Returns:
        A file name that reflects the audience (internal/customer).
    """
    from .generator import get_report_file_name as _get_report_file_name

    return _get_report_file_name(email)
