/* LLM PlayGround: UI component: video model and settings for the video tools. Lists only the tested
   models in the provider file's videoModels (with their notes), offers each one's own durations,
   resolutions and aspect ratios, the frame images it takes, audio as tested, and the price before
   sending. Used by the Video Generator and Animate the DreamGen Scene. */
import { provider, state, store } from '../core.js';
import { $, $$, el } from './dom.js';
import { estimateVideoCost, formatUsd } from './video-job.js';

const AUDIO_TEXT = { off: 'no audio', optional: 'audio optional', always: 'always has audio' };

// Tested models of the current provider, in the file's order, with the loaded /videos/models entry
// (options and prices) when models are loaded.
export function testedVideoModels() {
  const list = provider()?.videoModels || {};
  return Object.entries(list).filter(([id]) => !id.startsWith('_')).map(([id, t]) => ({ id, ...t, meta: state.models.find((m) => m.id === id) }));
}

// opts: { key: storage key for the choices, firstFrameOnly: offer only models that take a first
// frame and hide the frame inputs (the tool supplies the frame), frames: show frame inputs }.
// Returns { root, refresh(), read(), model(), price(), setFrameCount(n) }.
export function videoSettings({ key, firstFrameOnly = false, frames = true } = {}) {
  let saved = {};
  try { saved = JSON.parse(store.get(key) || '{}') || {}; } catch { /* none */ }
  let externalFrames = 0;
  const notice = el('div', { class: 'muted small vs-notice' });
  const cards = el('div', { class: 'vg-models', role: 'radiogroup', 'aria-label': 'Video model' });
  const select = (name, label) => el('label', {}, label, el('select', { name }));
  const duration = select('duration', 'Duration (s)');
  const resolution = select('resolution', 'Resolution');
  const aspect = select('aspect_ratio', 'Aspect ratio');
  const audio = el('input', { type: 'checkbox', name: 'generate_audio' });
  const audioLabel = el('label', { class: 'inline' }, audio, el('span', { text: 'Audio' }));
  const first = el('input', { type: 'file', name: 'first_frame', accept: 'image/*' });
  const last = el('input', { type: 'file', name: 'last_frame', accept: 'image/*' });
  const firstLabel = el('label', {}, 'First frame', first);
  const lastLabel = el('label', {}, 'Last frame', last);
  const modelNote = el('div', { class: 'muted small' });
  const price = el('div', { class: 'vs-price' });
  const root = el('div', { class: 'video-settings' },
    notice, cards, modelNote,
    el('div', { class: 'grid3' }, duration, resolution, aspect, audioLabel),
    frames && !firstFrameOnly ? el('div', { class: 'grid3' }, firstLabel, lastLabel) : null,
    price);

  let chosen = saved.model;
  const models = () => testedVideoModels().filter((m) => !firstFrameOnly || m.frames?.includes('first_frame'));
  const model = () => models().find((m) => m.id === chosen);

  const fillSelect = (label, values, want) => {
    const s = $('select', label);
    s.replaceChildren(...values.map((v) => el('option', { value: String(v), text: String(v) })));
    s.disabled = !values.length;
    if (values.map(String).includes(String(want))) s.value = String(want);
  };

  function refresh() {
    const list = models();
    const p = provider();
    notice.textContent = !list.length
      ? `No tested video models for ${p?.label || 'this provider'} yet. The tested list is in providers/<id>.json (videoModels); OpenRouter has one. The Video tab can still try any video model.`
      : !state.models.length ? 'Load models (the connection chip at the top) to see each model\'s options and prices.' : '';
    if (!list.some((m) => m.id === chosen)) chosen = list[0]?.id;
    cards.replaceChildren(...list.map((m) => {
      const est = m.meta && estimateVideoCost(m.meta, { ...m.default, frames: m.needsFirstFrame || firstFrameOnly ? 1 : 0 });
      const radio = el('input', { type: 'radio', name: `${key}-model`, value: m.id, checked: m.id === chosen || undefined,
        onchange: () => { chosen = m.id; applyModel(true); } });
      return el('label', { class: `vg-model${m.id === chosen ? ' chosen' : ''}`, title: m.id },
        el('span', { class: 'vg-model-head' }, radio, el('strong', { text: m.label || m.id })),
        el('span', { class: 'muted small', text: [m.frames?.includes('last_frame') ? 'first + last frame' : 'first frame', m.needsFirstFrame ? '(needed)' : '', AUDIO_TEXT[m.audio] || ''].filter(Boolean).join(' · ') }),
        m.faces ? el('span', { class: 'muted small', text: `Faces: ${m.faces}` }) : null,
        el('span', { class: 'small', text: est ? `${formatUsd(est.usd)} for ${m.default?.duration} s ${m.default?.resolution || ''}${est.approx ? ' (about)' : ''}` : (m.meta ? '' : 'not in the loaded list') }));
    }));
    applyModel(false);
  }

  // Options for the chosen model: the loaded metadata, narrowed by the file's lists when it has them.
  function applyModel(fresh) {
    $$('.vg-model', cards).forEach((c) => c.classList.toggle('chosen', $('input', c).value === chosen));
    const m = model();
    const meta = m?.meta || {};
    const pickFrom = (listed, own) => (Array.isArray(own) ? own : Array.isArray(listed) ? listed : []);
    const keep = (name) => (fresh ? undefined : saved[name]);
    fillSelect(duration, pickFrom(meta.supported_durations, m?.durations), keep('duration') ?? m?.default?.duration);
    fillSelect(resolution, pickFrom(meta.supported_resolutions, m?.resolutions), keep('resolution') ?? m?.default?.resolution);
    fillSelect(aspect, pickFrom(meta.supported_aspect_ratios, m?.aspectRatios), keep('aspect_ratio') ?? m?.default?.aspect_ratio);
    audio.disabled = !m || m.audio !== 'optional';
    audio.checked = m?.audio === 'always' || (m?.audio === 'optional' && Boolean(keep('generate_audio') ?? m?.default?.generate_audio));
    $('span', audioLabel).textContent = m?.audio === 'always' ? 'Audio (always on)' : m?.audio === 'off' ? 'Audio (none)' : 'Audio';
    first.disabled = !m?.frames?.includes('first_frame');
    last.disabled = !m?.frames?.includes('last_frame');
    firstLabel.firstChild.textContent = m?.needsFirstFrame ? 'First frame (needed)' : 'First frame (optional)';
    if (last.disabled) last.value = '';
    if (first.disabled) first.value = '';
    modelNote.textContent = m ? `${m.note || ''}${m.tested?.length ? ` Tested: ${m.tested[0]}.` : ''}` : '';
    update();
  }

  function read() {
    const m = model();
    const int = (s) => (s.value === '' ? undefined : Number(s.value));
    return {
      model: m?.id,
      duration: int($('select', duration)),
      resolution: $('select', resolution).value || undefined,
      aspect_ratio: $('select', aspect).value || undefined,
      // Sent only where the tests showed it matters: "optional" models take true or false.
      generate_audio: m?.audio === 'optional' ? audio.checked : undefined,
      first_frame: first.files[0],
      last_frame: last.files[0],
    };
  }

  function priceNow() {
    const m = model();
    if (!m?.meta) return null;
    const v = read();
    const frameCount = externalFrames + (v.first_frame ? 1 : 0) + (v.last_frame ? 1 : 0);
    return estimateVideoCost(m.meta, { ...v, generate_audio: m.audio === 'always' ? true : v.generate_audio, frames: frameCount });
  }

  function update() {
    const v = read();
    store.set(key, JSON.stringify({ model: chosen, duration: v.duration, resolution: v.resolution, aspect_ratio: v.aspect_ratio, generate_audio: v.generate_audio }));
    saved = JSON.parse(store.get(key) || '{}');
    const est = priceNow();
    price.textContent = !model() ? '' : `${est ? `Estimated price: ${formatUsd(est.usd)}${est.approx ? ' (about)' : ''} · ${est.basis}` : 'Price: load models to see it.'}${model().priceSeen ? ` · ${model().priceSeen}` : ''}`;
  }

  root.addEventListener('change', (e) => { if (e.target.type !== 'radio') update(); });
  document.addEventListener('models-changed', refresh);
  // A provider switch clears the list without that event when there is no key to load with.
  $('#provider')?.addEventListener('change', () => setTimeout(refresh));
  refresh();
  return {
    root, refresh, read, model, price: priceNow,
    // Frames the tool supplies itself (Animate the DreamGen Scene's scene picture) count in the price.
    setFrameCount(n) { externalFrames = n; update(); },
  };
}
