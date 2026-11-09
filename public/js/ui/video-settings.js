/* LLM PlayGround: UI component: video model and settings for the video tools. Lists the tested
   models in the provider file's videoModels first (with their notes), and any other video model the
   key can use under "Other video model", marked untested. Offers each model's own durations,
   resolutions and aspect ratios, the frame images it takes, audio, and a relative price before
   sending. Used by the Video Generator and Animate the DreamGen Scene. */
import { modelsIn, provider, state, store } from '../core.js';
import { $, $$, el } from './dom.js';
import { estimateVideoCost, priceTag } from './video-job.js';

const AUDIO_TEXT = { off: 'no audio', optional: 'audio optional', always: 'always has audio' };

// Tested models of the current provider, in the file's order, with the loaded /videos/models entry
// (options and prices) when models are loaded.
export function testedVideoModels() {
  const list = provider()?.videoModels || {};
  return Object.entries(list).filter(([id]) => !id.startsWith('_')).map(([id, t]) => ({ id, ...t, meta: state.models.find((m) => m.id === id) }));
}

// Any other loaded video model (the model filter applies), described only by its list entry.
// Audio: "optional" where the list says the model has audio, "off" where it says not, and
// "unknown" (sent only when ticked) where it says nothing.
function untestedVideoModel(meta) {
  return {
    id: meta.id, label: meta.name || meta.id, untested: true, meta,
    frames: Array.isArray(meta.supported_frame_images) ? meta.supported_frame_images : [],
    audio: meta.generate_audio === true ? 'optional' : meta.generate_audio === false ? 'off' : 'unknown',
    note: 'Not tested here: its options and price come from the provider\'s model list, and it may still refuse some of them, or a picture.',
  };
}

// The tools share one video choice (model, duration, resolution, aspect ratio, audio), as they
// share one chat and one image model (ui/remember.js). Before 2026-11 the Video Generator kept it
// under its own key, which is read once as a fallback.
const SHARED_KEY = 'tools:video';
const OLD_KEY = 'videogen:settings';

