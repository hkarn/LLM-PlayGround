/* LLM PlayGround: UI component: Hide/Show settings for a tool step once its model is chosen. */
import { store } from '../core.js';
import { el } from './dom.js';
import { chosenModel } from './model-picker.js';

// A Hide/Show settings button for a tool step. Hiding is possible only once the step's
// mandatory choice (its model) is made; the choice to hide is remembered.
export function settingsToggle(form, body, key, describe) {
  const k = `dgscene_hide_${key}`;
  const btn = el('button', { type: 'button', class: 'secondary' });
  const summary = el('span', { class: 'muted small' });
  body.before(el('div', { class: 'row settings-bar' }, btn, summary));
  let hide = store.get(k) === '1';
  const sync = () => {
    const ready = Boolean(chosenModel(form));
    const hidden = hide && ready;
    body.hidden = hidden;
    btn.textContent = hidden ? 'Show settings' : 'Hide settings';
    btn.disabled = !hidden && !ready;
    summary.textContent = hidden ? describe() : (ready ? '' : 'Choose a model; then the settings can be hidden.');
  };
  btn.addEventListener('click', () => {
    hide = !body.hidden;
    if (hide) store.set(k, '1');
    else store.del(k);
    sync();
  });
  form.addEventListener('change', sync);
  form.addEventListener('input', sync);
  sync();
}
