/* LLM PlayGround: UI component: typed text kept across a reload (sessionStorage). */
import { $$ } from './dom.js';

/* ------------------------------------------------------------------ */
/* Drafts: typed text survives a reload                                */
/* ------------------------------------------------------------------ */
// Text the user typed is kept in sessionStorage (this browser tab only; cleared when the tab
// closes) and put back after a reload. Choices of model and options are kept by rememberModel.
export const drafts = {
  get(k) { try { return sessionStorage.getItem(`draft:${k}`); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(`draft:${k}`, v); } catch { /* full or blocked: skip */ } },
};
// Saves after a short pause in typing, so a large export is not rewritten on every key.
export function debounce(fn, ms = 400) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Text, number and checkbox fields with a name, inside `root`, keyed by `scope` and name.
export function keepDrafts(root, scope, { skip = [] } = {}) {
  const fields = $$('input[name], textarea[name]', root)
    .filter((f) => !['file', 'password', 'hidden'].includes(f.type) && !skip.includes(f.name) && !['model', 'model_custom'].includes(f.name));
  for (const f of fields) {
    const key = `${scope}:${f.name}`;
    const saved = drafts.get(key);
    if (saved != null) {
      if (f.type === 'checkbox') f.checked = saved === '1';
      else f.value = saved;
      f.dispatchEvent(new Event(f.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
    }
    const save = debounce(() => drafts.set(key, f.type === 'checkbox' ? (f.checked ? '1' : '0') : f.value));
    f.addEventListener(f.type === 'checkbox' ? 'change' : 'input', save);
  }
}

// Rows added on the page (chat messages, decision questions): saved as a list, rebuilt on load.
export function keepRows(form, scope, container, { read, rebuild }) {
  const saved = drafts.get(scope);
  if (saved) {
    try {
      const rows = JSON.parse(saved);
      if (Array.isArray(rows)) { container.replaceChildren(); rows.forEach((r) => rebuild(r)); }
    } catch { /* ignore a broken draft */ }
  }
  const save = debounce(() => drafts.set(scope, JSON.stringify(read())));
  container.addEventListener('input', save);
  container.addEventListener('change', save);
  new MutationObserver(save).observe(container, { childList: true });
}
