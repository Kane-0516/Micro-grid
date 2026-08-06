$ErrorActionPreference = 'Stop'
$homer = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent
$learn = Split-Path (Split-Path (Split-Path $homer -Parent) -Parent) -Parent
Set-Location $learn

$recoverDir = Join-Path $env:TEMP 'microgrid-recover'
New-Item -ItemType Directory -Force -Path $recoverDir | Out-Null

$clientSrc = Join-Path $homer '__codex_upload_tmp__\frontend_client.ts'
$clientDst = Join-Path $recoverDir 'client.ts'
Copy-Item $clientSrc $clientDst -Force

$relPrefix = (Resolve-Path $homer).Path.Substring($learn.Length + 1).Replace('\', '/')
git show "HEAD:${relPrefix}/backend/app/routers/product_admin.py" | Out-File -FilePath (Join-Path $recoverDir 'product_admin.py') -Encoding utf8

Copy-Item (Join-Path $homer 'frontend\src\product-admin-main.tsx') (Join-Path $recoverDir 'product-config-main.tsx') -Force

$frontendDir = Join-Path $homer 'frontend'
$startCmd = @"
@echo off
set HOST=0.0.0.0
set PORT=5173
set API_HOST=0.0.0.0
set API_PORT=6001
set CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://192.168.40.31:5173
cd /d "$frontendDir"
start "" /b cmd /c "cd /d `"$homer`" && call start-backend.cmd"
call npm run dev -- --host 0.0.0.0 --port 5173 --open /product-config.html
"@
Set-Content -Path (Join-Path $recoverDir 'start-product-config.cmd') -Value $startCmd -Encoding Ascii

$apiMjs = @'
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(root, '../backend');
const frontendDir = path.resolve(root, '../frontend');
const apiPort = Number(process.env.PRODUCT_ADMIN_API_PORT || 6001);
const frontendPort = Number(process.env.PRODUCT_ADMIN_FRONTEND_PORT || 5173);
const launcherPort = Number(process.env.PRODUCT_ADMIN_LAUNCHER_PORT || 6011);

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}

function proxyRequest(clientReq, clientRes, targetPort) {
  const proxy = http.request(
    {
      hostname: '127.0.0.1',
      port: targetPort,
      path: clientReq.url,
      method: clientReq.method,
      headers: clientReq.headers,
    },
    (upstreamRes) => {
      clientRes.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    },
  );
  proxy.on('error', () => {
    clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    clientRes.end(`Upstream on port ${targetPort} is unavailable.`);
  });
  clientReq.pipe(proxy);
}

function serveStatic(urlPath, clientRes) {
  const distRoot = path.join(frontendDir, 'dist');
  const candidates = [
    path.join(distRoot, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '')),
    path.join(distRoot, 'index.html'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      clientRes.writeHead(200, { 'content-type': contentType(candidate) });
      createReadStream(candidate).pipe(clientRes);
      return true;
    }
  }
  return false;
}

const backend = spawn(
  process.env.PYTHON || 'python',
  ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', String(apiPort), '--app-dir', backendDir],
  { cwd: backendDir, stdio: 'inherit', shell: true },
);

const frontend = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'dev', '--', '--host', '0.0.0.0', '--port', String(frontendPort), '--open', '/product-config.html'],
  { cwd: frontendDir, stdio: 'inherit', shell: true },
);

function shutdown(code = 0) {
  backend.kill('SIGTERM');
  frontend.kill('SIGTERM');
  process.exit(code);
}

backend.on('exit', (code) => shutdown(code ?? 0));
frontend.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (req.url.startsWith('/api/')) {
    proxyRequest(req, res, apiPort);
    return;
  }
  if (serveStatic(req.url, res)) {
    return;
  }
  proxyRequest(req, res, frontendPort);
});

server.listen(launcherPort, '127.0.0.1', () => {
  console.log(`product-admin-api launcher on http://127.0.0.1:${launcherPort}`);
  console.log(`backend api on http://127.0.0.1:${apiPort}`);
  console.log(`frontend dev on http://127.0.0.1:${frontendPort}`);
});
'@
Set-Content -Path (Join-Path $recoverDir 'product-admin-api.mjs') -Value $apiMjs -Encoding UTF8

$map = @{
  "$relPrefix/backend/app/routers/product_admin.py" = Join-Path $recoverDir 'product_admin.py'
  "$relPrefix/frontend/src/api/client.ts" = Join-Path $recoverDir 'client.ts'
  "$relPrefix/frontend/src/product-config-main.tsx" = Join-Path $recoverDir 'product-config-main.tsx'
  "$relPrefix/start-product-config.cmd" = Join-Path $recoverDir 'start-product-config.cmd'
  "$relPrefix/tools/product-admin-api.mjs" = Join-Path $recoverDir 'product-admin-api.mjs'
}

foreach ($entry in $map.GetEnumerator()) {
  $blob = git hash-object -w $entry.Value
  git update-index --add --cacheinfo "100644,$blob,$($entry.Key)"
  Write-Output "indexed $($entry.Key) -> $blob ($((Get-Item $entry.Value).Length) bytes)"
}

git diff --cached --stat -- @($map.Keys)
