@echo off
chcp 65001 >nul
echo ==========================================
echo    藥師比價專家 - 新電腦一鍵安裝
echo ==========================================
echo.

:: ── 步驟 1：檢查 Node.js ──────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 未安裝 Node.js！
    echo.
    echo 請先至以下網址下載並安裝 Node.js (建議 LTS 版)：
    echo https://nodejs.org/zh-tw/
    echo.
    echo 安裝完成後請重新執行此腳本。
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] 偵測到 Node.js %NODE_VER%

:: ── 步驟 2：安裝 npm 相依套件 ─────────────────────────────────
echo.
echo [1/3] 正在安裝套件 (npm install)...
set "CWD=%~dp0"
cd /d "%CWD%"
call npm install
if %errorlevel% neq 0 (
    echo [錯誤] npm install 失敗，請確認網路連線後重試。
    pause
    exit /b 1
)
echo [OK] 套件安裝完成

:: ── 步驟 3：安裝 Playwright Chromium 瀏覽器 ──────────────────
echo.
echo [2/3] 正在下載 Playwright Chromium 瀏覽器核心 (約 200-300MB)...
call npx playwright install chromium
if %errorlevel% neq 0 (
    echo [錯誤] Playwright 瀏覽器安裝失敗，請確認網路連線後重試。
    pause
    exit /b 1
)
echo [OK] Playwright Chromium 安裝完成

:: ── 步驟 4：建立桌面捷徑 ──────────────────────────────────────
echo.
echo [3/3] 正在建立桌面捷徑...
powershell -ExecutionPolicy Bypass -File "%CWD%create_shortcut.ps1"
if %errorlevel% neq 0 (
    echo [警告] 桌面捷徑建立失敗，可手動執行 run_chrome.bat 啟動程式。
) else (
    echo [OK] 桌面捷徑建立完成
)

:: ── 完成 ──────────────────────────────────────────────────────
echo.
echo ==========================================
echo    安裝完成！
echo    請雙擊桌面上的「藥師比價專家 (Chrome模式)」啟動程式
echo ==========================================
echo.
pause
