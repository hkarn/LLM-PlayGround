/* LLM PlayGround: UI component: the pictures embedded in a DreamGen JSON export, as a folded
   gallery with a caption and a button on each. Loading sends nothing. Thumbnails make one object
   URL each, and frees it as soon as that picture has loaded, so nothing is left behind if the page moves on. */
import { el } from './dom.js';
import { asJpeg } from './frame-image.js';

// Saves one picture: as it is (WebP, from DreamGen) or converted to JPEG. The file is named from
// its caption and its number within the entity, e.g. Alina-2.webp. `img` is { name|caption, kind, index, file }.
export async function downloadPicture(img, { jpeg = false } = {}) {
  const file = jpeg ? await asJpeg(img.file) : img.file;
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const base = String(img.caption ?? img.name ?? '').trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || img.kind || 'picture';
  const a = el('a', { href: URL.createObjectURL(file), download: `${base}${img.index ? `-${img.index + 1}` : ''}.${ext}` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// The two download buttons, for any list of pictures.
export const downloadButtons = (img, run = (fn) => fn()) => [
  el('button', { type: 'button', class: 'secondary small-btn', title: 'Save the picture as it is', text: 'Download', onclick: () => run(() => downloadPicture(img)) }),
  el('button', { type: 'button', class: 'secondary small-btn', title: 'Save the picture converted to JPEG', text: 'JPEG', onclick: () => run(() => downloadPicture(img, { jpeg: true })) }),
];

// `images` are { name, kind, index, nsfw, file } (ui/dreamgen-export.js). `actions` are
// [{ label, onclick(image) }], one button each under every picture.
export function exportPictures({ actions = [], title = 'Pictures in the export' } = {}) {
  const grid = el('div', { class: 'export-pictures' });
  const details = el('details', { hidden: '' }, el('summary', {}), grid);
  const summary = details.querySelector('summary');
  let list = [];
  const free = () => grid.replaceChildren();
  const draw = () => {
    free();
    if (!details.open) return;
    grid.replaceChildren(...list.map((img) => {
      const url = URL.createObjectURL(img.file);
      const done = () => URL.revokeObjectURL(url);
      return el('figure', { title: [img.kind, img.file.name].filter(Boolean).join(' · ') },
        el('img', { src: url, alt: img.name, onload: done, onerror: done }),
        el('figcaption', { class: 'small', text: img.name || '(no caption)' }),
        ...downloadButtons(img, (fn) => fn().catch((e) => alert(e.message))),
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
