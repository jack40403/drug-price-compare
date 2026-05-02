# setup_schedule.ps1
# 在 Windows 工作排程器建立「每 2 小時執行藥品比價」排程
# 請用「以系統管理員身分執行 PowerShell」來跑此腳本

$TaskName   = "DrugPriceQuery"
$ScriptPath = "C:\drug-price-compare\drug_query.py"
$PythonExe  = (Get-Command python -ErrorAction SilentlyContinue).Source

if (-not $PythonExe) {
    $PythonExe = "C:\Python312\python.exe"  # 若找不到，請改成你的 Python 路徑
}

Write-Host "Python 路徑：$PythonExe"
Write-Host "腳本路徑：$ScriptPath"

# 移除舊排程（若存在）
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# 建立動作：執行 python drug_query.py（排程模式，不帶參數）
$Action = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "`"$ScriptPath`"" `
    -WorkingDirectory "C:\drug-price-compare"

# 觸發條件：每天從 08:00 開始，每 2 小時重複，持續 24 小時（即全天候）
$Trigger = New-ScheduledTaskTrigger `
    -Daily `
    -At "08:00AM" `
    -RepetitionInterval (New-TimeSpan -Hours 2) `
    -RepetitionDuration (New-TimeSpan -Hours 24)

# 設定：即使未登入也執行、喚醒電腦執行
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

# 使用目前登入的使用者帳號執行
$Principal = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName  $TaskName `
    -Action    $Action `
    -Trigger   $Trigger `
    -Settings  $Settings `
    -Principal $Principal `
    -Force

Write-Host ""
Write-Host "✅ 排程建立成功！" -ForegroundColor Green
Write-Host "   任務名稱：$TaskName"
Write-Host "   執行頻率：每 2 小時（從 08:00 開始）"
Write-Host "   查詢清單：C:\drug-price-compare\drug_list.txt"
Write-Host ""
Write-Host "手動測試執行方式："
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
