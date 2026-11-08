/* LLM PlayGround: The endpoint testers: one handler per API tab, and the helpers only those tabs use. */
import { $, $$, callApi, chosenModel, compact, curlFor, el, ep, errorMessage, fileToDataUrl, lines, MAX_EDIT_IMAGES, messageText, num, pre, renderImages, renderResult, sendImageEdit, state, str, truncate, usageLine, wait } from './core.js';

/* ------------------------------------------------------------------ */
/* Speech voices                                                       */
/* ------------------------------------------------------------------ */
// /models/all has no voice names, so they are kept here, taken from each provider's docs.
// The first matching entry wins. `groups` maps an optgroup label (or '' for none) to voices.
// `def` is the provider's default voice. `required` means the API rejects a request without a voice.
export const OPENAI_TTS1_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];
export const SPEECH_VOICES = [
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
export function setupVoicePicker(form) {
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
/* Handlers per category                                               */
/* ------------------------------------------------------------------ */
export const handlers = {
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
    const resp = await callApi(ep('chat').path, { signal: form._abort?.signal, base: ep('chat').base, json: body });
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
    const resp = await callApi(ep('decision').path, { signal: form._abort?.signal, base: ep('decision').base, json: body });
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
    const resp = await callApi(ep('embeddings').path, { signal: form._abort?.signal, base: ep('embeddings').base, json: body });
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
    const resp = await callApi(ep('image').path, { signal: form._abort?.signal, base: ep('image').base, json: body });
    const { rendered, shown } = renderImages(resp, body.output_format);
    renderResult(out, { resp: shown, request: body, curl: curlFor(ep('image').path, { base: ep('image').base, json: body }), rendered });
  },

  // Reference images go as JSON input_references (OpenRouter) or multipart image[] fields.
  async imageEdit(form, out) {
    const images = form._refImages || [];
    if (!images.length) throw new Error('Add at least one reference image.');
    if (images.length > MAX_EDIT_IMAGES) throw new Error(`At most ${MAX_EDIT_IMAGES} reference images.`);
    const mask = form.elements.mask.files[0];
    const fields = compact({
      model: chosenModel(form), prompt: form.elements.prompt.value.trim(),
      size: str(form, 'size'), aspect_ratio: str(form, 'aspect_ratio'), resolution: str(form, 'resolution'), quality: str(form, 'quality'),
    });
    const { resp, request, curl, maskDropped } = await sendImageEdit(fields, images, mask, form._abort?.signal);
    const { rendered, shown } = renderImages(resp);
    const note = maskDropped ? el('div', { class: 'muted small', text: 'The mask was not sent: this endpoint has no mask field.' }) : null;
    renderResult(out, { resp: shown, request, curl, rendered: rendered && el('div', {}, note, rendered) });
  },

  async speech(form, out) {
    const body = compact({
      // A typed voice overrides the dropdown.
      model: chosenModel(form), input: form.elements.input.value.trim(), voice: str(form, 'voice') || str(form, 'voice_preset'),
      response_format: str(form, 'response_format'), speed: num(form, 'speed'), instructions: str(form, 'instructions'),
    });
    const resp = await callApi(ep('speech').path, { signal: form._abort?.signal, base: ep('speech').base, json: body });
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
    const resp = await callApi(ep('transcription').path, { signal: form._abort?.signal, base: ep('transcription').base, formData: fd });
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
    const resp = await callApi(path, { signal: form._abort?.signal, base, json: body });
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
    let resp = await callApi(path, { signal: form._abort?.signal, base, json: body });
    const id = resp.data?.id;
    if (!resp.ok || !id) { renderResult(out, { resp, request: shownReq, curl, rendered: undefined }); return; }

    const progress = el('div', { class: 'muted' });
    out.replaceChildren(progress);
    const done = ['completed', 'failed', 'cancelled', 'expired'];
    let status = resp.data.status;
    while (!done.includes(status)) {
      progress.textContent = `Job ${id}: ${status || 'submitted'} · ${Math.round((Date.now() - t0) / 1000)} s. Checking every 5 s…`;
      await wait(5000, form._abort?.signal);
      resp = await callApi(`${path}/${encodeURIComponent(id)}`, { signal: form._abort?.signal, base, method: 'GET' });
      if (!resp.ok) { renderResult(out, { resp, request: shownReq, curl, rendered: undefined }); return; }
      status = resp.data?.status;
    }
    let rendered;
    if (status === 'completed') {
      const video = await callApi(`${path}/${encodeURIComponent(id)}/content?index=0`, { signal: form._abort?.signal, base, method: 'GET' });
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

export function decodeB64Floats(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return Array.from(new Float32Array(bytes.buffer));
}
export const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (norm(a) * norm(b) || 1);
}
export function similarityTable(vectors, inputs) {
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
export const pct = (x) => `${(Number(x) * 100).toFixed(0)}%`;
export const meter = (x) => el('span', { class: 'meter' }, el('div', { style: `width:${Math.max(0, Math.min(1, Number(x))) * 100}%` }));

export function renderAnswer(id, a, q) {
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

// Files from several picks add up, so images can come from different folders.
export function setupRefImages(form) {
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

export const CRITERIA_HINT = {
  noul: 'Not used for noul questions',
  choice: 'One option per line, optionally "option: description"',
  score: 'Scale labels, one per line, lowest first',
};
export function addQuestion(form, { id = '', type = 'noul', instructions = '', criteria = '' } = {}) {
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

export function addMessage(form, role = 'user', content = '', { focus = true } = {}) {
  const node = $('#message-row').content.firstElementChild.cloneNode(true);
  $('.role', node).value = role;
  $('.content', node).value = content;
  $('.remove', node).addEventListener('click', () => node.remove());
  $('.messages', form).append(node);
  if (!content && focus) $('.content', node).focus();
}

/* ------------------------------------------------------------------ */
/* Mic recording for transcriptions                                    */
/* ------------------------------------------------------------------ */
export function setupRecorder(form) {
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
