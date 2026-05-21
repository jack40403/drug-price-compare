@echo off
set "ROOT=%~dp0.."
cd /d "%ROOT%"
echo ==========================================
echo    正在啟動：藥品比價小精靈 - V2
echo ==========================================
npm run dev
pause
