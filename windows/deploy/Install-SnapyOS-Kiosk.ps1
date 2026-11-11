[CmdletBinding()]
param(
    [ValidateSet('Detect', 'Verify', 'Install', 'Upgrade', 'Uninstall', 'RollbackPrepare')]
    [string]$Action = 'Detect',
    [switch]$ApplyStartup,
    [string]$ManifestPath = "$PSScriptRoot/snapyos-install-manifest.json",
    [string]$DataRoot = "$env:LOCALAPPDATA\SnapyOS",
    [string]$InstallRoot = "$env:ProgramFiles\SnapyOS",
    [string]$ProgramDataRoot = "$env:ProgramData\SnapyOS",
    [switch]$WhatIf,
    [switch]$RemoveMedia,
    [switch]$ConfirmRemoveMedia
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:OperationId = "install_{0:yyyyMMddHHmmss}_{1}" -f (Get-Date), ([guid]::NewGuid().ToString('N').Substring(0, 8))
$script:LogRoot = Join-Path $ProgramDataRoot 'Installer\logs'
$script:BackupRoot = Join-Path $ProgramDataRoot 'Installer\backups'
$script:LockName = 'Global\SnapyOS.ManualInstaller'
$script:ManifestRoot = $null

function Write-InstallerLog {
    param([string]$Level, [string]$Message, [hashtable]$Data = @{})
    $safe = $Message -replace '(?i)(token|secret|password|pin|credential)[^,; ]*', '$1=[redacted]'
    $entry = [ordered]@{ timestamp = [DateTimeOffset]::UtcNow; operationId = $script:OperationId; level = $Level; message = $safe; data = $Data }
    if (-not $WhatIf) {
        New-Item -ItemType Directory -Force -Path $script:LogRoot | Out-Null
        Add-Content -LiteralPath (Join-Path $script:LogRoot "$($script:OperationId).jsonl") -Value ($entry | ConvertTo-Json -Compress)
    }
    Write-Verbose ($entry | ConvertTo-Json -Compress)
}

function Fail([string]$Message) { Write-InstallerLog 'error' $Message; throw $Message }
function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Fail 'Administrator elevation is required.' }
}
function Assert-Platform {
    if ($env:OS -ne 'Windows_NT') { Fail 'Windows 10/11 x64 is required.' }
    if ([Environment]::Is64BitOperatingSystem -ne $true -or [Environment]::Is64BitProcess -ne $true) { Fail 'x64 Windows is required.' }
    $build = [Environment]::OSVersion.Version.Build
    if ($build -lt 10240) { Fail "Windows 10 or newer is required. Build: $build" }
}
function Read-Manifest {
    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { Fail "Manifest not found: $ManifestPath" }
    try { $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json } catch { Fail 'Installer manifest is invalid JSON.' }
    if ($manifest.architecture -ne 'x64') { Fail 'Only x64 installer manifests are supported.' }
    if ($manifest.minWindowsVersion -and [Environment]::OSVersion.Version -lt [version]$manifest.minWindowsVersion) { Fail 'Windows version is below the manifest minimum.' }
    if ([string]::IsNullOrWhiteSpace($manifest.version)) { Fail 'Manifest version is required.' }
    if ([string]::IsNullOrWhiteSpace($manifest.payloadRoot)) { Fail 'Manifest payloadRoot is required.' }
    # Resolve through the PowerShell provider so relative paths use the caller's current directory.
    $manifestFullPath = (Resolve-Path -LiteralPath $ManifestPath).Path
    $script:ManifestRoot = Split-Path -Parent $manifestFullPath
    $manifest.payloadRoot = [IO.Path]::GetFullPath((Join-Path $script:ManifestRoot $manifest.payloadRoot))
    return $manifest
}
function Resolve-SafePath([string]$Root, [string]$Relative) {
    if ([string]::IsNullOrWhiteSpace($Relative) -or [IO.Path]::IsPathRooted($Relative) -or $Relative -match '(^|[\\/])\.\.([\\/]|$)') { Fail "Unsafe manifest path: $Relative" }
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $full = [IO.Path]::GetFullPath((Join-Path $rootFull $Relative))
    if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) { Fail "Manifest path escapes root: $Relative" }
    return $full
}
function Get-ManifestFiles($Manifest) {
    $manifestFiles = @($Manifest.files)
    if ($manifestFiles.Count -eq 0) { Fail 'Manifest files are required.' }
    $seen = @{}
    foreach ($file in $manifestFiles) {
        if ($seen.ContainsKey($file.path)) { Fail "Duplicate manifest path: $($file.path)" }
        $seen[$file.path] = $true
        if ($file.sha256 -notmatch '^[0-9a-fA-F]{64}$' -or [int64]$file.size -lt 0) { Fail "Invalid checksum or size: $($file.path)" }
        [pscustomobject]@{ Path = $file.path; Size = [int64]$file.size; Sha256 = $file.sha256.ToLowerInvariant() }
    }
}
function Test-Payload($Manifest, [string]$Root) {
    $files = @(Get-ManifestFiles $Manifest)
    foreach ($file in $files) {
        $path = Resolve-SafePath $Root $file.Path
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Fail "Payload file missing: $($file.Path)" }
        $item = Get-Item -LiteralPath $path
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { Fail "Reparse point is not allowed: $($file.Path)" }
        if ($item.Length -ne $file.Size) { Fail "Payload size mismatch: $($file.Path)" }
        $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -ne $file.Sha256) { Fail "Payload checksum mismatch: $($file.Path)" }
    }
    $expected = @($files.Path | ForEach-Object { [IO.Path]::GetFullPath((Resolve-SafePath $Root $_)) })
    $actual = @(Get-ChildItem -LiteralPath $Root -File -Recurse | Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } | ForEach-Object FullName)
    $extra = @($actual | Where-Object { $_ -notin $expected })
    if ($extra.Count -gt 0) { Fail "Unlisted payload file exists: $($extra[0])" }
    Write-InstallerLog 'info' 'Payload checksum manifest verified' @{ files = $files.Count }
}
function Acquire-Lock {
    $created = $false
    $mutex = [Threading.Mutex]::new($false, $script:LockName, [ref]$created)
    if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); Fail 'Another installer operation is running.' }
    return $mutex
}
function Stop-Processes {
    if ($WhatIf) { Write-InstallerLog 'info' 'Process stop planned'; return }
    foreach ($name in @('SnapyOS.Wpf', 'SnapyOS.Launcher', 'SnapyOS.Agent')) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
}
function Copy-IfExists([string]$Source, [string]$Destination) {
    if (Test-Path -LiteralPath $Source -PathType Leaf) { Copy-Item -LiteralPath $Source -Destination $Destination -Force }
}
function Backup-Data([string]$Destination) {
    if ($WhatIf) { Write-InstallerLog 'info' 'Local data backup planned' @{ path = $Destination }; return }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    foreach ($name in @('snapyos.db', 'snapyos.db-wal', 'snapyos.db-shm')) { Copy-IfExists (Join-Path $DataRoot $name) (Join-Path $Destination $name) }
    foreach ($name in @('configuration', 'secrets', 'device', 'media')) {
        $source = Join-Path $DataRoot $name
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $Destination $name) -Recurse -Force }
    }
    Write-InstallerLog 'info' 'Local data backup created' @{ path = $Destination }
}
function Export-AssociationState([string]$Destination, $Manifest) {
    if ($WhatIf) { Write-InstallerLog 'info' 'File association export planned' @{ path = (Join-Path $Destination 'file-associations.json') }; return }
    $associations = @($Manifest.fileAssociations)
    $export = [ordered]@{ format = 'snapyos.file-associations'; version = 1; productVersion = $Manifest.version; ownershipId = $Manifest.fileAssociationOwnershipId; associations = $associations; exportedAt = [DateTimeOffset]::UtcNow }
    $export | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $Destination 'file-associations.json') -Encoding UTF8
}
function Invoke-DatabaseMigration($Manifest) {
    $launcher = Join-Path $InstallRoot $Manifest.launcherRelativePath
    if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { Fail 'Launcher is required for database migration.' }
    $media = Join-Path $DataRoot 'media'
    New-Item -ItemType Directory -Force -Path $DataRoot, $media | Out-Null
    # Launcher resolves %LOCALAPPDATA%\SnapyOS itself; pass paths only when DataRoot is non-default.
    $migrationArgs = if ([IO.Path]::GetFullPath($DataRoot).TrimEnd('\') -ieq [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'SnapyOS')).TrimEnd('\')) {
        @('--migrate')
    } else {
        @('--migrate', (Join-Path $DataRoot 'snapyos.db'), $media)
    }
    $result = Start-Process -FilePath $launcher -ArgumentList $migrationArgs -Wait -PassThru -NoNewWindow -WorkingDirectory $InstallRoot
    if ($result.ExitCode -ne 0) { Fail "Database migration failed with exit code $($result.ExitCode)." }
    Write-InstallerLog 'info' 'Database migration completed' @{ schema = 'application-owned' }
}
function Register-Startup($Manifest) {
    $taskName = [string]$Manifest.startupTaskName
    if ([string]::IsNullOrWhiteSpace($taskName)) { Fail 'Startup task name is required.' }
    $launcher = Join-Path $InstallRoot $Manifest.launcherRelativePath
    $action = New-ScheduledTaskAction -Execute $launcher -Argument "`"$(Join-Path $InstallRoot $Manifest.launcherManifestRelativePath)`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    if ($WhatIf) { Write-InstallerLog 'info' 'Startup registration planned' @{ task = $taskName }; return }
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Description 'SnapyOS interactive kiosk launcher. Manual deployment only.' -Force | Out-Null
    Write-InstallerLog 'info' 'Startup registration applied' @{ task = $taskName }
}
function Unregister-Startup($Manifest) {
    if (-not $Manifest.startupTaskName) { return }
    if ($WhatIf) { Write-InstallerLog 'info' 'Startup removal planned' @{ task = $Manifest.startupTaskName }; return }
    Unregister-ScheduledTask -TaskName $Manifest.startupTaskName -Confirm:$false -ErrorAction SilentlyContinue
}
function Assert-ServiceContract($Manifest) {
    if ($Manifest.service -and $Manifest.service.enabled) {
        if (-not $Manifest.service.serviceAwareExecutable) { Fail 'Service registration refused: executable is not declared service-aware.' }
        if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot $Manifest.service.executableRelativePath) -PathType Leaf)) { Fail 'Service executable is missing.' }
    }
}
function Write-Marker([string]$Name, [hashtable]$Data) {
    if (-not $WhatIf) { New-Item -ItemType Directory -Force -Path $script:BackupRoot | Out-Null; $Data | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $script:BackupRoot $Name) -Encoding UTF8 }
}
function Verify-Installed($Manifest) {
    if (-not (Test-Path -LiteralPath $InstallRoot -PathType Container)) { Fail "Install root not found: $InstallRoot" }
    Test-Payload $Manifest $InstallRoot
    if (Test-Path -LiteralPath (Join-Path $DataRoot 'snapyos.db') -PathType Leaf) {
        Write-InstallerLog 'info' 'Installed database present' @{ path = (Join-Path $DataRoot 'snapyos.db') }
    }
    Write-Output ([ordered]@{ version = $Manifest.version; installRoot = $InstallRoot; dataRoot = $DataRoot; startupTask = $Manifest.startupTaskName; serviceEnabled = [bool]$Manifest.service.enabled } | ConvertTo-Json -Depth 8)
}
function Install-OrUpgrade($Manifest) {
    Assert-Administrator
    $source = [IO.Path]::GetFullPath($Manifest.payloadRoot)
    if (-not (Test-Path -LiteralPath $source -PathType Container)) { Fail "Payload root not found: $source" }
    Test-Payload $Manifest $source
    # A leftover empty install root from an interrupted run is not an installed product; remove it so Install can proceed.
    if ((Test-Path -LiteralPath $InstallRoot -PathType Container) -and -not (Get-ChildItem -LiteralPath $InstallRoot -Force | Select-Object -First 1)) { Remove-Item -LiteralPath $InstallRoot -Force }
    if ((Test-Path -LiteralPath $InstallRoot -PathType Container) -and $Action -eq 'Install') { Fail 'Install root already exists; use -Action Upgrade.' }
    Assert-ServiceContract $Manifest
    $backup = Join-Path $script:BackupRoot "$($Manifest.version)-$($script:OperationId)"
    if (-not $WhatIf) { New-Item -ItemType Directory -Force -Path $backup | Out-Null }
    Stop-Processes
    Backup-Data $backup
    Export-AssociationState $backup $Manifest
    $stage = "$InstallRoot.staging-$script:OperationId"
    if (-not $WhatIf) { if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }; New-Item -ItemType Directory -Force -Path $stage | Out-Null; Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $stage -Recurse -Force; Test-Payload $Manifest $stage }
    if ($Action -ne 'Detect' -and -not $WhatIf) {
        if (Test-Path $InstallRoot) { Rename-Item -LiteralPath $InstallRoot -NewName ((Split-Path $InstallRoot -Leaf) + ".previous-$script:OperationId") }
        Rename-Item -LiteralPath $stage -NewName (Split-Path $InstallRoot -Leaf)
        Invoke-DatabaseMigration $Manifest
        Register-Startup $Manifest
        Write-Marker "$script:OperationId.commit.json" @{ action = $Action; version = $Manifest.version; backup = $backup; mediaPreserved = $true; autoUpdate = $false }
    }
    Write-InstallerLog 'info' "$Action completed" @{ version = $Manifest.version; backup = $backup; mediaPreserved = $true }
}
function Uninstall-Application($Manifest) {
    Assert-Administrator
    if ($RemoveMedia -and -not $ConfirmRemoveMedia) { Fail 'Media deletion requires -ConfirmRemoveMedia.' }
    Stop-Processes
    Unregister-Startup $Manifest
    if (-not $WhatIf -and (Test-Path $InstallRoot)) { Remove-Item $InstallRoot -Recurse -Force }
    if ($RemoveMedia -and $ConfirmRemoveMedia -and -not $WhatIf) { Remove-Item (Join-Path $DataRoot 'media') -Recurse -Force -ErrorAction SilentlyContinue }
    Write-InstallerLog 'info' 'Uninstall completed; local data retained by default' @{ dataRoot = $DataRoot; mediaRemoved = [bool]($RemoveMedia -and $ConfirmRemoveMedia) }
}

Assert-Platform
$manifest = Read-Manifest
$mutex = Acquire-Lock
try {
    if ($ApplyStartup) { $Action = 'Install' }
    switch ($Action) {
        'Detect' { Write-Output ([ordered]@{ os = [Environment]::OSVersion.Version.ToString(); architecture = 'x64'; version = $manifest.version; payloadRoot = $manifest.payloadRoot; startupTask = $manifest.startupTaskName; serviceEnabled = [bool]$manifest.service.enabled } | ConvertTo-Json -Depth 8) }
        'Verify' { Test-Payload $manifest ([IO.Path]::GetFullPath($manifest.payloadRoot)); if ((Test-Path -LiteralPath $InstallRoot -PathType Container) -and (Get-ChildItem -LiteralPath $InstallRoot -Force | Select-Object -First 1)) { Verify-Installed $manifest } else { Write-Output ([ordered]@{ version = $manifest.version; payloadVerified = $true; installed = $false; installRoot = $InstallRoot } | ConvertTo-Json -Depth 8) } }
        'Install' { Install-OrUpgrade $manifest }
        'Upgrade' { Install-OrUpgrade $manifest }
        'RollbackPrepare' { Assert-Administrator; Write-Marker "$script:OperationId.rollback.json" @{ action = 'RollbackPrepare'; installRoot = $InstallRoot; dataRoot = $DataRoot; autoUpdate = $false }; Write-InstallerLog 'info' 'Rollback preparation recorded' }
        'Uninstall' { Uninstall-Application $manifest }
    }
} finally { if ($mutex) { $mutex.ReleaseMutex(); $mutex.Dispose() } }
