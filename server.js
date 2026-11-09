#!/usr/bin/env node
// LLM PlayGround – zero-dependency static server + pass-through proxy.
//
// The browser talks to /api/*, and this server forwards each request to the
// endpoint chosen in the UI, sent as the X-Upstream-Base header (e.g.
// https://router.requesty.ai/v1). Going through a local proxy avoids CORS
// problems and lets binary bodies (audio uploads, TTS audio) pass through
// untouched.
//
// The API key is entered in the UI and sent per request in the
// Authorization header. The server never stores it. You can also set a key
// per provider (REQUESTY_API_KEY, OPENROUTER_API_KEY, LLMGATEWAY_API_KEY), in the
// environment or in a .env file next to this one. It is used when the browser
// sends no key, and only for that provider's own domain.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// .env next to this file (KEY=value lines, as in .env.example), so `node server.js` picks up the
// same keys `docker compose` does. Variables already set in the environment win.
{
  let text = '';
  try { text = fs.readFileSync(path.join(__dirname, '.env'), 'utf8'); } catch { /* no .env: fine */ }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || Object.hasOwn(process.env, m[1])) continue;
    let value = m[2];
    const quoted = value.match(/^(["'])(.*)\1$/);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, '');
    process.env[m[1]] = value;
  }
}

// Some hosts (iisnode, Passenger) pass a pipe or socket path instead of a port number.
const PORT = process.env.PORT || 3000;
const IS_TCP_PORT = /^\d+$/.test(String(PORT));
const HOST = process.env.HOST || '127.0.0.1';
// Server-side keys per provider, from the same public/providers/<id>.json files the page uses:
// keyEnv names the env var, server.domain the only hosts the key is ever sent to. Providers
// without a server.domain (e.g. custom) get no server key.
const PROVIDERS = {};
{
  const dir = path.join(__dirname, 'public', 'providers');
  const { providers: ids } = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  for (const id of ids) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
    if (p.server?.domain && p.keyEnv) PROVIDERS[id] = { domain: p.server.domain, envVar: p.keyEnv };
  }
}
for (const p of Object.values(PROVIDERS)) p.key = process.env[p.envVar] || '';
const onDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);
// The UI can point at any URL (a custom or local endpoint). On a public server that would let
// anyone use this proxy to reach other hosts, so other URLs are only allowed when listening on
// a loopback address, unless ALLOW_ANY_UPSTREAM says otherwise.
const IS_LOOPBACK = IS_TCP_PORT && ['127.0.0.1', 'localhost', '::1'].includes(HOST);
const ALLOW_ANY_UPSTREAM = process.env.ALLOW_ANY_UPSTREAM
  ? /^(1|true|yes)$/i.test(process.env.ALLOW_ANY_UPSTREAM)
  : IS_LOOPBACK;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.json': 'application/json; charset=utf-8',
};

// Request headers we pass on upstream.
const FORWARD_REQ_HEADERS = ['authorization', 'content-type', 'accept', 'http-referer', 'x-title'];
// Response headers we drop (Node recomputes these, or fetch already decoded the body).
const DROP_RES_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection']);
// Transcription uploads can be up to 32 MB; leave room for the multipart overhead.
const MAX_BODY_BYTES = 40 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        // Stop buffering but keep draining, so the 413 response can still reach the client.
        req.removeAllListeners('data');
        req.resume();
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendError(res, status, message) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message } }));
}

async function proxy(req, res) {
  let base;
  try {
    base = new URL(String(req.headers['x-upstream-base'] || ''));
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('bad protocol');
  } catch {
    sendError(res, 400, 'Set a base URL that starts with http:// or https://.');
    return;
  }
  const known = Object.values(PROVIDERS).some((p) => onDomain(base.hostname, p.domain));
  if (!known && !ALLOW_ANY_UPSTREAM) {
    sendError(res, 403, `This server only proxies to known providers. Set ALLOW_ANY_UPSTREAM=1 on the server to allow ${base.origin}.`);
    return;
  }
  const target = base.href.replace(/\/+$/, '') + req.url.slice('/api'.length);
  const headers = {};
  for (const h of FORWARD_REQ_HEADERS) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }
  const provider = Object.hasOwn(PROVIDERS, req.headers['x-upstream-provider']) ? PROVIDERS[req.headers['x-upstream-provider']] : null;
  if (!headers.authorization && provider?.key && base.protocol === 'https:' && onDomain(base.hostname, provider.domain)) {
    headers.authorization = `Bearer ${provider.key}`;
  }
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  headers['http-referer'] ||= `${proto}://${req.headers.host || `${HOST}:${PORT}`}`;
  headers['x-title'] ||= 'LLM PlayGround';

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const started = Date.now();
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await readBody(req) : undefined,
    });
    const outHeaders = {};
    upstream.headers.forEach((v, k) => {
      if (!DROP_RES_HEADERS.has(k)) outHeaders[k] = v;
    });
    outHeaders['x-tester-upstream-url'] = target;
    outHeaders['x-tester-upstream-ms'] = String(Date.now() - started);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, outHeaders);
    res.end(buf);
    console.log(`${req.method} ${target} -> ${upstream.status} (${Date.now() - started} ms)`);
  } catch (err) {
    if (err.status === 413) {
      console.warn(`${req.method} ${target} rejected: ${err.message}`);
      res.writeHead(413, { 'content-type': 'application/json', connection: 'close' });
      res.end(JSON.stringify({ error: { message: `Request body is larger than ${MAX_BODY_BYTES / 1024 / 1024} MB` } }));
      return;
    }
    console.error(`${req.method} ${target} failed:`, err);
    sendError(res, 502, `Proxy could not reach ${target}: ${err.message}`);
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    if (req.url === '/config') {
      res.writeHead(200, { 'content-type': 'application/json' });
      const providers = Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, { hasEnvKey: Boolean(p.key) }]));
      res.end(JSON.stringify({ providers, allowAnyUpstream: ALLOW_ANY_UPSTREAM }));
    } else if (req.url.startsWith('/api/')) {
      proxy(req, res);
    } else {
      serveStatic(req, res);
    }
  })
  .listen(...(IS_TCP_PORT ? [Number(PORT), HOST] : [PORT]), () => {
    console.log(`LLM PlayGround running at ${IS_TCP_PORT ? `http://${HOST}:${PORT}` : PORT}`);
    const keys = Object.values(PROVIDERS).filter((p) => p.key).map((p) => p.envVar);
    console.log(`Proxying /api/* to the endpoint chosen in the UI${ALLOW_ANY_UPSTREAM ? '' : ' (known providers only)'}${keys.length ? `. Server keys: ${keys.join(', ')}` : ''}`);
  });
