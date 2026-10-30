@echo off
rem ===========================================================================
rem  SNAPY OS BOOTH — peluncur satu klik untuk operator (Windows x64).
rem
rem  Pemakaian:
rem    Jalankan-Booth.cmd            jalankan normal (adapter nyata, fase 3+)
rem    Jalankan-Booth.cmd -Mock      jalankan dengan kamera/printer mock
rem
rem  Token bridge:
rem    - Bila PHOTOBOOTH_BRIDGE_TOKEN sudah di-set di environment, nilai itu dipakai.
rem    - Bila belum, dibaca dari bridge-token.txt di folder ini.
rem    - Bila belum ada juga, dibuat otomatis (32 karakter hex) lalu disimpan
rem      ke bridge-token.txt supaya tidak berubah tiap kali dijalankan.
rem
rem  Token TIDAK pernah ditulis ke UI/localStorage; Shell menyuntiknya ke
rem  WebView2 lewat AddScriptToExecuteOnDocumentCreatedAsync.
rem ===========================================================================
setlocal

set "HERE=%~dp0"
set "EXE=%HERE%SnapyOS.Booth.Shell.exe"

if not exist "%EXE%" (
  echo [GALAT] SnapyOS.Booth.Shell.exe tidak ditemukan di folder ini.
  echo         Ekstrak seluruh isi ZIP rilis ke satu folder, jangan pindahkan EXE-nya saja.
  pause
  exit /b 1
)

set "MOCK=0"
if /i "%~1"=="-Mock" set "MOCK=1"
if /i "%~1"=="--mock" set "MOCK=1"

if "%MOCK%"=="1" (
  set "SNAPYOS_ALLOW_MOCK=1"
  set "SNAPYOS_CAMERA=mock"
  set "SNAPYOS_PRINTER=mock"
)

if not defined PHOTOBOOTH_BRIDGE_TOKEN (
  if exist "%HERE%bridge-token.txt" (
    set /p PHOTOBOOTH_BRIDGE_TOKEN=<"%HERE%bridge-token.txt"
  )
)

if not defined PHOTOBOOTH_BRIDGE_TOKEN (
  for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "-join ((1..32) ^| ForEach-Object { '{0:x}' -f (Get-Random -Minimum 0 -Maximum 16) })"`) do set "PHOTOBOOTH_BRIDGE_TOKEN=%%T"
  >"%HERE%bridge-token.txt" echo %PHOTOBOOTH_BRIDGE_TOKEN%
  echo [INFO] Token bridge baru dibuat dan disimpan di bridge-token.txt
)

echo.
echo  SNAPY OS BOOTH
echo  bridge   : http://127.0.0.1:17777
echo  token    : %PHOTOBOOTH_BRIDGE_TOKEN%
echo  mode     : %MOCK% (1 = MOCK, hanya untuk uji coba)
echo.

start "" "%EXE%"
exit /b 0
