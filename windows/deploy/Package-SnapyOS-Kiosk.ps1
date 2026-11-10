[CmdletBinding()]
param(
    [string]$Version = '0.1.0',
    [string]$Configuration = 'Release',
    [string]$Runtime = 'win-x64',
    [switch]$SelfContained
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deployRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $deployRoot)
$solution = Join-Path $repoRoot 'windows\SnapyOS.sln'
$payloadRoot = Join-Path $deployRoot 'payload'
$templatePath = Join-Path $deployRoot 'snapyos-install-manifest.template.json'
$manifestPath = Join-Path $deployRoot 'snapyos-install-manifest.json'

if ($env:OS -ne 'Windows_NT') { throw 'Packaging must run on Windows 10/11 x64 with the .NET 10 SDK.' }

dotnet restore $solution
if ($LASTEXITCODE -ne 0) { throw 'dotnet restore failed.' }
dotnet build $solution --configuration $Configuration --no-restore
if ($LASTEXITCODE -ne 0) { throw 'dotnet build failed.' }
dotnet test $solution --configuration $Configuration --no-build
if ($LASTEXITCODE -ne 0) { throw 'dotnet test failed.' }

if (Test-Path -LiteralPath $payloadRoot) { Remove-Item -LiteralPath $payloadRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $payloadRoot | Out-Null

$selfContainedValue = if ($SelfContained) { 'true' } else { 'false' }
foreach ($project in @('SnapyOS.Wpf\SnapyOS.Wpf.csproj', 'SnapyOS.Launcher\SnapyOS.Launcher.csproj')) {
    dotnet publish (Join-Path $repoRoot "windows\$project") `
        --configuration $Configuration `
        --runtime $Runtime `
        --self-contained $selfContainedValue `
        --output $payloadRoot `
        -p:DebugType=None -p:DebugSymbols=false
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed for $project." }
}

Copy-Item -LiteralPath (Join-Path $deployRoot 'snapyos-kiosk.json') -Destination $payloadRoot -Force

$files = Get-ChildItem -LiteralPath $payloadRoot -File -Recurse | ForEach-Object {
    [ordered]@{
        path = $_.FullName.Substring($payloadRoot.Length + 1).Replace('\', '/')
        size = $_.Length
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
} | Sort-Object { $_.path }

$manifest = Get-Content -Raw -LiteralPath $templatePath | ConvertFrom-Json
$manifest.version = $Version
$manifest.files = @($files)
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Output ("Payload: {0} files, {1:N0} bytes" -f $files.Count, ($files | Measure-Object -Property size -Sum).Sum)
Write-Output 'Manifest: snapyos-install-manifest.json updated.'

# Bundle the installer next to the payload so a target machine needs one extract, not a repo copy.
$windowsRoot = Split-Path -Parent $deployRoot
$zipName = "SnapyOS-Kiosk-win-x64-v$Version.zip"
$zipPath = Join-Path $windowsRoot $zipName
$bundleFiles = @(
    'Install-SnapyOS-Kiosk.ps1',
    'Package-SnapyOS-Kiosk.ps1',
    'Test-SnapyOS-Readiness.ps1',
    'README.md',
    'snapyos-install-manifest.template.json',
    'snapyos-install-manifest.json',
    'snapyos-kiosk.json'
)
$bundleRoot = Join-Path $deployRoot "bundle-$Version"
if (Test-Path -LiteralPath $bundleRoot) { Remove-Item -LiteralPath $bundleRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $bundleRoot | Out-Null
foreach ($name in $bundleFiles) {
    $source = Join-Path $deployRoot $name
    if (Test-Path -LiteralPath $source -PathType Leaf) { Copy-Item -LiteralPath $source -Destination $bundleRoot -Force }
}
Copy-Item -LiteralPath $payloadRoot -Destination (Join-Path $bundleRoot 'payload') -Recurse -Force
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($bundleRoot, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $false)
Remove-Item -LiteralPath $bundleRoot -Recurse -Force

$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output ("ZIP: windows\{0} ({1:N0} bytes)" -f $zipName, (Get-Item -LiteralPath $zipPath).Length)
Write-Output ("SHA256: {0}" -f $zipHash)
