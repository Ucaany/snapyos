#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Build EXE/MSI aplikasi booth SNAPY OS di mesin Windows.

.DESCRIPTION
  Menyiapkan sidecar Node, membundel runtime lokal, lalu menjalankan
  `tauri build`. Semua langkah dijalankan dari repo, tidak perlu dibuka
  satu-satu.

  Yang tidak bisa dilakukan dari macOS dan karena itu ada di sini:
  1. Sidecar `node.exe` (Tauri menyalinnya sebagai node-x86_64-pc-windows-msvc.exe).
  2. `@node-rs/argon2-win32-x64-msvc` (modul native; bundler hanya menyalin paket
     milik platform mesin build, dan di Mac itu darwin-arm64).
  3. Bundler MSI/NSIS (WiX + makensis) yang hanya ada di Windows.

  Skrip ini TIDAK memasang apa pun ke mesin booth. Hasilnya adalah berkas
  installer yang nanti diunggah ke Drive dan dipasang lewat
  scripts/install-snapyos.ps1.

.PARAMETER NodeVersion
  Versi Node yang diunduh sebagai sidecar. Default 24.22.1 (LTS, punya
  node:sqlite tanpa flag).

.PARAMETER SkipNodeDownload
  Sidecar sudah ada di src-tauri/binaries/ dan tidak perlu diunduh lagi.

.PARAMETER Targets
  Target bundel Tauri. Default "msi nsis" (keduanya).

.EXAMPLE
  .\scripts\build-booth.ps1
.EXAMPLE
  .\scripts\build-booth.ps1 -SkipNodeDownload -Targets nsis
#>
[CmdletBinding()]
param(
  [string]$NodeVersion = "24.22.1",
  [switch]$SkipNodeDownload,
  [string]$Targets = "msi nsis"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$TauriDir = Join-Path $RepoRoot "src-tauri"
$BinariesDir = Join-Path $TauriDir "binaries"
$SidecarName = "node-x86_64-pc-windows-msvc.exe"
$SidecarPath = Join-Path $BinariesDir $SidecarName
$DistDir = Join-Path $TauriDir "target\release\bundle"

function Fail([string]$Message) {
  Write-Host ""
  Write-Host "GAGAL: $Message" -ForegroundColor Red
  exit 1
}
function Step([string]$Message) {
  Write-Host ""
  Write-Host "== $Message" -ForegroundColor Cyan
}
function Ok([string]$Message) {
  Write-Host "  OK  $Message" -ForegroundColor Green
}
# Jalankan program native; kembalikan exit code + stdout gabungan.
# $ErrorActionPreference dilonggarkan supaya stderr dari program native tidak
# jadi exception mentah (masalah yang sama seperti di install-snapyos.ps1).
function Invoke-Native([string]$Exe, [string[]]$ArgList, [string]$WorkingDir = "") {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $splat = @{ FilePath = $Exe; ArgumentList = $ArgList; NoNewWindow = $true; PassThru = $true }
    if ($WorkingDir) { $splat.WorkingDirectory = $WorkingDir }
    $proc = Start-Process @splat -Wait
    return $proc.ExitCode
  } finally {
    $ErrorActionPreference = $previous
  }
}

# --- 0. Platform ------------------------------------------------------------
Step "Memeriksa mesin build"
if ($env:OS -ne "Windows_NT") { Fail "Skrip ini hanya untuk Windows." }
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "package.json"))) {
  Fail "Tidak menemukan package.json di $RepoRoot. Jalankan dari dalam repo."
}
$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -ne "AMD64") {
  Fail "Arsitektur $arch tidak didukung. Sidecar dan argon2 hanya tersedia untuk x64."
}
Ok "Windows x64, repo di $RepoRoot"

# --- 1. Prasyarat toolchain -------------------------------------------------
Step "Memeriksa prasyarat"
$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Fail "Node.js tidak ditemukan di PATH. Pasang Node.js 22+ (disarankan 24 LTS)." }
$nodeVersionLocal = (node.exe -p "process.versions.node").Trim()
$nodeMajor = [int]($nodeVersionLocal.Split(".")[0])
if ($nodeMajor -lt 22) { Fail "Node.js $nodeVersionLocal terlalu lama. Butuh >= 22." }
Ok "Node.js $nodeVersionLocal"

$cargoCmd = Get-Command cargo.exe -ErrorAction SilentlyContinue
if (-not $cargoCmd) {
  Fail "Rust tidak ditemukan. Pasang dari https://rustup.rs lalu jalankan `rustup default stable`."
}
$rustcVersion = (rustc.exe --version).Trim()
Ok "$rustcVersion"

$msvc = cargo.exe build --version 2>&1 | Out-String
if ($msvc -notmatch "msvc") {
  Fail "Toolchain Rust aktif bukan MSVC. Jalankan `rustup default stable-x86_64-pc-windows-msvc`."
}
Ok "toolchain MSVC aktif"

