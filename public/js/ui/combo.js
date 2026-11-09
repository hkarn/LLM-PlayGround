/* LLM PlayGround: UI component: a text input with a suggestion list drawn by the page (a combobox).
   The browser's <datalist> pop-up is tiny, can't be styled, and only lists entries that match what
   is already in the field, so a filled-in field offers nothing else. This one shows every entry when
   the field gets focus and narrows the list only once the user types. Used by the model filter and
   AI Group Chat. */
import { $$, el } from './dom.js';

// input: the text input to attach to (it is wrapped in a .combo box; place `wrap` where it was).
// opts: {
//   items(): [{ value, label?, note? }]: every entry, in order; label is shown (and searched first)
//     instead of the value, such as a model's name without its provider, and note after it;
//   pick(value): called with a chosen entry, or with undefined for Enter with nothing highlighted;
//   max: rows drawn at once (default 200); more(n), empty(): the texts for the last row;
//   label: the list's accessible name.
// }
// Returns { wrap, refresh(), hide() }: refresh() redraws an open list (after the entries changed).
let uid = 0;
export function comboBox(input, { items, pick, max = 200, more = (n) => `${n} more: keep typing to narrow the list`, empty = () => 'No match', label = 'Suggestions' }) {
  const listId = `combo-${++uid}`;
  Object.assign(input, { spellcheck: false, autocomplete: 'off' });
  for (const [k, v] of Object.entries({ role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId })) input.setAttribute(k, v);
  const list = el('ul', { id: listId, class: 'combo-list', role: 'listbox', 'aria-label': label, hidden: '' });
  const wrap = el('div', { class: 'combo' });
  input.replaceWith?.(wrap);
  wrap.append(input, list);
  let active = -1; // the highlighted row, for the arrow keys
  let typed = false; // false until the user types after focusing: until then every entry is shown

  // Matches for what is typed: those whose label (or value) starts with it first, then those
  // containing it anywhere. A model list labels each id by its name ("qwen3-30b"), so typing the
  // model's name finds it whatever its provider ("alibaba/") is.
  const matches = () => {
    const all = items();
    const q = typed ? input.value.trim().toLowerCase() : '';
    if (!q) return all;
    const starts = (o) => (o.label ?? o.value).toLowerCase().startsWith(q) || o.value.toLowerCase().startsWith(q);
    const has = (o) => `${o.value} ${o.label ?? ''} ${o.note ?? ''}`.toLowerCase().includes(q);
    return [...all.filter(starts), ...all.filter((o) => !starts(o) && has(o))];
  };

  function show() {
    const rows = matches();
    // The rows are redrawn, so nothing is highlighted any more.
    active = -1;
    input.removeAttribute('aria-activedescendant');
    list.replaceChildren(...rows.slice(0, max).map((o, i) => el('li', {
      id: `${listId}-${i}`, role: 'option', 'aria-selected': 'false', 'data-value': o.value,
      class: o.value === input.value.trim() ? 'current' : undefined,
      // mousedown, so the input keeps its focus
      onmousedown: (e) => { e.preventDefault(); choose(o.value); },
      // Inside a <label>, a click would be passed on to the input and open the list again.
      onclick: (e) => e.preventDefault(),
    }, el('span', { class: 'mono', text: o.label ?? o.value }), o.note ? el('span', { class: 'muted small', text: o.note }) : null)),
    ...(rows.length > max ? [el('li', { class: 'muted small combo-more', text: more(rows.length - max) })] : []),
    ...(!rows.length ? [el('li', { class: 'muted small combo-more', text: empty() })] : []));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    // Opened on a filled-in field: scroll to its current entry.
    $$('li.current', list)[0]?.scrollIntoView?.({ block: 'nearest' });
  }
  const hide = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  const choose = (value) => { typed = false; pick(value); };
  // step: +1 (ArrowDown) or -1 (ArrowUp). With nothing highlighted, down starts at the first row
  // and up at the last.
  const highlight = (step) => {
    const rows = $$('[role=option]', list);
    if (!rows.length) return;
    active = active < 0 ? (step > 0 ? 0 : rows.length - 1) : (active + step + rows.length) % rows.length;
    rows.forEach((r, n) => r.setAttribute('aria-selected', String(n === active)));
    input.setAttribute('aria-activedescendant', rows[active].id);
    rows[active].scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('focus', () => { typed = false; show(); });
  input.addEventListener('click', () => { if (list.hidden) { typed = false; show(); } });
  input.addEventListener('input', () => { typed = true; show(); });
  input.addEventListener('blur', hide);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) show();
      highlight(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = $$('[role=option]', list)[active];
      choose(!list.hidden && row ? row.dataset.value : undefined);
    } else if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      hide();
    }
  });
  return { wrap, show, hide, refresh: () => { if (!list.hidden) show(); } };
}
