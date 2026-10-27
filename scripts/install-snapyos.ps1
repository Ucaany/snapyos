#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Pemasang runtime lokal SNAPY OS untuk booth Windows.

.DESCRIPTION
  Menyiapkan satu mesin booth supaya bisa jualan tanpa internet:
  memeriksa prasyarat (Node >= 22, WebView2), membuat bridge.env berisi token
  bridge, meminta PIN darurat, lalu mendaftarkan runtime sebagai tugas boot
  SYSTEM.

  Token bridge TIDAK pernah ditulis di dalam skrip ini — dibuat di mesin booth
  saat instalasi, karena token yang sama di banyak booth berarti siapa pun yang
  memegang satu booth bisa mengendalikan kamera/printer booth lain.

.PARAMETER AppDir
  Folder aplikasi hasil pemasangan EXE. Harus memuat runtime\main.mjs.

.PARAMETER DataDir
  Folder data booth (SQLite + foto). Default %ProgramData%\SNAPYOS\data.

.PARAMETER CloudUrl
  URL aplikasi SNAPY OS, mis. https://snapyos.example. Kosong = booth hanya
  lokal: sesi tersimpan tapi tidak pernah tersinkron.

.PARAMETER KioskUrl
  Halaman kiosk booth ini: https://snapyos.example/p/<business>/<booth>. Slug
  diambil dari sini dan ditulis ke store; tanpa slug sesi offline ditolak.

.EXAMPLE
  .\install-snapyos.ps1 -AppDir "C:\Program Files\SNAPY OS Kiosk" `
    -CloudUrl https://test.snapyos.biz.id `
    -KioskUrl https://test.snapyos.biz.id/p/toko-a/booth-1
#>
[CmdletBinding()]
param(
  [string]$AppDir = $PSScriptRoot,
  [string]$DataDir = "",
  [int]$Port = 17777,
  [string]$CloudUrl = "",
  [string]$KioskUrl = "",
  [ValidateSet("landscape", "portrait")][string]$Orientation = "landscape"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$TaskName = "SnapyOSRuntime"
$BaseDir = Join-Path $env:ProgramData "SNAPYOS"
$EnvFile = Join-Path $BaseDir "bridge.env"
$TaskXml = Join-Path $BaseDir "$TaskName.xml"

function Fail([string]$Message) {
  Write-Host "GAGAL: $Message" -ForegroundColor Red
  exit 1
}

function Step([string]$Message) {
  Write-Host ""
  Write-Host "== $Message" -ForegroundColor Cyan
}

<#
  Jalankan program native; kembalikan exit code + stdout gabungan.

  PowerShell 5.1 mengubah tulisan stderr dari program native menjadi error
  terminating saat $ErrorActionPreference = "Stop", sehingga `icacls` yang gagal
  melempar exception mentah alih-alih sampai ke pesan Fail di bawah. Di sini
  $ErrorActionPreference dilonggarkan selama panggilan dan hanya exit code yang
  dipakai untuk memutuskan.
#>
function Invoke-Native([string]$Exe, [string[]]$ArgList, [string]$Stdin = "") {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = if ($Stdin) { $Stdin | & $Exe @ArgList 2>&1 } else { & $Exe @ArgList 2>&1 }
    return [pscustomobject]@{
      Exit   = $LASTEXITCODE
      Output = (@($output) | ForEach-Object { [string]$_ }) -join "`n"
    }
  } finally {
    $ErrorActionPreference = $previous
  }
}

# --- 1. Node.js -------------------------------------------------------------

Step "Memeriksa Node.js"
$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCmd) { [string]$nodeCmd.Source } else { "" }
if (-not $nodeExe) {
  Fail "Node.js tidak ditemukan di PATH. Pasang Node.js 24 LTS (x64) lalu ulangi."
}
$nodeVersion = (Invoke-Native $nodeExe @("-p", "process.versions.node")).Output.Trim()
$nodeMajor = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt 22) {
  Fail "Node.js $nodeVersion terlalu lama. Runtime butuh Node.js >= 22 (disarankan 24 LTS)."
}

