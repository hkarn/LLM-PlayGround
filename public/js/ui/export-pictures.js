/* LLM PlayGround: UI component: the pictures embedded in a DreamGen JSON export, as a folded
   gallery with a caption and a button on each. Loading sends nothing. Thumbnails make one object
   URL each, only while the gallery is open, and free them when it closes or the list changes. */
import { el } from './dom.js';

// `images` are { name, kind, index, nsfw, file } (ui/dreamgen-export.js). `actions` are
// [{ label, onclick(image) }], one button each under every picture.
export function exportPictures({ actions = [], title = 'Pictures in the export' } = {}) {
  const grid = el('div', { class: 'export-pictures' });
  const details = el('details', { hidden: '' }, el('summary', {}), grid);
  const summary = details.querySelector('summary');
  let urls = [];
  let list = [];
  const free = () => { for (const u of urls) URL.revokeObjectURL(u); urls = []; grid.replaceChildren(); };
  const draw = () => {
    free();
    if (!details.open) return;
    grid.replaceChildren(...list.map((img) => {
      const url = URL.createObjectURL(img.file);
      urls.push(url);
      return el('figure', { title: [img.kind, img.file.name].filter(Boolean).join(' · ') },
        el('img', { src: url, alt: img.name, loading: 'lazy' }),
        el('figcaption', { class: 'small', text: img.name || '(no caption)' }),
        ...actions.map((a) => el('button', { type: 'button', class: 'secondary small-btn', text: a.label, onclick: () => a.onclick(img) })));
    }));
  };
  details.addEventListener('toggle', draw);
  return {
    node: details,
    set(images) {
      list = images || [];
      details.hidden = !list.length;
      summary.textContent = `${title} (${list.length})`;
      draw();
    },
  };
}
