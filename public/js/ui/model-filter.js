/* LLM PlayGround: UI component: the model filter (issue #33). Two lists, providers and models, that
   narrow every model dropdown and the Filter models table. Kept per endpoint in localStorage, since
   routers name makers differently (z-ai on OpenRouter, zai elsewhere). The matching is in core.js. */
import { renderModelsTable, splitModelId, state, store, visibleModels } from '../core.js';
import { $, $$, el } from './dom.js';

const KINDS = [
  { key: 'providers', title: 'Providers', hint: 'Matched exactly, e.g. z-ai', placeholder: 'Add a provider…' },
  { key: 'models', title: 'Models', hint: 'Matched from the start, so GLM-5.3 keeps every GLM-5.3 version, region and variant', placeholder: 'Add a model…' },
];
const SUGGEST_MAX = 200; // rows drawn at once; typing narrows the rest
const storeKey = () => `modelfilter_${state.provider}`;
let root = null;
// What each input can suggest, from the loaded list: [{ value, count }] (count: how many models).
const options = { providers: [], models: [] };

export function setupModelFilter(container) {
  root = container;
  root.replaceChildren(
    el('div', { class: 'model-filter-head' },
      el('strong', { text: 'Model filter' }),
      el('span', { class: 'muted small', text: 'Every model list shows only models that match both lists. An empty list matches everything.' }),
      el('span', { class: 'mf-count muted small' }),
      el('button', { type: 'button', class: 'secondary mf-clear', text: 'Clear filter', onclick: () => save({ providers: [], models: [] }) }),
    ),
    el('div', { class: 'model-filter-lists' }, ...KINDS.map(filterList)),
  );
  document.addEventListener('models-changed', render);
}

