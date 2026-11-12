/* LLM PlayGround: the models list: loading it, which tab a model belongs to, the model filter and the status line. */
import { $ } from '../ui/dom.js';
import { state, store } from './state.js';
import { PROVIDERS, provider, baseUrl } from './providers.js';
import { apiKey, callApi, errorMessage, hasKey, keyReady } from './api.js';

// Category keys match the `api` field Requesty returns from GET /v1/models/all.
// Other providers are mapped onto them in categorize().
export const CATEGORY_LABEL = {
  chat: 'Chat', decision: 'Decision', embedding: 'Embeddings', rerank: 'Rerank', image: 'Image', video: 'Video',
  speech: 'Speech', transcription: 'Transcription',
};

/* ------------------------------------------------------------------ */
/* Model categorisation                                                */
/* ------------------------------------------------------------------ */
// Requesty's GET /v1/models/all tags every model with its modality in `api`. OpenRouter lists
// the endpoints each model works with in `endpoints`. The name-based fallback is for the rest.
// A provider file's modelFields fills the page's own model fields (supported_durations,
// supported_resolutions, supported_frame_images, generate_audio …, as OpenRouter's lists have them)
// from wherever that provider keeps the facts, per tab: { "<tab>": { "<field>": rule } }. A rule is a
// path ("providers.0.supportedVideoSizes"), or { "if": [conditions], "value": v, "else": w } where a
// condition is a path that holds something (not empty, not false) or "path:item" (a list holding
// item), any one being enough; "all" instead of "if" needs every one, and "!" before a condition
// turns it around. A field the model already has is kept.
const pathIn = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const holds = (v) => v != null && v !== false && !(Array.isArray(v) && !v.length) && v !== '';
function modelFields(model, id) {
  const rules = provider(id)?.modelFields?.[model._category];
  if (!rules) return model;
  for (const [field, rule] of Object.entries(rules)) {
    if (field.startsWith('_') || model[field] !== undefined) continue;
    let value;
    if (typeof rule === 'string') value = pathIn(model, rule);
    else {
      const test = (c) => {
        if (c.startsWith('!')) return !test(c.slice(1));
        const cut = c.indexOf(':');
        if (cut < 0) return holds(pathIn(model, c));
        const list = pathIn(model, c.slice(0, cut));
        return Array.isArray(list) && list.includes(c.slice(cut + 1));
      };
      const met = rule.all ? rule.all.every(test) : (rule.if || []).some(test);
      value = met ? rule.value : rule.else;
    }
    if (value !== undefined) model[field] = value;
  }
  return model;
}

