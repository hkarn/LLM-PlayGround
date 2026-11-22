/* LLM PlayGround: UI component: a series of pictures, one card per shot (a scene and a moment in it),
   filled in as each is drawn, with Download all as one .zip (numbered pictures and prompts.txt).
   Used by Draw the DreamGen Scene for the scenes ticked in the scene picker. */
import { el } from './dom.js';
import { fileName, openPictures } from './media.js';
import { saveBlob, zipFiles } from './zip.js';

const slug = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'scene';
const pad = (n) => String(n).padStart(2, '0');

export function seriesView() {
  const grid = el('div', { class: 'series-grid' });
  const zipBtn = el('button', { type: 'button', class: 'secondary', text: 'Download all (.zip)', disabled: '' });
  const note = el('span', { class: 'muted small' });
  const node = el('div', { class: 'series', hidden: '' }, el('div', { class: 'row' }, zipBtn, note), grid);
  let shots = [];

  const drawCard = (s, i) => {
    const pic = s.file ? el('img', { src: s.url, alt: `${s.title}, ${s.moment}`, tabindex: '0', role: 'button', title: 'Show larger' }) : el('div', { class: 'series-empty', text: s.status || 'Waiting' });
    if (s.file) {
      // The pop-out steps through every finished picture of the series, starting at this one.
      const open = () => {
        const done = shots.filter((x) => x.file);
        openPictures(done.map((x) => ({ src: x.url, alt: `${x.title}, ${x.moment}`, name: x.fileName })), done.indexOf(s));
      };
      pic.addEventListener('click', open);
      pic.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    const save = s.file ? el('button', { type: 'button', class: 'secondary small-btn', text: 'Download', onclick: () => saveBlob(s.file, s.fileName) }) : null;
    const retry = s.retry && !s.busy ? el('button', { type: 'button', class: 'secondary small-btn', text: '↻ Retry', title: 'Draw this picture again, with the same prompt and references', onclick: s.retry }) : null;
    const details = s.details ? el('details', { class: 'request-details' }, el('summary', { text: 'Request details' }), el('pre', { class: 'mono', text: s.details })) : null;
    const card = el('figure', { class: `series-card${s.error ? ' failed' : ''}${s.busy ? ' busy' : ''}` },
      el('figcaption', {}, el('strong', { text: `${pad(i + 1)} · ${s.title}` }), el('span', { class: 'muted small', text: s.moment })),
      pic,
      s.error ? el('div', { class: 'error small', text: s.error }) : s.busy ? el('div', { class: 'muted small', text: s.status }) : null,
      s.prompt ? el('details', { class: 'series-prompt' }, el('summary', { text: 'Image prompt' }), el('p', { class: 'small', text: s.prompt })) : null,
      (save || retry) ? el('div', { class: 'row' }, save, retry) : null,
      details);
    return card;
  };
  const render = () => {
    grid.replaceChildren(...shots.map(drawCard));
    const done = shots.filter((s) => s.file).length;
    zipBtn.disabled = !done;
    note.textContent = shots.length ? `${done} of ${shots.length} pictures` : '';
  };

  zipBtn.addEventListener('click', async () => {
    const done = shots.filter((s) => s.file);
    const prompts = shots.map((s, i) => `${pad(i + 1)} · ${s.title} · ${s.moment}${s.range ? ` (¶${s.range.start}–¶${s.range.end})` : ''}\n${s.prompt || '(no prompt)'}${s.file ? `\nFile: ${s.fileName}` : '\n(no picture)'}`).join('\n\n');
    const blob = await zipFiles([...done.map((s) => ({ name: s.fileName, data: s.file })), { name: 'prompts.txt', data: prompts }]);
    saveBlob(blob, fileName('scene-series', 'zip'));
  });

  return {
    node,
    // A new series: shots are { title, moment, range }; earlier pictures are let go.
    start(list) {
      for (const s of shots) if (s.url) URL.revokeObjectURL(s.url);
      shots = list.map((s) => ({ ...s, status: 'Waiting' }));
      node.hidden = !shots.length;
      render();
    },
    // Changes one shot: { status, busy, prompt, file, error, details, retry }.
    update(i, patch) {
      const s = shots[i];
      if (!s) return;
      if (patch.file && s.url) URL.revokeObjectURL(s.url);
      Object.assign(s, patch);
      if (patch.file) {
        s.url = URL.createObjectURL(patch.file);
        const ext = (patch.file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        s.fileName = `${pad(i + 1)}-${slug(s.title)}-${slug(s.moment)}.${ext}`;
        s.error = '';
      }
      render();
    },
    shots: () => shots,
  };
}
