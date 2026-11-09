/* LLM PlayGround: Shared core: providers, requests (callApi, cURL), the models list (loading, status line, All models table), storage and small helpers. Imports only ui/dom.js. */
import { $, el } from './ui/dom.js';

// Category keys match the `api` field Requesty returns from GET /v1/models/all.
// Other providers are mapped onto them in categorize().
export const CATEGORY_LABEL = {
  chat: 'Chat', decision: 'Decision', embedding: 'Embeddings', rerank: 'Rerank', image: 'Image', video: 'Video',
  speech: 'Speech', transcription: 'Transcription',
};
// Default paths, relative to the base URL. A provider file can override them under endpoints.
export const ENDPOINT = {
  chat: '/chat/completions', decision: '/decisions', embeddings: '/embeddings', rerank: '/rerank',
  image: '/images/generations', imageEdit: '/images/edits', video: '/videos', speech: '/audio/speech', transcription: '/audio/transcriptions',
};

// The asset version: "dev" locally; pages.yml writes the commit here so data files fetched at
// start-up (providers/*.json) are never an old cached copy next to new code.
export const ASSET_VERSION = 'dev';

// Endpoints in the picker, loaded from public/providers/<id>.json by loadProviders() (the list and
// order are in providers/index.json; server.js reads the same files). Each file has: label,
// baseUrl (only a suggestion: the URL field can be edited), modelsPaths (fetched and merged),
// serverBaseUrl (used instead of baseUrl when server.js serves the page), baseUrlHint (placeholder text when the URL is empty), keyEnv (the server.js env var and the name used in cURL), keyHint, signup, server.domain (where a
// server key may be sent), unsupported (tabs that stay usable but are dimmed), endpoints (per tab:
// path relative to the base URL, base {replace: [pattern, with]} applied to the base URL, and the
// request/response template keys described in openai-standard.json), suggest (hardcoded option lists, false = not supported)
// speechVoices (a voice list file in providers/), categorize (which model field decides its tab) and
// needsServer (no browser access: usable only through server.js), attributionHeaders (false: no
// HTTP-Referer / X-Title on direct calls) and extends (another provider file to start from).
// "_notes" hold the comments.
export const PROVIDERS = {};
// The shared request/response templates (providers/openai-standard.json), read by adapter.js.
export const TEMPLATES = { endpoints: {} };

async function fetchData(file) {
  const res = await fetch(`providers/${file}?v=${ASSET_VERSION}`);
  if (!res.ok) throw new Error(`Could not load providers/${file}: ${res.status}`);
  return res.json();
}

// Loads every provider file once. Voice lists are shared between files that name the same one.
export async function loadProviders() {
  const { providers: ids, templates } = await fetchData('index.json');
  if (templates) TEMPLATES.endpoints = (await fetchData(templates)).endpoints || {};
  const lists = {};
  for (const id of ids) {
    let p = await fetchData(`${id}.json`);
    // extends: start from another provider file and override what this one lists (its notes stay its own).
    if (p.extends) {
      const { _notes, ...base } = await fetchData(p.extends);
      p = { ...base, ...p };
    }
    if (p.speechVoices) {
      lists[p.speechVoices] ??= fetchData(p.speechVoices).then((d) => d.voices.map((v) => ({ ...v, match: new RegExp(v.match, v.flags || '') })));
      p.speechVoices = await lists[p.speechVoices];
    }
    PROVIDERS[id] = p;
  }
  return PROVIDERS;
}

// The URL a provider starts with: serverBaseUrl through server.js (e.g. a gateway on localhost), else baseUrl.
export const defaultBaseUrl = (p = provider()) => (state.viaServer && p.serverBaseUrl) || p.baseUrl;

export const state = {
  models: [],         // raw model objects from the provider's model list
  provider: 'requesty',
  keys: {},           // keys typed this session, per provider, so switching back keeps them
  viaServer: false,   // true when server.js serves the page and proxies /api/*
  config: null,       // server.js `config`, or null on a static host
};
export const provider = () => PROVIDERS[state.provider];
export const baseUrl = () => $('#base-url').value.trim().replace(/\/+$/, '');
// Where a tab sends its request on the current provider: { path, base }. How the request and the
// answer look is in the templates, read by adapter.js.
export function ep(kind) {
  const o = provider().endpoints?.[kind] || {};
  const base = o.base?.replace ? baseUrl().replace(new RegExp(o.base.replace[0]), o.base.replace[1]) : baseUrl();
  return { path: o.path || ENDPOINT[kind], base };
}

