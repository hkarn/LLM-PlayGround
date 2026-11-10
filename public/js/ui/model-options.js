/* LLM PlayGround: UI component: option dropdowns that follow the chosen model (size, aspect ratio, duration, ...). */
import { state } from '../core/state.js';
import { provider } from '../core/providers.js';
import { $$, el } from './dom.js';
import { chosenModel } from './model-picker.js';

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
  const selects = $$('select', form).filter((s) => !['model', 'voice_preset', 'generate_audio'].includes(s.name) && !s.closest('.model-picker'));
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
    // A field the provider's API requires (its file's required.<kind>, e.g. LLM Gateway's video
    // seconds) gets no "default" choice, so a value is always sent.
    const required = provider().required?.[kind] || [];
    for (const s of selects) {
      const hasDefault = s._hasDefault && !required.includes(s.name);
      let values = optionsFromModel(kind, s.name, m);
      if (values === undefined) values = provider().suggest?.[kind]?.[s.name];
      if (values === undefined) values = s._orig;
      const prev = s.value;
      s.disabled = values === false;
      const list = values || [];
      s.replaceChildren(...(hasDefault || (s._hasDefault && s.disabled) ? [el('option', { value: '', text: s.disabled ? 'not supported' : 'default' })] : []),
        ...list.map((v) => el('option', { value: v, text: v })));
      const preset = !hasMeta && list.includes(s._origSelected) ? s._origSelected : (hasDefault ? '' : list[0] ?? '');
      s.value = list.includes(prev) && !(hasMeta && prev === s._origSelected && hasDefault) ? prev : preset;
    }
    if (kind === 'video') {
      // Some video models list which frame images and whether audio they take.
      const frames = m?.supported_frame_images;
      form.elements.first_frame.disabled = Array.isArray(frames) && !frames.includes('first_frame');
      form.elements.last_frame.disabled = !Array.isArray(frames) || !frames.includes('last_frame');
      // Audio: default (nothing sent: the provider decides), on or off. A model whose list says it
      // has no sound gets "not supported" and one that always adds sound (audio_always) "always on":
      // both send nothing, since some providers refuse the field (LLM Gateway's MiniMax Hailuo
      // refuses even audio: false). Otherwise the user's choice is kept across models.
      const audio = form.elements.generate_audio;
      const fixed = m?.audio_always ? 'always on' : m?.generate_audio === false ? 'not supported' : '';
      if (fixed) {
        if (!audio.disabled) audio.dataset.choice = audio.value;
        audio.replaceChildren(el('option', { value: '', text: fixed }));
        audio.disabled = true;
      } else if (audio.disabled || audio.options.length < 3) {
        audio.replaceChildren(el('option', { value: '', text: 'default' }), el('option', { value: 'true', text: 'on' }), el('option', { value: 'false', text: 'off' }));
        audio.disabled = false;
        audio.value = audio.dataset.choice || '';
      }
      audio.title = m?.audio_always ? 'This model always adds sound.' : m?.generate_audio === false ? 'This model makes no sound.' : 'default sends nothing, so the provider decides.';
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
