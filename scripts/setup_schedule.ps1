# setup_schedule.ps1
# 在 Windows 工作排程器建立「每 2 小時執行藥品比價」排程
# 請用「以系統管理員身分執行 PowerShell」來跑此腳本

$ProjectDir = Split-Path $PSScriptRoot -Parent
$TaskName   = "DrugPriceQuery"
$ScriptPath = Join-Path $ProjectDir "python\drug_query.py"
$PythonExe  = (Get-Command python -ErrorAction SilentlyContinue).Source

if (-not $PythonExe) {
    $PythonExe = "C:\Python312\python.exe"
}

Write-Host "Python 路徑：$PythonExe"
Write-Host "腳本路徑：$ScriptPath"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "`"$ScriptPath`"" `
    -WorkingDirectory $ProjectDir

$Trigger = New-ScheduledTaskTrigger `
    -Daily `
    -At "08:00AM" `
    -RepetitionInterval (New-TimeSpan -Hours 2) `
    -RepetitionDuration (New-TimeSpan -Hours 24)

$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

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

Write-Host "排程建立成功！任務名稱：$TaskName（每 2 小時，從 08:00 起）"
