#!/usr/bin/env node
/* Local server for AllinOneDesign outside claude.ai:
   - serves dist/ (the built app) at http://localhost:8787
   - POST /v1/messages (Anthropic Messages shape, what the page speaks) goes to one of two backends:
       anthropic (default): forwarded to api.anthropic.com, adding ANTHROPIC_API_KEY from the environment when the
                            browser sent no key, so the key never has to be stored in the browser.
       copilot:             answered by GitHub Copilot through the Copilot SDK (@github/copilot-sdk) driving the
                            GitHub Copilot CLI (`copilot`) that is logged in on this machine. The page's tool calls
                            (console commands) are relayed: Copilot asks for a tool → the page runs it → result goes back.
   - GET /v1/backend tells the page which backend is active.
   Usage:
     ANTHROPIC_API_KEY=sk-ant-…  npm run serve                 (PORT=8787 by default)
     npm run serve -- --copilot      or   AI_BACKEND=copilot npm run serve
        needs: `npm i` (installs @github/copilot-sdk, which bundles the Copilot runtime) and a GitHub login with Copilot:
               `gh auth login`, or `copilot` → /login (npm i -g @github/copilot), or COPILOT_GITHUB_TOKEN / GH_TOKEN env.
        COPILOT_MODEL=claude-sonnet-4.5 (optional) picks the Copilot model; otherwise the CLI default.
   Then open http://localhost:8787 and set 로컬 AI 설정 → 프록시 서버 경유 → http://localhost:8787 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT || 8787);
const KEY = process.env.ANTHROPIC_API_KEY || '';
const BACKEND = (process.argv.includes('--copilot') || process.env.AI_BACKEND === 'copilot') ? 'copilot' : 'anthropic';
const COPILOT_MODEL = process.env.COPILOT_MODEL || '';
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
    let body = Buffer.concat(chunks);
    try { const j = JSON.parse(body.toString('utf8')); if ('copilot_run' in j) { delete j.copilot_run; body = Buffer.from(JSON.stringify(j)); } } catch (e) {}
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

/* ---------- GitHub Copilot backend ---------- */
let CP = null;            // { client, sdk }
const RUNS = new Map();   // run id → { session, pending, queue, waiters, text, model, n }
async function copilotClient() {
  if (CP) return CP;
  let sdk;
  try { sdk = await import(process.env.COPILOT_SDK || '@github/copilot-sdk'); }
  catch (e) { throw new Error('@github/copilot-sdk 가 없습니다: 소스 폴더에서 `npm i` (또는 `npm i @github/copilot-sdk`) (' + e.message + ')'); }
  const tok = process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const client = new sdk.CopilotClient({ logLevel: 'error', cwd: ROOT, cliPath: process.env.COPILOT_CLI || undefined, gitHubToken: tok || undefined });
  await client.start();
  CP = { client, sdk };
  return CP;
}
function emit(run, o) { const w = run.waiters.shift(); if (w) w(o); else run.queue.push(o); }
function nextOutcome(run, ms = 10 * 60 * 1000) {
  if (run.queue.length) return Promise.resolve(run.queue.shift());
  return new Promise(res => { const t = setTimeout(() => res({ kind: 'error', message: 'Copilot 응답 대기 시간 초과' }), ms); run.waiters.push(o => { clearTimeout(t); res(o); }); });
}
function pickModel(m) { if (COPILOT_MODEL) return COPILOT_MODEL; if (!m || /^claude-[a-z]+-\d+-\d+$/.test(m)) return undefined; return m; }
function flatten(messages) {
  return messages.map(m => { const c = m.content; const t = typeof c === 'string' ? c : (c || []).filter(x => x.type === 'text').map(x => x.text).join('\n'); return m.role === 'assistant' ? '(assistant) ' + t : t; }).filter(Boolean).join('\n\n');
}
const AUTH_RE = /OAuth token|HMAC|unauthori[sz]ed|\b401\b|not logged|login/i;
function cpError(m) { m = String(m || ''); const auth = AUTH_RE.test(m); return { status: auth ? 401 : 502, body: { error: { type: 'copilot_error', message: auth ? 'GitHub Copilot 로그인이 필요합니다: `gh auth login` 또는 `copilot` → /login, 또는 COPILOT_GITHUB_TOKEN 환경변수 (' + m + ')' : m } } }; }
async function endRun(run) { RUNS.delete(run.id); try { await run.session.destroy(); } catch (e) {} }
async function finish(run, o) {
  if (o.kind === 'tool') { run.n++; return { status: 200, body: { id: 'msg_' + run.id, type: 'message', role: 'assistant', model: run.model, stop_reason: 'tool_use', copilot_run: run.id,
    content: [...(o.text ? [{ type: 'text', text: o.text }] : []), { type: 'tool_use', id: 'tu_' + run.id + '_' + run.n, name: o.name, input: o.input }] } }; }
  await endRun(run);
  if (o.kind === 'error') return cpError(o.message);
  return { status: 200, body: { id: 'msg_' + run.id, type: 'message', role: 'assistant', model: run.model, stop_reason: 'end_turn', content: [{ type: 'text', text: run.text || '' }] } };
}
async function copilotTurn(body) {
  const last = body.messages[body.messages.length - 1] || {};
  const tr = Array.isArray(last.content) ? last.content.find(c => c.type === 'tool_result') : null;
  if (body.copilot_run && RUNS.has(body.copilot_run) && tr) {                    // the page ran the tool → hand the result back
    const run = RUNS.get(body.copilot_run); const outcome = nextOutcome(run);
    if (run.pending) { const p = run.pending; run.pending = null; const txt = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content); p.resolve(tr.is_error ? { textResultForLlm: txt, resultType: 'failure', error: txt } : txt); }
    return finish(run, await outcome);
  }
  const { client, sdk } = await copilotClient();
  const run = { id: crypto.randomUUID().slice(0, 8), session: null, pending: null, queue: [], waiters: [], text: '', model: '', n: 0 };
  const tools = (body.tools || []).filter(t => t.name && !t.type).map(t => sdk.defineTool(t.name, { description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} },
    handler: async (args) => new Promise((resolve, reject) => { run.pending = { resolve, reject }; emit(run, { kind: 'tool', name: t.name, input: args, text: run.text }); run.text = ''; }) }));
  const model = pickModel(body.model);
  run.session = await client.createSession({ model, streaming: false, tools, availableTools: tools.map(t => t.name), onPermissionRequest: sdk.approveAll,
    systemMessage: { mode: 'append', content: 'You are embedded in an electronics design tool (AllinOneDesign). Answer in the language of the user. Use ONLY the tools given in this session (they run console commands in the page); never run shell commands, read or edit files, or browse. When asked for JSON, reply with the JSON object only.' } });
  run.model = (model || 'copilot');
  run.session.on(ev => { const t = ev.type; const d = ev.data || {};
    if (t === 'assistant.message') run.text = d.content || run.text;
    else if (t === 'session.idle') emit(run, { kind: 'done' });
    else if (t === 'session.error') emit(run, { kind: 'error', message: d.message || 'Copilot 오류' }); });
  RUNS.set(run.id, run);
  const outcome = nextOutcome(run);
  run.session.send({ prompt: flatten(body.messages) }).catch(e => emit(run, { kind: 'error', message: e.message || String(e) }));
  return finish(run, await outcome);
}
function copilotProxy(req, res) {
  const chunks = []; req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { res.writeHead(400); res.end('bad json'); return; }
    try { const r = await copilotTurn(body); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(r.body)); }
    catch (e) { const r = cpError(e.message || String(e)); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(r.body)); }
  });
}
function backendInfo(res) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ backend: BACKEND, model: BACKEND === 'copilot' ? (COPILOT_MODEL || 'copilot 기본') : 'api.anthropic.com', key: BACKEND === 'anthropic' ? !!KEY : undefined, sdk: BACKEND === 'copilot' ? !!CP : undefined })); }

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
  const u = req.url.replace(/\?.*$/, '');
  if (req.method === 'POST' && u === '/v1/messages') return BACKEND === 'copilot' ? copilotProxy(req, res) : proxy(req, res);
  if (req.method === 'GET' && u === '/v1/backend') return backendInfo(res);
  if (req.method === 'GET') return serveFile(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => {
  console.log(`AllinOneDesign: http://localhost:${PORT}  backend: ${BACKEND === 'copilot' ? 'GitHub Copilot (CLI via SDK)' + (COPILOT_MODEL ? ' model ' + COPILOT_MODEL : '') : 'Anthropic API (key: ' + (KEY ? 'from ANTHROPIC_API_KEY' : 'none on server — enter one in the page') + ')'}`);
  if (BACKEND === 'copilot') copilotClient().then(() => console.log('Copilot CLI connected')).catch(e => console.log('Copilot: ' + e.message));
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) console.log('dist/index.html not found — run `npm run build` first');
});
