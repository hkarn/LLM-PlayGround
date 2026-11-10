/* LLM PlayGround: UI component: the table of loaded models on the Filter models tab (#models-table),
   narrowed by the model filter and by the search field above it (#model-filter). */
import { state } from '../core/state.js';
import { visibleModels } from '../core/models.js';
import { $, el } from './dom.js';

export function renderModelsTable() {
  const table = $('#models-table');
  const filter = $('#model-filter').value.trim().toLowerCase();
  const rows = visibleModels().filter((m) => !filter || JSON.stringify(m).toLowerCase().includes(filter));
  // Show a handful of common scalar columns that actually exist in the data.
  const candidates = ['context_window', 'context_length', 'max_output_tokens', 'input_price', 'output_price', 'cached_price',
    'supports_vision', 'supports_tool_calling', 'supports_reasoning', 'supports_caching', 'supports_output_json_schema'];
  const cols = candidates.filter((c) => state.models.some((m) => m[c] != null && typeof m[c] !== 'object'));
  cols.splice(0, 0, ...['geolocation'].filter((c) => state.models.some((m) => m[c] != null)));
  table.tHead.replaceChildren(el('tr', {}, el('th', { text: 'id' }), el('th', { text: 'category' }), ...cols.map((c) => el('th', { text: c }))));
  table.tBodies[0].replaceChildren(...rows.map((m) => el('tr', {},
    el('td', { class: 'mono', text: m.id }),
    el('td', {}, el('span', { class: 'cat', text: m._category })),
    ...cols.map((c) => el('td', { text: m[c] == null ? '' : String(m[c]) })),
  )));
  $('#model-count').textContent = `${rows.length} of ${state.models.length}`;
}

// core announces a new model list, and ui/model-filter.js a changed filter, with this event.
document.addEventListener('models-changed', renderModelsTable);
