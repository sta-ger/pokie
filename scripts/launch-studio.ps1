$ErrorActionPreference = 'Stop'
$Version = if ($env:POKIE_NODE_VERSION) { $env:POKIE_NODE_VERSION } else { '22.12.0' }
$Root = Split-Path -Parent $PSScriptRoot
$CacheRoot = if ($env:POKIE_RUNTIME_DIR) { $env:POKIE_RUNTIME_DIR } else { Join-Path $env:LOCALAPPDATA 'POKIE\runtime' }
$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } elseif ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }

function Test-AdequateNode([string]$NodePath) {
    if (-not (Test-Path $NodePath)) { return $false }
    try {
        & $NodePath -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' 2>$null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

$SystemNode = Get-Command node -ErrorAction SilentlyContinue
if ($SystemNode -and (Test-AdequateNode $SystemNode.Source)) {
    & $SystemNode.Source (Join-Path $Root 'scripts\start-studio.mjs') @args
    exit $LASTEXITCODE
}

$Archive = "node-v$Version-win-$Arch.zip"
$NodeDir = Join-Path $CacheRoot "node-v$Version-win-$Arch"
$NodeExe = Join-Path $NodeDir 'node.exe'
if (-not (Test-AdequateNode $NodeExe)) {
    New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null
    $ArchivePath = Join-Path $CacheRoot ".poke-node-$([Guid]::NewGuid().ToString('N')).zip"
    $SumsPath = Join-Path $CacheRoot ".poke-node-sums.txt"
    try {
        Write-Host "POKIE Studio: a suitable Node.js was not found."
        Write-Host "Downloading pinned Node.js $Version for win-$Arch into $CacheRoot ..."
        $BaseUrl = "https://nodejs.org/dist/v$Version"
        Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/$Archive" -OutFile $ArchivePath
        Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/SHASUMS256.txt" -OutFile $SumsPath
        $ExpectedLine = Get-Content $SumsPath | Where-Object { ($_ -split '\s+')[1] -eq $Archive } | Select-Object -First 1
        if (-not $ExpectedLine) { throw "The Node.js checksum list does not contain $Archive; refusing to install it." }
        $Expected = ($ExpectedLine.Trim() -split '\s+')[0]
        $Actual = (Get-FileHash -Algorithm SHA256 -Path $ArchivePath).Hash.ToLowerInvariant()
        if ($Expected.ToLowerInvariant() -ne $Actual) { throw "The downloaded Node.js archive failed SHA-256 verification; refusing to install it." }
        Expand-Archive -Path $ArchivePath -DestinationPath $CacheRoot -Force
    } finally {
        Remove-Item -Force -ErrorAction SilentlyContinue $ArchivePath, $SumsPath
    }
}

if (-not (Test-AdequateNode $NodeExe)) {
    throw "The portable Node.js runtime at $NodeExe is not usable. Delete $NodeDir and try again, or install Node.js 22.12+ from https://nodejs.org/."
}
$NodeDir = Split-Path -Parent $NodeExe
$env:PATH = "$NodeDir;$env:PATH"
& $NodeExe (Join-Path $Root 'scripts\start-studio.mjs') @args
exit $LASTEXITCODE
