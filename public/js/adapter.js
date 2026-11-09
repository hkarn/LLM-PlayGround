/* LLM PlayGround: The provider adapter: fills the provider's request template, sends it, and reads answers through its response map. */
import { callApi, curlFor, ep, fileToDataUrl, provider, TEMPLATES } from './core.js';

// An endpoint's settings: the shared OpenAI-standard template (providers/openai-standard.json)
// with the provider file's own endpoints[kind] laid over it, plus where to send it.
export function spec(kind) {
  const std = TEMPLATES.endpoints?.[kind] || {};
  const own = provider().endpoints?.[kind] || {};
  const { path, base } = ep(kind);
  return { body: 'json', files: [], drops: [], ...std, ...own, path, base };
}

const empty = (v) => v === undefined || v === null || v === '';

function get(vars, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);
}

// Fills a request template. "{{name}}" alone keeps the value's type, and the key is left out when
// it is missing or empty; text around {{…}} makes a string. {each, as} maps a list (each entry is
// "item"); a "..." key copies an object's keys in at that point (overwriting earlier keys in place).
export function fill(tpl, vars) {
  if (typeof tpl === 'string') {
    const whole = tpl.match(/^\{\{([\w.]+)\}\}$/);
    if (whole) {
      const v = get(vars, whole[1]);
      return empty(v) ? undefined : v;
    }
    return tpl.replace(/\{\{([\w.]+)\}\}/g, (_, p) => (empty(get(vars, p)) ? '' : String(get(vars, p))));
  }
  if (Array.isArray(tpl)) return tpl.map((t) => fill(t, vars)).filter((v) => v !== undefined);
  if (tpl && typeof tpl === 'object') {
    if (tpl.each) {
      const list = get(vars, tpl.each);
      if (!Array.isArray(list) || !list.length) return undefined;
      return list.map((item) => fill(tpl.as, { ...vars, item }));
    }
    // Every key keeps its place (an empty one too, until the end), so a "..." spread that sets a
    // key overwrites it in place, as a JavaScript object spread does.
    const out = {};
    for (const [k, t] of Object.entries(tpl)) {
      if (k === '...') {
        const obj = fill(t, vars);
        if (obj && typeof obj === 'object') Object.assign(out, obj);
        continue;
      }
      out[k] = fill(t, vars);
    }
    for (const k of Object.keys(out)) if (empty(out[k])) delete out[k];
    return out;
  }
  return tpl;
}

// "$.a.b[0].c" and "[*]" paths into a response.
export function pick(data, path) {
  const steps = path.replace(/^\$\.?/, '').match(/[^.[\]]+|\[\*\]|\[\d+\]/g) || [];
  let cur = [data];
  let many = false;
  for (const s of steps) {
    if (s === '[*]') { cur = cur.flatMap((x) => (Array.isArray(x) ? x : [])); many = true; continue; }
    const key = s.startsWith('[') ? Number(s.slice(1, -1)) : s;
    cur = cur.map((x) => (x == null ? undefined : x[key]));
  }
  return many ? cur.filter((x) => x !== undefined) : cur[0];
}

// The answer in the app's own terms, e.g. { text, model, usage } for chat or { images: [{ b64, url,
// mime, revised }], usage } for images, whatever shape the provider sends.
export function read(kind, resp) {
  const out = {};
  for (const [key, rule] of Object.entries(spec(kind).response || {})) {
    if (typeof rule === 'string') out[key] = pick(resp?.data, rule);
    else if (rule?.path) {
      const items = pick(resp?.data, rule.path);
      out[key] = (Array.isArray(items) ? items : []).map((it) => Object.fromEntries(Object.entries(rule.as).map(([k, p]) => [k, pick(it, p)])));
    }
  }
  if (Array.isArray(out.text)) out.text = out.text.map((p) => p?.text ?? '').join(''); // content given as parts
  return out;
}

const describe = (f) => `${f.name} (${f.type || 'unknown type'}, ${(f.size / 1024).toFixed(1)} KB)`;

// Sends one request of `kind` built from `input` (field values, plus lists of Files such as images).
// Returns { resp, request, curl, dropped }: request and curl are what was sent, with file contents
// shortened for display; dropped lists inputs this endpoint cannot take.
export async function send(kind, input, { signal } = {}) {
  const s = spec(kind);
  const dropped = s.drops.filter((k) => !empty(input[k]));
  if (s.body === 'multipart') {
    const fields = fill(s.request, input) || {};
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    const parts = [];
    for (const f of s.files) {
      const list = f.each ? (input[f.each] || []) : (input[f.one] ? [input[f.one]] : []);
      for (const file of list) { fd.append(f.field, file, file.name); parts.push({ f, file }); }
    }
    const resp = await callApi(s.path, { base: s.base, formData: fd, signal });
    const request = { ...fields };
    for (const f of s.files) {
      const shown = parts.filter((p) => p.f === f).map((p) => describe(p.file));
      if (shown.length) request[f.field] = f.each ? shown : shown[0];
    }
    const curl = curlFor(s.path, { base: s.base, formFields: [...Object.entries(fields), ...parts.map((p) => [p.f.field, `@${p.file.name}`])] });
    return { resp, request, curl, dropped };
  }
  // JSON: lists of Files become items with a name and, when the template uses it, a data URL.
  // The shown copy gets a placeholder instead of the data.
  const tplText = JSON.stringify(s.request);
  const real = { ...input };
  const shown = { ...input };
  for (const [k, v] of Object.entries(input)) {
    if (!Array.isArray(v) || !v.length || !(v[0] instanceof Blob)) continue;
    const needsData = tplText.includes('item.dataUrl');
    real[k] = await Promise.all(v.map(async (file) => ({ name: file.name, dataUrl: needsData ? await fileToDataUrl(file) : undefined })));
    shown[k] = v.map((file) => ({ name: file.name, dataUrl: `<${file.name} as base64 data URL>` }));
  }
  const body = fill(s.request, real) || {};
  const request = fill(s.request, shown) || {};
  const resp = await callApi(s.path, { base: s.base, json: body, signal });
  return { resp, request, curl: curlFor(s.path, { base: s.base, json: request }), dropped };
}
