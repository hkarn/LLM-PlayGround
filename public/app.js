/* LLM PlayGround – front-end. Talks to the local proxy at /api/* (see server.js). */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : String(c));
  return node;
};

// Category keys match the `api` field Requesty returns from GET /v1/models/all.
// Other providers are mapped onto them in categorize().
const CATEGORY_LABEL = {
  chat: 'Chat', decision: 'Decision', embedding: 'Embeddings', rerank: 'Rerank', image: 'Image', video: 'Video',
  speech: 'Speech', transcription: 'Transcription',
};
// Default paths, relative to the base URL. Providers can override them in PROVIDERS[...].endpoints.
const ENDPOINT = {
  chat: '/chat/completions', decision: '/decisions', embeddings: '/embeddings', rerank: '/rerank',
  image: '/images/generations', imageEdit: '/images/edits', video: '/videos', speech: '/audio/speech', transcription: '/audio/transcriptions',
};

// Endpoints in the picker. `baseUrl` is only a suggestion: the URL field can be edited.
// `modelsPaths` are fetched and merged. `keyEnv` is the server.js env var and the name used in cURL.
// `unsupported` lists tabs the provider has no endpoint for; they stay usable but are dimmed.
// `endpoints` overrides a tab's path (relative to the base URL), its base (a function of the
// base URL) or its request style (`json` for image edits sent as input_references).
const PROVIDERS = {
  requesty: {
    label: 'Requesty', baseUrl: 'https://router.requesty.ai/v1', modelsPaths: ['/models/all'],
    keyEnv: 'REQUESTY_API_KEY', keyHint: 'sk-…', signup: { href: 'https://app.requesty.ai/join?ref=b1f2b1e1', text: 'No key? Sign up for Requesty' },
    unsupported: ['rerank', 'video'],
    // Hardcoded choices for options the model list doesn't describe. Speech voices are in SPEECH_VOICES.
    // OpenAI-style image API: size, not aspect_ratio or resolution.
    suggest: {
      image: { aspect_ratio: false, resolution: false },
      imageEdit: { aspect_ratio: false, resolution: false },
    },
  },
  openrouter: {
    // output_modalities=all lists every model group (chat, image, embeddings, rerank, video,
    // speech, transcription, decisions); without it /models only returns text models.
    label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', modelsPaths: ['/models?output_modalities=all', '/images/models', '/videos/models'],
    keyEnv: 'OPENROUTER_API_KEY', keyHint: 'sk-or-…', signup: { href: 'https://openrouter.ai/keys', text: 'No key? Get one at OpenRouter' },
    endpoints: {
      decision: { base: (b) => b.replace(/\/v1$/, '/alpha') }, // https://openrouter.ai/api/alpha/decisions
      image: { path: '/images' },
      imageEdit: { path: '/images', json: true },
    },
    // Image and video options come per model from /images/models and /videos/models; these
    // cover what no list gives. /audio/speech only returns mp3 or pcm (pcm doesn't play in the page).
    suggest: {
      speech: { response_format: ['mp3', 'pcm'] },
    },
  },
  custom: {
    // Only OpenAI's standard endpoints; decisions, rerank and video have no common format.
    label: 'Custom (OpenAI-compatible)', baseUrl: '', modelsPaths: ['/models'], keyEnv: 'API_KEY', keyHint: 'if needed',
    unsupported: ['decision', 'rerank', 'video'],
    suggest: {
      image: { aspect_ratio: false, resolution: false },
      imageEdit: { aspect_ratio: false, resolution: false },
    },
  },
};

const state = {
  models: [],         // raw model objects from the provider's model list
  provider: 'requesty',
  keys: {},           // keys typed this session, per provider, so switching back keeps them
  viaServer: false,   // true when server.js serves the page and proxies /api/*
  config: null,       // server.js `config`, or null on a static host
};
const provider = () => PROVIDERS[state.provider];
const baseUrl = () => $('#base-url').value.trim().replace(/\/+$/, '');
// Where a tab sends its request on the current provider: { path, base, json }.
function ep(kind) {
  const o = provider().endpoints?.[kind] || {};
  return { path: o.path || ENDPOINT[kind], base: o.base ? o.base(baseUrl()) : baseUrl(), json: Boolean(o.json) };
}

