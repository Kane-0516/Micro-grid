param(
    [ValidateSet("us", "cn")]
    [string]$Region = "us",

    [switch]$PullLatest
)

$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PeliasDockerRoot = Join-Path $RepoRoot ".tools\pelias-docker"
$SourceProjectDir = Join-Path $PeliasDockerRoot "projects\portland-metro"
$ProjectName = "microgrid-$Region"
$ProjectDir = Join-Path $PeliasDockerRoot "projects\$ProjectName"
$TemplateJson = Join-Path $PSScriptRoot "pelias.$Region.json"
$DataDir = Join-Path $RepoRoot ".tools\pelias-data\$Region"

function Convert-ToWslPath {
    param([string]$WindowsPath)

    $resolved = [System.IO.Path]::GetFullPath($WindowsPath)
    $drive = $resolved.Substring(0, 1).ToLowerInvariant()
    $suffix = $resolved.Substring(2).Replace("\", "/")
    return "/mnt/$drive$suffix"
}

Require-Command git
Require-Command docker
Require-Command wsl

Write-Host "[Check] Verifying Docker Desktop is reachable..."
docker info | Out-Null

if (-not (Test-Path $PeliasDockerRoot)) {
    Write-Host "[Setup] Cloning pelias/docker..."
    git clone https://github.com/pelias/docker.git $PeliasDockerRoot
} elseif ($PullLatest) {
    Write-Host "[Setup] Updating pelias/docker..."
    git -C $PeliasDockerRoot pull --ff-only
}

if (-not (Test-Path $SourceProjectDir)) {
    throw "Expected Pelias example project not found: $SourceProjectDir"
}

if (-not (Test-Path $TemplateJson)) {
    throw "Missing template config: $TemplateJson"
}

Write-Host "[Setup] Creating local data directory..."
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path $ProjectDir | Out-Null

Write-Host "[Setup] Copying base Pelias project files..."
Copy-Item (Join-Path $SourceProjectDir "docker-compose.yml") (Join-Path $ProjectDir "docker-compose.yml") -Force
Copy-Item $TemplateJson (Join-Path $ProjectDir "pelias.json") -Force

$LinuxDataDir = Convert-ToWslPath $DataDir
$EnvLines = @(
    "DOCKER_USER=pelias",
    "COMPOSE_PROJECT_NAME=pelias_microgrid_$Region",
    "DATA_DIR=$LinuxDataDir"
)

[System.IO.File]::WriteAllText(
    (Join-Path $ProjectDir ".env"),
    ($EnvLines -join "`n"),
    (New-Object System.Text.UTF8Encoding($false))
)

$LinuxProjectDir = Convert-ToWslPath $ProjectDir
$LinuxRepoRoot = Convert-ToWslPath $RepoRoot
$RunScript = if ($Region -eq "us") { "run-import-us.sh" } else { "run-import-cn.sh" }

Write-Host ""
Write-Host "[Done] Pelias project prepared:"
Write-Host "       Windows: $ProjectDir"
Write-Host "       WSL    : $LinuxProjectDir"
Write-Host ""
Write-Host "Next step:"
Write-Host "  bash $LinuxRepoRoot/pelias/$RunScript"
Write-Host ""
Write-Host "When Pelias is ready on http://localhost:4000, run:"
Write-Host "  .\start-all.bat"

