@echo off
REM ============================================================
REM LAVI CRM V2 - Publie les modifications sur GitHub
REM (GitHub Pages met le site a jour automatiquement en ~1 min)
REM ============================================================
cd /d "%~dp0"

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] Aucun depot GitHub configure.
  echo Executez d'abord :  git remote add origin https://github.com/VOTRE_COMPTE/lavi-crm.git
  pause
  exit /b 1
)

git add -A
git commit -m "Mise a jour LAVI CRM %date% %time%"
git push -u origin main
if errorlevel 1 (
  echo.
  echo [ERREUR] Echec du push. Verifiez votre connexion ou vos identifiants GitHub.
) else (
  echo.
  echo [OK] Publie ! Le site sera a jour dans environ 1 minute.
)
echo.
pause