// Use the server.js proxy when it serves the page. On a static host (e.g. GitHub Pages)
// there is no `config`, so call the provider directly. Requesty and OpenRouter allow CORS
// from any origin. Paths are relative so the app also works from a subfolder.
const serverConfig = fetch('config')
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
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ------------------------------------------------------------------ */
/* Model categorisation                                                */
/* ------------------------------------------------------------------ */
// Requesty's GET /v1/models/all tags every model with its modality in `api`. OpenRouter lists
// the endpoints each model works with in `endpoints`. The name-based fallback is for the rest.
function categorize(model) {
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

const modelsIn = (category) => state.models.filter((m) => m._category === category);

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */
function apiKey() { return $('#api-key').value.trim(); }

async function callApi(path, { method = 'POST', json, formData, base = baseUrl() } = {}) {
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
    Object.assign(headers, { 'HTTP-Referer': location.origin + location.pathname, 'X-Title': 'LLM PlayGround' });
  }
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (formData) body = formData;

  const t0 = performance.now();
  // no-store: through server.js every endpoint shares the same /api/* URLs, so a cached
  // GET /api/models from one provider would otherwise be reused for another.
  const res = await fetch(`${state.viaServer ? 'api' : base}${path}`, { method, headers, body, cache: 'no-store' });
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

function errorMessage(resp) {
  const d = resp.data;
  if (d?.error?.message) return `${d.error.origin ? `[${d.error.origin}] ` : ''}${d.error.message}`;
  if (d && typeof d === 'object') return d.error?.message || d.message || d.detail || JSON.stringify(d.error || d);
  return typeof d === 'string' && d ? d : `${resp.status} ${resp.statusText}`;
}

/* ------------------------------------------------------------------ */
/* cURL rendering                                                      */
/* ------------------------------------------------------------------ */
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
function curlFor(path, { json, formFields, base = baseUrl() }) {
  const lines = [`curl ${base}${path}`,`  -H "Authorization: Bearer $${provider().keyEnv}"`];
  if (json !== undefined) {
    lines.push(`  -H "Content-Type: application/json"`, `  -d ${shq(JSON.stringify(json, null, 2))}`);
  }
  for (const [k, v] of formFields || []) lines.push(`  -F ${shq(`${k}=${v}`)}`);
  return lines.join(' \\\n');
}

/* ------------------------------------------------------------------ */
/* Result panel                                                        */
/* ------------------------------------------------------------------ */
function pre(obj) {
  return el('pre', { class: 'mono' }, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

function renderResult(container, { resp, request, curl, rendered }) {
  container.replaceChildren();
  container.append(el('div', { class: 'status-line' },
    el('span', { class: `badge ${resp.ok ? 'ok' : 'err'}`, text: `${resp.status} ${resp.statusText || ''}`.trim() }),
    el('span', { class: 'muted', text: `${resp.ms} ms round-trip` }),
    resp.headers['x-tester-upstream-ms'] ? el('span', { class: 'muted', text: `(${resp.headers['x-tester-upstream-ms']} ms upstream)` }) : null,
    resp.contentType ? el('span', { class: 'muted', text: resp.contentType }) : null,
  ));

  if (!resp.ok) {
    container.append(el('div', { class: 'output error', text: errorMessage(resp) }));
  } else if (rendered) {
    container.append(rendered);
  }

  const rawResponse = resp.blob ? `<binary ${resp.blob.type || 'data'}, ${resp.blob.size.toLocaleString()} bytes>` : resp.data;
  container.append(
    el('details', { open: !resp.ok || undefined }, el('summary', { text: 'Raw response' }), pre(rawResponse ?? '')),
    el('details', {}, el('summary', { text: 'Request body' }), pre(request)),
    el('details', {}, el('summary', { text: 'Response headers' }), pre(resp.headers)),
    el('details', {}, el('summary', { text: 'cURL' }), pre(curl)),
  );
}

function renderException(container, err) {
  container.replaceChildren(el('div', { class: 'output error', text: `Request failed: ${err.message}` }));
}

/* ------------------------------------------------------------------ */
/* Model pickers                                                       */
/* ------------------------------------------------------------------ */
function setupPicker(picker) {
  const category = picker.dataset.category;
  const select = el('select', { name: 'model' });
  const custom = el('input', { name: 'model_custom', placeholder: 'or type a model id, e.g. openai/gpt-4o-mini', spellcheck: 'false' });
  const showAll = el('input', { type: 'checkbox' });
  const info = el('div', { class: 'model-info' });

  picker.replaceChildren(
    el('label', { text: `Model (${CATEGORY_LABEL[category]})` }),
    el('div', { class: 'row' }, select, el('label', { class: 'inline small' }, showAll, 'show all')),
    custom,
    info,
  );

  const fill = () => {
    const prev = select.value;
    const list = showAll.checked ? state.models : modelsIn(category);
    select.replaceChildren(
      ...(list.length ? [] : [el('option', { value: '', text: state.models.length ? `No ${category} models detected – tick "show all"` : 'Load models first' })]),
      ...list.map((m) => el('option', { value: m.id, text: showAll.checked ? `${m.id}  [${m._category}]` : m.id })),
    );
    // Keep the current choice; otherwise the first model in the list stays selected.
    if (list.some((m) => m.id === prev)) select.value = prev;
    // Bubbles so the form can react to the new model, e.g. the speech voice list.
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const showInfo = () => {
    const m = state.models.find((x) => x.id === select.value);
    info.replaceChildren();
    if (!m) return;
    const bits = [];
    const ctx = m.context_window ?? m.context_length ?? m.max_context_length;
    if (ctx) bits.push(`context ${Number(ctx).toLocaleString()}`);
    const perM = (x) => `$${+(Number(x) * 1e6).toPrecision(4)}/M`;
    // Requesty: input_price/output_price. OpenRouter: pricing.prompt/completion, as strings.
    const inP = m.input_price ?? m.pricing?.input ?? m.pricing?.prompt;
    const outP = m.output_price ?? m.pricing?.output ?? m.pricing?.completion;
    if (inP != null) bits.push(`in ${perM(inP)}`);
    if (outP != null) bits.push(`out ${perM(outP)}`);
    // Non-chat models only have per-unit keys in `pricing`, e.g. input_character, input_second, output_image.
    if (inP == null && outP == null && m.pricing && !Array.isArray(m.pricing)) {
      for (const [k, v] of Object.entries(m.pricing)) {
        if (typeof v !== 'number') continue;
        bits.push(k === 'input_second' ? `${k} $${+(v * 60).toPrecision(4)}/min` : `${k} ${perM(v)}`);
      }
    }
    if (m.geolocation) bits.push(m.geolocation);
    if (m.owned_by) bits.push(`by ${m.owned_by}`);
    if (m.description) bits.push(String(m.description).slice(0, 140));
    info.append(bits.join(' · '), ' ', el('details', {}, el('summary', { class: 'small', text: 'model metadata' }), pre(stripPrivate(m))));
  };
  select.addEventListener('change', showInfo);
  showAll.addEventListener('change', fill);
  picker._fill = fill;
  fill();
}

function stripPrivate(m) {
  const { _category, ...rest } = m;
  return rest;
}

function chosenModel(form) {
  return form.elements.model_custom.value.trim() || form.elements.model.value;
}

function refreshPickers() { $$('.model-picker').forEach((p) => p._fill && p._fill()); }

/* ------------------------------------------------------------------ */
/* Loading models                                                      */
/* ------------------------------------------------------------------ */
async function loadModels() {
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
    refreshPickers();
    renderModelsTable();
  } catch (err) {
    if (forProvider === state.provider) status.textContent = `Could not load models: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

function renderModelsTable() {
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
/* Speech voices                                                       */
/* ------------------------------------------------------------------ */
// /models/all has no voice names, so they are kept here, taken from each provider's docs.
// The first matching entry wins. `groups` maps an optgroup label (or '' for none) to voices.
// `def` is the provider's default voice. `required` means the API rejects a request without a voice.
const OPENAI_TTS1_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];
const SPEECH_VOICES = [
  { match: /^openai\/tts-1/, required: true, groups: { '': OPENAI_TTS1_VOICES },
    note: 'tts-1 and tts-1-hd support 9 voices. ballad, verse, marin and cedar are gpt-4o-mini-tts only.' },
  { match: /^openai\//, required: true, groups: { '': ['marin', 'cedar', ...OPENAI_TTS1_VOICES, 'ballad', 'verse'] },
    note: 'OpenAI recommends marin or cedar for best quality.' },
  { match: /kokoro/i, def: 'af_bella', groups: {
    'American English': ['af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
      'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa'],
    'British English': ['bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis'],
    Japanese: ['jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro', 'jm_kumo'],
    'Mandarin Chinese': ['zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi', 'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang'],
    Spanish: ['ef_dora', 'em_alex', 'em_santa'],
    French: ['ff_siwis'],
    Hindi: ['hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi'],
    Italian: ['if_sara', 'im_nicola'],
    'Brazilian Portuguese': ['pf_dora', 'pm_alex', 'pm_santa'],
  }, note: 'The second letter is f for female, m for male. Pick a voice that matches the language of the text.' },
  { match: /orpheus/i, def: 'tara', groups: { '': ['tara', 'leah', 'jess', 'leo', 'dan', 'mia', 'zac', 'zoe'] },
    note: 'English voices, listed from most to least natural. Emotive tags like <laugh> or <sigh> work in the text.' },
  { match: /mimo.*tts/i, def: 'mimo_default', groups: { English: ['Mia', 'Chloe', 'Milo', 'Dean'], Chinese: ['冰糖', '茉莉', '苏打', '白桦'] },
    note: 'mimo_default is Mia outside China.' },
  { match: /voicedesign/i, groups: {}, placeholder: 'describe the voice, e.g. A deep male voice with a calm, authoritative tone',
    note: 'No preset voices. Describe the voice you want in the text box.' },
  { match: /chatterbox/i, groups: {}, note: 'No preset voices. Chatterbox takes the ID of a voice cloned on DeepInfra. Leave it empty for the default voice.' },
  { match: /csm-1b/i, groups: {}, note: 'No documented preset voices. Leave it empty for the default voice.' },
];

// Fills the voice dropdown for the chosen model. Called whenever the model changes.
function setupVoicePicker(form) {
  const select = form.elements.voice_preset;
  const custom = form.elements.voice;
  const note = $('.voice-note', form);
  const update = () => {
    const model = chosenModel(form);
    // OpenRouter lists each speech model's voices in `supported_voices`; otherwise use SPEECH_VOICES.
    const listed = state.models.find((m) => m.id === model)?.supported_voices;
    const entry = listed?.length
      ? { required: true, groups: { '': listed }, note: `${listed.length} voices from the model list.` }
      : SPEECH_VOICES.find((v) => v.match.test(model));
    const groups = Object.entries(entry?.groups || {});
    select.replaceChildren(
      ...(entry?.required ? [] : [el('option', { value: '', text: entry?.def ? `model default (${entry.def})` : 'model default' })]),
      ...groups.map(([label, voices]) => {
        const options = voices.map((v) => el('option', { value: v, text: v }));
        return label ? el('optgroup', { label }, ...options) : options;
      }).flat(),
    );
    select.disabled = !groups.length;
    custom.placeholder = entry?.placeholder || 'or type a voice name (overrides the list)';
    note.textContent = entry?.note || (model ? 'No voice list for this model. Type a voice name or leave it empty for the default.' : '');
  };
  form.addEventListener('change', (e) => { if (e.target.name === 'model') update(); });
  form.addEventListener('input', (e) => { if (e.target.name === 'model_custom') update(); });
  update();
}

/* ------------------------------------------------------------------ */
/* Per-model option lists                                              */
/* ------------------------------------------------------------------ */
// A dropdown's choices come from, in order: the chosen model's own metadata, the provider's
// `suggest` list for that form, then the options written in index.html. `false` from either
// source greys the field out, and disabled fields are not sent.
const VIDEO_META = { duration: 'supported_durations', resolution: 'supported_resolutions', aspect_ratio: 'supported_aspect_ratios' };
function optionsFromModel(kind, name, m) {
  if (!m) return undefined;
  if ((kind === 'image' || kind === 'imageEdit') && m.supported_parameters && !Array.isArray(m.supported_parameters)) {
    // OpenRouter /images/models: a missing key means the model doesn't take that parameter.
    const p = m.supported_parameters[name];
    if (!p) return false;
    return p.type === 'enum' ? p.values.map(String) : undefined;
  }
  if (kind === 'video' && VIDEO_META[name] && Array.isArray(m[VIDEO_META[name]])) {
    return m[VIDEO_META[name]].length ? m[VIDEO_META[name]].map(String) : false;
  }
  return undefined;
}

function setupModelOptions(form) {
  const kind = form.dataset.kind;
  const selects = $$('select', form).filter((s) => !['model', 'voice_preset'].includes(s.name) && !s.closest('.model-picker'));
  // Remember the options from index.html as the last fallback.
  for (const s of selects) {
    s._orig = [...s.options].filter((o) => o.value !== '').map((o) => o.value);
    s._origSelected = s.value;
    s._hasDefault = [...s.options].some((o) => o.value === '');
  }
  const update = () => {
    const m = state.models.find((x) => x.id === chosenModel(form));
    // With per-model metadata, start from "default" rather than the page's preset (e.g. size 1024x1024).
    const hasMeta = Boolean(m && ((m.supported_parameters && !Array.isArray(m.supported_parameters)) || m.supported_durations));
    for (const s of selects) {
      let values = optionsFromModel(kind, s.name, m);
      if (values === undefined) values = provider().suggest?.[kind]?.[s.name];
      if (values === undefined) values = s._orig;
      const prev = s.value;
      s.disabled = values === false;
      const list = values || [];
      s.replaceChildren(...(s._hasDefault ? [el('option', { value: '', text: s.disabled ? 'not supported' : 'default' })] : []),
        ...list.map((v) => el('option', { value: v, text: v })));
      const preset = !hasMeta && list.includes(s._origSelected) ? s._origSelected : (s._hasDefault ? '' : list[0] ?? '');
      s.value = list.includes(prev) && !(hasMeta && prev === s._origSelected && s._hasDefault) ? prev : preset;
    }
    if (kind === 'video') {
      // Some video models list which frame images and whether audio they take.
      const frames = m?.supported_frame_images;
      form.elements.first_frame.disabled = Array.isArray(frames) && !frames.includes('first_frame');
      form.elements.generate_audio.disabled = m?.generate_audio === false;
    }
    if (kind === 'image' || kind === 'imageEdit') {
      const n = m?.supported_parameters?.n;
      if (form.elements.n) form.elements.n.max = n?.type === 'range' ? n.max : 10;
    }
  };
  form.addEventListener('change', (e) => { if (e.target.name === 'model') update(); });
  form.addEventListener('input', (e) => { if (e.target.name === 'model_custom') update(); });
  form._updateOptions = update;
  update();
}

/* ------------------------------------------------------------------ */
/* Form helpers                                                        */
/* ------------------------------------------------------------------ */
// Disabled fields are settings the chosen model doesn't support, so they are left out.
function num(form, name) {
  if (form.elements[name]?.disabled) return undefined;
  const v = form.elements[name]?.value;
  return v === '' || v == null ? undefined : Number(v);
}
function str(form, name) {
  if (form.elements[name]?.disabled) return undefined;
  const v = form.elements[name]?.value?.trim();
  return v ? v : undefined;
}
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''));
}
function lines(text) { return text.split('\n').map((s) => s.trim()).filter(Boolean); }

/* ------------------------------------------------------------------ */
/* Handlers per category                                               */
/* ------------------------------------------------------------------ */
const handlers = {
  async chat(form, out) {
    const messages = [];
    const system = str(form, 'system');
    if (system) messages.push({ role: 'system', content: system });
    for (const row of $$('.message', form)) {
      const content = $('.content', row).value.trim();
      if (content) messages.push({ role: $('.role', row).value, content });
    }
    if (!messages.some((m) => m.role !== 'system')) throw new Error('Add at least one message.');
    let extra = {};
    if (str(form, 'extra')) {
      try { extra = JSON.parse(form.elements.extra.value); } catch (e) { throw new Error(`Extra JSON is invalid: ${e.message}`); }
    }
    const body = compact({
      model: chosenModel(form), messages,
      temperature: num(form, 'temperature'), max_tokens: num(form, 'max_tokens'), top_p: num(form, 'top_p'), ...extra,
    });
    const resp = await callApi(ep('chat').path, { base: ep('chat').base, json: body });
    let rendered;
    if (resp.ok && resp.data?.choices) {
      const choice = resp.data.choices[0] || {};
      const msg = choice.message || {};
      rendered = el('div', {},
        el('div', { class: 'output', text: messageText(msg) || '(empty content)' }),
        msg.tool_calls ? el('details', { open: true }, el('summary', { text: 'Tool calls' }), pre(msg.tool_calls)) : null,
        el('div', { class: 'muted small', text: usageLine(resp.data, choice) }),
        el('div', { class: 'row' }, el('button', {
          type: 'button', class: 'secondary', text: 'Append reply & continue',
          onclick: () => { addMessage(form, 'assistant', messageText(msg)); addMessage(form, 'user', ''); },
        })),
      );
    }
    renderResult(out, { resp, request: body, curl: curlFor(ep('chat').path, { base: ep('chat').base, json: body }), rendered });
  },

  async decision(form, out) {
    const raw = form.elements.state.value.trim();
    let stateValue = raw;
    if (/^[[{]/.test(raw)) { try { stateValue = JSON.parse(raw); } catch { /* send as text */ } }
    const image = form.elements.image.files[0];
    if (image) stateValue = [stateValue, { type: 'image_url', image_url: { url: await fileToDataUrl(image) } }];

    const questions = {};
    for (const row of $$('.question', form)) {
      const id = $('.qid', row).value.trim();
      if (!id) continue;
      const type = $('.qtype', row).value;
      const q = { type };
      const instr = $('.qinstr', row).value.trim();
      if (instr) q.instructions = instr;
      const crit = lines($('.qcriteria', row).value);
      if (type === 'choice') {
        q.criteria = Object.fromEntries(crit.map((l) => {
          const i = l.indexOf(':');
          return i < 0 ? [l, null] : [l.slice(0, i).trim(), l.slice(i + 1).trim() || null];
        }));
      } else if (type === 'score') q.criteria = crit;
      questions[id] = q;
    }
    if (!Object.keys(questions).length) throw new Error('Add at least one question with an id.');

    const body = { model: chosenModel(form), state: stateValue, questions };
    const resp = await callApi(ep('decision').path, { base: ep('decision').base, json: body });
    let rendered;
    if (resp.ok && resp.data?.answers) {
      rendered = el('div', {},
        ...Object.entries(resp.data.answers).map(([id, a]) => renderAnswer(id, a, questions[id])),
        el('div', { class: 'muted small', text: usageLine(resp.data) }));
    }
    const shownReq = image ? { ...body, state: [body.state[0], { type: 'image_url', image_url: { url: `<${image.name} as base64 data URL>` } }] } : body;
    renderResult(out, { resp, request: shownReq, curl: curlFor(ep('decision').path, { base: ep('decision').base, json: shownReq }), rendered });
  },

  async embeddings(form, out) {
    const inputs = lines(form.elements.input.value);
    if (!inputs.length) throw new Error('Enter at least one input line.');
    const body = compact({
      model: chosenModel(form),
      input: inputs.length === 1 ? inputs[0] : inputs,
      dimensions: num(form, 'dimensions'),
      encoding_format: str(form, 'encoding_format'),
    });
    const resp = await callApi(ep('embeddings').path, { base: ep('embeddings').base, json: body });
    let rendered;
    if (resp.ok && Array.isArray(resp.data?.data)) {
      const vectors = resp.data.data.map((d) => (Array.isArray(d.embedding) ? d.embedding : decodeB64Floats(d.embedding)));
      const dims = vectors[0]?.length ?? 0;
      rendered = el('div', {},
        el('div', { class: 'output' },
          `${vectors.length} vector(s) × ${dims} dimensions\n\n`,
          ...vectors.map((v, i) => `#${i} "${truncate(inputs[i], 50)}"\n  [${v.slice(0, 8).map((x) => x.toFixed(5)).join(', ')}${v.length > 8 ? ', …' : ''}]  ‖v‖=${norm(v).toFixed(4)}\n`)),
        vectors.length > 1 ? similarityTable(vectors, inputs) : null,
        el('div', { class: 'muted small', text: usageLine(resp.data) }),
      );
    }
    // Avoid dumping thousands of floats in the raw view
    const shown = resp.ok && Array.isArray(resp.data?.data)
      ? { ...resp, data: { ...resp.data, data: resp.data.data.map((d) => ({ ...d, embedding: Array.isArray(d.embedding) ? [...d.embedding.slice(0, 16), `… ${d.embedding.length - 16} more`] : d.embedding })) } }
      : resp;
    renderResult(out, { resp: shown, request: body, curl: curlFor(ep('embeddings').path, { base: ep('embeddings').base, json: body }), rendered });
  },

  async image(form, out) {
    const body = compact({
      model: chosenModel(form), prompt: form.elements.prompt.value.trim(),
      size: str(form, 'size'), aspect_ratio: str(form, 'aspect_ratio'), resolution: str(form, 'resolution'),
      n: num(form, 'n'), quality: str(form, 'quality'),
      background: str(form, 'background'), output_format: str(form, 'output_format'),
    });
    const resp = await callApi(ep('image').path, { base: ep('image').base, json: body });
    const { rendered, shown } = renderImages(resp, body.output_format);
    renderResult(out, { resp: shown, request: body, curl: curlFor(ep('image').path, { base: ep('image').base, json: body }), rendered });
  },

  // Multipart, with one image[] field per reference image (up to 16 for GPT image models).
  async imageEdit(form, out) {
    const images = form._refImages || [];
    if (!images.length) throw new Error('Add at least one reference image.');
    if (images.length > MAX_EDIT_IMAGES) throw new Error(`At most ${MAX_EDIT_IMAGES} reference images.`);
    const mask = form.elements.mask.files[0];
    const fields = compact({
      model: chosenModel(form), prompt: form.elements.prompt.value.trim(),
      size: str(form, 'size'), aspect_ratio: str(form, 'aspect_ratio'), resolution: str(form, 'resolution'), quality: str(form, 'quality'),
    });
    const { path, base, json } = ep('imageEdit');
    if (json) {
      // OpenRouter: JSON to /images, with the pictures as data URLs in input_references. No mask.
      const refs = await Promise.all(images.map(async (f) => ({ type: 'image_url', image_url: { url: await fileToDataUrl(f) } })));
      const body = { ...fields, input_references: refs };
      const resp = await callApi(path, { base, json: body });
      const { rendered, shown } = renderImages(resp);
      const request = { ...fields, input_references: images.map((f) => ({ type: 'image_url', image_url: { url: `<${f.name} as base64 data URL>` } })) };
      const note = mask ? el('div', { class: 'muted small', text: 'The mask was not sent: this endpoint has no mask field.' }) : null;
      renderResult(out, { resp: shown, request, curl: curlFor(path, { base, json: request }), rendered: rendered && el('div', {}, note, rendered) });
      return;
    }
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    for (const img of images) fd.append('image[]', img, img.name);
    if (mask) fd.append('mask', mask, mask.name);
    const resp = await callApi(ep('imageEdit').path, { base: ep('imageEdit').base, formData: fd });
    const { rendered, shown } = renderImages(resp);
    const describe = (f) => `${f.name} (${f.type || 'unknown type'}, ${(f.size / 1024).toFixed(1)} KB)`;
    const request = { ...fields, 'image[]': images.map(describe), ...(mask ? { mask: describe(mask) } : {}) };
    const curl = curlFor(ep('imageEdit').path, { base: ep('imageEdit').base, formFields: [
      ...Object.entries(fields), ...images.map((f) => ['image[]', `@${f.name}`]), ...(mask ? [['mask', `@${mask.name}`]] : []),
    ] });
    renderResult(out, { resp: shown, request, curl, rendered });
  },

  async speech(form, out) {
    const body = compact({
      // A typed voice overrides the dropdown.
      model: chosenModel(form), input: form.elements.input.value.trim(), voice: str(form, 'voice') || str(form, 'voice_preset'),
      response_format: str(form, 'response_format'), speed: num(form, 'speed'), instructions: str(form, 'instructions'),
    });
    const resp = await callApi(ep('speech').path, { base: ep('speech').base, json: body });
    let rendered;
    if (resp.ok && resp.blob) {
      const url = URL.createObjectURL(resp.blob);
      rendered = el('div', { class: 'output' },
        el('audio', { controls: '', src: url, autoplay: '' }),
        el('div', {}, el('a', { href: url, download: `speech.${body.response_format || 'mp3'}`, text: `Download (${(resp.blob.size / 1024).toFixed(1)} KB)` })));
    } else if (resp.ok) {
      rendered = el('div', { class: 'output error', text: 'Expected audio but got a non-binary response – see raw response.' });
    }
    renderResult(out, { resp, request: body, curl: curlFor(ep('speech').path, { base: ep('speech').base, json: body }) + ' \\\n  --output speech.' + (body.response_format || 'mp3'), rendered });
  },

  async transcription(form, out) {
    const file = form.elements.file.files[0] || form._recording;
    if (!file) throw new Error('Choose an audio file or record one.');
    const fields = compact({ model: chosenModel(form), language: str(form, 'language') });
    const fd = new FormData();
    fd.append('file', file, file.name || 'recording.webm');
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    const resp = await callApi(ep('transcription').path, { base: ep('transcription').base, formData: fd });
    let rendered;
    if (resp.ok) {
      const text = typeof resp.data === 'string' ? resp.data : resp.data?.text;
      rendered = el('div', {},
        el('div', { class: 'output', text: text ?? '(no text field – see raw response)' }),
        resp.data?.usage ? el('div', { class: 'muted small', text: `usage: ${JSON.stringify(resp.data.usage)}` }) : null,
      );
    }
    const request = { file: `${file.name || 'recording.webm'} (${file.type || 'unknown type'}, ${(file.size / 1024).toFixed(1)} KB)`, ...fields };
    const curl = curlFor(ep('transcription').path, { base: ep('transcription').base, formFields: [['file', `@${file.name || 'recording.webm'}`], ...Object.entries(fields)] });
    renderResult(out, { resp, request, curl, rendered });
  },

  async rerank(form, out) {
    const documents = lines(form.elements.documents.value);
    if (!documents.length) throw new Error('Enter at least one document line.');
    const body = compact({ model: chosenModel(form), query: form.elements.query.value.trim(), documents, top_n: num(form, 'top_n') });
    const { path, base } = ep('rerank');
    const resp = await callApi(path, { base, json: body });
    let rendered;
    if (resp.ok && Array.isArray(resp.data?.results)) {
      const results = [...resp.data.results].sort((a, b) => b.relevance_score - a.relevance_score);
      rendered = el('div', {},
        el('div', { class: 'output rerank' }, ...results.map((r, rank) => el('div', {},
          el('span', { class: 'small muted', text: `${rank + 1}. #${r.index} ` }), meter(r.relevance_score),
          el('span', { class: 'small', text: ` ${Number(r.relevance_score).toFixed(3)}  ` }),
          el('span', { text: r.document?.text ?? documents[r.index] ?? '' })))),
        el('div', { class: 'muted small', text: usageLine(resp.data) }));
    }
    renderResult(out, { resp, request: body, curl: curlFor(path, { base, json: body }), rendered });
  },

  // Async: submit a job, poll its status, then download the video from /videos/{id}/content.
  async video(form, out) {
    const frame = form.elements.first_frame.files[0];
    const body = compact({
      model: chosenModel(form), prompt: form.elements.prompt.value.trim(), duration: num(form, 'duration'),
      resolution: str(form, 'resolution'), aspect_ratio: str(form, 'aspect_ratio'),
      generate_audio: (!form.elements.generate_audio.disabled && form.elements.generate_audio.checked) || undefined,
    });
    if (frame && form.elements.first_frame.disabled) throw new Error('This model takes no first frame image. Clear the file or pick another model.');
    if (frame) body.frame_images = [{ type: 'image_url', image_url: { url: await fileToDataUrl(frame) }, frame_type: 'first_frame' }];
    const shownReq = frame ? { ...body, frame_images: [{ ...body.frame_images[0], image_url: { url: `<${frame.name} as base64 data URL>` } }] } : body;
    const { path, base } = ep('video');
    const curl = curlFor(path, { base, json: shownReq });
    const t0 = Date.now();
    let resp = await callApi(path, { base, json: body });
    const id = resp.data?.id;
    if (!resp.ok || !id) { renderResult(out, { resp, request: shownReq, curl, rendered: undefined }); return; }

    const progress = el('div', { class: 'muted' });
    out.replaceChildren(progress);
    const done = ['completed', 'failed', 'cancelled', 'expired'];
    let status = resp.data.status;
    while (!done.includes(status)) {
      progress.textContent = `Job ${id}: ${status || 'submitted'} · ${Math.round((Date.now() - t0) / 1000)} s. Checking every 5 s…`;
      if (Date.now() - t0 > 20 * 60 * 1000) throw new Error(`Gave up after 20 minutes. Job ${id} was still ${status}.`);
      await new Promise((r) => setTimeout(r, 5000));
      resp = await callApi(`${path}/${encodeURIComponent(id)}`, { base, method: 'GET' });
      if (!resp.ok) { renderResult(out, { resp, request: shownReq, curl, rendered: undefined }); return; }
      status = resp.data?.status;
    }
    let rendered;
    if (status === 'completed') {
      const video = await callApi(`${path}/${encodeURIComponent(id)}/content?index=0`, { base, method: 'GET' });
      if (video.ok && video.blob) {
        const url = URL.createObjectURL(video.blob);
        rendered = el('div', { class: 'output' },
          el('video', { controls: '', src: url, autoplay: '', muted: '', loop: '' }),
          el('div', {}, el('a', { href: url, download: `video-${id}.mp4`, text: `Download (${(video.blob.size / 1024 / 1024).toFixed(1)} MB)` })),
          el('div', { class: 'muted small', text: `Took ${Math.round((Date.now() - t0) / 1000)} s.${resp.data.usage?.cost != null ? ` Cost $${resp.data.usage.cost}.` : ''}` }));
      } else {
        rendered = el('div', { class: 'output error', text: `The job finished but the video download failed: ${errorMessage(video)}` });
      }
    } else {
      rendered = el('div', { class: 'output error', text: `Job ${status}${resp.data?.error ? `: ${resp.data.error}` : ''}` });
    }
    renderResult(out, { resp, request: shownReq, curl, rendered });
  },
};

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */
function messageText(msg) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) return msg.content.map((p) => p.text ?? '').join('');
  return '';
}
function usageLine(data, choice) {
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
function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch { /* try harder */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* give up */ } }
  return null;
}
function decodeB64Floats(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return Array.from(new Float32Array(bytes.buffer));
}
const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (norm(a) * norm(b) || 1);
}
function similarityTable(vectors, inputs) {
  const label = (i) => `#${i}`;
  return el('div', {},
    el('h3', { text: 'Cosine similarity' }),
    el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th'), ...vectors.map((_, i) => el('th', { title: inputs[i], text: label(i) })))),
      el('tbody', {}, ...vectors.map((a, i) => el('tr', {},
        el('th', { title: inputs[i], text: `${label(i)} ${truncate(inputs[i], 24)}` }),
        ...vectors.map((b, j) => {
          const s = cosine(a, b);
          return el('td', { class: 'sim', style: `background: color-mix(in srgb, var(--accent) ${Math.round(Math.max(0, s) * 55)}%, transparent)`, text: s.toFixed(3) });
        })))))));
}
const truncate = (s = '', n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const pct = (x) => `${(Number(x) * 100).toFixed(0)}%`;
const meter = (x) => el('span', { class: 'meter' }, el('div', { style: `width:${Math.max(0, Math.min(1, Number(x))) * 100}%` }));

function renderAnswer(id, a, q) {
  const head = el('div', {}, el('strong', { text: id }), el('span', { class: 'cat', text: a.type }));
  const box = el('div', { class: 'output answer' }, head);
  if (a.type === 'refusal') {
    box.classList.add('error');
    box.append(el('div', { text: a.refusal || a.reason || a.message || 'The model refused to answer.' }));
  } else if (a.type === 'noul') {
    box.append(el('div', {}, `P(true) = ${pct(a.noul)} `, meter(a.noul)));
  } else if (a.type === 'choice') {
    const probs = a.probabilities || {};
    const opts = Object.keys(probs).length ? Object.keys(probs) : Object.keys(q?.criteria || {});
    box.append(el('div', { class: 'decision-options' }, ...opts.map((o) => el('span', { class: o === a.choice ? 'chosen' : '', text: probs[o] != null ? `${o} · ${pct(probs[o])}` : o }))));
    if (a.confidence != null) box.append(el('div', {}, `confidence ${pct(a.confidence)} `, meter(a.confidence)));
  } else if (a.type === 'score') {
    const labels = Array.isArray(q?.criteria) ? q.criteria : [];
    const max = Math.max(labels.length - 1, 1);
    const nearest = labels[Math.round(Number(a.score))];
    box.append(el('div', {}, `score ${Number(a.score).toFixed(2)} / ${max}${nearest ? ` (≈ ${nearest})` : ''} `, meter(Number(a.score) / max)));
    if (a.confidence != null) box.append(el('div', {}, `confidence ${pct(a.confidence)} `, meter(a.confidence)));
    // The spec documents [{value, probability}]; the live API returns {"0": p, …} plus a legend {"0": label, …}.
    const dist = Array.isArray(a.probabilities) ? a.probabilities
      : Object.entries(a.probabilities || {}).map(([value, probability]) => ({ value, probability }));
    const labelOf = (v) => a.legend?.[v] ?? labels[v];
    if (dist.length) {
      box.append(el('div', { class: 'score-dist' }, ...dist.map((p) => el('div', {},
        el('span', { class: 'small', text: `${p.value}${labelOf(p.value) != null ? ` ${labelOf(p.value)}` : ''}` }), meter(p.probability), el('span', { class: 'small muted', text: ` ${pct(p.probability)}` })))));
    }
  } else {
    box.append(pre(a));
  }
  return box;
}

// Shared by image generation and edits. `shown` shortens b64_json for the raw view.
function renderImages(resp, format = 'png') {
  if (!resp.ok || !Array.isArray(resp.data?.data)) return { rendered: undefined, shown: resp };
  const rendered = el('div', { class: 'output' }, ...resp.data.data.map((img, i) => {
    const src = img.b64_json ? `data:${img.media_type || `image/${format}`};base64,${img.b64_json}` : img.url;
    return el('div', {},
      src ? el('img', { src, alt: `Generated image ${i + 1}` }) : el('div', { text: '(no image data)' }),
      img.revised_prompt ? el('div', { class: 'muted small', text: `Revised prompt: ${img.revised_prompt}` }) : null,
      src ? el('a', { href: src, download: `image-${i + 1}.${format}`, target: '_blank', text: 'Download / open' }) : null);
  }), resp.data.usage ? el('div', { class: 'muted small', text: `usage: ${JSON.stringify(resp.data.usage)}` }) : null);
  const shown = { ...resp, data: { ...resp.data, data: resp.data.data.map((d) => (d.b64_json ? { ...d, b64_json: `<${d.b64_json.length.toLocaleString()} base64 chars>` } : d)) } };
  return { rendered, shown };
}

/* ------------------------------------------------------------------ */
/* Reference images for image edits                                    */
/* ------------------------------------------------------------------ */
const MAX_EDIT_IMAGES = 16;
// Files from several picks add up, so images can come from different folders.
function setupRefImages(form) {
  const input = form.elements.images;
  const grid = $('.ref-images', form);
  const count = $('.ref-count', form);
  form._refImages = [];
  const render = () => {
    grid.replaceChildren(...form._refImages.map((f, i) => el('figure', { title: f.name },
      el('img', { src: URL.createObjectURL(f), alt: f.name, onload: (e) => URL.revokeObjectURL(e.target.src) }),
      el('button', { type: 'button', class: 'secondary', title: 'Remove', text: '×', onclick: () => { form._refImages.splice(i, 1); render(); } }),
      el('figcaption', { text: `${i + 1}. ${f.name}` }))));
    const n = form._refImages.length;
    count.textContent = n ? `${n} of ${MAX_EDIT_IMAGES} images` : 'No images chosen.';
  };
  input.addEventListener('change', () => {
    const room = MAX_EDIT_IMAGES - form._refImages.length;
    const picked = [...input.files];
    form._refImages.push(...picked.slice(0, room));
    input.value = '';
    render();
    if (picked.length > room) count.textContent += ` (skipped ${picked.length - room}: the limit is ${MAX_EDIT_IMAGES})`;
  });
  $('.clear-images', form).addEventListener('click', () => { form._refImages = []; render(); });

  // A file input can't be emptied from its own dialog, so the mask gets a clear button.
  const mask = form.elements.mask;
  const maskRow = $('.mask-row', form);
  const syncMask = () => {
    const f = mask.files[0];
    maskRow.hidden = !f;
    $('.mask-status', form).textContent = f ? `Mask: ${f.name} (${(f.size / 1024).toFixed(1)} KB)` : '';
  };
  mask.addEventListener('change', syncMask);
  $('.clear-mask', form).addEventListener('click', () => { mask.value = ''; syncMask(); });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const CRITERIA_HINT = {
  noul: 'Not used for noul questions',
  choice: 'One option per line, optionally "option: description"',
  score: 'Scale labels, one per line, lowest first',
};
function addQuestion(form, { id = '', type = 'noul', instructions = '', criteria = '' } = {}) {
  const node = $('#question-row').content.firstElementChild.cloneNode(true);
  const typeSel = $('.qtype', node);
  const crit = $('.qcriteria', node);
  $('.qid', node).value = id;
  typeSel.value = type;
  $('.qinstr', node).value = instructions;
  crit.value = criteria;
  const sync = () => { crit.placeholder = CRITERIA_HINT[typeSel.value]; crit.hidden = typeSel.value === 'noul'; };
  typeSel.addEventListener('change', sync);
  sync();
  $('.remove', node).addEventListener('click', () => node.remove());
  $('.questions', form).append(node);
}

function addMessage(form, role = 'user', content = '') {
  const node = $('#message-row').content.firstElementChild.cloneNode(true);
  $('.role', node).value = role;
  $('.content', node).value = content;
  $('.remove', node).addEventListener('click', () => node.remove());
  $('.messages', form).append(node);
  if (!content) $('.content', node).focus();
}

/* ------------------------------------------------------------------ */
/* Mic recording for transcriptions                                    */
/* ------------------------------------------------------------------ */
function setupRecorder(form) {
  const btn = $('.record-btn', form);
  const status = $('.record-status', form);
  let recorder; let chunks = [];
  // A recording or the sample clip is kept on the form and used when no file is chosen.
  const useAudio = (file, label) => {
    form._recording = file;
    form.elements.file.value = '';
    status.replaceChildren(`${label} ${(file.size / 1024).toFixed(1)} KB `, el('audio', { controls: '', src: URL.createObjectURL(file) }));
  };
  $('.sample-btn', form).addEventListener('click', async () => {
    try {
      const res = await fetch('sample.ogg');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      useAudio(new File([await res.blob()], 'sample.ogg', { type: 'audio/ogg' }), 'Sample clip');
    } catch (err) {
      status.textContent = `Could not load the sample: ${err.message}`;
    }
  });
  btn.addEventListener('click', async () => {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        btn.textContent = '● Record from mic';
        useAudio(new File(chunks, `recording.${ext}`, { type }), 'Recorded');
      };
      recorder.start();
      btn.textContent = '■ Stop recording';
      status.textContent = 'Recording…';
    } catch (err) {
      status.textContent = `Mic unavailable: ${err.message}`;
    }
  });
  form.elements.file.addEventListener('change', () => { form._recording = null; status.textContent = ''; });
}