// One list (Providers or Models): its rows, and an input with its own suggestion list. The
// browser's <datalist> pop-up is tiny and can't be styled, so the suggestions are drawn here.
function filterList(k) {
  const listId = `mf-${k.key}-suggest`;
  const input = el('input', { type: 'text', placeholder: k.placeholder, spellcheck: 'false', autocomplete: 'off', 'aria-label': k.placeholder,
    role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId });
  const suggest = el('ul', { id: listId, class: 'mf-suggest', role: 'listbox', 'aria-label': `${k.title} to add`, hidden: '' });
  let active = -1; // the highlighted suggestion, for the arrow keys

  const add = (picked) => {
    const value = (picked ?? input.value).trim();
    if (!value) return;
    const f = state.modelFilter;
    if (!f[k.key].some((x) => x.toLowerCase() === value.toLowerCase())) save({ ...f, [k.key]: [...f[k.key], value] });
    input.value = '';
    showSuggestions();
    input.focus();
  };

  // Matches for what is typed: those starting with it first, then those containing it. Values
  // already in the list are left out.
  const matches = () => {
    const typed = input.value.trim().toLowerCase();
    const chosen = new Set(state.modelFilter[k.key].map((x) => x.toLowerCase()));
    const all = options[k.key].filter((o) => !chosen.has(o.value.toLowerCase()));
    if (!typed) return all;
    const starts = all.filter((o) => o.value.toLowerCase().startsWith(typed));
    return [...starts, ...all.filter((o) => !o.value.toLowerCase().startsWith(typed) && o.value.toLowerCase().includes(typed))];
  };

  function showSuggestions() {
    const list = matches();
    // The rows are redrawn, so nothing is highlighted any more.
    active = -1;
    input.removeAttribute('aria-activedescendant');
    suggest.replaceChildren(...list.slice(0, SUGGEST_MAX).map((o, i) => el('li', {
      id: `${listId}-${i}`, role: 'option', 'aria-selected': 'false', 'data-value': o.value,
      // mousedown, so the input keeps focus and the list stays open for the next pick
      onmousedown: (e) => { e.preventDefault(); add(o.value); },
    }, el('span', { class: 'mono', text: o.value }), el('span', { class: 'muted small', text: `${o.count} model${o.count === 1 ? '' : 's'}` }))),
    ...(list.length > SUGGEST_MAX ? [el('li', { class: 'muted small mf-more', text: `${list.length - SUGGEST_MAX} more: keep typing to narrow the list` })] : []),
    ...(!list.length ? [el('li', { class: 'muted small mf-more', text: options[k.key].length ? 'No match in the loaded list. Press Enter or Add to use what you typed.' : 'Load models to see suggestions. You can still type a value and add it.' })] : []));
    suggest.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  const hideSuggestions = () => { suggest.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  // step: +1 (ArrowDown) or -1 (ArrowUp). With nothing highlighted, down starts at the first row
  // and up at the last.
  const highlight = (step) => {
    const rows = $$('[role=option]', suggest);
    if (!rows.length) return;
    active = active < 0 ? (step > 0 ? 0 : rows.length - 1) : (active + step + rows.length) % rows.length;
    rows.forEach((r, n) => r.setAttribute('aria-selected', String(n === active)));
    input.setAttribute('aria-activedescendant', rows[active].id);
    rows[active].scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('focus', showSuggestions);
  input.addEventListener('input', showSuggestions);
  input.addEventListener('blur', hideSuggestions);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggest.hidden) showSuggestions();
      highlight(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = $$('[role=option]', suggest)[active];
      add(!suggest.hidden && row ? row.dataset.value : undefined);
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  const box = el('fieldset', { class: 'mf-list', 'data-kind': k.key },
    el('legend', { text: k.title }),
    el('p', { class: 'muted small', text: k.hint }),
    el('ul', { class: 'mf-rows' }),
    el('div', { class: 'row mf-add' }, el('div', { class: 'mf-combo' }, input, suggest),
      el('button', { type: 'button', class: 'secondary', text: 'Add', onclick: () => add() })));
  box._refreshSuggestions = () => { if (!suggest.hidden) showSuggestions(); };
  return box;
}

// Reads the filter saved for the current provider. Called whenever the provider changes.
export function loadModelFilter() {
  let f = null;
  try { f = JSON.parse(store.get(storeKey()) || 'null'); } catch { /* a broken entry counts as none */ }
  const list = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === 'string' && v.trim()) : []);
  state.modelFilter = { providers: list(f?.providers), models: list(f?.models) };
  render();
}

function save(f) {
  state.modelFilter = f;
  if (f.providers.length || f.models.length) store.set(storeKey(), JSON.stringify(f)); else store.del(storeKey());
  // Pickers and app lists refill on this event; the table is redrawn here.
  document.dispatchEvent(new Event('models-changed'));
  renderModelsTable();
}

function render() {
  if (!root) return;
  const f = state.modelFilter;
  for (const k of KINDS) {
    const box = root.querySelector(`[data-kind=${k.key}]`);
    $('.mf-rows', box).replaceChildren(...f[k.key].map((value) => el('li', {},
      el('span', { class: 'mono', text: value }),
      el('button', { type: 'button', class: 'icon-btn', title: `Remove ${value}`, 'aria-label': `Remove ${value}`, text: '×',
        onclick: () => save({ ...f, [k.key]: f[k.key].filter((x) => x !== value) }) }),
    )));
  }
  // Suggestions from the loaded list: makers, and model names without their region or variant
  // (only those of the chosen providers, when there are any), each with how many models it covers.
  const parts = state.models.map((m) => splitModelId(m.id));
  const tally = (values) => {
    const counts = new Map();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, count }));
  };
  const lowProviders = f.providers.map((p) => p.toLowerCase());
  options.providers = tally(parts.map((p) => p.maker).filter(Boolean));
  options.models = tally(parts
    .filter((p) => !lowProviders.length || lowProviders.includes(p.maker.toLowerCase()))
    .map((p) => p.name.replace(/[@:].*$/, '')));
  for (const box of $$('.mf-list', root)) box._refreshSuggestions?.();
  const on = f.providers.length || f.models.length;
  $('.mf-count', root).textContent = on && state.models.length ? `${visibleModels().length} of ${state.models.length} models match` : '';
  $('.mf-clear', root).hidden = !on;
}
