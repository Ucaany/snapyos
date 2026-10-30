# Build aplikasi booth SNAPY OS menjadi folder siap jalan (Windows x64).
#
#   .\scripts\build-booth.ps1             # Release (default)
#   .\scripts\build-booth.ps1 -Configuration Debug
#
# Hasil: booth\dist\booth\SnapyOS.Booth.Shell.exe + seluruh dependensi.
# Paket MSIX + code signing + auto-update ditambahkan pada Fase 5.
#
# Prasyarat: .NET 8 SDK, Node.js >= 22. Windows App SDK & WebView2 dipasang
# otomatis lewat NuGet saat restore.

param(
    [ValidateSet("Debug", "Release")][string]$Configuration = "Release",
    [switch]$SkipUi
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "[1/5] Cek toolchain" -ForegroundColor Cyan
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw "dotnet tidak ditemukan. Pasang .NET 8 SDK: https://dotnet.microsoft.com/download"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "node tidak ditemukan. Pasang Node.js >= 22: https://nodejs.org"
}
Write-Host ("  dotnet " + (dotnet --version))
Write-Host ("  node   " + (node --version))

Write-Host "[2/5] Regenerasi kontrak setelan" -ForegroundColor Cyan
& node (Join-Path $root "contracts\generate.mjs") | Out-Null

if (-not $SkipUi) {
    Write-Host "[3/5] Build UI React → Assets/ui" -ForegroundColor Cyan
    Push-Location (Join-Path $root "ui")
    if (-not (Test-Path "node_modules")) { npm ci }
    npm run build
    Pop-Location
} else {
    Write-Host "[3/5] UI dilewati (-SkipUi)" -ForegroundColor Yellow
}

Write-Host "[4/5] Restore & publish aplikasi Shell (self-contained)" -ForegroundColor Cyan
$outDir = Join-Path $root "dist\booth"
if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
& dotnet publish (Join-Path $root "src\SnapyOS.Booth.Shell\SnapyOS.Booth.Shell.csproj") `
    -c $Configuration -r win-x64 --self-contained true -p:SkipUiBuild=true `
    -o $outDir

Write-Host "[5/5] Verifikasi keluaran" -ForegroundColor Cyan
$exe = Join-Path $outDir "SnapyOS.Booth.Shell.exe"
if (-not (Test-Path $exe)) { throw "Build selesai tanpa EXE: $exe" }
$uiIndex = Join-Path $outDir "Assets\ui\index.html"
if (-not (Test-Path $uiIndex)) { throw "UI tidak ikut ter-publish: $uiIndex" }

Write-Host ""
Write-Host "Selesai. Folder siap jalan:" -ForegroundColor Green
Write-Host "  $outDir"
Write-Host "  $exe"
Write-Host ""
Write-Host "Jalankan (PowerShell):" -ForegroundColor Green
Write-Host '  $env:PHOTOBOOTH_BRIDGE_TOKEN = "<token 16+ karakter>"'
Write-Host '  $env:SNAPYOS_ALLOW_MOCK = "1"   # Fase 1: adapter mock sampai Fase 3'
Write-Host "  & '$exe'"