/* ------------------------------------------------------------------ */
/* Games and Tools                                                     */
/* ------------------------------------------------------------------ */
// Each hub tab shows a launcher of icon cards. Opening one fills the page under the tab bar.
// An app is { id, title, blurb, icon (inline SVG), status?, render(container) }.
const svgIcon = (paths) => {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  return wrap.firstElementChild;
};
const ICONS = {
  groupChat: '<path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M17 9h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-4a2 2 0 0 1-2-2v-1"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>',
};

const HUBS = {
  games: { title: 'Games', blurb: 'Small games and experiments played with LLMs.' },
  tools: { title: 'Tools', blurb: 'Focused tools built on the endpoints, with only the options we have checked.' },
};

const APPS = {
  games: [
    { id: 'group-chat', title: 'AI Group Chat', icon: ICONS.groupChat, status: 'Coming soon',
      blurb: 'Several AI characters, each on its own model, chat with you and with each other.', render: renderGroupChatPlaceholder },
  ],
  tools: [
    { id: 'video-generator', title: 'Video Generator', icon: ICONS.video, status: 'Coming soon',
      blurb: 'Make videos with models whose options we have tested, with the right settings for each.', render: renderVideoGeneratorPlaceholder },
  ],
};

function setupHubs() {
  for (const panel of $$('.panel.hub')) {
    const hub = panel.dataset.hub;
    const showLauncher = () => {
      store.del(`app_${hub}`);
      panel.replaceChildren(
        el('div', { class: 'hub-head' }, el('h2', { text: HUBS[hub].title }), el('span', { class: 'muted', text: HUBS[hub].blurb })),
        el('div', { class: 'launcher' },
          ...APPS[hub].map((app) => el('button', { type: 'button', class: 'app-card', onclick: () => openApp(app) },
            el('span', { class: 'app-icon' }, svgIcon(app.icon)),
            el('strong', { text: app.title }),
            el('span', { class: 'muted small', text: app.blurb }),
            app.status ? el('span', { class: 'tag', text: app.status }) : null)),
          el('div', { class: 'app-card soon' }, el('strong', { text: 'More to come' }), el('span', { class: 'small', text: 'New ideas land here.' }))));
    };
    const openApp = (app) => {
      store.set(`app_${hub}`, app.id);
      const body = el('div', { class: 'app-view' });
      panel.replaceChildren(
        el('div', { class: 'hub-head' },
          el('button', { type: 'button', class: 'secondary', text: `← All ${HUBS[hub].title.toLowerCase()}`, onclick: showLauncher }),
          el('h2', { text: app.title }),
          app.status ? el('span', { class: 'tag', text: app.status }) : null),
        body);
      app.render(body);
    };
    const saved = APPS[hub].find((a) => a.id === store.get(`app_${hub}`));
    if (saved) openApp(saved); else showLauncher();
  }
}

