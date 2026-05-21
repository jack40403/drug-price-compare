$ProjectDir = Split-Path $PSScriptRoot -Parent
$WshShell   = New-Object -ComObject WScript.Shell

$nameChars = @(0x85e5, 0x54c1, 0x6bd4, 0x50f9, 0x5c0f, 0x7cbe, 0x9748)
$name = ""
foreach ($c in $nameChars) { $name += [char]$c }

$LocalPaths = @(
    "C:\Users\1002vpn\Desktop",
    "C:\Users\1002vpn\OneDrive\Desktop",
    "C:\Users\Public\Desktop",
    [Environment]::GetFolderPath('Desktop')
)

$RemotePaths = @("O:\Users\Public\Desktop")

$LocalTarget  = Join-Path $ProjectDir "dist\win-unpacked\drug-price-compare.exe"
$RemoteTarget = "\\DESKTOP-JQVGUGM\C\drug-price-compare\dist\win-unpacked\drug-price-compare.exe"
$WorkDir      = Join-Path $ProjectDir "dist\win-unpacked"

foreach ($p in $LocalPaths) {
    if (Test-Path $p) {
        foreach ($lnkName in @($name, "DrugPriceCompare")) {
            $lnk = $WshShell.CreateShortcut((Join-Path $p ($lnkName + ".lnk")))
            $lnk.TargetPath       = $LocalTarget
            $lnk.WorkingDirectory = $WorkDir
            $lnk.Save()
        }
        Write-Host "Local success: $p"
    }
}

foreach ($p in $RemotePaths) {
    if (Test-Path $p) {
        foreach ($lnkName in @($name, "DrugPriceCompare")) {
            $lnk = $WshShell.CreateShortcut((Join-Path $p ($lnkName + ".lnk")))
            $lnk.TargetPath       = $RemoteTarget
            $lnk.WorkingDirectory = "\\DESKTOP-JQVGUGM\C\drug-price-compare\dist\win-unpacked"
            $lnk.Save()
        }
        Write-Host "Remote success: $p"
    }
}
