@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0portable-check.ps1" -Deep
echo.
pause
