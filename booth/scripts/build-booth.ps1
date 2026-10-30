# Build aplikasi booth SNAPY OS menjadi folder siap jalan (Windows x64).
#
#   .\scripts\build-booth.ps1                        # Release (default)
#   .\scripts\build-booth.ps1 -Configuration Debug
#   .\scripts\build-booth.ps1 -SkipContracts         # kontrak sudah segar
#   .\scripts\build-booth.ps1 -SkipUi                # UI sudah dibangun terpisah
#
# Hasil: booth\dist\booth\SnapyOS.Booth.Shell.exe + seluruh dependensi + UI lokal.
# Paket MSIX + code signing + auto-update ditambahkan pada Fase 5.
#
# Prasyarat: .NET 8 SDK, Node.js >= 22. Windows App SDK & WebView2 dipasang
# otomatis lewat NuGet saat restore.

param(
    [ValidateSet("Debug", "Release")][string]$Configuration = "Release",
    [switch]$SkipUi,
    [switch]$SkipContracts
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "[1/6] Cek toolchain" -ForegroundColor Cyan
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw "dotnet tidak ditemukan. Pasang .NET 8 SDK: https://dotnet.microsoft.com/download"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "node tidak ditemukan. Pasang Node.js >= 22: https://nodejs.org"
}
Write-Host ("  dotnet " + (dotnet --version))
Write-Host ("  node   " + (node --version))

if ($SkipContracts) {
    Write-Host "[2/6] Regenerasi kontrak dilewati (-SkipContracts)" -ForegroundColor Yellow
} else {
    Write-Host "[2/6] Regenerasi kontrak setelan" -ForegroundColor Cyan
    & node (Join-Path $root "contracts\generate.mjs") | Out-Null
}

Write-Host "[3/6] Aset ikon" -ForegroundColor Cyan
$assets = Join-Path $root "src\SnapyOS.Booth.Shell\Assets"
if (-not (Test-Path (Join-Path $assets "app.ico"))) {
    & node (Join-Path $root "scripts\generate-assets.mjs")
} else {
    Write-Host "  app.ico sudah ada" -ForegroundColor DarkGray
}

if ($SkipUi) {
    Write-Host "[4/6] UI dilewati (-SkipUi)" -ForegroundColor Yellow
} else {
    Write-Host "[4/6] Build UI React -> Assets/ui" -ForegroundColor Cyan
    Push-Location (Join-Path $root "ui")
    try {
        if (-not (Test-Path "node_modules")) { npm ci }
        npm run build
    } finally {
        Pop-Location
    }
}

$uiIndex = Join-Path $assets "ui\index.html"
if (-not (Test-Path $uiIndex)) {
    throw "UI belum dibangun: $uiIndex tidak ada. Jalankan tanpa -SkipUi."
}

Write-Host "[5/6] Restore & publish aplikasi Shell (self-contained)" -ForegroundColor Cyan
$outDir = Join-Path $root "dist\booth"
if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
& dotnet publish (Join-Path $root "src\SnapyOS.Booth.Shell\SnapyOS.Booth.Shell.csproj") `
    -c $Configuration -r win-x64 --self-contained true -p:SkipUiBuild=true `
    -o $outDir

Write-Host "[6/6] Verifikasi keluaran" -ForegroundColor Cyan
$exe = Join-Path $outDir "SnapyOS.Booth.Shell.exe"
if (-not (Test-Path $exe)) { throw "Build selesai tanpa EXE: $exe" }
$publishedUi = Join-Path $outDir "Assets\ui\index.html"
if (-not (Test-Path $publishedUi)) { throw "UI tidak ikut ter-publish: $publishedUi" }
$launcher = Join-Path $outDir "Jalankan-Booth.cmd"
if (-not (Test-Path $launcher)) { throw "Peluncur tidak ikut ter-publish: $launcher" }
# Blok `if (...)` mengekspansi %VAR% saat parse; itu yang dulu menulis
# "ECHO is off." ke bridge-token.txt sehingga aplikasi gagal start.
if (Select-String -Path $launcher -Pattern '^\s*if\s+.*\($' -Quiet) {
    throw "Peluncur memakai blok if (...) sehingga token akan rusak: $launcher"
}

$exeHash = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
$fileCount = (Get-ChildItem $outDir -Recurse -File).Count
$totalBytes = (Get-ChildItem $outDir -Recurse -File | Measure-Object -Property Length -Sum).Sum

Write-Host ""
Write-Host "Selesai. Folder siap jalan:" -ForegroundColor Green
Write-Host "  $outDir"
Write-Host "  $exe"
Write-Host ""
Write-Host "  SHA-256 EXE : $exeHash"
Write-Host ("  berkas      : {0} berkas, {1:N1} MB" -f $fileCount, ($totalBytes / 1MB))
Write-Host ""
Write-Host "Jalankan (PowerShell):" -ForegroundColor Green
Write-Host '  $env:PHOTOBOOTH_BRIDGE_TOKEN = "<token 16+ karakter>"'
Write-Host '  $env:SNAPYOS_ALLOW_MOCK = "1"   # Fase 1: adapter mock sampai Fase 3'
Write-Host '  $env:SNAPYOS_CAMERA = "mock"'
Write-Host '  $env:SNAPYOS_PRINTER = "mock"'
Write-Host "  & '$exe'"
Write-Host ""
Write-Host "Atau klik dua kali: Jalankan-Booth.cmd (mock + token otomatis, Fase 1)." -ForegroundColor Green
