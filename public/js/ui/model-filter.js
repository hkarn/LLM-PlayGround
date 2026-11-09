/* LLM PlayGround: UI component: the model filter (issue #33). Two lists, providers and models, that
   narrow every model dropdown and the All models table. Kept per endpoint in localStorage, since
   routers name makers differently (z-ai on OpenRouter, zai elsewhere). The matching is in core.js. */
import { renderModelsTable, splitModelId, state, store, visibleModels } from '../core.js';
import { $, el } from './dom.js';

const KINDS = [
  { key: 'providers', title: 'Providers', hint: 'Matched exactly, e.g. z-ai', placeholder: 'Add a provider…' },
  { key: 'models', title: 'Models', hint: 'Matched from the start, so GLM-5.3 keeps every GLM-5.3 version, region and variant', placeholder: 'Add a model…' },
];
const storeKey = () => `modelfilter_${state.provider}`;
let root = null;

export function setupModelFilter(container) {
  root = container;
  root.replaceChildren(
    el('div', { class: 'model-filter-head' },
      el('strong', { text: 'Model filter' }),
      el('span', { class: 'muted small', text: 'Every model list shows only models that match both lists. An empty list matches everything.' }),
      el('span', { class: 'mf-count muted small' }),
      el('button', { type: 'button', class: 'secondary mf-clear', text: 'Clear filter', onclick: () => save({ providers: [], models: [] }) }),
    ),
    el('div', { class: 'model-filter-lists' }, ...KINDS.map((k) => {
      const input = el('input', { type: 'text', list: `mf-${k.key}-options`, placeholder: k.placeholder, spellcheck: 'false', 'aria-label': k.placeholder });
      const add = () => {
        const value = input.value.trim();
        if (!value) return;
        const f = state.modelFilter;
        if (!f[k.key].some((x) => x.toLowerCase() === value.toLowerCase())) save({ ...f, [k.key]: [...f[k.key], value] });
        input.value = '';
        input.focus();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      return el('fieldset', { class: 'mf-list', 'data-kind': k.key },
        el('legend', { text: k.title }),
        el('p', { class: 'muted small', text: k.hint }),
        el('ul', { class: 'mf-rows' }),
        el('div', { class: 'row' }, input, el('button', { type: 'button', class: 'secondary', text: 'Add', onclick: add })),
        el('datalist', { id: `mf-${k.key}-options` }),
      );
    })),
  );
  document.addEventListener('models-changed', render);
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
  // (only those of the chosen providers, when there are any).
  const parts = state.models.map((m) => splitModelId(m.id));
  const makers = [...new Set(parts.map((p) => p.maker).filter(Boolean))].sort();
  const lowProviders = f.providers.map((p) => p.toLowerCase());
  const names = [...new Set(parts
    .filter((p) => !lowProviders.length || lowProviders.includes(p.maker.toLowerCase()))
    .map((p) => p.name.replace(/[@:].*$/, '')))].sort();
  $('#mf-providers-options', root).replaceChildren(...makers.map((v) => el('option', { value: v })));
  $('#mf-models-options', root).replaceChildren(...names.map((v) => el('option', { value: v })));
  const on = f.providers.length || f.models.length;
  $('.mf-count', root).textContent = on && state.models.length ? `${visibleModels().length} of ${state.models.length} models match` : '';
  $('.mf-clear', root).hidden = !on;
}
