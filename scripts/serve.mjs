#!/usr/bin/env node
/* Local server for AllinOneDesign outside claude.ai:
   - serves dist/ (the built app) at http://localhost:8787
   - forwards POST /v1/messages to the Anthropic Messages API, adding ANTHROPIC_API_KEY from the environment
     when the browser sent no key, so the key never has to be stored in the browser.
   Usage:  ANTHROPIC_API_KEY=sk-ant-…  npm run serve          (PORT=8787 by default)
   Then open http://localhost:8787 and set 로컬 AI 설정 → 프록시 서버 경유 → http://localhost:8787 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT || 8787);
const KEY = process.env.ANTHROPIC_API_KEY || '';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
  res.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS');
}

function proxy(req, res) {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const key = req.headers['x-api-key'] || KEY;
    if (!key) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'no API key: set ANTHROPIC_API_KEY for the server or enter one in the page' } })); return; }
    const up = https.request({ host: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': body.length, 'x-api-key': key, 'anthropic-version': req.headers['anthropic-version'] || '2023-06-01' } }, r => {
      res.writeHead(r.statusCode, { 'content-type': r.headers['content-type'] || 'application/json' });
      r.pipe(res);
    });
    up.on('error', e => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'upstream: ' + e.message } })); });
    up.end(body);
  });
}

function serveFile(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}

http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'POST' && req.url.replace(/\?.*$/, '') === '/v1/messages') return proxy(req, res);
  if (req.method === 'GET') return serveFile(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => {
  console.log(`AllinOneDesign: http://localhost:${PORT}  (API key: ${KEY ? 'from ANTHROPIC_API_KEY' : 'none on server — enter one in the page'})`);
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) console.log('dist/index.html not found — run `npm run build` first');
});
