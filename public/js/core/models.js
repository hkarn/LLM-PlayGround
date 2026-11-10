/* LLM PlayGround: the models list: loading it, which tab a model belongs to, the model filter, the status line and the Filter models table. */
import { $, el } from '../ui/dom.js';
import { state } from './state.js';
import { provider } from './providers.js';
import { callApi, errorMessage, keyReady } from './api.js';

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
function modelFields(model) {
  const rules = provider()?.modelFields?.[model._category];
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

/* ------------------------------------------------------------------ */
/* Loading models                                                      */
/* ------------------------------------------------------------------ */
export async function loadModels() {
  const status = $('#models-status');
  const btn = $('#key-form button');
  if (!keyReady()) {
    status.textContent = `Add an API key first. ${provider().label} lists its models without one, but refuses every request.`;
    return;
  }
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
        if (i === 0) { $('#models-raw').textContent = JSON.stringify(resp.data, null, 2); throw new Error(`${errorMessage(resp)}${refusedKey(resp) ? '. The provider refused the key: check that it is copied whole and still active in its dashboard.' : ''}`); }
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
      .map((m) => modelFields({ ...m, _category: categorize(m) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const counts = Object.keys(CATEGORY_LABEL).map((c) => `${modelsIn(c).length} ${c}`).join(', ');
    status.textContent = `${state.models.length} models (${counts})${skipped.length ? `. Skipped ${skipped.join(', ')}` : ''}`;
    // The model pickers (ui/model-picker.js) refill themselves on this event.
    document.dispatchEvent(new Event('models-changed'));
    renderModelsTable();
  } catch (err) {
    if (forProvider === state.provider) status.textContent = `Could not load models: ${err.message}`;
  } finally {
    btn.disabled = !keyReady();
  }
}

export function renderModelsTable() {
  const table = $('#models-table');
  const filter = $('#model-filter').value.trim().toLowerCase();
  const rows = visibleModels().filter((m) => !filter || JSON.stringify(m).toLowerCase().includes(filter));
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
