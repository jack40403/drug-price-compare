param([switch]$Quiet, [switch]$Deep)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$AppDir = Join-Path $Root 'App'
$ResourcesDir = Join-Path $AppDir 'resources'
$DataDir = Join-Path $Root 'Data'
$errors = [System.Collections.Generic.List[string]]::new()

function Pass([string]$message) {
    if (-not $Quiet) { Write-Host "[OK] $message" -ForegroundColor Green }
}

$mainExe = Get-ChildItem -LiteralPath $AppDir -File -Filter '*.exe' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne 'elevate.exe' } | Select-Object -First 1
if (-not $mainExe) { $errors.Add('Missing main application EXE in App.') } else { Pass 'Main application' }

if (-not (Test-Path -LiteralPath (Join-Path $ResourcesDir 'app.asar'))) {
    $errors.Add('Missing App\resources\app.asar.')
} else { Pass 'Application package' }

$manifestPath = Join-Path $Root 'portable-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
    $errors.Add('Missing portable-manifest.json.')
} else { Pass 'Portable file manifest' }

$appearance = Get-ChildItem -LiteralPath $ResourcesDir -Recurse -File -Filter '42_5.json' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $appearance) { $errors.Add('Missing drug appearance database (42_5.json).') } else { Pass 'Drug appearance database' }

$nhiFiles = Get-ChildItem -LiteralPath $ResourcesDir -Recurse -File -Filter 'all1_*.TXT' -ErrorAction SilentlyContinue
if (-not $nhiFiles) { $errors.Add('Missing NHI offline database files (all1_*.TXT).') } else { Pass "NHI database ($($nhiFiles.Count) files)" }

$chromium = Get-ChildItem -LiteralPath (Join-Path $ResourcesDir 'browsers') -Recurse -File -Filter 'chrome.exe' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match 'chromium-[^\\]+\\chrome-win64\\chrome\.exe$' } | Select-Object -First 1
if (-not $chromium) { $errors.Add('Missing Playwright Chromium in App\resources\browsers.') } else { Pass 'Playwright Chromium' }

try {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
    foreach ($dir in @('config', 'logs')) { New-Item -ItemType Directory -Path (Join-Path $DataDir $dir) -Force | Out-Null }
    $probe = Join-Path $DataDir '.write-test'
    [IO.File]::WriteAllText($probe, 'ok')
    Remove-Item -LiteralPath $probe -Force
    Pass 'Writable Data directory'
} catch { $errors.Add("Data directory is not writable: $($_.Exception.Message)") }

$configJson = Join-Path $DataDir 'config\drug-price-compare.json'
$localState = Join-Path $DataDir 'config\Local State'
if ((Test-Path -LiteralPath $configJson -PathType Leaf) -and -not (Test-Path -LiteralPath $localState -PathType Leaf)) {
    if (-not $Quiet) {
        Write-Host '[WARN] Credentials config exists, but Local State is missing. Previously encrypted passwords may need to be re-entered.' -ForegroundColor Yellow
    }
}

$listener = $null
try {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 3010)
    $listener.Start()
    Pass 'Local port 3010 is available'
} catch {
    if (-not $Quiet) {
        Write-Host '[WARN] Local port 3010 is in use. Desktop mode will work, but the optional HTTP bridge will be disabled.' -ForegroundColor Yellow
    }
}
finally { if ($listener) { $listener.Stop() } }

if ($Deep -and (Test-Path -LiteralPath $manifestPath)) {
    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        foreach ($entry in $manifest.files) {
            $file = Join-Path $Root $entry.path
            if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
                $errors.Add("Manifest file is missing: $($entry.path)")
                continue
            }
            $item = Get-Item -LiteralPath $file
            if ($item.Length -ne [long]$entry.bytes) {
                $errors.Add("File size mismatch: $($entry.path)")
                continue
            }
            $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash
            if ($actualHash -ne $entry.sha256) { $errors.Add("SHA256 mismatch: $($entry.path)") }
        }
        if ($errors.Count -eq 0) { Pass "Deep manifest verification ($($manifest.files.Count) files)" }
    } catch { $errors.Add("Manifest verification failed: $($_.Exception.Message)") }
}

if ($errors.Count -gt 0) {
    foreach ($message in $errors) { Write-Host "[ERROR] $message" -ForegroundColor Red }
    exit 1
}
if (-not $Quiet) { Write-Host 'Portable integrity check passed.' -ForegroundColor Cyan }
exit 0
