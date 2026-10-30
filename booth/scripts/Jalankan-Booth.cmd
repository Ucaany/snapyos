@echo off
rem ===========================================================================
rem  SNAPY OS BOOTH: peluncur satu klik untuk operator (Windows x64).
rem
rem  Pemakaian:
rem    Jalankan-Booth.cmd            adapter mock (Fase 1; adapter nyata Fase 3)
rem    Jalankan-Booth.cmd -Mock      sama, eksplisit
rem
rem  Fase 1 hanya punya adapter mock. Peluncur selalu memakai mock; Shell tetap
rem  menolak config nyata dan melabeli mock di UI. Adapter nyata menyusul Fase 3.
rem
rem  Token bridge:
rem    - PHOTOBOOTH_BRIDGE_TOKEN dari environment dipakai bila sah.
rem    - Bila tidak, dibaca dari bridge-token.txt di folder ini.
rem    - Bila belum ada ATAU isinya tidak sah (< 16 karakter), token baru dibuat
rem      (32 hex) lalu disimpan.
rem
rem  Token TIDAK pernah ditulis ke UI/localStorage; Shell menyuntiknya ke
rem  WebView2 lewat AddScriptToExecuteOnDocumentCreatedAsync.
rem
rem  Catatan: tidak ada blok `if (...)` sama sekali. Ekspansi %VAR% di dalam blok
rem  terjadi saat parse, bukan saat jalan; itu yang dulu membuat bridge-token.txt
rem  berisi teks "ECHO is off." sehingga aplikasi gagal start (token < 16).
rem  Semua percabangan memakai label + goto, dan setiap baris di-parse sendiri
rem  sehingga %VAR% selalu berisi nilai terbaru.
rem ===========================================================================
setlocal EnableExtensions

set "HERE=%~dp0"
set "EXE=%HERE%SnapyOS.Booth.Shell.exe"
set "TOKENFILE=%HERE%bridge-token.txt"

if not exist "%EXE%" goto :no_exe

rem Fase 1: mock untuk semua adapter. Mock wajib SNAPYOS_ALLOW_MOCK=1.
set "SNAPYOS_ALLOW_MOCK=1"
set "SNAPYOS_CAMERA=mock"
set "SNAPYOS_PRINTER=mock"
set "SNAPYOS_CAMERA_STREAM=mock"

if defined PHOTOBOOTH_BRIDGE_TOKEN goto :check_token
if not exist "%TOKENFILE%" goto :make_token
set /p PHOTOBOOTH_BRIDGE_TOKEN=<"%TOKENFILE%"

:check_token
rem Token sah = minimal 16 karakter (batas RuntimeConfig.Load).
if "%PHOTOBOOTH_BRIDGE_TOKEN:~15%"=="" goto :make_token
goto :run

:make_token
set "PHOTOBOOTH_BRIDGE_TOKEN="
for /f "usebackq delims=" %%T in (`powershell -NoProfile -NonInteractive -Command "[guid]::NewGuid().ToString('N')"`) do set "PHOTOBOOTH_BRIDGE_TOKEN=%%T"
if "%PHOTOBOOTH_BRIDGE_TOKEN:~31%"=="" goto :no_token
>"%TOKENFILE%" echo %PHOTOBOOTH_BRIDGE_TOKEN%
echo [INFO] Token bridge baru dibuat dan disimpan di bridge-token.txt

:run
echo.
echo  SNAPY OS BOOTH
echo  bridge   : http://127.0.0.1:17777
echo  token    : %PHOTOBOOTH_BRIDGE_TOKEN%
echo  mode     : MOCK (Fase 1; adapter nyata Fase 3)
echo  log      : %LOCALAPPDATA%\SNAPYOS\booth.log
echo.
start "" "%EXE%"
exit /b 0

:no_exe
echo [GALAT] SnapyOS.Booth.Shell.exe tidak ditemukan di folder ini.
echo         Ekstrak seluruh isi ZIP rilis ke satu folder, jangan pindahkan EXE-nya saja.
echo.
pause
exit /b 1

:no_token
echo [GALAT] Token bridge gagal dibuat (PowerShell tidak tersedia?).
echo         Set PHOTOBOOTH_BRIDGE_TOKEN manual (minimal 16 karakter) lalu jalankan ulang.
echo.
pause
exit /b 1
