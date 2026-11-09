/* LLM PlayGround: The endpoint testers: one handler per API tab, and the helpers only those tabs use. */
import { follow, read, send } from './adapter.js';
import { errorMessage, lines, MAX_EDIT_IMAGES, num, provider, state, str, truncate, usageLine } from './core.js';
import { $, $$, el } from './ui/dom.js';
import { framePngOrJpeg } from './ui/frame-image.js';
import { chosenModel } from './ui/model-picker.js';
import { pre, renderImages, renderResult } from './ui/result.js';
import { wait } from './ui/run-step.js';

/* ------------------------------------------------------------------ */
/* Speech voices                                                       */
/* ------------------------------------------------------------------ */
// /models/all has no voice names, so they are kept in providers/speech-voices.json, taken from each provider's docs.
// The first matching entry wins. `groups` maps an optgroup label (or '' for none) to voices.
// `def` is the provider's default voice. `required` means the API rejects a request without a voice.
// Fills the voice dropdown for the chosen model. Called whenever the model changes.
export function setupVoicePicker(form) {
  const select = form.elements.voice_preset;
  const custom = form.elements.voice;
  const note = $('.voice-note', form);
  const update = () => {
    const model = chosenModel(form);
    // OpenRouter lists each speech model's voices in `supported_voices`; otherwise the provider's
    // voice list (providers/speech-voices.json) is used.
    const listed = state.models.find((m) => m.id === model)?.supported_voices;
    const entry = listed?.length
      ? { required: true, groups: { '': listed }, note: `${listed.length} voices from the model list.` }
      : (provider().speechVoices || []).find((v) => v.match.test(model));
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
    const { resp, request, curl } = await send('chat', {
      model: chosenModel(form), messages,
      temperature: num(form, 'temperature'), max_tokens: num(form, 'max_tokens'), top_p: num(form, 'top_p'), extra,
    }, { signal: form._abort?.signal });
    let rendered;
    if (resp.ok && resp.data?.choices) {
      const answer = read('chat', resp);
      const text = typeof answer.text === 'string' ? answer.text : '';
      rendered = el('div', {},
        el('div', { class: 'output', text: text || '(empty content)' }),
        answer.toolCalls ? el('details', { open: true }, el('summary', { text: 'Tool calls' }), pre(answer.toolCalls)) : null,
        el('div', { class: 'muted small', text: usageLine(resp.data, resp.data.choices[0] || {}) }),
        el('div', { class: 'row' }, el('button', {
          type: 'button', class: 'secondary', text: 'Append reply & continue',
          onclick: () => { addMessage(form, 'assistant', text); addMessage(form, 'user', ''); },
        })),
      );
    }
    renderResult(out, { resp, request, curl, rendered });
  },

  async decision(form, out) {
    const raw = form.elements.state.value.trim();
    let stateValue = raw;
    if (/^[[{]/.test(raw)) { try { stateValue = JSON.parse(raw); } catch { /* send as text */ } }
    // An image goes with the state as an image part; the adapter sends the File as a data URL.
    const image = form.elements.image.files[0];
    if (image) stateValue = [stateValue, { type: 'image_url', image_url: { url: image } }];

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

    const { resp, request, curl } = await send('decision', { model: chosenModel(form), state: stateValue, questions }, { signal: form._abort?.signal });
    const { answers } = read('decision', resp);
    let rendered;
    if (resp.ok && answers) {
      rendered = el('div', {},
        ...Object.entries(answers).map(([id, a]) => renderAnswer(id, a, questions[id])),
        el('div', { class: 'muted small', text: usageLine(resp.data) }));
    }
    renderResult(out, { resp, request, curl, rendered });
  },

  async embeddings(form, out) {
    const inputs = lines(form.elements.input.value);
    if (!inputs.length) throw new Error('Enter at least one input line.');
    const { resp, request, curl } = await send('embeddings', {
      model: chosenModel(form),
      input: inputs.length === 1 ? inputs[0] : inputs,
      dimensions: num(form, 'dimensions'),
      encoding_format: str(form, 'encoding_format'),
    }, { signal: form._abort?.signal });
    let rendered;
    if (resp.ok && Array.isArray(resp.data?.data)) {
      // base64 vectors (encoding_format "base64") are packed float32s.
      const vectors = read('embeddings', resp).vectors.map((v) => (Array.isArray(v) ? v : decodeB64Floats(v)));
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
    renderResult(out, { resp: shown, request, curl, rendered });
  },

  async image(form, out) {
    const { resp, request, curl } = await send('image', {
      model: chosenModel(form), prompt: form.elements.prompt.value.trim(),
      size: str(form, 'size'), aspect_ratio: str(form, 'aspect_ratio'), resolution: str(form, 'resolution'),
      n: num(form, 'n'), quality: str(form, 'quality'),
      background: str(form, 'background'), output_format: str(form, 'output_format'),
    }, { signal: form._abort?.signal });
    const { rendered, shown } = renderImages(resp, request.output_format);
    renderResult(out, { resp: shown, request, curl, rendered });
  },

  // How the reference images travel (multipart image[] fields, JSON input_references, …) is in
  // the provider's imageEdit template.
  async imageEdit(form, out) {
    const images = form._refImages || [];
    if (!images.length) throw new Error('Add at least one reference image.');
    if (images.length > MAX_EDIT_IMAGES) throw new Error(`At most ${MAX_EDIT_IMAGES} reference images.`);
    const mask = form.elements.mask.files[0];
    const { resp, request, curl, dropped } = await send('imageEdit', {
      model: chosenModel(form), prompt: form.elements.prompt.value.trim(),
      size: str(form, 'size'), aspect_ratio: str(form, 'aspect_ratio'), resolution: str(form, 'resolution'), quality: str(form, 'quality'),
      images, mask,
    }, { signal: form._abort?.signal });
    const { rendered, shown } = renderImages(resp, 'png', 'imageEdit');
    const note = dropped.includes('mask') ? el('div', { class: 'muted small', text: 'The mask was not sent: this endpoint has no mask field.' }) : null;
    renderResult(out, { resp: shown, request, curl, rendered: rendered && el('div', {}, note, rendered) });
  },

  async speech(form, out) {
    const { resp, request, curl } = await send('speech', {
      // A typed voice overrides the dropdown.
      model: chosenModel(form), input: form.elements.input.value.trim(), voice: str(form, 'voice') || str(form, 'voice_preset'),
      response_format: str(form, 'response_format'), speed: num(form, 'speed'), instructions: str(form, 'instructions'),
    }, { signal: form._abort?.signal });
    const ext = request.response_format || 'mp3';
    let rendered;
    if (resp.ok && resp.blob) {
      const url = URL.createObjectURL(resp.blob);
      rendered = el('div', { class: 'output' },
        el('audio', { controls: '', src: url, autoplay: '' }),
        el('div', {}, el('a', { href: url, download: `speech.${ext}`, text: `Download (${(resp.blob.size / 1024).toFixed(1)} KB)` })));
    } else if (resp.ok) {
      rendered = el('div', { class: 'output error', text: 'Expected audio but got a non-binary response – see raw response.' });
    }
    renderResult(out, { resp, request, curl: `${curl} \\\n  --output speech.${ext}`, rendered });
  },

  async transcription(form, out) {
    let file = form.elements.file.files[0] || form._recording;
    if (!file) throw new Error('Choose an audio file or record one.');
    if (!file.name) file = new File([file], 'recording.webm', { type: file.type });
    const { resp, request, curl } = await send('transcription', { model: chosenModel(form), language: str(form, 'language'), file }, { signal: form._abort?.signal });
    let rendered;
    if (resp.ok) {
      // A text or srt response_format comes back as plain text, not JSON.
      const answer = typeof resp.data === 'string' ? { text: resp.data } : read('transcription', resp);
      rendered = el('div', {},
        el('div', { class: 'output', text: answer.text ?? '(no text field – see raw response)' }),
        answer.usage ? el('div', { class: 'muted small', text: `usage: ${JSON.stringify(answer.usage)}` }) : null,
      );
    }
    renderResult(out, { resp, request, curl, rendered });
  },

  async rerank(form, out) {
    const documents = lines(form.elements.documents.value);
    if (!documents.length) throw new Error('Enter at least one document line.');
    const { resp, request, curl } = await send('rerank', { model: chosenModel(form), query: form.elements.query.value.trim(), documents, top_n: num(form, 'top_n') }, { signal: form._abort?.signal });
    let rendered;
    if (resp.ok && Array.isArray(resp.data?.results)) {
      const results = read('rerank', resp).results.sort((a, b) => b.score - a.score);
      rendered = el('div', {},
        el('div', { class: 'output rerank' }, ...results.map((r, rank) => el('div', {},
          el('span', { class: 'small muted', text: `${rank + 1}. #${r.index} ` }), meter(r.score),
          el('span', { class: 'small', text: ` ${Number(r.score).toFixed(3)}  ` }),
          el('span', { text: r.text ?? documents[r.index] ?? '' })))),
        el('div', { class: 'muted small', text: usageLine(resp.data) }));
    }
    renderResult(out, { resp, request, curl, rendered });
  },

  // Async: submit a job, poll its status, then download the video from /videos/{id}/content.
  async video(form, out) {
    const picked = form.elements.first_frame.files[0];
    if (picked && form.elements.first_frame.disabled) throw new Error('This model takes no first frame image. Clear the file or pick another model.');
    const pickedLast = form.elements.last_frame.files[0];
    if (pickedLast && form.elements.last_frame.disabled) throw new Error('This model takes no last frame image. Clear the file or pick another model.');
    // JPEG and PNG go as they are; other formats (e.g. WebP) would fail the job after submit, so they go as PNG.
    const { file: frame, note: firstNote } = await framePngOrJpeg(picked);
    const { file: lastFrame, note: lastNote } = await framePngOrJpeg(pickedLast);
    const frameNote = [firstNote, lastNote].filter(Boolean).join(' ');
    const showResult = (args) => {
      renderResult(out, args);
      if (frameNote) $('.status-line', out)?.after(el('div', { class: 'muted small', text: frameNote }));
    };
    const signal = form._abort?.signal;
    const t0 = Date.now();
    let { resp, request: shownReq, curl } = await send('video', {
      model: chosenModel(form), prompt: form.elements.prompt.value.trim(), duration: num(form, 'duration'),
      resolution: str(form, 'resolution'), aspect_ratio: str(form, 'aspect_ratio'),
      generate_audio: (!form.elements.generate_audio.disabled && form.elements.generate_audio.checked) || undefined,
      first_frame: frame ? [frame] : undefined,
      last_frame: lastFrame ? [lastFrame] : undefined,
    }, { signal });
    let job = read('video', resp);
    const { id } = job;
    if (!resp.ok || !id) { showResult({ resp, request: shownReq, curl, rendered: undefined }); return; }

    const progress = el('div', { class: 'muted' });
    out.replaceChildren(progress);
    const done = ['completed', 'failed', 'cancelled', 'expired'];
    while (!done.includes(job.status)) {
      progress.textContent = `Job ${id}: ${job.status || 'submitted'} · ${Math.round((Date.now() - t0) / 1000)} s. Checking every 5 s…`;
      await wait(5000, signal);
      resp = await follow('video', 'poll', { id }, { signal });
      if (!resp.ok) { showResult({ resp, request: shownReq, curl, rendered: undefined }); return; }
      job = read('video', resp);
    }
    const { status } = job;
    let rendered;
    if (status === 'completed') {
      const video = await follow('video', 'content', { id }, { signal });
      if (video.ok && video.blob) {
        const url = URL.createObjectURL(video.blob);
        rendered = el('div', { class: 'output' },
          el('video', { controls: '', src: url, autoplay: '', muted: '', loop: '' }),
          el('div', {}, el('a', { href: url, download: `video-${id}.mp4`, text: `Download (${(video.blob.size / 1024 / 1024).toFixed(1)} MB)` })),
          el('div', { class: 'muted small', text: `Took ${Math.round((Date.now() - t0) / 1000)} s.${job.cost != null ? ` Cost $${job.cost}.` : ''}` }));
      } else {
        rendered = el('div', { class: 'output error', text: `The job finished but the video download failed: ${errorMessage(video)}` });
      }
    } else {
      rendered = el('div', { class: 'output error', text: `Job ${status}${job.error ? `: ${typeof job.error === 'string' ? job.error : JSON.stringify(job.error)}` : ''}` });
    }
    showResult({ resp, request: shownReq, curl, rendered });
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
