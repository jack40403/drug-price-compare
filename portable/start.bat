@echo off
setlocal
set "PORTABLE_ROOT=%~dp0"
set "DRUG_PRICE_PORTABLE_ROOT=%PORTABLE_ROOT%"
set "DRUG_PRICE_PORTABLE_DATA=%PORTABLE_ROOT%Data"
set "PLAYWRIGHT_BROWSERS_PATH=%PORTABLE_ROOT%App\resources\browsers"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PORTABLE_ROOT%portable-check.ps1" -Quiet
if errorlevel 1 (
  echo.
  echo Portable check failed. See the messages above.
  pause
  exit /b 1
)

for %%F in ("%PORTABLE_ROOT%App\*.exe") do (
  if /I not "%%~nxF"=="elevate.exe" set "APP_EXE=%%~fF"
)
if not defined APP_EXE (
  echo Main application EXE was not found.
  pause
  exit /b 1
)
start "" /D "%PORTABLE_ROOT%App" "%APP_EXE%"
exit /b 0
