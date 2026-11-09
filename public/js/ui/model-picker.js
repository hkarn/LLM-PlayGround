/* LLM PlayGround: UI component: the model picker (dropdown of the provider's models, typed id, metadata). */
import { CATEGORY_LABEL, modelFilterOn, modelsIn, state, visibleModels } from '../core.js';
import { $, $$, el } from './dom.js';
import { pre } from './result.js';

/* ------------------------------------------------------------------ */
/* Model pickers                                                       */
/* ------------------------------------------------------------------ */
export function setupPicker(picker) {
  const category = picker.dataset.category;
  const select = el('select', { name: 'model' });
  const custom = el('input', { name: 'model_custom', placeholder: 'or type a model id, e.g. openai/gpt-4o-mini', spellcheck: 'false' });
  const showAll = el('input', { type: 'checkbox' });
  const info = el('div', { class: 'model-info' });
  // Shown while the model filter (Filter models tab) hides some of the list.
  const filterNote = el('p', { class: 'muted small filter-note', hidden: true }, 'Model filter on. ', el('a', { href: '#models', text: 'Edit it' }));

  picker.replaceChildren(
    el('label', { text: `Model (${CATEGORY_LABEL[category]})` }),
    el('div', { class: 'row' }, select, el('label', { class: 'inline small' }, showAll, 'show all')),
    filterNote,
    custom,
    info,
  );

  const fill = () => {
    const prev = select.value;
    const list = showAll.checked ? visibleModels() : modelsIn(category);
    filterNote.hidden = !modelFilterOn() || !state.models.length;
    const empty = !state.models.length ? 'Load models first'
      : modelFilterOn() && !visibleModels().length ? 'No models match the model filter'
        : `No ${category} models ${modelFilterOn() ? 'match the model filter' : 'detected'} – tick "show all"`;
    select.replaceChildren(
      ...(list.length ? [] : [el('option', { value: '', text: empty })]),
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

// core.js announces a new or cleared model list with this event; every picker refills.
document.addEventListener('models-changed', refreshPickers);
