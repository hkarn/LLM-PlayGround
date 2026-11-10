/* LLM PlayGround: UI component: the layout of a tool page. The steps, with what changes on every
   run, fill the main column, and the settings (the models and their options, the style, the
   advanced bits) sit in a panel on the right. On a narrow screen the panel folds into a Settings
   button above the steps. Used by every tool that has one model of each kind; the API tester tabs
   keep their own layout. */
import { store } from '../core/state.js';
import { el } from './dom.js';
import { rememberFold } from './fold.js';

// One block of the panel: a heading that folds it away, and its fields. Every block starts open.
export function panelSection(title, ...children) {
  return el('section', { class: 'panel-section' },
    rememberFold(el('details', {},
      el('summary', {}, el('h3', { text: title })),
      el('div', { class: 'panel-section-body' }, ...children)), `panel_${title}`, true));
}

// A tool's "How it works" (and privacy) text, folded. It is open on the first visit to the tool and
// then as the user last left it, so a returning user goes straight to the steps.
export function aboutBox(id, ...children) {
  const key = `about_open_${id}`;
  const summary = el('summary', { text: 'How it works · Privacy' });
  const box = el('details', { class: 'tool-about', open: (store.get(key) ?? '1') === '1' || undefined },
    summary, el('div', { class: 'tool-about-body' }, ...children));
  // The first visit counts as seen: next time it starts folded unless the user opened it again.
  if (store.get(key) == null) store.set(key, '0');
  // Only the user's own clicks are saved: the browser also fires "toggle" when the box is drawn open.
  summary.addEventListener('click', () => setTimeout(() => store.set(key, box.open ? '1' : '0')));
  return box;
}

// Puts `main` (the steps) beside `panel` (a list of panelSection nodes) in `root`.
// summary(): a short line shown beside the Settings button while the panel is folded on a narrow
// screen, such as the chosen models. Returns { refresh() } to redraw that line.
export function toolLayout(root, { panel, main, summary = () => '' }) {
  const key = 'toolpanel_open';
  const body = el('div', { class: 'tool-panel-body', id: `tool-panel-${Math.random().toString(36).slice(2, 8)}` }, ...panel);
  const btn = el('button', { type: 'button', class: 'secondary tool-panel-toggle', 'aria-controls': body.id });
  const line = el('span', { class: 'muted small tool-panel-summary' });
  const aside = el('aside', { class: 'tool-panel', 'aria-label': 'Settings' },
    el('div', { class: 'tool-panel-head' }, btn, line), body);
  const refresh = () => {
    const open = store.get(key) === '1';
    aside.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Hide settings' : 'Settings';
    // Before the tool has set up its pickers there is nothing to sum up yet.
    let text = '';
    try { text = open ? '' : summary(); } catch { /* not set up yet */ }
    line.textContent = text;
  };
  btn.addEventListener('click', () => {
    if (aside.classList.contains('open')) store.del(key); else store.set(key, '1');
    refresh();
  });
  body.addEventListener('change', () => setTimeout(refresh));
  document.addEventListener('models-changed', () => setTimeout(refresh));
  // The panel comes first in the page, so on a narrow screen its Settings button sits above the
  // steps; on a wide screen the stylesheet puts it in the right-hand column.
  root.append(el('div', { class: 'tool-layout' }, aside, el('div', { class: 'tool-main' }, ...main)));
  refresh();
  return { refresh };
}
