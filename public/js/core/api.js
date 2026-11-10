/* LLM PlayGround: sending requests: the key rule (keyReady), callApi, error text and cURL. */
import { $ } from '../ui/dom.js';
import { state, serverConfig } from './state.js';
import { provider, baseUrl } from './providers.js';

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */
export function apiKey() { return $('#api-key').value.trim(); }
// A key is needed before anything is sent: one typed here, or a server key (server.js, from .env).
// Model lists are often public, so without this rule a list loads and the page looks connected
// although every request will be refused. A provider file's keyOptional lets it go without one
// (Custom: local servers such as Ollama take no key).
export const hasKey = () => Boolean(apiKey() || state.config?.providers?.[state.provider]?.hasEnvKey);
export const keyReady = () => hasKey() || Boolean(provider()?.keyOptional);

// `signal` lets the page stop waiting (the Cancel button). There is no timeout: slow or silent
// providers are part of what this page tests.
export async function callApi(path, { method = 'POST', json, formData, base = baseUrl(), signal } = {}) {
  await serverConfig;
  // Every request needs a key (typed or on the server), unless the provider takes none (Custom).
  if (!keyReady()) throw new Error(`Add an API key first (the connection chip at the top). ${provider().label} refuses requests without one.`);
  if (!/^https?:\/\/./.test(base)) throw new Error('Enter a base URL that starts with http:// or https://.');
  const headers = {};
  const key = apiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  if (state.viaServer) {
    // server.js forwards to this URL, and picks a server-side key by provider when no key is typed.
    Object.assign(headers, { 'X-Upstream-Base': base, 'X-Upstream-Provider': state.provider });
  } else {
    // server.js adds these itself; direct calls send them so routers can attribute the app.
    // A provider file can turn this off ("attributionHeaders": false) when its CORS allows only its own
    // headers, as LLM Gateway's does; extra headers would make the browser's preflight fail.
    if (provider()?.attributionHeaders !== false) {
      Object.assign(headers, { 'HTTP-Referer': location.origin + location.pathname, 'X-Title': 'LLM PlayGround' });
    }
  }
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (formData) body = formData;

  const t0 = performance.now();
  // no-store: through server.js every endpoint shares the same /api/* URLs, so a cached
  // GET /api/models from one provider would otherwise be reused for another.
  const res = await fetch(`${state.viaServer ? 'api' : base}${path}`, { method, headers, body, cache: 'no-store', signal });
  const ms = Math.round(performance.now() - t0);
  const contentType = res.headers.get('content-type') || '';
  const respHeaders = Object.fromEntries(res.headers.entries());

  let data; let blob;
  if (contentType.includes('application/json')) {
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
  } else if (/^(text\/|application\/(x-)?subrip)/.test(contentType) || !contentType) {
    data = await res.text();
    if (!contentType) { try { data = JSON.parse(data); } catch { /* keep text */ } }
  } else {
    blob = await res.blob();
  }
  return { ok: res.ok, status: res.status, statusText: res.statusText, ms, contentType, headers: respHeaders, data, blob };
}

export function errorMessage(resp) {
  const d = resp.data;
  if (d?.error?.message) return `${d.error.origin ? `[${d.error.origin}] ` : ''}${d.error.message}`;
  if (d && typeof d === 'object') return d.error?.message || d.message || d.detail || JSON.stringify(d.error || d);
  return typeof d === 'string' && d ? d : `${resp.status} ${resp.statusText}`;
}

/* ------------------------------------------------------------------ */
/* cURL rendering                                                      */
/* ------------------------------------------------------------------ */
export const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
export function curlFor(path, { json, formFields, base = baseUrl() }) {
  const lines = [`curl ${base}${path}`,`  -H "Authorization: Bearer $${provider().keyEnv}"`];
  if (json !== undefined) {
    lines.push(`  -H "Content-Type: application/json"`, `  -d ${shq(JSON.stringify(json, null, 2))}`);
  }
  for (const [k, v] of formFields || []) lines.push(`  -F ${shq(`${k}=${v}`)}`);
  return lines.join(' \\\n');
}