// Use the server.js proxy when it serves the page. On a static host (e.g. GitHub Pages)
// there is no `config`, so call the provider directly. Requesty and OpenRouter allow CORS
// from any origin. Paths are relative so the app also works from a subfolder.
export const serverConfig = fetch('config')
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null)
  .then((cfg) => {
    state.config = cfg?.providers ? cfg : null;
    state.viaServer = Boolean(state.config);
    return state.config;
  });

/* ------------------------------------------------------------------ */
/* Storage helpers (localStorage may be unavailable)                   */
/* ------------------------------------------------------------------ */
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ------------------------------------------------------------------ */
/* Model categorisation                                                */
/* ------------------------------------------------------------------ */
// Requesty's GET /v1/models/all tags every model with its modality in `api`. OpenRouter lists
// the endpoints each model works with in `endpoints`. The name-based fallback is for the rest.
export function categorize(model) {
  // A provider file can say which field lists what a model produces, and which value means which
  // tab (first match wins), e.g. LLM Gateway's architecture.output_modalities.
  const rule = provider()?.categorize;
  if (rule) {
    const value = rule.field.split('.').reduce((o, k) => o?.[k], model);
    const values = Array.isArray(value) ? value : [value];
    for (const [match, category] of rule.order) if (values.includes(match)) return category;
    return 'other';
  }
  if (model.api && CATEGORY_LABEL[model.api]) return model.api;
  if (Array.isArray(model.endpoints)) {
    const has = (suffix) => model.endpoints.some((e) => e.endsWith(suffix));
    // Most specific first: image models also serve /chat/completions.
    for (const [suffix, cat] of [['/decisions', 'decision'], ['/rerank', 'rerank'], ['/embeddings', 'embedding'], ['/videos', 'video'],
      ['/audio/speech', 'speech'], ['/audio/transcriptions', 'transcription'], ['/images', 'image'], ['/chat/completions', 'chat']]) {
      if (has(suffix)) return cat;
    }
    return 'other'; // e.g. batch-only or extraction models
  }
  const id = String(model.id || '').toLowerCase();
  if (/embed/.test(id)) return 'embedding';
  if (/whisper|transcribe/.test(id)) return 'transcription';
  if (/tts/.test(id)) return 'speech';
  if (/gpt-image|dall-e|imagen|flux/.test(id)) return 'image';
  return 'chat';
}

export const modelsIn = (category) => state.models.filter((m) => m._category === category);

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */
export function apiKey() { return $('#api-key').value.trim(); }

