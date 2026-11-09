/* LLM PlayGround: UI component: the result panel (status, rendered answer, raw response, request, headers, cURL) and image results. */
import { read } from '../adapter.js';
import { errorMessage } from '../core.js';
import { el } from './dom.js';

/* ------------------------------------------------------------------ */
/* Result panel                                                        */
/* ------------------------------------------------------------------ */
export function pre(obj) {
  return el('pre', { class: 'mono' }, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

// quiet (the tools): the answer, or the error, first; the status line and the raw views folded into
// one "Request details". The API tester tabs show them all, as a debugger should.
export function renderResult(container, { resp, request, curl, rendered, quiet = false }) {
  container.replaceChildren();
  if (quiet) {
    const raw = el('div', {});
    renderResult(raw, { resp, request, curl });
    raw.querySelector('.output.error')?.remove();
    container.append(...(resp.ok ? (rendered ? [rendered] : []) : [el('div', { class: 'output error', text: errorMessage(resp) })]),
      el('details', { class: 'request-details' }, el('summary', { text: 'Request details' }), ...raw.childNodes));
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
export function renderImages(resp, format = 'png', kind = 'image') {
  const images = resp.ok ? read(kind, resp).images : undefined;
  if (!images?.length) return { rendered: undefined, shown: resp };
  const rendered = el('div', { class: 'output' }, ...images.map((img, i) => {
    const src = img.b64 ? `data:${img.mime || `image/${format}`};base64,${img.b64}` : img.url;
    return el('div', {},
      src ? el('img', { src, alt: `Generated image ${i + 1}` }) : el('div', { text: '(no image data)' }),
      img.revised ? el('div', { class: 'muted small', text: `Revised prompt: ${img.revised}` }) : null,
      src ? el('a', { href: src, download: `image-${i + 1}.${format}`, target: '_blank', text: 'Download / open' }) : null);
  }), resp.data.usage ? el('div', { class: 'muted small', text: `usage: ${JSON.stringify(resp.data.usage)}` }) : null);
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