// Placeholder: the layout the group chat will have, with nothing wired up yet.
function renderGroupChatPlaceholder(root) {
  const people = [
    { name: 'Ada', color: '#7c5cd6', role: 'curious scientist', model: 'pick a chat model' },
    { name: 'Bram', color: '#d6705c', role: 'grumpy pirate', model: 'pick a chat model' },
    { name: 'Cleo', color: '#3f9e7a', role: 'quiz host', model: 'pick a chat model' },
  ];
  const avatar = (p) => el('span', { class: 'gc-avatar', style: `background:${p.color}`, text: p.name[0] });
  const msg = (p, text) => el('div', { class: `gc-msg${p ? '' : ' me'}` },
    p ? avatar(p) : el('span', { class: 'gc-avatar', style: 'background:var(--accent)', text: 'You'[0] }),
    el('div', { class: 'bubble' }, el('div', { class: 'small muted', text: p ? p.name : 'You' }), text));
  root.append(
    el('div', { class: 'placeholder-note' },
      el('strong', { text: 'What this will be' }),
      el('ul', {},
        el('li', { text: 'Add 2–6 AI characters, each with a name, a personality and any chat model from the chosen endpoint.' }),
        el('li', { text: 'They take turns answering you and each other, so different models talk in one conversation.' }),
        el('li', { text: 'Modes such as free chat, a debate or a guessing game, and a cost counter per character.' }))),
    el('div', { class: 'groupchat mock' },
      el('div', { class: 'gc-side' },
        el('strong', { text: 'Characters' }),
        ...people.map((p) => el('div', { class: 'gc-person' }, avatar(p),
          el('div', {}, el('div', { text: `${p.name} · ${p.role}` }), el('div', { class: 'muted small', text: p.model })))),
        el('button', { type: 'button', class: 'secondary', disabled: '', text: '+ Add character' })),
      el('div', { class: 'gc-main' },
        el('div', { class: 'gc-log' },
          msg(null, 'Hi all! What should we play?'),
          msg(people[2], 'A quiz! First question: which planet has the most moons?'),
          msg(people[0], 'Saturn, last I checked. The count keeps changing as new ones are found.'),
          msg(people[1], 'Arr, I only count the ones I can see from the deck.')),
        el('div', { class: 'row' },
          el('input', { disabled: '', placeholder: 'Coming soon', style: 'flex:1' }),
          el('button', { type: 'button', class: 'primary', disabled: '', text: 'Send' })))));
}

