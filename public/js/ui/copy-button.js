/* LLM PlayGround: UI component: a Copy button with a note beside it. */
import { el } from './dom.js';

// getText() returns what to copy, or '' when there is nothing yet. Returns the row (button and note).
export function copyButton({ getText, label = 'Copy', hint = '', empty = 'There is nothing to copy yet.', done = 'Copied.' }) {
  const note = el('span', { class: 'muted small', text: hint });
  const button = el('button', {
    type: 'button', class: 'secondary', text: label,
    onclick: async () => {
      const text = getText();
      if (!text) { note.textContent = empty; return; }
      note.textContent = (await copyText(text)) ? done : 'Could not copy: select the text and copy it by hand.';
    },
  });
  return el('div', { class: 'row' }, button, note);
}

// The clipboard API, or for older browsers and pages without clipboard permission, a copy from a
// selected off-screen field holding exactly the same text.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = el('textarea', { style: 'position:fixed;left:-9999px;top:0', 'aria-hidden': 'true' });
    field.value = text;
    document.body.append(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  }
}
