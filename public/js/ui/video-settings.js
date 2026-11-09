/* LLM PlayGround: UI component: video model and settings for the video tools. Lists the tested
   models in the provider file's videoModels first (with their notes), and any other video model the
   key can use under "Other video model", marked untested. Offers each model's own durations,
   resolutions and aspect ratios, the frame images it takes, audio, and a relative price before
   sending. Used by the Video Generator and Animate the DreamGen Scene. */
import { modelsIn, provider, state, store } from '../core.js';
import { $, $$, el } from './dom.js';
import { estimateVideoCost, priceTag } from './video-job.js';


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
  const modelNote = el('div', { class: 'vg-model-note small' });
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
  // The shared choice found among all video models, also when this tool can't use it.
  const anyModel = (id) => {
    const t = testedVideoModels().find((m) => m.id === id);
    if (t) return t;
    const meta = modelsIn('video').find((m) => m.id === id);
    return meta ? untestedVideoModel(meta) : undefined;
  };
  // A shared choice this tool can't use (Animate takes only models that start from a picture). It is
  // kept, not swapped for another model, so the tools never quietly disagree: the user picks again,
  // and that pick becomes the choice in every video tool.
  const unusable = () => (state.models.length && chosen && !model() ? anyModel(chosen) : undefined);
  const blocked = () => {
    const m = unusable();
    return m ? `The video model chosen in the other video tools, ${m.label || m.id}, can't start from a picture, so it doesn't work here. Pick one under Settings; it becomes the choice in the other video tools too.` : '';
  };

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
      : !list.length && !rest.length ? `No video models found for ${p?.label || 'this provider'}.` : blocked();
    notice.classList.toggle('vs-blocked', Boolean(unusable()));
    // Before the list is loaded the saved choice can't be checked, so it is kept as it is. A choice
    // that is gone from the list falls back to the first model; one this tool can't use is kept.
    if (state.models.length && !model() && !unusable()) chosen = list[0]?.id ?? rest[0]?.id;
    cards.replaceChildren(...list.map((m) => {
      // Priced as it will be sent: "always" models always pay for audio, whatever the default says.
      const est = m.meta && estimateVideoCost(m.meta, { ...m.default, generate_audio: m.audio === 'always' ? true : m.default?.generate_audio, frames: m.needsFirstFrame || firstFrameOnly ? 1 : 0 });
      const radio = el('input', { type: 'radio', name: 'video-model', value: m.id, checked: m.id === chosen || undefined,
        onchange: () => { chosen = m.id; touched = true; applyModel(true); } });
      // A card shows only the name and the price of its cheapest clip; what the model takes and what
      // we found are in its tooltip, and under the cards for the chosen one (a phone has no hover).
      const cheapest = est ? `Price for ${m.default?.duration} s ${m.default?.resolution || ''}`.trim() : '';
      return el('label', { class: `vg-model${m.id === chosen ? ' chosen' : ''}`, title: [m.label || m.id, ...facts(m), cheapest, m.id].filter(Boolean).join('\n') },
        el('span', { class: 'vg-model-head' }, radio, el('strong', { text: m.label || m.id })),
        est ? el('span', { class: 'vg-model-price' }, priceTag(est.usd * (m.priceFactor || 1), { approx: est.approx || Boolean(m.priceFactor), amount: est.usd }))
          : el('span', { class: 'muted small', text: m.meta ? '' : 'not in the loaded list' }));
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
    return el('label', { class: `vg-model vg-other${isOther ? ' chosen' : ''}`, title: `${rest.length} more video models on this key, not tested here` },
      el('span', { class: 'vg-model-head' }, radio, el('strong', { text: `Other video model (${rest.length}, untested)` })),
      pick);
  }

  // What a model takes and what we found, as short lines: for a card's tooltip and the chosen model.
  function facts(m) {
    if (!m) return [];
    return [
      // Animate supplies the one picture itself, so an end frame means nothing there.
      firstFrameOnly ? '' : m.frames?.includes('last_frame') ? 'Starts from a picture, and can end on another' : m.frames?.includes('first_frame') ? `Starts from a picture${m.needsFirstFrame ? ' (needed)' : ''}` : 'Text only',
      { off: 'No sound', optional: 'Sound can be turned on or off', always: 'Always has sound', unknown: '' }[m.audio] || '',
      m.faces ? `Faces: ${m.faces}` : '',
    ].filter(Boolean);
  }

  // Options for the chosen model: the loaded metadata, narrowed by the file's lists when it has them.
  function applyModel(fresh) {
    // A pick here replaces a choice this tool couldn't use: the warning goes.
    if (notice.classList.contains('vs-blocked') && !unusable()) { notice.textContent = ''; notice.classList.remove('vs-blocked'); }
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
    // The chosen model's facts, then its note (what our tests found, or that it is untested).
    modelNote.replaceChildren(...(m ? [el('strong', { text: m.label || m.id }), el('ul', {}, ...facts(m).map((t) => el('li', { text: t }))),
      m.note ? el('div', { text: m.note }) : null].filter(Boolean) : []));
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
  // A tool is drawn again each time it is opened, so an earlier copy of these settings can be left
  // behind. Once it has been on the page and is gone, it stops listening: otherwise a model reload
  // or provider switch would make it save its old choice over the shared one.
  let shown = false;
  const onOuterChange = () => {
    if (root.isConnected) { shown = true; refresh(); return; }
    if (!shown) return; // not on the page yet
    document.removeEventListener('models-changed', onOuterChange);
    $('#provider')?.removeEventListener('change', onProvider);
  };
  const onProvider = () => setTimeout(onOuterChange);
  document.addEventListener('models-changed', onOuterChange);
  // A provider switch clears the list without that event when there is no key to load with.
  $('#provider')?.addEventListener('change', onProvider);
  refresh();
  // The tool appends the settings after this returns: from then on they count as shown.
  setTimeout(() => { if (root.isConnected) shown = true; });
  return {
    // blocked(): why there is no model to use here (the shared choice doesn't suit this tool), or ''.
    root, frames, price, refresh, read, model, priceNow, blocked,
    // Frames the tool supplies itself (Animate the DreamGen Scene's scene picture) count in the price.
    setFrameCount(n) { externalFrames = n; update(); },
  };
}
