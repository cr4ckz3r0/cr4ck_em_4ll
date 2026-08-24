@echo off
setlocal EnableExtensions
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Make-Ready.ps1"
if errorlevel 1 (
  echo.
  echo Make-Ready fehlgeschlagen.
  pause
)
endlocal