// Placeholder: a curated video tool. The Video tab stays as the raw endpoint tester.
function renderVideoGeneratorPlaceholder(root) {
  root.append(
    el('div', { class: 'placeholder-note' },
      el('strong', { text: 'What this will be' }),
      el('ul', {},
        el('li', { text: 'Only video models we have tested, each with the options it really supports (duration, resolution, aspect ratio, audio, first and last frame).' }),
        el('li', { text: 'Price shown before you start, from the model\'s per-second pricing.' }),
        el('li', { text: 'Jobs keep running while you do other things, and finished videos are listed in a gallery.' })),
      el('div', { class: 'muted small', text: 'For any video model with raw request and response details, use the Video tab.' })),
    el('div', { class: 'vidgen mock' },
      el('div', {},
        el('strong', { text: 'Model' }),
        el('div', { class: 'vg-models' },
          ...['Tested model 1', 'Tested model 2', 'Tested model 3'].map((t) => el('div', { class: 'vg-model' },
            el('div', { text: t }), el('div', { class: 'muted small', text: 'durations · resolutions · price/s' })))),
        el('label', {}, 'Prompt', el('textarea', { rows: 3, disabled: '', placeholder: 'Describe the video…' })),
        el('div', { class: 'grid3' },
          el('label', {}, 'Duration', el('select', { disabled: '' }, el('option', { text: '—' }))),
          el('label', {}, 'Resolution', el('select', { disabled: '' }, el('option', { text: '—' }))),
          el('label', {}, 'Aspect ratio', el('select', { disabled: '' }, el('option', { text: '—' })))),
        el('button', { type: 'button', class: 'primary', disabled: '', text: 'Generate' })),
      el('div', {},
        el('strong', { text: 'Preview' }),
        el('div', { class: 'vg-stage', text: 'Your video will play here' }),
        el('strong', { text: 'Gallery' }),
        el('div', { class: 'muted small', text: 'Finished videos will be listed here.' }))));
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */
function init() {
  // Tabs
  $$('.tabs button').forEach((btn) => btn.addEventListener('click', () => {
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === btn.dataset.tab));
    store.set('tab', btn.dataset.tab);
  }));
  const savedTab = store.get('tab');
  if (savedTab) $(`.tabs button[data-tab="${savedTab}"]`)?.click();
  setupHubs();

  // Endpoint and key. Keys are remembered per provider.
  const keyName = () => `key_${state.provider}`;
  const legacyKey = store.get('requesty_key');
  if (legacyKey && !store.get('key_requesty')) store.set('key_requesty', legacyKey);
  store.del('requesty_key');
  const providerSelect = $('#provider');
  providerSelect.replaceChildren(...Object.entries(PROVIDERS).map(([id, p]) => el('option', { value: id, text: p.label })));
  const savedProvider = store.get('provider');
  if (PROVIDERS[savedProvider]) state.provider = savedProvider;
  providerSelect.value = state.provider;
  $('#base-url').addEventListener('change', () => {
    const url = baseUrl();
    if (url && url !== provider().baseUrl) store.set(`base_${state.provider}`, url); else store.del(`base_${state.provider}`);
  });
  $('#reset-url').addEventListener('click', () => {
    $('#base-url').value = provider().baseUrl;
    store.del(`base_${state.provider}`);
    $('#base-url').focus();
  });
  providerSelect.addEventListener('change', () => {
    state.keys[state.provider] = apiKey();
    state.provider = providerSelect.value;
    store.set('provider', state.provider);
    applyProvider();
  });
  $('#key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('#remember-key').checked && apiKey()) store.set(keyName(), apiKey()); else store.del(keyName());
    loadModels();
  });
  $('#remember-key').addEventListener('change', (e) => { if (!e.target.checked) store.del(keyName()); });

  // Pickers & forms
  $$('.model-picker').forEach(setupPicker);
  const chatForm = $('form[data-kind=chat]');
  addMessage(chatForm, 'user', 'Say hello and tell me which model you are.');
  $('.add-message', chatForm).addEventListener('click', () => addMessage(chatForm));
  setupRecorder($('form[data-kind=transcription]'));
  setupVoicePicker($('form[data-kind=speech]'));
  setupRefImages($('form[data-kind=imageEdit]'));
  for (const kind of ['image', 'imageEdit', 'video', 'speech']) setupModelOptions($(`form[data-kind=${kind}]`));
  const decisionForm = $('form[data-kind=decision]');
  addQuestion(decisionForm, { id: 'positive', type: 'noul', instructions: 'The review is positive.' });
  addQuestion(decisionForm, { id: 'genre', type: 'choice', instructions: 'Which genre is the book?', criteria: 'fantasy: Magic, myth or invented worlds\nmystery: A crime or puzzle to solve\nromance: A love story' });
  addQuestion(decisionForm, { id: 'rating', type: 'score', instructions: 'How much did the reviewer enjoy the book?', criteria: 'Hated it\nDisliked it\nNeutral\nLiked it\nLoved it' });
  $('.add-question', decisionForm).addEventListener('click', () => addQuestion(decisionForm));

  $$('form.request-form').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = $('.result', form.closest('.panel'));
    const btn = $('button[type=submit]', form);
    if (!chosenModel(form)) { renderException(out, new Error('Pick or type a model first.')); return; }
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Sending…';
    // Show elapsed time, since cold-starting provider models can take a minute.
    const waiting = el('div', { class: 'muted', text: 'Waiting for response…' });
    out.replaceChildren(waiting);
    const t0 = Date.now();
    const timer = setInterval(() => { waiting.textContent = `Waiting for response… ${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
    try {
      await handlers[form.dataset.kind](form, out);
    } catch (err) {
      renderException(out, err);
    } finally {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = label;
    }
  }));

  $('#model-filter').addEventListener('input', renderModelsTable);

  applyProvider();
}

// Fills the URL, key and links for the chosen provider, clears the old model list and
// loads the new one when a key is available.
function applyProvider() {
  const p = provider();
  $('#base-url').value = store.get(`base_${state.provider}`) || p.baseUrl;
  const saved = store.get(`key_${state.provider}`);
  $('#api-key').value = state.keys[state.provider] ?? saved ?? '';
  $('#remember-key').checked = Boolean(saved);
  const link = $('#signup-link');
  link.hidden = !p.signup;
  if (p.signup) { link.href = p.signup.href; link.textContent = p.signup.text; }
  $$('.tabs button').forEach((b) => {
    const off = p.unsupported?.includes(b.dataset.tab);
    b.classList.toggle('unsupported', Boolean(off));
    b.title = off ? `${p.label} has no endpoint for this tab` : '';
  });

  state.models = [];
  $('#models-raw').textContent = '';
  refreshPickers();
  renderModelsTable();

  const hasEnvKey = () => Boolean(state.config?.providers?.[state.provider]?.hasEnvKey);
  const showKeyHint = () => {
    $('#api-key').placeholder = hasEnvKey() ? `Using ${p.keyEnv} from server (optional override)` : `${p.label} API key (${p.keyHint})`;
  };
  showKeyHint();
  $('#models-status').textContent = 'No models loaded.';
  serverConfig.then((cfg) => {
    if (p !== provider()) return;
    showKeyHint();
    if (!cfg) $('#models-status').textContent = `No models loaded. Calling ${p.label} directly from the browser.`;
    if (apiKey() || hasEnvKey()) loadModels();
  });
}

init();
