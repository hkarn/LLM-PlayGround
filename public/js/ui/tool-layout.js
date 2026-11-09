/* LLM PlayGround: UI component: the layout of a tool page. The settings (the models and their
   options, the style, the advanced bits) sit in a panel on the left, and the steps, with what
   changes on every run, in the main column. On a narrow screen the panel folds into a Settings
   button above the steps. Used by every tool that has one model of each kind; the API tester
   tabs keep their own layout. */
import { store } from '../core.js';
import { el } from './dom.js';

// One block of the panel: a heading and its fields.
export function panelSection(title, ...children) {
  return el('section', { class: 'panel-section' }, el('h3', { text: title }), ...children);
}

// Puts `panel` (a list of panelSection nodes) beside `main` (the steps) in `root`.
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
  root.append(el('div', { class: 'tool-layout' }, aside, el('div', { class: 'tool-main' }, ...main)));
  refresh();
  return { refresh };
}
