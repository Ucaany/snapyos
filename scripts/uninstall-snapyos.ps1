#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Melepas runtime lokal SNAPY OS dari satu mesin booth.

.DESCRIPTION
  Menghapus tugas boot, bridge.env (berisi token), dan berkas XML tugas.

  Data booth — SQLite, foto, karantina, dan hash PIN darurat — TIDAK disentuh.
  Booth yang dipasang ulang harus menemukan sesi lamanya; menghapus data hanya
  boleh dilakukan manusia yang tahu apa yang dibuang.

.PARAMETER BaseDir
  Folder konfigurasi. Default %ProgramData%\SNAPYOS.
#>
[CmdletBinding()]
param(
  [string]$BaseDir = (Join-Path $env:ProgramData "SNAPYOS")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$TaskName = "SnapyOSRuntime"
$EnvFile = Join-Path $BaseDir "bridge.env"
$TaskXml = Join-Path $BaseDir "$TaskName.xml"

# Dibaca sebelum bridge.env dihapus: setelah itu lokasi data tidak tercatat lagi.
$dataDir = $null
if (Test-Path -LiteralPath $EnvFile) {
  $dataLine = Select-String -LiteralPath $EnvFile -Pattern "^\s*SNAPYOS_DATA_DIR\s*=" | Select-Object -First 1
  if ($dataLine) { $dataDir = ($dataLine.Line -split "=", 2)[1].Trim() }
}
if (-not $dataDir) { $dataDir = Join-Path $BaseDir "data" }

# Tugas yang tidak ada memang tujuan akhirnya: kegagalan di sini bukan alasan
# menghentikan pelepasan. stderr-nya juga tidak boleh jadi error terminating
# (PowerShell 5.1 melakukannya saat $ErrorActionPreference = "Stop").
$ErrorActionPreference = "Continue"
& schtasks.exe /end /tn $TaskName 2>&1 | Out-Null
& schtasks.exe /delete /tn $TaskName /f 2>&1 | Out-Null
$ErrorActionPreference = "Stop"

Remove-Item -LiteralPath $EnvFile -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $TaskXml -Force -ErrorAction SilentlyContinue

Write-Host "Runtime SNAPY OS dilepas (tugas + bridge.env)."
Write-Host ""
Write-Host "Data booth TIDAK dihapus:"
Write-Host "  $dataDir" -ForegroundColor Yellow
Write-Host ""
Write-Host "Hapus folder itu sendiri hanya bila booth ini memang dibuang atau"
Write-Host "dipindahkan dan sesinya sudah tersinkron ke cloud."
