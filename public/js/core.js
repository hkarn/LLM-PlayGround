/* LLM PlayGround: Shared core: providers, requests, results, model pickers, form helpers, drafts and the busy/Cancel helper. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const el = (tag, attrs = {}, ...children) => {
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
export const CATEGORY_LABEL = {
  chat: 'Chat', decision: 'Decision', embedding: 'Embeddings', rerank: 'Rerank', image: 'Image', video: 'Video',
  speech: 'Speech', transcription: 'Transcription',
};
// Default paths, relative to the base URL. Providers can override them in PROVIDERS[...].endpoints.
export const ENDPOINT = {
  chat: '/chat/completions', decision: '/decisions', embeddings: '/embeddings', rerank: '/rerank',
  image: '/images/generations', imageEdit: '/images/edits', video: '/videos', speech: '/audio/speech', transcription: '/audio/transcriptions',
};

// Endpoints in the picker. `baseUrl` is only a suggestion: the URL field can be edited.
// `modelsPaths` are fetched and merged. `keyEnv` is the server.js env var and the name used in cURL.
// `unsupported` lists tabs the provider has no endpoint for; they stay usable but are dimmed.
// `endpoints` overrides a tab's path (relative to the base URL), its base (a function of the
// base URL) or its request style (`json` for image edits sent as input_references).
export const PROVIDERS = {
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

export const state = {
  models: [],         // raw model objects from the provider's model list
  provider: 'requesty',
  keys: {},           // keys typed this session, per provider, so switching back keeps them
  viaServer: false,   // true when server.js serves the page and proxies /api/*
  config: null,       // server.js `config`, or null on a static host
};
export const provider = () => PROVIDERS[state.provider];
export const baseUrl = () => $('#base-url').value.trim().replace(/\/+$/, '');
// Where a tab sends its request on the current provider: { path, base, json }.
export function ep(kind) {
  const o = provider().endpoints?.[kind] || {};
  return { path: o.path || ENDPOINT[kind], base: o.base ? o.base(baseUrl()) : baseUrl(), json: Boolean(o.json) };
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
    Object.assign(headers, { 'HTTP-Referer': location.origin + location.pathname, 'X-Title': 'LLM PlayGround' });
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
/* Result panel                                                        */
/* ------------------------------------------------------------------ */
export function pre(obj) {
  return el('pre', { class: 'mono' }, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

export function renderResult(container, { resp, request, curl, rendered }) {
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

export function renderException(container, err) {
  container.replaceChildren(el('div', { class: 'output error', text: `Request failed: ${err.message}` }));
}

/* ------------------------------------------------------------------ */
/* Model pickers                                                       */
/* ------------------------------------------------------------------ */
export function setupPicker(picker) {
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

export function stripPrivate(m) {
  const { _category, ...rest } = m;
  return rest;
}

export function chosenModel(form) {
  return form.elements.model_custom.value.trim() || form.elements.model.value;
}

export function refreshPickers() { $$('.model-picker').forEach((p) => p._fill && p._fill()); }

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
    refreshPickers();
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
/* Per-model option lists                                              */
/* ------------------------------------------------------------------ */
// A dropdown's choices come from, in order: the chosen model's own metadata, the provider's
// `suggest` list for that form, then the options written in index.html. `false` from either
// source greys the field out, and disabled fields are not sent.
export const VIDEO_META = { duration: 'supported_durations', resolution: 'supported_resolutions', aspect_ratio: 'supported_aspect_ratios' };
export function optionsFromModel(kind, name, m) {
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

export function setupModelOptions(form) {
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

// Shared by image generation and edits. `shown` shortens b64_json for the raw view.
export function renderImages(resp, format = 'png') {
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
export const MAX_EDIT_IMAGES = 16;
// Image with reference pictures, on whatever the current provider uses for edits.
// OpenRouter: JSON to /images with data URLs in input_references and no mask.
// OpenAI style (Requesty, custom): multipart with one image[] field per picture.
export async function sendImageEdit(fields, images, mask, signal) {
  const { path, base, json } = ep('imageEdit');
  if (json) {
    const refs = await Promise.all(images.map(async (f) => ({ type: 'image_url', image_url: { url: await fileToDataUrl(f) } })));
    const resp = await callApi(path, { base, json: { ...fields, input_references: refs }, signal });
    const request = { ...fields, input_references: images.map((f) => ({ type: 'image_url', image_url: { url: `<${f.name} as base64 data URL>` } })) };
    return { resp, request, curl: curlFor(path, { base, json: request }), maskDropped: Boolean(mask) };
  }
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  for (const img of images) fd.append('image[]', img, img.name);
  if (mask) fd.append('mask', mask, mask.name);
  const resp = await callApi(path, { base, formData: fd, signal });
  const describe = (f) => `${f.name} (${f.type || 'unknown type'}, ${(f.size / 1024).toFixed(1)} KB)`;
  const request = { ...fields, 'image[]': images.map(describe), ...(mask ? { mask: describe(mask) } : {}) };
  const curl = curlFor(path, { base, formFields: [
    ...Object.entries(fields), ...images.map((f) => ['image[]', `@${f.name}`]), ...(mask ? [['mask', `@${mask.name}`]] : []),
  ] });
  return { resp, request, curl, maskDropped: false };
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Remembers the model chosen in a tool form, and the step's other `fields`, per provider, and
// picks them again whenever the model list is refilled (page load, model reload, provider switch).
export function rememberModel(form, key, fields = []) {
  const k = () => `dgscene_model_${key}_${state.provider}`;
  const picker = $('.model-picker', form);
  const select = form.elements.model;
  const custom = form.elements.model_custom;
  const fill = picker._fill;
  let filling = false; // a refill selects the first model; that is not the user's choice
  picker._fill = () => {
    const saved = store.get(k());
    filling = true;
    fill();
    filling = false;
    if (saved && [...select.options].some((o) => o.value === saved) && select.value !== saved) {
      select.value = saved;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Then the step's other settings, where the chosen model still offers that value.
    for (const name of fields) {
      const f = form.elements[name];
      const v = store.get(`${k()}_${name}`);
      if (!f || f.disabled || v == null) continue;
      if (f.tagName !== 'SELECT' || [...f.options].some((o) => o.value === v)) f.value = v;
    }
  };
  select.addEventListener('change', () => { if (!filling && select.value) store.set(k(), select.value); });
  for (const name of fields) {
    form.elements[name]?.addEventListener('change', (e) => {
      if (!filling && !e.target.disabled) store.set(`${k()}_${name}`, e.target.value);
    });
  }
  custom.value = store.get(`${k()}_custom`) || '';
  custom.addEventListener('input', () => {
    if (custom.value.trim()) store.set(`${k()}_custom`, custom.value.trim());
    else store.del(`${k()}_custom`);
  });
  picker._fill();
}

// A Hide/Show settings button for a tool step. Hiding is possible only once the step's
// mandatory choice (its model) is made; the choice to hide is remembered.
export function settingsToggle(form, body, key, describe) {
  const k = `dgscene_hide_${key}`;
  const btn = el('button', { type: 'button', class: 'secondary' });
  const summary = el('span', { class: 'muted small' });
  body.before(el('div', { class: 'row settings-bar' }, btn, summary));
  let hide = store.get(k) === '1';
  const sync = () => {
    const ready = Boolean(chosenModel(form));
    const hidden = hide && ready;
    body.hidden = hidden;
    btn.textContent = hidden ? 'Show settings' : 'Hide settings';
    btn.disabled = !hidden && !ready;
    summary.textContent = hidden ? describe() : (ready ? '' : 'Choose a model; then the settings can be hidden.');
  };
  btn.addEventListener('click', () => {
    hide = !body.hidden;
    if (hide) store.set(k, '1');
    else store.del(k);
    sync();
  });
  form.addEventListener('change', sync);
  form.addEventListener('input', sync);
  sync();
}

// Runs one request for a form: busy button, elapsed time, a Cancel button and error display.
// Used by every endpoint tab and tool. Cancel aborts the fetch (and any polling between calls)
// through `form._abort`, so the form is usable again without reloading the page.
export async function runStep(form, out, fn) {
  const btn = $('button[type=submit]', form);
  if (!form._cancelBtn) {
    form._cancelBtn = el('button', { type: 'button', class: 'secondary cancel-btn', text: 'Cancel', hidden: '',
      onclick: () => form._abort?.abort() });
    btn.after(form._cancelBtn);
  }
  form._abort = new AbortController();
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending…';
  form._cancelBtn.hidden = false;
  const waiting = el('div', { class: 'muted', text: 'Waiting for response…' });
  out.replaceChildren(waiting);
  // Show elapsed time, since cold-starting provider models can take a minute.
  const t0 = Date.now();
  const timer = setInterval(() => { waiting.textContent = `Waiting for response… ${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
  try {
    await fn();
  } catch (err) {
    if (err?.name === 'AbortError') {
      out.replaceChildren(el('div', { class: 'output', text: `Cancelled after ${Math.round((Date.now() - t0) / 1000)} s. The page stopped waiting; the provider may still finish the request and charge for it.` }));
    } else {
      renderException(out, err);
    }
  } finally {
    clearInterval(timer);
    btn.disabled = false;
    btn.textContent = label;
    form._cancelBtn.hidden = true;
    form._abort = null;
  }
}

// A pause that ends early, with an AbortError, when the signal is aborted.
export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

/* ------------------------------------------------------------------ */
/* Drafts: typed text survives a reload                                */
/* ------------------------------------------------------------------ */
// Text the user typed is kept in sessionStorage (this browser tab only; cleared when the tab
// closes) and put back after a reload. Choices of model and options are kept by rememberModel.
export const drafts = {
  get(k) { try { return sessionStorage.getItem(`draft:${k}`); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(`draft:${k}`, v); } catch { /* full or blocked: skip */ } },
};
// Saves after a short pause in typing, so a large export is not rewritten on every key.
export function debounce(fn, ms = 400) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Text, number and checkbox fields with a name, inside `root`, keyed by `scope` and name.
export function keepDrafts(root, scope, { skip = [] } = {}) {
  const fields = $$('input[name], textarea[name]', root)
    .filter((f) => !['file', 'password', 'hidden'].includes(f.type) && !skip.includes(f.name) && !['model', 'model_custom'].includes(f.name));
  for (const f of fields) {
    const key = `${scope}:${f.name}`;
    const saved = drafts.get(key);
    if (saved != null) {
      if (f.type === 'checkbox') f.checked = saved === '1';
      else f.value = saved;
      f.dispatchEvent(new Event(f.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
    }
    const save = debounce(() => drafts.set(key, f.type === 'checkbox' ? (f.checked ? '1' : '0') : f.value));
    f.addEventListener(f.type === 'checkbox' ? 'change' : 'input', save);
  }
}

// Rows added on the page (chat messages, decision questions): saved as a list, rebuilt on load.
export function keepRows(form, scope, container, { read, rebuild }) {
  const saved = drafts.get(scope);
  if (saved) {
    try {
      const rows = JSON.parse(saved);
      if (Array.isArray(rows)) { container.replaceChildren(); rows.forEach((r) => rebuild(r)); }
    } catch { /* ignore a broken draft */ }
  }
  const save = debounce(() => drafts.set(scope, JSON.stringify(read())));
  container.addEventListener('input', save);
  container.addEventListener('change', save);
  new MutationObserver(save).observe(container, { childList: true });
}
