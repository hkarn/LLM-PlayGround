/* LLM PlayGround: UI component: the model picker (dropdown of the provider's models, typed id, metadata). */
import { state, store } from '../core/state.js';
import { CURATED } from '../core/providers.js';
import { CATEGORY_LABEL, modelFilterOn, modelsIn, visibleModels } from '../core/models.js';
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
  // "curated": only the models we have tested for this kind (providers/curated-models.json), the
  // entries whose id is on the current key. Offered only where a picker asks for it with
  // data-curated (the tools, where it helps to choose; "on" starts it ticked), and remembered per
  // kind. The API tester tabs are for trying any model, so they don't offer it.
  const offered = Boolean(picker.dataset.curated);
  const curated = el('input', { type: 'checkbox' });
  const curatedLabel = el('label', { class: 'inline small', title: 'Only models we have tested for this' }, curated, 'curated');
  const curatedKey = `picker_curated_${category}_tools`;
  curated.checked = offered && (store.get(curatedKey) ?? (picker.dataset.curated === 'on' ? '1' : '0')) === '1';
  // The curated entries on this key: { <model id>: entry }, in the file's order. An entry names a
  // model ("claude-haiku-5.5"); it matches an id whose last part is that name, ignoring case, . versus -,
  // a region (@eu), a variant (:flex) and, failing an exact match, a trailing date tag (-0731).
  // A model of the picker's kind wins, then the first plain match (no region or variant), so one
  // entry shows once.
  const norm = (x) => String(x).toLowerCase().replace(/\./g, '-');
  const nameOf = (id) => norm(String(id).replace(/^~/, '').split('/').pop().replace(/[@:].*$/, ''));
  // "FLUX.2 klein 4B · $", "Qwen Image 3 · $$ · draft", "MAI Image 2.6 · draft" (no price before a test).
  const curatedText = (e) => [e.label, e.price, e.draft ? 'draft' : ''].filter(Boolean).join(' · ');
  const curatedList = () => {
    const entries = CURATED[category];
    if (!Array.isArray(entries)) return null;
    const found = {};
    for (const e of entries) {
      const want = norm(e.name);
      const named = state.models.filter((m) => nameOf(m.id) === want || nameOf(m.id).replace(/-\d{4}$/, '') === want);
      // Models of this picker's kind first: Requesty lists Gemini's image models as chat models too.
      const hits = [...named.filter((m) => m._category === category), ...named.filter((m) => m._category !== category)];
      const pick = hits.find((m) => !/[@:]/.test(m.id) && nameOf(m.id) === want) || hits.find((m) => !/[@:]/.test(m.id)) || hits[0];
      if (pick && !found[pick.id]) found[pick.id] = e;
    }
    return found;
  };
  const info = el('div', { class: 'model-info' });
  // Shown while the model filter (Filter models tab) hides some of the list.
  const filterNote = el('p', { class: 'muted small filter-note', hidden: true }, 'Model filter on. ', el('a', { href: '#models', text: 'Edit it' }));

  picker.replaceChildren(
    el('label', { text: `Model (${CATEGORY_LABEL[category]})` }),
    el('div', { class: 'row' }, select, curatedLabel, el('label', { class: 'inline small' }, showAll, 'show all')),
    filterNote,
    custom,
    info,
  );

  const fill = () => {
    const prev = select.value;
    const tested = curatedList();
    curatedLabel.hidden = !offered || !Array.isArray(CURATED[category]);
    const onlyTested = Boolean(tested && curated.checked);
    let list = showAll.checked ? visibleModels() : modelsIn(category);
    // Curated: the tested models, in the file's order (cheapest first).
    if (onlyTested) list = Object.keys(tested).map((id) => list.find((m) => m.id === id) || visibleModels().find((m) => m.id === id)).filter(Boolean);
    filterNote.hidden = !modelFilterOn() || !state.models.length;
    const empty = !state.models.length ? 'Load models first'
      // Curated models on the key, but all hidden by the model filter, is not the same as none on the key.
      : onlyTested && Object.keys(tested).length ? 'The model filter hides every curated model – edit it or untick "curated"'
      : onlyTested ? 'None of the curated models is on this key – untick "curated"'
      : modelFilterOn() && !visibleModels().length ? 'No models match the model filter'
        : `No ${category} models ${modelFilterOn() ? 'match the model filter' : 'detected'} – tick "show all"`;
    select.replaceChildren(
      ...(list.length ? [] : [el('option', { value: '', text: empty })]),
      ...list.map((m) => el('option', { value: m.id, text: onlyTested && tested[m.id] ? curatedText(tested[m.id]) : showAll.checked ? `${m.id}  [${m._category}]` : m.id })),
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
    // What our tests found, for a curated model, under a fold named for it. A draft's note says
    // itself that it is a draft and is not a test result, so it folds as "Model details".
    const entry = curatedList()?.[m.id];
    const tested = entry?.note && !entry.draft;
    const summary = tested ? 'Test results' : 'Model details';
    // Our tests cost money, so a tested model's results open by default; the reader can fold them away.
    info.replaceChildren(el('details', { class: 'model-facts', ...(tested ? { open: '' } : {}) },
      el('summary', { class: 'small', text: summary }),
      entry?.note ? el('p', { class: 'small', text: entry.draft ? `Draft: ${entry.note}` : entry.note }) : null,
      bits.length ? el('p', { class: 'small muted', text: bits.join(' · ') }) : null,
      el('details', {}, el('summary', { class: 'small', text: 'Model metadata' }), pre(stripPrivate(m)))));
  };
  select.addEventListener('change', showInfo);
  showAll.addEventListener('change', fill);
  curated.addEventListener('change', () => { store.set(curatedKey, curated.checked ? '1' : '0'); fill(); });
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

// core/models.js announces a new or cleared model list with this event; every picker refills.
document.addEventListener('models-changed', refreshPickers);