// `signal` lets the page stop waiting (the Cancel button). There is no timeout: slow or silent
// providers are part of what this page tests.
export async function callApi(path, { method = 'POST', json, formData, base = baseUrl(), signal } = {}) {
  await serverConfig;
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

/* ------------------------------------------------------------------ */
/* Loading models                                                      */
/* ------------------------------------------------------------------ */
export async function loadModels() {
  const status = $('#models-status');
  const btn = $('#key-form button');
  btn.disabled = true;
  status.textContent = 'Loading models…';
  const forProvider = state.provider;
  try {
    const list = [];
    const raw = {};
    const skipped = [];
    // The first path is required. The others add to it and are skipped on failure, e.g.
    // OpenRouter's /embeddings/models, which browsers can't call directly (no CORS).
    for (const [i, path] of provider().modelsPaths.entries()) {
      let resp;
      try {
        resp = await callApi(path, { method: 'GET' });
      } catch (err) {
        if (i === 0) throw err;
        skipped.push(`${path} (${err.message})`);
        continue;
      }
      raw[path] = resp.data;
      if (!resp.ok) {
        if (i === 0) { $('#models-raw').textContent = JSON.stringify(resp.data, null, 2); throw new Error(errorMessage(resp)); }
        skipped.push(`${path} (${errorMessage(resp)})`);
        continue;
      }
      const items = Array.isArray(resp.data) ? resp.data : (resp.data?.data || resp.data?.models || []);
      if (i === 0) { list.push(...items); continue; }
      // Later lists add detail to models already listed (e.g. OpenRouter's /images/models has
      // per-model supported_parameters, /videos/models has durations and resolutions).
      const byId = new Map(list.map((m) => [m.id, m]));
      for (const m of items) {
        const known = byId.get(m.id);
        if (known) Object.assign(known, { ...m, ...known, supported_parameters: m.supported_parameters ?? known.supported_parameters });
        else list.push(m);
      }
    }
    if (forProvider !== state.provider) return; // switched provider while loading
    $('#models-raw').textContent = JSON.stringify(Object.keys(raw).length === 1 ? Object.values(raw)[0] : raw, null, 2);
    state.models = list
      .map((m) => (typeof m === 'string' ? { id: m } : m))
      .map((m) => ({ ...m, _category: categorize(m) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const counts = Object.keys(CATEGORY_LABEL).map((c) => `${modelsIn(c).length} ${c}`).join(', ');
    status.textContent = `${state.models.length} models (${counts})${skipped.length ? `. Skipped ${skipped.join(', ')}` : ''}`;
    // The model pickers (ui/model-picker.js) refill themselves on this event.
    document.dispatchEvent(new Event('models-changed'));
    renderModelsTable();
  } catch (err) {
    if (forProvider === state.provider) status.textContent = `Could not load models: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

export function renderModelsTable() {
  const table = $('#models-table');
  const filter = $('#model-filter').value.trim().toLowerCase();
  const rows = state.models.filter((m) => !filter || JSON.stringify(m).toLowerCase().includes(filter));
  // Show a handful of common scalar columns that actually exist in the data.
  const candidates = ['context_window', 'context_length', 'max_output_tokens', 'input_price', 'output_price', 'cached_price',
    'supports_vision', 'supports_tool_calling', 'supports_reasoning', 'supports_caching', 'supports_output_json_schema'];
  const cols = candidates.filter((c) => state.models.some((m) => m[c] != null && typeof m[c] !== 'object'));
  cols.splice(0, 0, ...['geolocation'].filter((c) => state.models.some((m) => m[c] != null)));
  table.tHead.replaceChildren(el('tr', {}, el('th', { text: 'id' }), el('th', { text: 'category' }), ...cols.map((c) => el('th', { text: c }))));
  table.tBodies[0].replaceChildren(...rows.map((m) => el('tr', {},
    el('td', { class: 'mono', text: m.id }),
    el('td', {}, el('span', { class: 'cat', text: m._category })),
    ...cols.map((c) => el('td', { text: m[c] == null ? '' : String(m[c]) })),
  )));
  $('#model-count').textContent = `${rows.length} of ${state.models.length}`;
}

/* ------------------------------------------------------------------ */
/* Form helpers                                                        */
/* ------------------------------------------------------------------ */
// Disabled fields are settings the chosen model doesn't support, so they are left out.
export function num(form, name) {
  if (form.elements[name]?.disabled) return undefined;
  const v = form.elements[name]?.value;
  return v === '' || v == null ? undefined : Number(v);
}
export function str(form, name) {
  if (form.elements[name]?.disabled) return undefined;
  const v = form.elements[name]?.value?.trim();
  return v ? v : undefined;
}
export function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''));
}
export function lines(text) { return text.split('\n').map((s) => s.trim()).filter(Boolean); }

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */
export function messageText(msg) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) return msg.content.map((p) => p.text ?? '').join('');
  return '';
}
export function usageLine(data, choice) {
  const parts = [];
  if (data?.model) parts.push(`model: ${data.provider ? `${data.provider}/` : ''}${data.model}`);
  if (choice?.finish_reason) parts.push(`finish: ${choice.finish_reason}`);
  const u = data?.usage;
  if (u) {
    if (u.prompt_tokens != null) parts.push(`prompt ${u.prompt_tokens}`);
    if (u.input_tokens != null) parts.push(`input ${u.input_tokens}`);
    if (u.output_tokens != null) parts.push(`output ${u.output_tokens}`);
    if (u.completion_tokens != null) parts.push(`completion ${u.completion_tokens}`);
    if (u.total_tokens != null) parts.push(`total ${u.total_tokens} tokens`);
    if (u.cost != null) parts.push(`cost $${u.cost}`);
  }
  return parts.join(' · ');
}
export function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch { /* try harder */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* give up */ } }
  return null;
}
export const truncate = (s = '', n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ------------------------------------------------------------------ */
/* Reference images for image edits                                    */
/* ------------------------------------------------------------------ */
export const MAX_EDIT_IMAGES = 16;
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
