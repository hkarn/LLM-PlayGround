/* LLM PlayGround: UI component: a fold (details) whose open state is kept in this browser. */
import { store } from '../core/state.js';

// The fold opens or closes as the user last left it, across reloads, tab switches and redraws. `open`
// is used until the user has opened or closed it. Keys are short names, stored as "fold_<key>".
export function rememberFold(details, key, open = false) {
  const saved = store.get(`fold_${key}`);
  details.open = saved == null ? Boolean(open) : saved === '1';
  details.addEventListener('toggle', () => store.set(`fold_${key}`, details.open ? '1' : '0'));
  return details;
}
