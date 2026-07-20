param([string]$OutputName = 'DrugPriceComparePortable')

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ReleaseDir = Join-Path $ProjectRoot 'release'
$UnpackedDir = Join-Path $ReleaseDir 'win-unpacked'
$PortableDir = Join-Path $ReleaseDir $OutputName

Set-Location $ProjectRoot
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { throw 'npm.cmd was not found. Node.js is required only on the build computer.' }

& $npm run build:portable-app
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path -LiteralPath $UnpackedDir)) { throw 'electron-builder did not create win-unpacked.' }

if (Test-Path -LiteralPath $PortableDir) { Remove-Item -LiteralPath $PortableDir -Recurse -Force }
New-Item -ItemType Directory -Path $PortableDir | Out-Null
Copy-Item -LiteralPath $UnpackedDir -Destination (Join-Path $PortableDir 'App') -Recurse
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'portable\start.bat') -Destination $PortableDir
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'portable\verify.bat') -Destination $PortableDir
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'portable\portable-check.ps1') -Destination $PortableDir
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'portable\PORTABLE-README.txt') -Destination $PortableDir
New-Item -ItemType Directory -Path (Join-Path $PortableDir 'Data\config') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $PortableDir 'Data\logs') -Force | Out-Null

$LegacyConfigDir = Join-Path $env:APPDATA 'drug-price-compare'
foreach ($legacyFile in @('drug-price-compare.json', 'Local State')) {
    $source = Join-Path $LegacyConfigDir $legacyFile
    if (Test-Path -LiteralPath $source -PathType Leaf) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $PortableDir "Data\config\$legacyFile") -Force
        Write-Host "[OK] Imported existing config: $legacyFile" -ForegroundColor Green
    }
}

$manifestFiles = Get-ChildItem -LiteralPath $PortableDir -Recurse -File |
    Where-Object { $_.FullName -notlike (Join-Path $PortableDir 'Data\*') -and $_.Name -ne 'portable-manifest.json' }
$manifestEntries = foreach ($file in $manifestFiles) {
    [pscustomobject]@{
        path = $file.FullName.Substring($PortableDir.Length + 1)
        bytes = $file.Length
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash
    }
}
$manifest = [pscustomobject]@{
    format = 1
    generatedUtc = [DateTime]::UtcNow.ToString('o')
    files = @($manifestEntries)
}
$manifest | ConvertTo-Json -Depth 4 | Out-File -LiteralPath (Join-Path $PortableDir 'portable-manifest.json') -Encoding utf8

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PortableDir 'portable-check.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Portable integrity check failed.' }
Write-Host "Portable build completed: $PortableDir" -ForegroundColor Green
