/* LLM PlayGround: UI component: the result panel (status, rendered answer, raw response, request, headers, cURL) and image results. */
import { read } from '../adapter.js';
import { errorMessage } from '../core/api.js';
import { el } from './dom.js';
import { dockDetails, fileName, pictures } from './media.js';

/* ------------------------------------------------------------------ */
/* Result panel                                                        */
/* ------------------------------------------------------------------ */
export function pre(obj) {
  return el('pre', { class: 'mono' }, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

// The line under a text answer, the same shape as a clip's: input tokens first, then the time and
// the billed cost. Null when there is nothing to show.
export function answerFacts(usage, seconds) {
  const u = usage || {};
  const input = u.prompt_tokens ?? u.input_tokens;
  const time = [seconds != null ? `Took ${seconds} s.` : '', u.cost != null ? `Billed $${u.cost}` : ''].filter(Boolean).join(' ');
  const parts = [input != null ? `${Number(input).toLocaleString()} input tokens` : '', time].filter(Boolean);
  return parts.length ? el('div', { class: 'muted small', text: parts.join(' · ') }) : null;
}

// quiet (the tools): the answer, or the error, first; the status line and the raw views folded into
// one "Request details". The API tester tabs show them all, as a debugger should.
export function renderResult(container, { resp, request, curl, rendered, quiet = false }) {
  container.replaceChildren();
  if (quiet) {
    const raw = el('div', {});
    renderResult(raw, { resp, request, curl });
    raw.querySelector('.output.error')?.remove();
    const details = el('details', { class: 'request-details' }, el('summary', { text: 'Request details' }), ...raw.childNodes);
    container.append(...(resp.ok ? (rendered ? [rendered] : []) : [el('div', { class: 'output error', text: errorMessage(resp) })]));
    // Under a picture or clip the fold sits on the left of its bar (ui/media.js); otherwise below.
    if (!(resp.ok && rendered && dockDetails(rendered, details))) container.append(details);
    return;
  }
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

// Shared by image generation and edits. `shown` shortens b64_json for the raw view.
// `kind` names the endpoint whose response map says where the images are (image or imageEdit).
// opts: name (the start of the file name, e.g. "draw-scene"), retry (the tools: send again).
// Each picture opens larger when clicked and has a bar with a download icon (ui/media.js).
export function renderImages(resp, format = 'png', kind = 'image', { name = kind === 'imageEdit' ? 'image-edit' : 'image', retry } = {}) {
  const images = resp.ok ? read(kind, resp).images : undefined;
  if (!images?.length) return { rendered: undefined, shown: resp };
  const list = images.map((img, i) => {
    const src = img.b64 ? `data:${img.mime || `image/${format}`};base64,${img.b64}` : img.url;
    const ext = (img.mime || `image/${format}`).split('/')[1]?.replace('jpeg', 'jpg') || format;
    return src && { src, alt: `Generated image ${i + 1}`, caption: img.revised ? `Revised prompt: ${img.revised}` : '', name: fileName(name, ext, images.length > 1 ? i + 1 : 0) };
  });
  const rendered = el('div', { class: 'output' },
    ...pictures(list.filter(Boolean), { retry }),
    ...(list.some((x) => !x) ? [el('div', { text: '(an image came back without data)' })] : []));
  const shown = { ...resp, data: shortenBase64(resp.data) };
  return { rendered, shown };
}

// A copy of a response with long base64 strings shortened, for the raw view.
function shortenBase64(v) {
  // Only unbroken base64 (or a base64 data URL): long text with spaces is shown as it is.
  if (typeof v === 'string') {
    const data = v.match(/^data:[\w/+.-]+;base64,/);
    const body = data ? v.slice(data[0].length) : v;
    return body.length > 2000 && /^[A-Za-z0-9+/=]+$/.test(body) ? `<${data ? data[0] : ''}${body.length.toLocaleString()} base64 chars>` : v;
  }
  if (Array.isArray(v)) return v.map(shortenBase64);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shortenBase64(x)]));
  return v;
}
