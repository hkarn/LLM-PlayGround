/* LLM PlayGround: UI component: reference portraits with a name each, for image (and later video) models. */
import { MAX_EDIT_IMAGES } from '../core/helpers.js';
import { el } from './dom.js';
import { downloadButtons } from './export-pictures.js';

// Returns { node, refs, active(), add(name, file, opts), set(list) }. `refs` is the live list of
// { name, file, send, kind? }; the names can be edited on each portrait, and `send` (a checkbox on
// it) says whether it goes with the request. `active()` is the list that is sent. Pictures that
// only offer themselves (an export's extras) are added with `send: false`. `extra` is shown next
// to the file picker.
export function refPortraits({ max = MAX_EDIT_IMAGES, pickerLabel = 'Add portraits ', extra = null } = {}) {
  const grid = el('div', { class: 'ref-portraits' });
  const picker = el('input', { type: 'file', accept: 'image/*', multiple: '' });
  const count = el('span', { class: 'muted small' });
  const api = { refs: [] };
  // A picture's object URL is freed as soon as it has loaded, so nothing is held if the page moves on.
  const thumb = (r) => { const url = URL.createObjectURL(r.file); const done = () => URL.revokeObjectURL(url); return el('img', { src: url, alt: r.name, onload: done, onerror: done }); };

  api.active = () => api.refs.filter((r) => r.send);
  const tally = () => {
    const n = api.active().length;
    count.textContent = api.refs.length ? `${n} of ${api.refs.length} will be sent` : '';
    count.classList.toggle('error', n > max);
  };
  // The picture is sent only if it is ticked, and at most `max` can be.
  api.check = () => {
    const n = api.active().length;
    if (n > max) throw new Error(`${n} reference images are ticked, and at most ${max} can be sent. Untick some.`);
  };

  const render = () => {
    grid.replaceChildren(...api.refs.map((r, i) => {
      const fig = el('figure', { title: [r.kind, r.file.name].filter(Boolean).join(' · '), class: r.send ? '' : 'off' },
        thumb(r),
        el('button', { type: 'button', class: 'secondary', title: 'Remove', text: '×', onclick: () => { api.refs.splice(i, 1); render(); } }),
        el('label', { class: 'inline small send' },
          el('input', { type: 'checkbox', checked: r.send ? '' : null, 'aria-label': `Send reference ${i + 1}`, onchange: (e) => { r.send = e.target.checked; fig.classList.toggle('off', !r.send); tally(); } }),
          'Send'),
        ...(r.fromExport ? [el('div', { class: 'row small-row' }, ...downloadButtons(r, (fn) => fn().catch((e) => alert(e.message))))] : []),
        el('input', { value: r.name, placeholder: 'Who is this?', 'aria-label': `Name for reference ${i + 1}`, oninput: (e) => { r.name = e.target.value; } }));
      return fig;
    }));
    tally();
  };

  api.add = (name, file, { send = true, kind = '' } = {}) => {
    if (send && api.active().length >= max) { alert(`At most ${max} reference images are sent.`); return false; }
    api.refs.push({ name, file, send, kind });
    render();
    return true;
  };
  // Replaces the whole list. Entries are { name, file, send?, kind? }; send is on unless it says false.
  api.set = (list) => {
    api.refs.splice(0, api.refs.length, ...list.map((r) => ({ send: true, ...r })));
    render();
  };
  // Re-draws after a caller changed `send` or a name on the entries in `refs`.
  api.refresh = render;

  // A file's name, without extension and with _ and - as spaces, is the first guess at who it shows.
  picker.addEventListener('change', () => {
    for (const f of picker.files) api.add(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), f);
    picker.value = '';
  });

  api.node = el('div', { class: 'ref-portraits-box' },
    el('div', { class: 'row' }, el('label', { class: 'inline' }, pickerLabel, picker), count, extra),
    grid);
  return api;
}