# Versi 22 awal masih butuh --experimental-sqlite; runtime tidak memakainya,
# jadi periksa kemampuannya langsung alih-alih percaya nomor versi saja.
$sqliteProbe = Invoke-Native $nodeExe @("--input-type=module", "-e", "await import('node:sqlite')")
if ($sqliteProbe.Exit -ne 0) {
  Fail "Node.js $nodeVersion tidak menyediakan node:sqlite tanpa flag. Pasang Node.js 24 LTS."
}
Write-Host "  Node.js $nodeVersion ($nodeExe)"

if (($nodeExe -notlike "$env:ProgramFiles\*") -and ($nodeExe -notlike "${env:ProgramFiles(x86)}\*")) {
  Write-Host "  PERINGATAN: node.exe berada di luar Program Files ($nodeExe)." -ForegroundColor Yellow
  Write-Host "  Tugas SYSTEM bisa gagal menemukannya setelah update Node. Pasang Node.js per-mesin."
}

# --- 2. WebView2 ------------------------------------------------------------

Step "Memeriksa WebView2 Runtime"
$wv2Keys = @(
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
)
$webview2 = $null
foreach ($key in $wv2Keys) {
  $item = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
  if ($item -and ($item.PSObject.Properties.Name -contains "pv") -and $item.pv) {
    $webview2 = $item.pv
    break
  }
}
if (-not $webview2) {
  Fail "WebView2 Runtime tidak terpasang. Ambil 'Evergreen Standalone Installer' dari Microsoft lalu ulangi."
}
Write-Host "  WebView2 $webview2"

# --- 3. Berkas runtime ------------------------------------------------------

Step "Memeriksa berkas runtime"
$runtimeDir = Join-Path $AppDir "runtime"
$runtimeMain = Join-Path $runtimeDir "main.mjs"
if (-not (Test-Path -LiteralPath $runtimeMain)) {
  Fail "runtime\main.mjs tidak ada di $AppDir. Arahkan -AppDir ke folder hasil pemasangan EXE."
}
# Modul native untuk hash PIN darurat ikut dibundel di sebelah main.mjs.
if (-not (Test-Path -LiteralPath (Join-Path $runtimeDir "node_modules\@node-rs\argon2"))) {
  Fail "node_modules\@node-rs\argon2 tidak ada di $runtimeDir. Paket aplikasi tidak lengkap."
}
Write-Host "  $runtimeMain"

# --- 4. Perangkat pendukung -------------------------------------------------

Step "Mendeteksi perangkat pendukung"
$digicamCandidates = @(
  "C:\Program Files\digiCamControl\CameraControlCmd.exe",
  "C:\Program Files (x86)\digiCamControl\CameraControlCmd.exe"
)
$digicam = $digicamCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($digicam) {
  Write-Host "  digiCamControl: $digicam"
  Write-Host "  GUI digiCamControl harus TERTUTUP saat booth dipakai (CLI berebut kamera dengan GUI)." -ForegroundColor Yellow
} else {
  Write-Host "  digiCamControl: TIDAK ditemukan — kamera DSLR tidak akan jalan." -ForegroundColor Yellow
}

$sumatraCandidates = @(
  "C:\Program Files\SumatraPDF\SumatraPDF.exe",
  "C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
  (Join-Path $env:LOCALAPPDATA "SumatraPDF\SumatraPDF.exe")
)
$sumatra = $sumatraCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($sumatra) {
  Write-Host "  SumatraPDF: $sumatra"
} else {
  Write-Host "  SumatraPDF: TIDAK ditemukan — cetak PDF tidak akan jalan." -ForegroundColor Yellow
}

# --- 5. PIN darurat ---------------------------------------------------------