// opts: { firstFrameOnly: offer only models that take a first frame and leave out the frame inputs
// (the tool supplies the frame) }.
// Returns { root, frames, price, refresh(), read(), model(), priceNow(), setFrameCount(n) }: root
// (the model cards and options) goes in the tool's settings panel; frames (the first and last frame
// inputs, or null) and price (the price line) go with the step that sends, near its button.
export function videoSettings({ firstFrameOnly = false } = {}) {
  const key = SHARED_KEY;
  // The choices are kept per provider (as ui/remember.js keeps models), so switching provider and
  // back restores them instead of falling back to the first model.
  const storeKey = () => `${key}_${state.provider}`;
  let savedFor = null;
  let saved = {};
  let chosen;
  const loadSaved = () => {
    try { saved = JSON.parse(store.get(storeKey()) || store.get(`${OLD_KEY}_${state.provider}`) || '{}') || {}; } catch { saved = {}; }
    chosen = saved.model;
    savedFor = state.provider;
  };
  loadSaved();
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
    el('div', { class: 'grid3' }, duration, resolution, aspect, audioLabel));
  const frames = firstFrameOnly ? null : el('div', { class: 'grid3' }, firstLabel, lastLabel);
  // Saved only when the user changes something here: a tool that offers fewer models (Animate
  // takes only first-frame models) falls back to its first one without overwriting the shared choice.
  let touched = false;

  const takesFrame = (m) => !firstFrameOnly || m.frames?.includes('first_frame');
  const tested = () => testedVideoModels().filter(takesFrame);
  const others = () => {
    const ids = new Set(tested().map((m) => m.id));
    return modelsIn('video').filter((m) => !ids.has(m.id)).map(untestedVideoModel).filter(takesFrame);
  };
  const model = () => tested().find((m) => m.id === chosen) || others().find((m) => m.id === chosen);

  const fillSelect = (label, values, want) => {
    const s = $('select', label);
    s.replaceChildren(...values.map((v) => el('option', { value: String(v), text: String(v) })));
    s.disabled = !values.length;
    if (values.map(String).includes(String(want))) s.value = String(want);
  };

  function refresh() {
    if (savedFor !== state.provider) loadSaved();
    const list = tested();
    const rest = others();
    const p = provider();
    notice.textContent = !state.models.length
      ? 'Load models (the connection chip at the top) to see each model\'s options and prices, and the other video models your key can use.'
      : !list.length && !rest.length ? `No video models found for ${p?.label || 'this provider'}.` : '';
    // Before the list is loaded the saved choice can't be checked, so it is kept as it is.
    if (state.models.length && !model()) chosen = list[0]?.id ?? rest[0]?.id;
    cards.replaceChildren(...list.map((m) => {
      // Priced as it will be sent: "always" models always pay for audio, whatever the default says.
      const est = m.meta && estimateVideoCost(m.meta, { ...m.default, generate_audio: m.audio === 'always' ? true : m.default?.generate_audio, frames: m.needsFirstFrame || firstFrameOnly ? 1 : 0 });
      const radio = el('input', { type: 'radio', name: 'video-model', value: m.id, checked: m.id === chosen || undefined,
        onchange: () => { chosen = m.id; touched = true; applyModel(true); } });
      return el('label', { class: `vg-model${m.id === chosen ? ' chosen' : ''}`, title: m.id },
        el('span', { class: 'vg-model-head' }, radio, el('strong', { text: m.label || m.id })),
        el('span', { class: 'muted small', text: [m.frames?.includes('last_frame') ? 'first + last frame' : 'first frame', m.needsFirstFrame ? '(needed)' : '', AUDIO_TEXT[m.audio] || ''].filter(Boolean).join(' · ') }),
        m.faces ? el('span', { class: 'muted small', text: `Faces: ${m.faces}` }) : null,
        est ? el('span', { class: 'small' }, priceTag(est.usd * (m.priceFactor || 1), { approx: est.approx || Boolean(m.priceFactor), amount: est.usd }), ` for ${m.default?.duration} s ${m.default?.resolution || ''}`)
          : el('span', { class: 'small', text: m.meta ? '' : 'not in the loaded list' }));
    }), ...(rest.length ? [otherCard(rest)] : []));
    applyModel(false);
  }

  // "Other video model": every other video model the key lists, untested, in one dropdown.
  function otherCard(rest) {
    const isOther = rest.some((m) => m.id === chosen);
    const pick = el('select', { 'aria-label': 'Other video model' },
      ...rest.map((m) => el('option', { value: m.id, text: m.id, selected: m.id === chosen || undefined })));
    const radio = el('input', { type: 'radio', name: 'video-model', value: '__other', checked: isOther || undefined,
      onchange: () => { chosen = pick.value; touched = true; applyModel(true); } });
    pick.addEventListener('change', () => { chosen = pick.value; radio.checked = true; touched = true; applyModel(true); });
    return el('label', { class: `vg-model vg-other${isOther ? ' chosen' : ''}` },
      el('span', { class: 'vg-model-head' }, radio, el('strong', { text: 'Other video model' })),
      el('span', { class: 'muted small', text: `Untested: ${rest.length} more on this key` }),
      pick);
  }

  // Options for the chosen model: the loaded metadata, narrowed by the file's lists when it has them.
  function applyModel(fresh) {
    $$('.vg-model', cards).forEach((c) => {
      const r = $('input[type=radio]', c);
      c.classList.toggle('chosen', r.value === chosen || (r.value === '__other' && others().some((m) => m.id === chosen)));
    });
    const m = model();
    const meta = m?.meta || {};
    const pickFrom = (listed, own) => (Array.isArray(own) ? own : Array.isArray(listed) ? listed : []);
    const keep = (name) => (fresh ? undefined : saved[name]);
    fillSelect(duration, pickFrom(meta.supported_durations, m?.durations), keep('duration') ?? m?.default?.duration);
    fillSelect(resolution, pickFrom(meta.supported_resolutions, m?.resolutions), keep('resolution') ?? m?.default?.resolution);
    fillSelect(aspect, pickFrom(meta.supported_aspect_ratios, m?.aspectRatios), keep('aspect_ratio') ?? m?.default?.aspect_ratio);
    audio.disabled = !m || !['optional', 'unknown'].includes(m.audio);
    audio.checked = m?.audio === 'always' || (['optional', 'unknown'].includes(m?.audio) && Boolean(keep('generate_audio') ?? m?.default?.generate_audio));
    $('span', audioLabel).textContent = m?.audio === 'always' ? 'Audio (always on)' : m?.audio === 'off' ? 'Audio (none)' : m?.audio === 'unknown' ? 'Audio (if the model has it)' : 'Audio';
    first.disabled = !m?.frames?.includes('first_frame');
    last.disabled = !m?.frames?.includes('last_frame');
    firstLabel.firstChild.textContent = m?.needsFirstFrame ? 'First frame (needed)' : 'First frame (optional)';
    if (last.disabled) last.value = '';
    if (first.disabled) first.value = '';
    modelNote.textContent = m?.note || '';
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
      // "optional" models take true or false; for an untested model with no audio facts it is
      // sent only when ticked; "always" and "off" models get nothing.
      generate_audio: m?.audio === 'optional' ? audio.checked : m?.audio === 'unknown' ? (audio.checked || undefined) : undefined,
      first_frame: first.files[0],
      last_frame: last.files[0],
    };
  }

  // The estimate for the current settings, in USD (shown only as the 1-5 scale), with the model's
  // priceFactor when a test was billed differently from its listed price.
  function priceNow() {
    const m = model();
    if (!m?.meta) return null;
    const v = read();
    const frameCount = externalFrames + (v.first_frame ? 1 : 0) + (v.last_frame ? 1 : 0);
    const est = estimateVideoCost(m.meta, { ...v, generate_audio: m.audio === 'always' ? true : v.generate_audio, frames: frameCount });
    // usd: for the scale (with priceFactor); listedUsd: the provider's own figure. A priceFactor
    // makes the listed figure wrong, so the price is then only an estimate (shown as the scale).
    return est && { ...est, approx: est.approx || Boolean(m.priceFactor), listedUsd: est.usd, usd: est.usd * (m.priceFactor || 1) };
  }

  function update() {
    const v = read();
    const m = model();
    // Saved only once the model's options are known (its list entry is loaded): before that the
    // option lists are empty, and saving would wipe the choices.
    if (m?.meta && touched) {
      saved = { model: chosen, duration: v.duration, resolution: v.resolution, aspect_ratio: v.aspect_ratio, generate_audio: v.generate_audio };
      store.set(storeKey(), JSON.stringify(saved));
    }
    const est = priceNow();
    price.replaceChildren(...(!m ? [] : est
      ? ['Price ', priceTag(est.usd, { approx: est.approx, amount: est.listedUsd }), est.approx ? ' (estimate)' : ' (listed)', m.priceSeen ? ` · ${m.priceSeen}` : '']
      : [m.meta ? 'Price: not given in the model list.' : 'Price: load models to see it.']));
  }

  root.addEventListener('change', (e) => { if (e.target.type !== 'radio' && !e.target.closest('.vg-other')) { touched = true; update(); } });
  frames?.addEventListener('change', () => update());
  document.addEventListener('models-changed', refresh);
  // A provider switch clears the list without that event when there is no key to load with.
  $('#provider')?.addEventListener('change', () => setTimeout(refresh));
  refresh();
  return {
    root, frames, price, refresh, read, model, priceNow,
    // Frames the tool supplies itself (Animate the DreamGen Scene's scene picture) count in the price.
    setFrameCount(n) { externalFrames = n; update(); },
  };
}
