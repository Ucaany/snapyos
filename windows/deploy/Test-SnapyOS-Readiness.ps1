[CmdletBinding()]
param(
    [switch]$SelfContained,
    [string]$Version = '0.1.0'
)

# Gate satu pintu untuk kesiapan uji coba Windows.
# Jalankan elevated PowerShell di folder windows\deploy.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deployRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $deployRoot)
$solution = Join-Path $repoRoot 'windows\SnapyOS.sln'
$manifestPath = Join-Path $deployRoot 'snapyos-install-manifest.json'
$payloadRoot = Join-Path $deployRoot 'payload'

function Step([string]$Name) { Write-Host ""; Write-Host "== $Name" -ForegroundColor Cyan }
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw "FAIL: $Message" }; Write-Host "PASS: $Message" -ForegroundColor Green }

if ($env:OS -ne 'Windows_NT') { throw 'Gate ini harus dijalankan pada Windows 10/11 x64.' }
if (-not [Environment]::Is64BitOperatingSystem) { throw 'Gate ini membutuhkan Windows x64.' }

Step '1. Build dan test'
& (Join-Path $deployRoot 'Package-SnapyOS-Kiosk.ps1') -Version $Version -SelfContained:$SelfContained

Step '2. Manifest payload'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
Assert ($manifest.files.Count -gt 0) "manifest memuat $($manifest.files.Count) file"
Assert ([bool]($manifest.files | Where-Object { $_.path -eq 'SnapyOS.Wpf.exe' })) 'payload berisi SnapyOS.Wpf.exe'
Assert ([bool]($manifest.files | Where-Object { $_.path -eq 'SnapyOS.Launcher.exe' })) 'payload berisi SnapyOS.Launcher.exe'
Assert ([bool]($manifest.files | Where-Object { $_.path -eq 'snapyos-kiosk.json' })) 'payload berisi snapyos-kiosk.json'
Assert ([bool]($manifest.files | Where-Object { $_.path -like '*e_sqlite3.dll' })) 'payload berisi native SQLite'
Assert (-not ($manifest.files | Where-Object { $_.path -match '(?i)\.pdb$' })) 'payload tanpa symbol PDB'
Assert ($manifest.checksumAlgorithm -eq 'SHA256') 'manifest memakai SHA256'
Assert ($manifest.architecture -eq 'x64') 'manifest menargetkan x64'
Assert ($manifest.service.enabled -eq $false) 'service Windows tetap nonaktif (tidak ada auto-update daemon)'

Step '3. Verifikasi checksum payload'
$bad = 0
foreach ($file in $manifest.files) {
    $path = Join-Path $payloadRoot ($file.path -replace '/', '\')
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Host "MISSING $($file.path)" -ForegroundColor Red; $bad++; continue }
    $item = Get-Item -LiteralPath $path
    if ($item.Length -ne $file.size) { Write-Host "SIZE $($file.path)" -ForegroundColor Red; $bad++; continue }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { Write-Host "HASH $($file.path)" -ForegroundColor Red; $bad++ }
}
$listed = @($manifest.files | ForEach-Object { $_.path })
$actual = @(Get-ChildItem -LiteralPath $payloadRoot -File -Recurse | ForEach-Object { $_.FullName.Substring($payloadRoot.Length + 1).Replace('\', '/') })
$extra = @($actual | Where-Object { $_ -notin $listed })
Assert ($bad -eq 0) 'semua checksum dan ukuran payload cocok'
Assert ($extra.Count -eq 0) 'tidak ada file payload tak terdaftar'

Step '4. Kontrak keamanan manifest'
$manifestText = Get-Content -Raw -LiteralPath $manifestPath
Assert ($manifestText -notmatch '(?i)device_token|api_key|secret|password|pin') 'manifest tidak memuat token, secret, atau PIN'

Step '5. Rencana installer non-mutasi'
& (Join-Path $deployRoot 'Install-SnapyOS-Kiosk.ps1') -Action Detect -ManifestPath $manifestPath | Out-Host
& (Join-Path $deployRoot 'Install-SnapyOS-Kiosk.ps1') -Action Install -ManifestPath $manifestPath -WhatIf | Out-Host

Step '6. Rehearsal wajib manual pada mesin disposable'
Write-Host 'Langkah berikut mengubah sistem dan harus dijalankan manual dengan operator:' -ForegroundColor Yellow
Write-Host '  1) Install bersih pada Windows 10'
Write-Host '  2) Install bersih pada Windows 11'
Write-Host '  3) Upgrade dari versi sebelumnya'
Write-Host '  4) Checksum gagal harus abort sebelum mutasi'
Write-Host '  5) Migrasi SQLite + buka kiosk'
Write-Host '  6) RollbackPrepare, uninstall normal, lalu uninstall -RemoveMedia -ConfirmRemoveMedia'
Write-Host ''
Write-Host 'Gate otomatis: PASS. Rehearsal mesin nyata belum dijalankan oleh skrip ini.' -ForegroundColor Cyan