# WiX (MSI) dan NSIS dibutuhin sesuai target yang diminta.
$targetList = $Targets -split "\s+" | Where-Object { $_ }
foreach ($t in $targetList) {
  if ($t -eq "msi" -and -not (Get-Command candle.exe -ErrorAction SilentlyContinue)) {
    Fail "WiX Toolset tidak ditemukan (dibutuhkan target msi). Pasang dari https://wixtoolset.org lalu buka terminal baru."
  }
  if ($t -eq "nsis" -and -not (Get-Command makensis.exe -ErrorAction SilentlyContinue)) {
    Fail "NSIS tidak ditemukan (dibutuhkan target nsis). Pasang dari https://nsis.sourceforge.io/Download lalu buka terminal baru."
  }
}
Ok "bundler: $($targetList -join ', ')"

# --- 2. Sidecar node.exe ----------------------------------------------------
Step "Menyiapkan sidecar Node"
if ($SkipNodeDownload) {
  if (-not (Test-Path -LiteralPath $SidecarPath)) {
    Fail "-SkipNodeDownload dipakai tapi $SidecarPath tidak ada."
  }
  Ok "pakai sidecar yang sudah ada: $SidecarName"
} else {
  New-Item -ItemType Directory -Force -Path $BinariesDir | Out-Null
  $url = "https://nodejs.org/dist/v$NodeVersion/win-x64/node.exe"
  $sumsUrl = "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt"
  Write-Host "  unduh $url"
  $tmp = Join-Path $env:TEMP "snapyos-node-$NodeVersion.exe"
  try {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    # SHA-256 dihitung dari berkas yang benar-benar diunduh, lalu dicocokkan
    # dengan SHASUMS256.txt resmi. Tanpa ini, node.exe yang rusak atau diganti
    # di tengah jalan ikut masuk ke installer.
    $actual = (Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLower()
    $sums = (Invoke-WebRequest -Uri $sumsUrl -UseBasicParsing).Content
    $expected = ($sums -split "`n" | ForEach-Object { $_.Trim() } |
      Where-Object { $_ -match "\s+win-x64/node\.exe$" } | Select-Object -First 1) -split "\s+" | Select-Object -First 1
    if (-not $expected) { Fail "Baris win-x64/node.exe tidak ada di $sumsUrl" }
    if ($expected.ToLower() -ne $actual) {
      Fail "SHA-256 node.exe tidak cocok.`n  diharapkan $expected`n  dapat $actual"
    }
    Ok "SHA-256 cocok dengan $sumsUrl"
    Copy-Item -LiteralPath $tmp -Destination $SidecarPath -Force
    $sidecarVersion = (& $SidecarPath -p "process.versions.node").Trim()
    if ($sidecarVersion -ne $NodeVersion) {
      Fail "Sidecar melaporkan v$sidecarVersion, diminta v$NodeVersion."
    }
    Ok "sidecar $SidecarName (v$sidecarVersion)"
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

# --- 3. Dependensi npm ------------------------------------------------------
Step "Memeriksa dependensi npm"
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules"))) {
  Write-Host "  node_modules belum ada, menjalankan npm ci"
  $ci = Invoke-Native "npm.cmd" @("ci") $RepoRoot
  if ($ci -ne 0) { Fail "npm ci gagal (exit $ci)." }
}
# @tauri-apps/cli-win32-x64-msvc adalah optionalDependency: di mesin yang
# sebelumnya hanya pernah install dari Mac, paket Windows bisa belum terunduh.
$cliWin = Join-Path $RepoRoot "node_modules\@tauri-apps\cli-win32-x64-msvc"
if (-not (Test-Path -LiteralPath $cliWin)) {
  Write-Host "  CLI Windows belum ada, menjalankan npm install"
  $inst = Invoke-Native "npm.cmd" @("install") $RepoRoot
  if ($inst -ne 0) { Fail "npm install gagal (exit $inst)." }
}
if (-not (Test-Path -LiteralPath $cliWin)) { Fail "$cliWin masih tidak ada setelah npm install." }
Ok "npm siap"

# --- 4. Bundel runtime ------------------------------------------------------
# beforeBuildCommand Tauri menjalankan ini juga, tapi dijalankan lebih dulu
# supaya kegagalan bundel terlihat sebelum build Rust yang lama.
Step "Membundel runtime lokal"
$bundle = Invoke-Native "node.exe" @("scripts\build-kiosk-runtime.mjs") $RepoRoot
if ($bundle -ne 0) { Fail "Bundel runtime gagal (exit $bundle)." }
$runtimeMain = Join-Path $TauriDir "runtime-dist\main.mjs"
if (-not (Test-Path -LiteralPath $runtimeMain)) { Fail "$runtimeMain tidak dihasilkan bundler." }
$argon2Win = Join-Path $TauriDir "runtime-dist\node_modules\@node-rs\argon2-win32-x64-msvc"
if (-not (Test-Path -LiteralPath $argon2Win)) {
  Fail "$argon2Win tidak ada. Bundler hanya menyalin paket platform mesin build; `n" +
    "  pastikan node_modules lengkap (npm install di Windows)."
}
$fonts = Join-Path $TauriDir "runtime-dist\standard-fonts"
if (-not (Test-Path -LiteralPath $fonts)) { Fail "$fonts tidak ada. Cetak PDF akan gagal." }
Ok "runtime-dist siap (main.mjs + argon2 win32 + standard-fonts)"

# --- 5. Versi ---------------------------------------------------------------
# Versi booth yang dilaporkan runtime dibaca dari package.json di sebelah
# main.mjs. Bundel tidak membuat berkas itu, jadi tanpa langkah ini runtime
# melaporkan 0.0.0 dan dashboard owner tidak pernah menandai booth ketinggalan.
Step "Menulis versi runtime"
$appVersion = (Get-Content -LiteralPath (Join-Path $RepoRoot "package.json") -Raw |
  ConvertFrom-Json).version
if (-not $appVersion) { Fail "version tidak terbaca dari package.json." }
$tauriVersion = (Get-Content -LiteralPath (Join-Path $TauriDir "tauri.conf.json") -Raw |
  ConvertFrom-Json).version
if ($tauriVersion -ne $appVersion) {
  Fail "Versi tidak sinkron: package.json $appVersion, tauri.conf.json $tauriVersion. `n" +
    "  Samakan keduanya dulu (dashboard owner membandingkan versi ini dengan app_releases)."
}
$runtimePkg = Join-Path $TauriDir "runtime-dist\package.json"
$pkg = Get-Content -LiteralPath $runtimePkg -Raw | ConvertFrom-Json
$pkg | Add-Member -NotePropertyName version -NotePropertyValue $appVersion -Force
$pkg | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $runtimePkg -Encoding UTF8
Ok "runtime-dist/package.json version = $appVersion"

# --- 6. Build ---------------------------------------------------------------
Step "Menjalankan tauri build ($($targetList -join ' '))"
Push-Location $TauriDir
try {
  $args = @("tauri", "build")
  foreach ($t in $targetList) { $args += @("-b", $t) }
  $build = Invoke-Native "npx.cmd" $args $TauriDir
} finally {
  Pop-Location
}
if ($build -ne 0) { Fail "tauri build gagal (exit $build). Lihat keluaran di atas." }

# --- 7. Ringkasan & Kompresi ---------------------------------------------------

Step "Selesai"
$artifacts = @()
foreach ($t in $targetList) {
  $dir = Join-Path $DistDir $t
  if (Test-Path -LiteralPath $dir) {
    $artifacts += Get-ChildItem -LiteralPath $dir -Include *.msi, *.exe -File -Recurse
  }
}
if ($artifacts.Count -eq 0) { Fail "Build dilaporkan sukses tapi tidak ada artefak di $DistDir." }

# Kompres semua artefak ke satu ZIP untuk memudahkan distribusi.
$zipFile = Join-Path $RepoRoot "snapyos-booth-build.zip"
if (Test-Path -LiteralPath $zipFile) { Remove-Item -LiteralPath $zipFile -Force }
Write-Host "  mengemas artefak ke $zipFile"
Compress-Archive -Path $DistDir -DestinationPath $zipFile -Force

foreach ($a in $artifacts) {
  $hash = (Get-FileHash -LiteralPath $a.FullName -Algorithm SHA256).Hash
  $size = [math]::Round($a.Length / 1MB, 1)
  Write-Host ""
  Write-Host "  $($a.Name)  ($size MB)" -ForegroundColor White
  Write-Host "  $($a.FullName)"
  Write-Host "  SHA-256: $hash" -ForegroundColor Gray
}
Write-Host ""
Write-Host "Selesai. Paket ZIP: $zipFile" -ForegroundColor Green
Write-Host ""
Write-Host "Langkah berikutnya (docs/19-desktop-app-release.md):" -ForegroundColor Cyan
Write-Host "  1. Unggah berkas ke Google Drive, akses 'Siapa saja yang punya link'."
Write-Host "  2. Isi versi, URL, ukuran byte, dan SHA-256 di /admin/apps."
Write-Host "  3. Pastikan baris berstatus Aktif, lalu pasang di booth dengan"
Write-Host "     .\scripts\install-snapyos.ps1 -AppDir '<folder hasil pasang>' ``"
Write-Host "       -CloudUrl https://test.snapyos.biz.id ``"
Write-Host "       -KioskUrl https://test.snapyos.biz.id/p/<business>/<booth>"
