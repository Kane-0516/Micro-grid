import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(root, '../backend');
const port = Number(process.env.PRODUCT_ADMIN_API_PORT || 6001);

const child = spawn(
  process.env.PYTHON || 'python',
  ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', String(port), '--app-dir', backendDir],
  { cwd: backendDir, stdio: 'inherit', shell: true },
);

child.on('exit', (code) => process.exit(code ?? 0));

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('product-admin-api launcher running');
});

server.listen(Number(process.env.PRODUCT_ADMIN_LAUNCHER_PORT || 6011));
