/* LLM PlayGround: Tool: Video Generator. Makes a clip with one of the tested video models in the
   provider file's videoModels, offering only that model's options and showing the price before
   sending. The Video tab stays the raw tester for every video model. */
import { PROVIDERS, state, store } from '../core.js';
import { $, el } from '../ui/dom.js';
import { keepDrafts } from '../ui/drafts.js';
import { runStep } from '../ui/run-step.js';
import { downloadVideo, priceTag, runVideoJob } from '../ui/video-job.js';
import { videoSettings } from '../ui/video-settings.js';

const LOG_KEY = 'videogen:jobs'; // finished jobs (no video data): model, prompt, cost, job id
const LOG_MAX = 20;
const clips = new Map(); // job id → object URL of a video fetched this page session

export function renderVideoGenerator(root) {
  const settings = videoSettings({ key: 'videogen:settings' });
  const prompt = el('textarea', { name: 'prompt', rows: 3, required: '', placeholder: 'Describe the clip: what moves, how the camera moves, the light.' });
  const form = el('form', { class: 'tool-form' },
    el('label', {}, 'Prompt', prompt),
    settings.root,
    el('button', { type: 'submit', class: 'primary', text: 'Generate video' }));
  const out = el('div', { class: 'result' });
  const gallery = el('div', { class: 'vg-gallery' });

  root.append(
    el('div', { class: 'placeholder-note' },
      el('p', { class: 'small', style: 'margin: 0' },
        'Only video models we have run for real are listed, each with its own durations, resolutions and aspect ratios, and what we found (faces, audio). ',
        'Prices are relative, from $ (cheapest) to $$$$$: estimated from the model\'s published prices before you send, and what was billed after. ',
        'For any other video model, and the raw request and response, use the ', el('a', { href: '#video', text: 'Video tab' }), '.')),
    el('section', { class: 'tool-step' }, el('h3', { text: 'Make a clip' }), form, out),
    el('section', { class: 'tool-step' }, el('h3', { text: 'Your clips' }),
      el('p', { class: 'muted small', text: 'Clips made on this page. The list (not the videos) is kept in this browser; a provider keeps a finished video for a while, so an older one can be fetched again without paying.' }),
      gallery));

  keepDrafts(form, 'videogen', { skip: ['generate_audio', 'videogen:settings-model'] });

  const log = () => { try { return JSON.parse(store.get(LOG_KEY) || '[]'); } catch { return []; } };
  // Saves the list, and frees the video of every clip no longer on it (removed, or past LOG_MAX):
  // each one is a Blob of a megabyte or more held by its object URL.
  const saveLog = (entries) => {
    const kept = entries.slice(0, LOG_MAX);
    store.set(LOG_KEY, JSON.stringify(kept));
    for (const [id, url] of clips) {
      if (!kept.some((x) => x.id === id)) { URL.revokeObjectURL(url); clips.delete(id); }
    }
  };

  const player = (url, id) => el('div', { class: 'output' },
    el('video', { controls: '', src: url, autoplay: '', muted: '', loop: '', playsinline: '' }),
    el('div', {}, el('a', { href: url, download: `video-${id}.mp4`, text: 'Download' })));

  function drawGallery() {
    const entries = log();
    gallery.replaceChildren(...(entries.length ? [] : [el('p', { class: 'muted small', text: 'None yet.' })]),
      ...entries.map((e) => {
        const url = clips.get(e.id);
        const fetchAgain = el('button', { type: 'button', class: 'secondary', text: 'Fetch the video again', onclick: async () => {
          // Job ids belong to one provider; the button is only drawn for it, and checked again here.
          if (e.provider !== state.provider) { drawGallery(); return; }
          fetchAgain.disabled = true;
          const v = await downloadVideo(e.id).catch((err) => ({ ok: false, error: err.message }));
          if (v.ok) { clips.set(e.id, URL.createObjectURL(v.blob)); drawGallery(); } else { fetchAgain.replaceWith(el('span', { class: 'error small', text: v.error })); }
        } });
        // Through el(), which skips null children (append() would write them out as "null").
        return el('div', { class: 'vg-clip' },
          url ? player(url, e.id) : null,
          el('div', { class: 'small' }, el('strong', { text: e.label || e.model }), ` · ${[e.duration && `${e.duration} s`, e.resolution, e.aspect_ratio].filter(Boolean).join(' · ')}`,
            e.cost != null ? ' · ' : '', e.cost != null ? priceTag(Number(e.cost)) : null, ` · ${new Date(e.at).toLocaleString()}`),
          el('div', { class: 'muted small vg-clip-prompt', text: e.prompt }),
          !url && e.provider === state.provider ? fetchAgain : null,
          !url && e.provider !== state.provider ? el('div', { class: 'muted small', text: `Made on ${PROVIDERS[e.provider]?.label || e.provider}: switch to it to fetch the video again.` }) : null,
          el('button', { type: 'button', class: 'icon-btn', title: 'Remove from the list', 'aria-label': 'Remove from the list', text: '×',
            onclick: () => { saveLog(log().filter((x) => x.id !== e.id)); drawGallery(); } }));
      }));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runStep(form, out, async () => {
      const m = settings.model();
      if (!m) throw new Error('Pick a video model first.');
      const input = { ...settings.read(), prompt: prompt.value.trim() };
      if (!input.prompt) throw new Error('Write a prompt first.');
      if (m.needsFirstFrame && !input.first_frame) throw new Error(`${m.label || m.id} needs a first frame image.`);
      const est = settings.price();
      const status = el('div', { class: 'muted' });
      out.replaceChildren(status);
      const job = await runVideoJob(input, {
        signal: form._abort?.signal,
        onStatus: (j, s) => { status.textContent = `Job ${j.id}: ${j.status || 'submitted'} · ${s} s. Checking every 5 s…`; },
      });
      // Prices only as the 1-5 scale: billed, and what was estimated before sending.
      const facts = el('div', { class: 'muted small' }, `Took ${job.seconds} s.`,
        job.cost != null ? ' Billed ' : '', job.cost != null ? priceTag(Number(job.cost)) : null,
        est ? ' · estimated ' : '', est ? priceTag(est.usd, est) : null);
      const raw = el('details', {}, el('summary', { text: 'Request and last response' }),
        el('pre', { class: 'mono', text: JSON.stringify({ request: job.request, response: job.resp?.data }, null, 2) }));
      if (!job.ok || !job.blob) {
        out.replaceChildren(el('div', { class: 'output error', text: job.error || 'The job failed.' }),
          ...job.notes.map((n) => el('div', { class: 'muted small', text: n })),
          facts, raw);
        return;
      }
      const url = URL.createObjectURL(job.blob);
      clips.set(job.id, url);
      out.replaceChildren(player(url, job.id), ...job.notes.map((n) => el('div', { class: 'muted small', text: n })),
        facts, raw);
      saveLog([{ id: job.id, provider: state.provider, model: m.id, label: m.label, prompt: input.prompt, duration: input.duration,
        resolution: input.resolution, aspect_ratio: input.aspect_ratio, cost: job.cost, at: Date.now() }, ...log()]);
      drawGallery();
    });
  });

  drawGallery();
  // "Fetch the video again" is only offered on the provider that made the clip, so redraw on a switch.
  $('#provider')?.addEventListener('change', () => setTimeout(drawGallery));
  $('textarea', form).focus();
}
