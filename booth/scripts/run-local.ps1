# Jalankan aplikasi booth dari repo hasil clone (Windows x64).
#
#   .\booth\scripts\run-local.ps1
#   .\booth\scripts\run-local.ps1 -Token "0123456789abcdef" -Mock
#
# Skrip ini membangun jika perlu, lalu menjalankan EXE. Untuk operator booth,
# pakai paket MSIX (fase 5) — jangan clone repo.

param(
    [string]$Token = $env:PHOTOBOOTH_BRIDGE_TOKEN,
    [switch]$Mock,
    [switch]$Rebuild,
    [ValidateSet("Debug", "Release")][string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not $Token -or $Token.Length -lt 16) {
    throw "Token bridge minimal 16 karakter. Pakai -Token <nilai> atau set PHOTOBOOTH_BRIDGE_TOKEN."
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw "dotnet tidak ditemukan. Pasang .NET 8 SDK: https://dotnet.microsoft.com/download"
}

$exe = Join-Path $root "dist\booth\SnapyOS.Booth.Shell.exe"
if ($Rebuild -or -not (Test-Path $exe)) {
    & (Join-Path $PSScriptRoot "build-booth.ps1") -Configuration $Configuration
}

$env:PHOTOBOOTH_BRIDGE_TOKEN = $Token
if ($Mock) { $env:SNAPYOS_ALLOW_MOCK = "1" }
if ($Mock) { $env:SNAPYOS_CAMERA = "mock"; $env:SNAPYOS_PRINTER = "mock" }

Write-Host "Menjalankan: $exe" -ForegroundColor Green
Write-Host "  mock: $([bool]$Mock)  bridge: http://127.0.0.1:17777" -ForegroundColor DarkGray
& $exe
