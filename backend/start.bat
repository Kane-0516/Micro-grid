@echo off
chcp 65001 >nul
echo Starting Microgrid Advisor Backend...
cd /d "%~dp0"
python app/main.py
pause