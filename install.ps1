# ============================================================
#  藥品比價小精靈 V2 - 一鍵環境安裝腳本
#  使用方式：雙擊 install.bat，或右鍵 install.ps1 → 以 PowerShell 執行
# ============================================================

$Host.UI.RawUI.WindowTitle = "藥品比價小精靈 - 一鍵安裝"
$ProjectDir = $PSScriptRoot
$NODE_VERSION = "22.11.0"
$NODE_URL     = "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-x64.msi"

function Write-Banner {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor DarkCyan
    Write-Host "   藥品比價小精靈 V2  -  一鍵安裝程式" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor DarkCyan
    Write-Host ""
}

function Write-Step([int]$n, [int]$total, [string]$msg) {
    Write-Host ""
    Write-Host "  [$n/$total] $msg" -ForegroundColor Yellow
}

function Write-OK([string]$msg)   { Write-Host "        OK  $msg" -ForegroundColor Green }
function Write-WARN([string]$msg) { Write-Host "      WARN  $msg" -ForegroundColor DarkYellow }
function Write-ERR([string]$msg)  { Write-Host "     ERROR  $msg" -ForegroundColor Red }

# ── 更新環境變數（安裝後立即生效，不需重開機）──────────────────
function Refresh-Path {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path","Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("Path","User")
    $env:Path    = "$machinePath;$userPath"
}

# ────────────────────────────────────────────────────────────
Write-Banner

Set-Location $ProjectDir

# ════════════════════════════════════════════════
#  STEP 1 : Node.js
# ════════════════════════════════════════════════
Write-Step 1 4 "檢查 Node.js 環境..."

$needInstallNode = $false
try {
    $ver = (node -v 2>$null).Trim()
    if ($ver -match "v(\d+)\.") {
        $major = [int]$Matches[1]
        if ($major -ge 18) {
            Write-OK "Node.js $ver 已安裝，版本符合需求"
        } else {
            Write-WARN "Node.js $ver 版本過舊（需 v18+），將自動更新"
            $needInstallNode = $true
        }
    } else {
        $needInstallNode = $true
    }
} catch {
    $needInstallNode = $true
}

if ($needInstallNode) {
    Write-Host "        正在下載 Node.js v$NODE_VERSION..." -ForegroundColor Cyan
    $installer = "$env:TEMP\nodejs_$NODE_VERSION.msi"
    try {
        Invoke-WebRequest -Uri $NODE_URL -OutFile $installer -UseBasicParsing
        Write-Host "        正在安裝（靜默模式，請稍候）..." -ForegroundColor Cyan
        $proc = Start-Process msiexec -ArgumentList "/i `"$installer`" /quiet /norestart ADDLOCAL=ALL" -Wait -PassThru
        if ($proc.ExitCode -ne 0) { throw "msiexec 回傳 $($proc.ExitCode)" }
        Refresh-Path
        Start-Sleep -Seconds 3
        $ver = (node -v 2>$null).Trim()
        if ($ver) { Write-OK "Node.js $ver 安裝完成" }
        else {
            Write-ERR "安裝後仍偵測不到 node，請重新開機後再執行此腳本"
            Read-Host "  按 Enter 結束"
            exit 1
        }
    } catch {
        Write-ERR "下載/安裝 Node.js 失敗：$($_.Exception.Message)"
        Write-Host ""
        Write-Host "  請手動安裝 Node.js：https://nodejs.org/" -ForegroundColor Yellow
        Read-Host "  按 Enter 結束"
        exit 1
    }
}

# ════════════════════════════════════════════════
#  STEP 2 : npm install
# ════════════════════════════════════════════════
Write-Step 2 4 "安裝 npm 套件（首次約需 1～3 分鐘）..."

$npmOut = & npm install 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-ERR "npm install 失敗，錯誤訊息如下："
    Write-Host $npmOut -ForegroundColor DarkRed
    Read-Host "  按 Enter 結束"
    exit 1
}
Write-OK "npm 套件安裝完成"

# ════════════════════════════════════════════════
#  STEP 3 : Playwright Chromium
# ════════════════════════════════════════════════
Write-Step 3 4 "安裝 Playwright Chromium 瀏覽器..."

$pwOut = & npx playwright install chromium 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-WARN "Chromium 安裝失敗（以下為詳情）"
    Write-Host ($pwOut | Out-String) -ForegroundColor DarkYellow
    Write-WARN "自動化比價功能可能受影響；其他功能（健保查詢等）仍可正常使用"
} else {
    Write-OK "Chromium 安裝完成"
}

# ════════════════════════════════════════════════
#  STEP 4 : 桌面捷徑
# ════════════════════════════════════════════════
Write-Step 4 4 "建立桌面捷徑..."

$WshShell    = New-Object -ComObject WScript.Shell
$Desktop     = [Environment]::GetFolderPath('Desktop')
$VbsLauncher = Join-Path $ProjectDir "scripts\run_app_silent.vbs"

# 主捷徑（靜默 VBS 啟動器）
if (Test-Path $VbsLauncher) {
    $lnk = $WshShell.CreateShortcut((Join-Path $Desktop "藥品比價小精靈.lnk"))
    $lnk.TargetPath      = "wscript.exe"
    $lnk.Arguments       = "`"$VbsLauncher`""
    $lnk.WorkingDirectory = $ProjectDir
    $lnk.WindowStyle     = 7
    $lnk.Save()
    Write-OK "桌面捷徑「藥品比價小精靈」已建立"
}

# 其他捷徑（如已有 final_execution_shortcut.ps1）
$finalScript = Join-Path $ProjectDir "scripts\final_execution_shortcut.ps1"
if (Test-Path $finalScript) {
    & powershell -ExecutionPolicy Bypass -File $finalScript 2>$null
}

# ════════════════════════════════════════════════
#  完成
# ════════════════════════════════════════════════
Write-Host ""
Write-Host "  ==========================================" -ForegroundColor DarkCyan
Write-Host "   安裝完成！" -ForegroundColor Green
Write-Host "  ==========================================" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  啟動方式：" -ForegroundColor White
Write-Host "    雙擊桌面上的「藥品比價小精靈」捷徑" -ForegroundColor Gray
Write-Host "    或直接執行：$VbsLauncher" -ForegroundColor Gray
Write-Host ""

$ans = Read-Host "  立即啟動程式？(Y/N)"
if ($ans -match "^[Yy]") {
    Write-Host "  正在啟動..." -ForegroundColor Cyan
    Start-Process "wscript.exe" -ArgumentList "`"$VbsLauncher`""
}

Write-Host ""
Read-Host "  按 Enter 關閉視窗"
