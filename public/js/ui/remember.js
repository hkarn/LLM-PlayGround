/* LLM PlayGround: UI component: remembers a form's model and options per provider (localStorage). */
import { state, store } from '../core.js';
import { $ } from './dom.js';

// Remembers the model chosen in a tool form, and the step's other `fields`, per provider, and
// picks them again whenever the model list is refilled (page load, model reload, provider switch).
// `key` is the model kind ("chat", "image"): every tool with one model of a kind uses the same key,
// so a model chosen in one tool is the one the next tool opens with. (The dgscene_ prefix is kept
// so earlier choices stay.)
export function rememberModel(form, key, fields = []) {
  const k = () => `dgscene_model_${key}_${state.provider}`;
  const picker = $('.model-picker', form);
  const select = form.elements.model;
  const custom = form.elements.model_custom;
  const fill = picker._fill;
  let filling = false; // a refill selects the first model; that is not the user's choice
  picker._fill = () => {
    const saved = store.get(k());
    filling = true;
    fill();
    filling = false;
    if (saved && [...select.options].some((o) => o.value === saved) && select.value !== saved) {
      select.value = saved;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Then the step's other settings, where the chosen model still offers that value.
    for (const name of fields) {
      const f = form.elements[name];
      const v = store.get(`${k()}_${name}`);
      if (!f || f.disabled || v == null) continue;
      if (f.tagName !== 'SELECT' || [...f.options].some((o) => o.value === v)) f.value = v;
    }
  };
  select.addEventListener('change', () => { if (!filling && select.value) store.set(k(), select.value); });
  for (const name of fields) {
    form.elements[name]?.addEventListener('change', (e) => {
      if (!filling && !e.target.disabled) store.set(`${k()}_${name}`, e.target.value);
    });
  }
  custom.value = store.get(`${k()}_custom`) || '';
  custom.addEventListener('input', () => {
    if (custom.value.trim()) store.set(`${k()}_custom`, custom.value.trim());
    else store.del(`${k()}_custom`);
  });
  picker._fill();
}
