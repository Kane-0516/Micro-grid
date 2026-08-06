"""
schemas/report.py — /api/send-report 请求 & 响应模型
"""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class ContactInfo(BaseModel):
    firstName: str = ""
    lastName:  str = ""
    company:   str = ""
    email:     str
    phone:     str = ""
    state:     str = ""
    city:      str = ""


class SendReportRequest(BaseModel):
    contact:         ContactInfo
    systemConfig:    Optional[dict] = None
    capex:           Optional[dict] = None
    simulation:      Optional[dict] = None
    summary:         Optional[dict] = None
    comparisonTable: Optional[list] = None


class SendReportResponse(BaseModel):
    success:       bool
    fileBase64:    Optional[str]  = None
    fileName:      Optional[str]  = None
    emailSent:     bool           = False
    emailError:    str            = ""
    smtpConfigured: bool          = False
    error:         Optional[str]  = None
