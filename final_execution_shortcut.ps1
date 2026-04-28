
$WshShell = New-Object -ComObject WScript.Shell
$nameChars = @(0x85e5, 0x54c1, 0x6bd4, 0x50f9, 0x5c0f, 0x7cbe, 0x9748)
$name = ""
foreach($c in $nameChars) { $name += [char]$c }

$LocalPaths = @(
    "C:\Users\1002vpn\Desktop",
    "C:\Users\1002vpn\OneDrive\Desktop",
    "C:\Users\Public\Desktop"
)

$RemotePaths = @(
    "O:\Users\Public\Desktop"
)

$LocalTarget = "C:\drug-price-compare\dist\win-unpacked\drug-price-compare.exe"
$RemoteTarget = "\\DESKTOP-JQVGUGM\C\drug-price-compare\dist\win-unpacked\drug-price-compare.exe"

# Create in local paths
foreach ($p in $LocalPaths) {
    if (Test-Path $p) {
        $FinalPath = Join-Path $p ($name + ".lnk")
        $Shortcut = $WshShell.CreateShortcut($FinalPath)
        $Shortcut.TargetPath = $LocalTarget
        $Shortcut.WorkingDirectory = "C:\drug-price-compare\dist\win-unpacked"
        $Shortcut.Save()
        
        $EngPath = Join-Path $p "DrugPriceCompare.lnk"
        $ShortcutEn = $WshShell.CreateShortcut($EngPath)
        $ShortcutEn.TargetPath = $LocalTarget
        $ShortcutEn.WorkingDirectory = "C:\drug-price-compare\dist\win-unpacked"
        $ShortcutEn.Save()
        
        Write-Host "Local success: $p"
    }
}

# Create in remote paths
foreach ($p in $RemotePaths) {
    if (Test-Path $p) {
        $FinalPath = Join-Path $p ($name + ".lnk")
        $Shortcut = $WshShell.CreateShortcut($FinalPath)
        $Shortcut.TargetPath = $RemoteTarget
        $Shortcut.WorkingDirectory = "\\DESKTOP-JQVGUGM\C\drug-price-compare\dist\win-unpacked"
        $Shortcut.Save()
        
        $EngPath = Join-Path $p "DrugPriceCompare.lnk"
        $ShortcutEn = $WshShell.CreateShortcut($EngPath)
        $ShortcutEn.TargetPath = $RemoteTarget
        $ShortcutEn.WorkingDirectory = "\\DESKTOP-JQVGUGM\C\drug-price-compare\dist\win-unpacked"
        $ShortcutEn.Save()
        
        Write-Host "Remote success: $p"
    }
}
