$ProjectDir  = Split-Path $PSScriptRoot -Parent
$ScriptsDir  = $PSScriptRoot
$WshShell    = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath('Desktop')

function Create-ModeShortcut($VbsFile, $Name) {
    $ShortcutPath = Join-Path $DesktopPath ($Name + ".lnk")
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath      = "wscript.exe"
    $Shortcut.Arguments       = """" + (Join-Path $ScriptsDir $VbsFile) + """"
    $Shortcut.WorkingDirectory = $ProjectDir
    $Shortcut.WindowStyle     = 7
    $Shortcut.Save()
    Write-Host "Created: $Name"
}

Create-ModeShortcut "run_chrome_silent.vbs"             "DrugCompare-ChromeMode"
Create-ModeShortcut "run_python_silent.vbs"             "DrugCompare-PythonMode"
Create-ModeShortcut "open_in_chrome_browser_silent.vbs" "DrugCompare-BrowserMode"

Write-Host "Success: Multi-mode shortcuts created (no CMD window)."
