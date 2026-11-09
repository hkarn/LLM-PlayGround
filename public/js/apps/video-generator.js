/* LLM PlayGround: Tool: Video Generator. Makes a clip with one of the tested video models in the
   provider file's videoModels, offering only that model's options and showing the price before
   sending. A job is watched in the background (ui/video-jobs.js), so the next clip can be started at
   once; the jobs list is in the settings panel. The Video tab stays the raw tester for every model. */
import { $, el } from '../ui/dom.js';
import { keepDrafts } from '../ui/drafts.js';
import { runStep } from '../ui/run-step.js';
import { priceTag } from '../ui/video-job.js';
import { startVideoJob, videoJobsLine, videoJobsList } from '../ui/video-jobs.js';
import { videoSettings } from '../ui/video-settings.js';
import { aboutBox, panelSection, toolLayout } from '../ui/tool-layout.js';

export function renderVideoGenerator(root) {
  // The video model and its options are in the settings panel (shared with Animate the DreamGen
  // Scene); the frames and the price stay here, with the prompt and the button that spends it.
  const settings = videoSettings();
  const prompt = el('textarea', { name: 'prompt', rows: 3, required: '', placeholder: 'Describe the clip: what moves, how the camera moves, the light.' });
  const form = el('form', { class: 'tool-form' },
    el('label', {}, 'Prompt', prompt),
    settings.frames,
    settings.price,
    el('button', { type: 'submit', class: 'primary', text: 'Generate video' }));
  const out = el('div', { class: 'result' });

  const layout = toolLayout(root, {
    panel: [panelSection('Video model', settings.root),
      panelSection('Video jobs', el('p', { class: 'muted small', text: 'Clips from this tool and Animate the DreamGen Scene, kept in this browser (not the videos). A provider keeps a finished video for a while, so one can be fetched again after a reload without paying.' }), videoJobsList())],
    summary: () => [settings.model()?.label || settings.model()?.id || '', videoJobsLine()].filter(Boolean).join(' · '),
    main: [
    aboutBox('video-generator',
      el('ol', {},
        el('li', { text: 'Pick a video model under Settings. The ones listed are models we have tried; hover one to see what it takes and what we found. Other video model has the rest on your key, untested.' }),
        el('li', { text: 'Write what should happen in the clip. You can add a picture to start from, and with some models one to end on.' }),
        el('li', { text: 'Check the price and press Generate video. A clip takes from 15 seconds to a few minutes; you can start the next one meanwhile, and follow them all under Video jobs in the settings panel, even after a reload.' })),
      el('p', { class: 'small' }, 'Prices are the provider\'s own where it lists them, and $ (cheapest) to $$$$$ where they can only be estimated. ',
        'Only your own requests leave this browser, with your key, to the provider you chose. ',
        'For the raw request and response, use the ', el('a', { href: '#video', text: 'Video tab' }), '.')),
    el('section', { class: 'tool-step' }, el('h3', { text: 'Make a clip' }), form, out)],
  });
  layout.refresh();
  document.addEventListener('video-jobs', () => { if (root.isConnected) layout.refresh(); });

  keepDrafts(form, 'videogen');

  const player = (url, id) => el('div', { class: 'output' },
    el('video', { controls: '', src: url, autoplay: '', muted: '', loop: '', playsinline: '' }),
    el('div', {}, el('a', { href: url, download: `video-${id}.mp4`, text: 'Download' })));
  const details = (job) => el('details', { class: 'request-details' }, el('summary', { text: 'Request details' }),
    el('pre', { class: 'mono', text: JSON.stringify({ request: job.request, response: job.resp?.data }, null, 2) }));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runStep(form, out, async () => {
      const m = settings.model();
      if (!m) throw new Error('Pick a video model first (Settings).');
      const input = { ...settings.read(), prompt: prompt.value.trim() };
      if (!input.prompt) throw new Error('Write a prompt first.');
      if (m.needsFirstFrame && !input.first_frame) throw new Error(`${m.label || m.id} needs a first frame image.`);
      const est = settings.priceNow();
      out.replaceChildren(el('div', { class: 'muted', text: 'Sending the job…' }));
      const job = await startVideoJob(input, { tool: 'video-generator', label: m.label || m.id, est, signal: form._abort?.signal });
      const notes = job.notes.map((n) => el('div', { class: 'muted small', text: n }));
      if (!job.ok) {
        out.replaceChildren(el('div', { class: 'output error', text: job.error || 'The job could not be sent.' }), ...notes, details(job));
        return;
      }
      // Sent: the form is free again. The clip shows here when it is done, if this is still the
      // latest one, and always under Video jobs.
      out.dataset.job = job.id;
      const estTag = est ? [' Estimated ', priceTag(est.usd, { approx: est.approx, amount: est.listedUsd }), '.'] : [];
      out.replaceChildren(el('div', { class: 'output' }, `Job sent. It runs in the background, so you can start another clip; it shows here when it is done, and under Video jobs in the settings panel.`, ...estTag),
        ...notes, details(job));
      job.done.then((r) => {
        if (out.dataset.job !== job.id) return;
        const facts = el('div', { class: 'muted small' }, `Took ${r.seconds} s.`,
          r.cost != null ? ' Billed ' : '', r.cost != null ? priceTag(Number(r.cost), { amount: Number(r.cost) }) : null);
        // Request details as sent, with the job's last answer (its end status and cost).
        out.replaceChildren(r.ok && r.url ? player(r.url, job.id) : el('div', { class: 'output error', text: r.error || 'The job failed.' }), ...notes, facts, details({ ...job, resp: r.resp || job.resp }));
      });
    });
  });

  $('textarea', form).focus();
}
