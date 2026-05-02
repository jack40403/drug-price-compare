
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$WshShell = New-Object -ComObject WScript.Shell
$ProjectDir = "C:\drug-price-compare"

function Create-ModeShortcut($BatFile, $Name) {
    $ShortcutPath = Join-Path $DesktopPath ($Name + ".lnk")
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = Join-Path $ProjectDir $BatFile
    $Shortcut.WorkingDirectory = $ProjectDir
    $Shortcut.Save()
    Write-Host "Created: $Name"
}

Create-ModeShortcut "run_chrome.bat" "DrugCompare-ChromeMode"
Create-ModeShortcut "run_python.bat" "DrugCompare-PythonMode"
Create-ModeShortcut "open_in_chrome_browser.bat" "DrugCompare-BrowserMode"

Write-Host "Success: Multi-mode shortcuts created."
