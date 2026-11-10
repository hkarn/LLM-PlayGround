/* LLM PlayGround: UI component: reference portraits with a name each, for image (and later video) models. */
import { MAX_EDIT_IMAGES } from '../core/helpers.js';
import { el } from './dom.js';

// Returns { node, refs, add(name, file), set(list) }. `refs` is the live list of { name, file };
// the names can be edited on each portrait. `extra` is shown next to the file picker.
export function refPortraits({ max = MAX_EDIT_IMAGES, pickerLabel = 'Add portraits ', extra = null } = {}) {
  const grid = el('div', { class: 'ref-portraits' });
  const picker = el('input', { type: 'file', accept: 'image/*', multiple: '' });
  const api = { refs: [] };

  const render = () => grid.replaceChildren(...api.refs.map((r, i) => el('figure', { title: r.file.name },
    el('img', { src: URL.createObjectURL(r.file), alt: r.name, onload: (e) => URL.revokeObjectURL(e.target.src) }),
    el('button', { type: 'button', class: 'secondary', title: 'Remove', text: '×', onclick: () => { api.refs.splice(i, 1); render(); } }),
    el('input', { value: r.name, placeholder: 'Who is this?', 'aria-label': `Name for reference ${i + 1}`, oninput: (e) => { r.name = e.target.value; } }))));

  api.add = (name, file) => {
    if (api.refs.length >= max) { alert(`At most ${max} reference images.`); return false; }
    api.refs.push({ name, file });
    render();
    return true;
  };
  // Replaces the whole list (cut to `max`).
  api.set = (list) => {
    api.refs.splice(0, api.refs.length, ...list.slice(0, max));
    render();
  };

  // A file's name, without extension and with _ and - as spaces, is the first guess at who it shows.
  picker.addEventListener('change', () => {
    for (const f of picker.files) api.add(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), f);
    picker.value = '';
  });

  api.node = el('div', { class: 'ref-portraits-box' },
    el('div', { class: 'row' }, el('label', { class: 'inline' }, pickerLabel, picker), extra),
    grid);
  return api;
}