export function categorize(model, providerId) {
  // A provider file can say which field lists what a model produces, and which value means which
  // tab (first match wins), e.g. LLM Gateway's architecture.output_modalities.
  const rule = provider(providerId)?.categorize;
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

/* ------------------------------------------------------------------ */
/* Model filter                                                        */
/* ------------------------------------------------------------------ */
// A model id is "<maker>/<name>", sometimes with a region or variant after it (@eu, :free, :flex).
// A leading "~" (an OpenRouter alias such as ~z-ai/glm-latest) is not part of the maker.
export function splitModelId(id) {
  const s = String(id).replace(/^~/, '');
  const i = s.indexOf('/');
  return i < 0 ? { maker: '', name: s } : { maker: s.slice(0, i), name: s.slice(i + 1) };
}
// Providers match the maker exactly; a model row matches every name that starts with it, so
// "GLM-5.3" keeps glm-5.3, glm-5.3-flash, glm-5.3:batch … A row with a "/" is matched against the
// whole id instead. Case is ignored, and a trailing "*" is allowed. Empty lists filter nothing.
export function passesModelFilter(m, f = state.modelFilter) {
  const { maker, name } = splitModelId(m.id);
  const low = (x) => String(x).toLowerCase();
  const full = low(String(m.id).replace(/^~/, ''));
  if (f.providers.length && !f.providers.some((p) => low(p) === low(maker))) return false;
  if (f.models.length && !f.models.some((row) => {
    const prefix = low(row).replace(/\*+$/, '');
    return prefix.includes('/') ? full.startsWith(prefix) : low(name).startsWith(prefix);
  })) return false;
  return true;
}
export const modelFilterOn = () => Boolean(state.modelFilter.providers.length || state.modelFilter.models.length);
// The models every list shows: the loaded list narrowed by the model filter.
export const visibleModels = () => state.models.filter((m) => passesModelFilter(m));
export const modelsIn = (category) => visibleModels().filter((m) => m._category === category);

// A 401/403 that came from the provider itself: a direct call, or one server.js forwarded (it marks
// those with x-tester-upstream-url). server.js's own 403, e.g. for a URL it may not proxy, is not
// about the key.
const refusedKey = (resp) => [401, 403].includes(resp.status) && (!state.viaServer || Boolean(resp.headers?.['x-tester-upstream-url']));
const KEY_HELP = 'check that it is copied whole and still active in its dashboard.';

/* ------------------------------------------------------------------ */
/* Loading models, one list per provider                               */
/* ------------------------------------------------------------------ */
// state.lists[id] keeps what was learned about each provider: { status: 'loading' | 'ok' | 'error',
// models, raw, skipped, error, keyOk, keyInfo, at, sig }. keyOk says whether the key itself was
// accepted: true or false when the provider has a way to tell (its file's keyCheck: { path } is a cheap
// authenticated GET, { models: true } means its model list already refuses a bad key), else null
// (not verified: a model list that loads is no proof, OpenRouter's loads with any key). state.models is
// the selected provider's list, which the pickers and tables read.
//
// The 2-minute rule: a provider is not checked again within CHECK_TTL of the last time unless the user
// asks (the Load models button). A failed provider or a refused key is not retried automatically before then, a list that
// loaded fine is reused while the URL and key are the same, and a key check that passed is not repeated.
// The last result is kept in localStorage (conn_<id>), so a page reload counts too.
export const CHECK_TTL = 2 * 60 * 1000;
const loadingNow = {};
const readConn = (id) => { try { return JSON.parse(store.get(`conn_${id}`) || 'null'); } catch { return null; } };
// What a result was made with: another URL or key is a new question. Only a short hash is kept in
// localStorage, never the key.
const signature = (id) => {
  let h = 0;
  for (const c of `${baseUrl(id)}\n${apiKey(id)}`) h = (Math.imul(h, 31) + c.codePointAt(0)) | 0;
  return String(h);
};

async function fetchList(id, last, recheck) {
  const p = provider(id);
  const list = [];
  const raw = {};
  const skipped = [];
  let keyOk = null;
  // The first path is required. The others add to it and are skipped on failure, e.g.
  // OpenRouter's /embeddings/models, which browsers can't call directly (no CORS).
  for (const [i, path] of p.modelsPaths.entries()) {
    let resp;
    try {
      resp = await callApi(path, { method: 'GET', provider: id });
    } catch (err) {
      if (i === 0) throw err;
      skipped.push(`${path} (${err.message})`);
      continue;
    }
    raw[path] = resp.data;
    if (!resp.ok) {
      if (i === 0) {
        const refused = refusedKey(resp);
        throw Object.assign(new Error(`${errorMessage(resp)}${refused ? `. The provider refused the key: ${KEY_HELP}` : ''}`), { raw: resp.data, keyOk: refused ? false : null });
      }
      skipped.push(`${path} (${errorMessage(resp)})`);
      continue;
    }
    if (i === 0 && p.keyCheck?.models) keyOk = true;
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
  // A key check of its own, for a provider whose model list loads without a valid key.
  let keyInfo;
  if (p.keyCheck?.path) {
    if (!recheck && last?.keyOk === true && last.sig === signature(id) && Date.now() - last.at < CHECK_TTL) keyOk = true;
    else {
      try {
        const resp = await callApi(p.keyCheck.path, { method: 'GET', provider: id });
        if (resp.ok) { keyOk = true; keyInfo = resp.data?.data ?? resp.data; } else if (refusedKey(resp)) keyOk = false;
      } catch { /* the check could not be made (network, CORS): the key stays unverified */ }
    }
  }
  const models = list
    .map((m) => (typeof m === 'string' ? { id: m } : m))
    .map((m) => modelFields({ ...m, _category: categorize(m, id) }, id))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { models, raw: Object.keys(raw).length === 1 ? Object.values(raw)[0] : raw, skipped, keyOk, keyInfo };
}

// Loads one provider's models and checks its key (see above), without touching the page. Returns its
// state.lists entry. recheck: the user asked, so the 2-minute rule does not apply.
export function loadProviderModels(id, { recheck = false } = {}) {
  const sig = signature(id);
  const have = state.lists[id];
  if (!recheck && have && have.sig === sig && have.status === 'ok' && Date.now() - have.at < CHECK_TTL) return Promise.resolve(have);
  const last = readConn(id);
  if (!recheck && last && last.sig === sig && (last.status === 'error' || last.keyOk === false) && Date.now() - last.at < CHECK_TTL) {
    state.lists[id] = { status: last.status, models: [], skipped: [], error: last.error, keyOk: last.keyOk ?? null, at: last.at, sig, cached: true };
    return Promise.resolve(state.lists[id]);
  }
  loadingNow[id] ??= (async () => {
    state.lists[id] = { models: [], ...have, status: 'loading', sig };
    let entry;
    try {
      entry = { status: 'ok', ...(await fetchList(id, last, recheck)) };
    } catch (err) {
      entry = { status: 'error', models: [], raw: err.raw, error: err.message, keyOk: err.keyOk ?? null };
    }
    entry = { ...entry, at: Date.now(), sig };
    state.lists[id] = entry;
    store.set(`conn_${id}`, JSON.stringify({ at: entry.at, sig, status: entry.status, keyOk: entry.keyOk, error: entry.error || (entry.keyOk === false ? `${provider(id).label} refused the key: ${KEY_HELP}` : undefined) }));
    delete loadingNow[id];
    return entry;
  })();
  return loadingNow[id];
}

// Providers other than the selected one that have a key of their own (typed and saved, or on the
// server) get their lists and key checks at start-up, so the page knows which ones are connected.
export function refreshConnections() {
  const others = Object.entries(PROVIDERS).filter(([id, p]) => id !== state.provider && !(p.needsServer && !state.viaServer) && hasKey(id));
  return Promise.allSettled(others.map(([id]) => loadProviderModels(id)));
}

// The selected provider: loads its list and writes the status line.
export async function loadModels({ recheck = false } = {}) {
  const status = $('#models-status');
  const btn = $('#key-form button');
  const id = state.provider;
  if (!keyReady(id)) {
    status.textContent = `Add an API key first. ${provider().label} lists its models without one, but refuses every request.`;
    return;
  }
  btn.disabled = true;
  status.textContent = 'Loading models…';
  const entry = await loadProviderModels(id, { recheck });
  if (id !== state.provider) return; // switched provider while loading
  btn.disabled = !keyReady();
  if (entry.raw !== undefined) $('#models-raw').textContent = JSON.stringify(entry.raw, null, 2);
  if (entry.status === 'error') {
    status.textContent = `Could not load models: ${entry.error}`;
    return;
  }
  state.models = entry.models;
  const counts = Object.keys(CATEGORY_LABEL).map((c) => `${modelsIn(c).length} ${c}`).join(', ');
  // A list that loads is no proof of a working key: when the provider can tell and says no, the status says so.
  status.textContent = entry.keyOk === false
    ? `Could not connect: ${provider().label} refused the key: ${KEY_HELP}`
    : `${entry.models.length} models (${counts})${entry.skipped.length ? `. Skipped ${entry.skipped.join(', ')}` : ''}`;
  // The model pickers (ui/model-picker.js) and the Filter models table (ui/models-table.js) redraw
  // themselves on this event.
  document.dispatchEvent(new Event('models-changed'));
}
