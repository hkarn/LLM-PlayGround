/* LLM PlayGround: a (?) button after a label whose text shows on hover or focus (CSS in style.css). */
import { el } from './dom.js';

let seq = 0;

// The tip is a span after the button; `.help-tip:hover + .help-tip-text` and `:focus` show it, so it
// works with a mouse, a keyboard and a tap (a tapped button takes focus).
export function helpTip(text) {
  const id = `help-tip-${++seq}`;
  const btn = el('button', { type: 'button', class: 'help-tip', 'aria-label': 'More about this', 'aria-describedby': id, text: '?' });
  return el('span', { class: 'help-tip-wrap' }, btn, el('span', { class: 'help-tip-text', id, role: 'tooltip', text }));
}
