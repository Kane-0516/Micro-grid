$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$deployDir = Join-Path $root 'deploy'
$peliasBase = 'http://localhost:4000'
$backendPort = 6001
$frontendPort = 5173
$localAccessIp = '192.168.40.31'

$backendLogOut = Join-Path $backendDir 'server-start.out.log'
$backendLogErr = Join-Path $backendDir 'server-start.err.log'
$frontendLogOut = Join-Path $frontendDir 'frontend-proxy.out.log'
$frontendLogErr = Join-Path $frontendDir 'frontend-proxy.err.log'

if (-not (Test-Path $backendDir)) { throw "Backend directory not found: $backendDir" }
if (-not (Test-Path $frontendDir)) { throw "Frontend directory not found: $frontendDir" }

Write-Host "[Setup] Writing frontend geocoder env..."
'VITE_GEOCODER_URL=/api/geocode?limit=1' | Set-Content -Path (Join-Path $frontendDir '.env.local') -Encoding UTF8

function Test-Pelias {
  try {
    Invoke-WebRequest -UseBasicParsing "$peliasBase/v1/search?text=test&size=1" -TimeoutSec 5 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Pelias)) {
  Write-Host "[Pelias] Not responding. Starting Pelias via docker compose..."
  $composeFile = Join-Path $deployDir 'docker-compose.pelias.yml'
  $peliasEnv = Join-Path $deployDir '.env.pelias'
  $compose = Start-Process -FilePath 'docker' -ArgumentList @('compose', '--env-file', $peliasEnv, '-f', $composeFile, 'up', '-d') -WorkingDirectory $root -NoNewWindow -PassThru -Wait
  if ($compose.ExitCode -ne 0) {
    throw "Failed to start Pelias. Check Docker Desktop and compose logs."
  }

  Write-Host "[Pelias] Waiting for API to become available..."
  $ready = $false
  for ($i = 0; $i -lt 90; $i++) {
    if (Test-Pelias) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 2
  }
  if ($ready) {
    Write-Host "[Pelias] API is responding."
  } else {
    Write-Host "[Warning] Pelias did not respond within the wait window."
  }
} else {
  Write-Host "[Pelias] Already responding."
}

Write-Host "[Startup] Backend log: $backendLogOut"
Write-Host "[Startup] Frontend static build will be served by backend on port $backendPort."
Write-Host "[Startup] Launching backend in background..."

$backendEnv = @{
  API_HOST = '0.0.0.0'
  API_PORT = "$backendPort"
  CORS_ORIGINS = "http://localhost:$frontendPort,http://127.0.0.1:$frontendPort,http://$localAccessIp`:$frontendPort,http://localhost:4173,http://127.0.0.1:4173,http://$localAccessIp`:4173,http://localhost:3000,http://127.0.0.1:3000,http://$localAccessIp`:3000"
  GEOCODER_DEFAULT_REGION = 'us'
  GEOCODER_API_URL = "$peliasBase/v1/search"
  GEOCODER_REVERSE_API_URL = "$peliasBase/v1/reverse"
  GEOCODER_API_URL_CN = "$peliasBase/v1/search"
  GEOCODER_REVERSE_API_URL_CN = "$peliasBase/v1/reverse"
  GEOCODER_API_URL_US = "$peliasBase/v1/search"
  GEOCODER_REVERSE_API_URL_US = "$peliasBase/v1/reverse"
}

$pythonExe = 'C:\Users\1\AppData\Local\Programs\Python\Python313\pythonw.exe'

$backendLauncher = Join-Path $root 'start-backend.cmd'
$backendLauncherContent = @"
@echo off
set API_HOST=$($backendEnv.API_HOST)
set API_PORT=$($backendEnv.API_PORT)
set CORS_ORIGINS=$($backendEnv.CORS_ORIGINS)
set GEOCODER_DEFAULT_REGION=$($backendEnv.GEOCODER_DEFAULT_REGION)
set GEOCODER_API_URL=$($backendEnv.GEOCODER_API_URL)
set GEOCODER_REVERSE_API_URL=$($backendEnv.GEOCODER_REVERSE_API_URL)
set GEOCODER_API_URL_CN=$($backendEnv.GEOCODER_API_URL_CN)
set GEOCODER_REVERSE_API_URL_CN=$($backendEnv.GEOCODER_REVERSE_API_URL_CN)
set GEOCODER_API_URL_US=$($backendEnv.GEOCODER_API_URL_US)
set GEOCODER_REVERSE_API_URL_US=$($backendEnv.GEOCODER_REVERSE_API_URL_US)
set PYTHONUNBUFFERED=1
cd /d "$backendDir"
"$pythonExe" -m uvicorn app.main:app --host $($backendEnv.API_HOST) --port $($backendEnv.API_PORT) --app-dir "$backendDir" > "$backendLogOut" 2> "$backendLogErr"
"@

Set-Content -Path $backendLauncher -Value $backendLauncherContent -Encoding ASCII

$backendPsi = New-Object System.Diagnostics.ProcessStartInfo
$backendPsi.FileName = 'C:\Windows\System32\cmd.exe'
$backendPsi.Arguments = '/c start "" /b "' + $backendLauncher + '"'
$backendPsi.WorkingDirectory = $root
$backendPsi.UseShellExecute = $false
[void][System.Diagnostics.Process]::Start($backendPsi)

Write-Host ""
Write-Host "Backend  : http://localhost:$backendPort/docs"
Write-Host "Backend  : http://$localAccessIp`:$backendPort/docs"
Write-Host "Frontend : http://localhost:$backendPort/"
Write-Host "Frontend : http://$localAccessIp`:$backendPort/"
Write-Host ""
Write-Host "[Check] Waiting for backend health..."

$apiReady = $false
for ($i = 0; $i -lt 45; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$backendPort/api/health" -TimeoutSec 3 | Out-Null
    $apiReady = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}

if ($apiReady) {
  Write-Host "[Check] Backend is responding."
} else {
  Write-Host "[Warning] Backend did not respond within the wait window."
}

Write-Host ""
Write-Host "[Done] Services are starting in the background."
Write-Host "        Frontend: http://localhost:$backendPort/"
Write-Host "        Backend : http://localhost:$backendPort/docs"
