
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$WshShell = New-Object -ComObject WScript.Shell
$ProjectDir = "C:\drug-price-compare"

function Create-ModeShortcut($VbsFile, $Name) {
    $ShortcutPath = Join-Path $DesktopPath ($Name + ".lnk")
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = "wscript.exe"
    $Shortcut.Arguments = """" + (Join-Path $ProjectDir $VbsFile) + """"
    $Shortcut.WorkingDirectory = $ProjectDir
    $Shortcut.WindowStyle = 7  # 最小化，避免 CMD 閃現
    $Shortcut.Save()
    Write-Host "Created: $Name"
}

Create-ModeShortcut "launch_chrome.vbs" "DrugCompare-ChromeMode"
Create-ModeShortcut "launch_python.vbs" "DrugCompare-PythonMode"

Write-Host "Success: Silent shortcuts created (no CMD window)."
