@echo off
REM ============================================================
REM LAVI CRM V2 - Genere le paquet Apps Script (dossier apps_script\)
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build_apps_script.ps1"
echo.
pause
