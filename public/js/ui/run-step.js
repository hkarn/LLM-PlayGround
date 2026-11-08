/* LLM PlayGround: UI component: running a request from a form, with busy state, elapsed time and Cancel. */
import { provider } from '../core.js';
import { $, el } from './dom.js';
import { renderException } from './result.js';

// Runs one request for a form: busy button, elapsed time, a Cancel button and error display.
// Used by every endpoint tab and tool. Cancel aborts the fetch (and any polling between calls)
// through `form._abort`, so the form is usable again without reloading the page.
export async function runStep(form, out, fn) {
  const btn = $('button[type=submit]', form);
  if (!form._cancelBtn) {
    form._cancelBtn = el('button', { type: 'button', class: 'secondary cancel-btn', text: 'Cancel', hidden: '',
      onclick: () => form._abort?.abort() });
    btn.after(form._cancelBtn);
  }
  form._abort = new AbortController();
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending…';
  form._cancelBtn.hidden = false;
  const waiting = el('div', { class: 'muted', text: 'Waiting for response…' });
  out.replaceChildren(waiting);
  // Show elapsed time, since cold-starting provider models can take a minute.
  const t0 = Date.now();
  const timer = setInterval(() => { waiting.textContent = `Waiting for response… ${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
  try {
    await fn();
  } catch (err) {
    if (err?.name === 'AbortError') {
      out.replaceChildren(el('div', { class: 'output', text: `Cancelled after ${Math.round((Date.now() - t0) / 1000)} s. The page stopped waiting; the provider may still finish the request and charge for it.` }));
    } else {
      renderException(out, err);
    }
  } finally {
    clearInterval(timer);
    btn.disabled = false;
    btn.textContent = label;
    form._cancelBtn.hidden = true;
    form._abort = null;
  }
}

// A pause that ends early, with an AbortError, when the signal is aborted.
export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}