Step "PIN darurat (dipakai petugas keluar booth saat internet mati)"
Write-Host "  PIN ini terpisah dari PIN keluar milik cloud dan hanya berlaku offline."
$pin = $null
while ($true) {
  $secure = Read-Host "  PIN darurat (4-8 digit)" -AsSecureString
  $first = [System.Net.NetworkCredential]::new("", $secure).Password
  if ($first -notmatch "^\d{4,8}$") {
    Write-Host "  PIN harus 4-8 digit angka." -ForegroundColor Yellow
    continue
  }
  $secureConfirm = Read-Host "  Ulangi PIN darurat" -AsSecureString
  $second = [System.Net.NetworkCredential]::new("", $secureConfirm).Password
  if ($first -ne $second) {
    Write-Host "  PIN tidak sama. Ulangi." -ForegroundColor Yellow
    continue
  }
  $pin = $first
  break
}

if (-not $DataDir) { $DataDir = Join-Path $BaseDir "data" }
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# Data booth (foto pelanggan + hash PIN darurat). Tiga penulis: tugas SYSTEM,
# sidecar yang dijalankan EXE sebagai user kiosk, dan operator saat servis —
# jadi Users tetap butuh tulis di sini. Yang dikunci hanya bridge.env, karena
# di situlah token bridge berada. Diterapkan SEBELUM snapyos.db dibuat supaya
# berkasnya lahir dengan ACL yang sama, bukan mewarisi izin folder induk.
$aclExit = Invoke-Native "icacls.exe" @(
  $DataDir, "/inheritance:r", "/grant:r",
  "*S-1-5-18:(OI)(CI)(F)",
  "*S-1-5-32-544:(OI)(CI)(F)",
  "*S-1-5-32-545:(OI)(CI)(M)"
)
if ($aclExit.Exit -ne 0) { Fail "Gagal mengatur ACL $DataDir." }

$dbPath = Join-Path $DataDir "snapyos.db"

# Slug booth: tanpa ini runtime menolak membuat sesi lokal ("belum
# dikonfigurasi") dan kiosk tidak bisa memastikan runtime ini milik booth-nya.
# Diambil dari /p/<business>/<photobox> pada -KioskUrl.
$businessSlug = ""
$photoboxSlug = ""
$kioskPath = ""
if ($KioskUrl) {
  try { $kioskPath = ([Uri]$KioskUrl).AbsolutePath }
  catch { Fail "-KioskUrl bukan URL yang valid: $KioskUrl" }
}
if ($kioskPath -match "^/p/([^/]+)/([^/?#]+)") {
  $businessSlug = $Matches[1]
  $photoboxSlug = $Matches[2]
} else {
  Write-Host "  PERINGATAN: -KioskUrl tidak berbentuk /p/<business>/<booth>." -ForegroundColor Yellow
  Write-Host "  Sesi offline akan ditolak sampai slug diisi di meta store." -ForegroundColor Yellow
}

# Hash argon2id + tulis ke meta. Parameter di bawah harus sama dengan
# ARGON2_PIN_OPTIONS di src/lib/device-token.ts — verify runtime memakai
# encoded string yang membawa parameternya sendiri, jadi nilainya harus cocok
# dengan yang tertulis di berkas itu.
#
# Berkas skrip kecil ditulis di dalam runtimeDir supaya `@node-rs/argon2`
# ter-resolve dari node_modules yang dibundel aplikasi, lalu dihapus lagi.
$pinScript = Join-Path $runtimeDir ".snapyos-set-pin.mjs"
# Tanpa BOM: PowerShell 5.1 menulis BOM pada -Encoding UTF8, dan itu ikut
# menjadi karakter pertama berkas.
$pinBody = @'
import { DatabaseSync } from "node:sqlite";
import { hash } from "@node-rs/argon2";

const dbPath = process.env.SNAPYOS_PIN_DB;
const businessSlug = process.env.SNAPYOS_BUSINESS_SLUG ?? "";
const photoboxSlug = process.env.SNAPYOS_PHOTOBOX_SLUG ?? "";
let pin = "";
for await (const chunk of process.stdin) pin += chunk;
pin = pin.trim();
if (!/^\d{4,8}$/.test(pin)) {
  console.error("PIN harus 4-8 digit angka.");
  process.exit(2);
}

