"""
POST /api/send-report
"""
from __future__ import annotations

import base64
import smtplib
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter

from app.core import config as cfg
from app.schemas.report import SendReportRequest, SendReportResponse
from app.services.reporting import build_solution_report, get_report_file_name

router = APIRouter(prefix="/api", tags=["report"])


@router.post("/send-report", response_model=SendReportResponse)
async def send_report(req: SendReportRequest):
    """
    Generate the solution Excel report and optionally email it to the contact.
    """
    try:
        file_name = get_report_file_name(req.contact.email)
        excel_bytes = build_solution_report(req)
        file_base64 = base64.b64encode(excel_bytes).decode()

        email_sent = False
        email_error = ""

        if cfg.SMTP_HOST and cfg.SMTP_USER and cfg.SMTP_PASS and req.contact.email:
            try:
                contact = req.contact
                system_config = req.systemConfig or {}
                pv_kw = system_config.get("pvCapacityKw", "-")
                included_lines = [
                    "  - Project basic information",
                    "  - System configuration and component details",
                    "  - Cost and parameter worksheets according to your template",
                ]

                subject = f"MicroGrid Microgrid Solution Report - {pv_kw} kW PV"
                body = (
                    f"Dear {contact.firstName} {contact.lastName},\n\n"
                    "Thank you for using MicroGrid Microgrid Advisor.\n\n"
                    "Please find attached your Microgrid Solution Configuration Report, including:\n"
                    + "\n".join(included_lines)
                    + "\n\nFor further information or to schedule an on-site assessment:\n"
                    "  Email: sales@example.com\n"
                    "  Web:   www.example.com\n\n"
                    "MicroGrid | Microgrid Solutions\n"
                )

                msg = MIMEMultipart()
                msg["From"] = cfg.SMTP_FROM
                msg["To"] = contact.email
                msg["Subject"] = subject
                msg.attach(MIMEText(body, "plain", "utf-8"))

                part = MIMEBase(
                    "application",
                    "vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
                part.set_payload(excel_bytes)
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", f'attachment; filename="{file_name}"')
                msg.attach(part)

                with smtplib.SMTP(cfg.SMTP_HOST, cfg.SMTP_PORT) as srv:
                    srv.starttls()
                    srv.login(cfg.SMTP_USER, cfg.SMTP_PASS)
                    srv.sendmail(cfg.SMTP_FROM, contact.email, msg.as_string())
                email_sent = True
            except Exception as exc:
                email_error = str(exc)

        return SendReportResponse(
            success=True,
            fileBase64=file_base64,
            fileName=file_name,
            emailSent=email_sent,
            emailError=email_error,
            smtpConfigured=bool(cfg.SMTP_HOST),
        )
    except Exception as exc:
        return SendReportResponse(success=False, error=str(exc))
