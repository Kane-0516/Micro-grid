@echo off
chcp 65001 >nul
echo Starting Microgrid Advisor Frontend (dev)...
cd /d "%~dp0"
npm run dev
pause