const db = new DatabaseSync(dbPath);
db.exec("pragma journal_mode = wal");
// Hanya tabel meta. user_version sengaja dibiarkan 0: migrasi runtime memakai
// `create table if not exists`, jadi start pertama tetap aman.
db.exec("create table if not exists meta (key text primary key, value text not null)");
const put = db.prepare(
  "insert into meta (key, value) values (?, ?) " +
    "on conflict(key) do update set value = excluded.value"
);
const hashed = await hash(pin, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
put.run("exit_pin_emergency_hash", hashed);
// Slug ditulis hanya bila ada: menimpa slug booth yang sudah benar dengan
// string kosong akan mematikan sesi offline.
if (businessSlug) put.run("business_slug", businessSlug);
if (photoboxSlug) put.run("photobox_slug", photoboxSlug);
// Kunci rate-limit dari pemasangan lama tidak boleh ikut ke booth yang baru.
db.prepare("delete from meta where key in ('exit_pin_failed_count', 'exit_pin_locked_until')").run();
db.close();
console.log("pin-ok");
'@
[System.IO.File]::WriteAllText($pinScript, $pinBody, (New-Object System.Text.UTF8Encoding($false)))

$env:SNAPYOS_PIN_DB = $dbPath
$env:SNAPYOS_BUSINESS_SLUG = $businessSlug
$env:SNAPYOS_PHOTOBOX_SLUG = $photoboxSlug
$pinRun = $null
try {
  $pinRun = Invoke-Native $nodeExe @($pinScript) $pin
} finally {
  Remove-Item Env:\SNAPYOS_PIN_DB, Env:\SNAPYOS_BUSINESS_SLUG, Env:\SNAPYOS_PHOTOBOX_SLUG -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $pinScript -Force -ErrorAction SilentlyContinue
}
if (-not $pinRun -or $pinRun.Exit -ne 0 -or $pinRun.Output.Trim() -ne "pin-ok") {
  Fail "PIN darurat gagal disimpan ke $dbPath."
}
Write-Host "  PIN darurat tersimpan (hash argon2id, bukan teks biasa)."

# --- 6. bridge.env ----------------------------------------------------------

Step "Menulis $EnvFile"
New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null

# Token dibuat di sini, sekali, per booth. Tidak pernah ditulis di skrip.
$tokenBytes = New-Object byte[] 24
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($tokenBytes)
$rng.Dispose()
$bridgeToken = [Convert]::ToBase64String($tokenBytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")

# Origin halaman kiosk. Runtime menolak request dari origin di luar daftar ini,
# dan request itu datang dari halaman kiosk — bukan dari alamat cloud.
$origins = @()
if ($CloudUrl) {
  try { $origins += ([Uri]$CloudUrl).GetLeftPart([UriPartial]::Authority) }
  catch { Fail "-CloudUrl bukan URL yang valid: $CloudUrl" }
} else {
  Write-Host "  PERINGATAN: -CloudUrl kosong. Sesi tidak akan tersinkron ke cloud." -ForegroundColor Yellow
}
if ($KioskUrl) {
  $kioskOrigin = ([Uri]$KioskUrl).GetLeftPart([UriPartial]::Authority)
  if ($origins -notcontains $kioskOrigin) { $origins += $kioskOrigin }
}
$origin = $origins -join ","

$envLines = @(
  "# Dibuat oleh scripts/install-snapyos.ps1. Berisi token bridge — jangan disalin ke booth lain.",
  "PHOTOBOOTH_BRIDGE_TOKEN=$bridgeToken",
  "PHOTOBOOTH_BRIDGE_HOST=127.0.0.1",
  "PHOTOBOOTH_BRIDGE_PORT=$Port",
  "PHOTOBOOTH_BRIDGE_ORIGINS=$origin",
  "SNAPYOS_DATA_DIR=$DataDir",
  "SNAPYOS_CLOUD_URL=$CloudUrl",
  "SNAPYOS_KIOSK_ORIENTATION=$Orientation",
  "NODE_ENV=production"
)
if ($KioskUrl) { $envLines += "SNAPYOS_KIOSK_URL=$KioskUrl" }
if ($digicam) { $envLines += "DIGICAMCONTROL_CMD=$digicam" }
if ($sumatra) { $envLines += "SUMATRA_BIN=$sumatra" }
# SNAPYOS_DEVICE_TOKEN diisi operator setelah booth diaktivasi dari layar kiosk.

# UTF-8 tanpa BOM: node --env-file membaca UTF-8, dan BOM akan menempel di
# nama kunci baris pertama. Path booth boleh berisi karakter non-ASCII.
[System.IO.File]::WriteAllLines($EnvFile, $envLines, (New-Object System.Text.UTF8Encoding($false)))

# Hanya SYSTEM dan Administrators: berkas ini memegang kunci kamera + printer.
# SID dipakai, bukan nama grup, karena nama grup diterjemahkan per bahasa Windows.
$aclExit = Invoke-Native "icacls.exe" @(
  $EnvFile, "/inheritance:r", "/grant:r", "*S-1-5-18:(F)", "*S-1-5-32-544:(F)"
)
if ($aclExit.Exit -ne 0) { Fail "Gagal mengatur ACL $EnvFile." }
Write-Host "  ACL bridge.env + data: SYSTEM + Administrators."

# --- 7. Tugas boot SYSTEM ---------------------------------------------------

Step "Mendaftarkan tugas $TaskName"
# Didaftarkan lewat schtasks dengan XML supaya path ber-spasi tidak perlu
# di-quote di command line (kutip bersarang di /tr adalah sumber kegagalan
# klasik di PowerShell 5.1). Isinya sama dengan /sc onstart /ru SYSTEM.
#
# Runtime hidup sejak boot, bukan menunggu EXE dibuka: kiosk butuh setelan
# device dan sesi lokal bahkan bila jendela belum tampil. EXE tetap mencoba
# menjalankan sidecar-nya sendiri; saat port sudah dipegang tugas ini, sidecar
# itu berhenti dengan EADDRINUSE dan kiosk memakai runtime yang sudah ada.
$nodeXml = [System.Security.SecurityElement]::Escape($nodeExe)
$envXml = [System.Security.SecurityElement]::Escape($EnvFile)
$mainXml = [System.Security.SecurityElement]::Escape($runtimeMain)
$dirXml = [System.Security.SecurityElement]::Escape($runtimeDir)

$taskXmlBody = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>SNAPY OS runtime lokal: kamera, printer, sesi offline.</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger><Enabled>true</Enabled></BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$nodeXml</Command>
      <Arguments>--env-file "$envXml" "$mainXml"</Arguments>
      <WorkingDirectory>$dirXml</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

Set-Content -LiteralPath $TaskXml -Value $taskXmlBody -Encoding Unicode
$taskExit = Invoke-Native "schtasks.exe" @("/create", "/tn", $TaskName, "/xml", $TaskXml, "/f")
if ($taskExit.Exit -ne 0) { Fail "schtasks gagal mendaftarkan $TaskName." }

# --- 8. Ringkasan -----------------------------------------------------------

Write-Host ""
Write-Host "Selesai." -ForegroundColor Green
Write-Host ""
Write-Host "  Token bridge (masukkan di Setup Perangkat kiosk booth ini):"
Write-Host "  $bridgeToken" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Data booth   : $DataDir (tidak pernah dihapus oleh uninstaller)"
Write-Host "  Konfigurasi  : $EnvFile"
Write-Host "  Tugas        : $TaskName (boot, SYSTEM) — berjalan setelah reboot"
Write-Host ""
Write-Host "  Token ini hanya untuk booth ini. Booth lain butuh token sendiri."
if (-not $digicam) { Write-Host "  Peringatan: digiCamControl tidak terdeteksi." -ForegroundColor Yellow }
if (-not $sumatra) { Write-Host "  Peringatan: SumatraPDF tidak terdeteksi." -ForegroundColor Yellow }
