
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$TempShortcut = Join-Path $DesktopPath "drug_price_shortcut.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($TempShortcut)

$ProjectDir = "C:\drug-price-compare"
$ExePath = "C:\drug-price-compare\dist\win-unpacked\drug-price-compare.exe"
$BatPath = "C:\drug-price-compare\run_app.bat"

if (Test-Path $ExePath) {
    $Shortcut.TargetPath = $ExePath
    $Shortcut.WorkingDirectory = "C:\drug-price-compare\dist\win-unpacked"
} else {
    $Shortcut.TargetPath = $BatPath
    $Shortcut.WorkingDirectory = $ProjectDir
}

$Shortcut.Save()

# Rename using a decoded string to avoid source file encoding issues
$bytes = [System.Convert]::FromBase64String("6Je95ZOB5q+U5YO55bCP57K+6Z2I")
$name = [System.Text.Encoding]::UTF8.GetString($bytes)
$FinalName = Join-Path $DesktopPath ($name + ".lnk")

if (Test-Path $FinalName) { Remove-Item $FinalName }
Rename-Item $TempShortcut $FinalName

Write-Host "Success: Shortcut created and renamed."
