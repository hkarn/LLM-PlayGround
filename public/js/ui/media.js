/* LLM PlayGround: UI component: pictures and clips in a result. Each shows with a bar under it:
   Request details on the left (in the tools), and icon buttons on the right: Retry (the tools) and
   Download, with a file name from the tool and the time. A picture opens larger in a pop-out when
   clicked (Esc or a click outside closes it, arrow keys move between pictures). Nothing blocks the
   browser's own right-click menu. Imports only dom. */
import { el } from './dom.js';

const svg = (paths) => {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  return wrap.firstElementChild;
};
const ICON = {
  download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  retry: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
};

// "draw-scene-20261110-1432" (+ "-2" for the second picture of a set): a name that sorts by time.
export function fileName(prefix, ext, n) {
  const d = new Date();
  const p2 = (x) => String(x).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  return `${prefix || 'result'}-${stamp}${n ? `-${n}` : ''}.${ext}`;
}

// The bar under a picture or clip. left: a node (usually the Request details fold); download:
// { href, name }; retry: a function (sends the same request again).
export function mediaBar({ left, download, retry } = {}) {
  const right = el('div', { class: 'media-actions' });
  if (retry) right.append(el('button', { type: 'button', class: 'icon-btn media-btn', title: 'Retry: send the same request again', 'aria-label': 'Retry', onclick: retry }, svg(ICON.retry)));
  if (download?.href) right.append(el('a', { class: 'icon-btn media-btn', href: download.href, download: download.name, title: `Download ${download.name}`, 'aria-label': `Download ${download.name}` }, svg(ICON.download)));
  return el('div', { class: 'media-bar' }, el('div', { class: 'media-left' }, left || null), right);
}

// Pictures: [{ src, alt?, caption?, name }]. Returns one figure per picture, each with its bar.
export function pictures(list, { retry } = {}) {
  return list.map((p, i) => el('figure', { class: 'media' },
    el('img', { src: p.src, alt: p.alt || `Picture ${i + 1}`, class: 'media-pic', title: 'Click to see it larger', onclick: () => openPictures(list, i) }),
    p.caption ? el('figcaption', { class: 'muted small', text: p.caption }) : null,
    mediaBar({ download: { href: p.src, name: p.name }, retry: i === list.length - 1 ? retry : undefined })));
}

// A clip: { src, name }. autoplay starts it muted, as the tools do when one is done.
export function clip({ src, name, left, retry, autoplay = true }) {
  return el('figure', { class: 'media' },
    el('video', { controls: '', src, muted: '', loop: '', playsinline: '', ...(autoplay ? { autoplay: '' } : {}) }),
    mediaBar({ left, download: { href: src, name }, retry }));
}

// Puts a Request details fold into the bar of the last picture or clip in `root`, so it sits on the
// bar's left instead of below. Returns false when there is no bar to put it in.
export function dockDetails(root, details) {
  const slots = root.querySelectorAll('.media-bar .media-left');
  const slot = slots[slots.length - 1];
  if (!slot || !details) return false;
  details.classList.add('media-details');
  slot.replaceChildren(details);
  return true;
}

/* ---- The pop-out ---- */
function openPictures(list, start) {
  let i = start;
  const back = document.activeElement;
  const img = el('img', { class: 'lightbox-img', alt: '' });
  const count = el('span', { class: 'lightbox-count' });
  const save = el('a', { class: 'icon-btn media-btn', 'aria-label': 'Download' }, svg(ICON.download));
  const btn = (icon, label, onclick) => el('button', { type: 'button', class: 'icon-btn media-btn', title: label, 'aria-label': label, onclick }, svg(icon));
  const multi = list.length > 1;
  const show = (n) => {
    i = (n + list.length) % list.length;
    const p = list[i];
    img.src = p.src;
    img.alt = p.alt || `Picture ${i + 1}`;
    save.href = p.src;
    save.download = p.name;
    save.title = `Download ${p.name}`;
    count.textContent = multi ? `${i + 1} / ${list.length}` : '';
  };
  const close = () => { box.remove(); document.removeEventListener('keydown', keys); back?.focus?.(); };
  const keys = (e) => {
    if (e.key === 'Escape') close();
    else if (multi && e.key === 'ArrowRight') show(i + 1);
    else if (multi && e.key === 'ArrowLeft') show(i - 1);
  };
  const closeBtn = btn(ICON.close, 'Close (Esc)', close);
  const box = el('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Picture' },
    el('div', { class: 'lightbox-bar' }, count, el('span', { class: 'lightbox-actions' }, save, closeBtn)),
    multi ? btn(ICON.prev, 'Previous (←)', () => show(i - 1)) : null,
    img,
    multi ? btn(ICON.next, 'Next (→)', () => show(i + 1)) : null);
  if (multi) { box.children[1].classList.add('lightbox-prev'); box.lastElementChild.classList.add('lightbox-next'); }
  // A click on the dark backdrop (not the picture or a button) closes it.
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', keys);
  show(start);
  document.body.append(box);
  closeBtn.focus();
}
