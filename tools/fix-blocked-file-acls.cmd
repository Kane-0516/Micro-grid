@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0fix-blocked-file-acls.ps1\"'"
if exist "%TEMP%\fix-microgrid-acl.log" type "%TEMP%\fix-microgrid-acl.log"
