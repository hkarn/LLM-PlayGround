/* LLM PlayGround: Tool: Animate the DreamGen Scene. Turns a scene picture (from Draw the DreamGen
   Scene, or uploaded) into a short clip: a chat model writes the motion from the last scene of the
   same session export, and one of the tested video models in the provider's videoModels makes it. */
import { read, send } from '../adapter.js';
import { curlFor, ep, num, usageLine } from '../core.js';
import { $, $$, el } from '../ui/dom.js';
import { keepDrafts } from '../ui/drafts.js';
import { dreamGenJsonToMarkdown, readDreamGenMarkdown, tokensFor, trimSessionTo } from '../ui/dreamgen-export.js';
import { chosenModel, setupPicker } from '../ui/model-picker.js';
import { rememberModel } from '../ui/remember.js';
import { renderResult } from '../ui/result.js';
import { runStep } from '../ui/run-step.js';
import { scenePicture } from '../ui/scene-handoff.js';
import { sceneStylePicker } from '../ui/scene-styles.js';
import { aboutBox, panelSection, toolLayout } from '../ui/tool-layout.js';
import { priceTag, runVideoJob } from '../ui/video-job.js';
import { videoSettings } from '../ui/video-settings.js';

export const MOTION_SYSTEM_PROMPT = `You read an exported DreamGen role-play game and write a motion prompt for an image-to-video model. The clip starts from a still picture of the final moment of the last scene (the image prompt it was drawn from may follow the export) and lasts only a few seconds.

Write what moves in the next few seconds of that moment, in one or two sentences and at most 50 words:
- What the people in the picture do: a turn of the head, a hand reaching, a step, a change of expression. Name them as they appear, by what they look like or wear, not only by name, since the video model does not know the story.
- What else moves: wind, water, smoke, light, crowds, vehicles.
- How the camera moves, if at all: a slow push in, a pan, or still.

Keep it to what can happen in three to five seconds and stays in the frame. No new characters, no cuts or scene changes, no dialogue, sounds or thoughts. Do not describe the picture again. Reply with the motion prompt only.`;

export function renderDreamGenVideo(root) {
  const st = { frame: null, frameUrl: null, clipUrl: null }; // object URLs are freed when replaced

  // 1. Scene picture
  const preview = el('div', { class: 'vg-stage', text: 'No picture yet.' });
  const upload = el('input', { type: 'file', accept: 'image/*' });
  const useLast = el('button', { type: 'button', class: 'secondary', text: 'Use the last drawn scene' });
  const pictureNote = el('div', { class: 'muted small' });
  function setFrame(file, note = '') {
    if (st.frameUrl) URL.revokeObjectURL(st.frameUrl);
    st.frame = file;
    st.frameUrl = file ? URL.createObjectURL(file) : null;
    preview.replaceChildren(file ? el('img', { src: st.frameUrl, alt: 'Scene picture (first frame)' }) : 'No picture yet.');
    pictureNote.textContent = note;
    settings.setFrameCount(file ? 1 : 0);
  }

  // 2. Motion prompt from a chat model, reading the session export.
  const exportBox = el('textarea', { name: 'export', rows: 10, class: 'mono scene-export', spellcheck: 'false', placeholder: 'Use the session from Draw the DreamGen Scene, load an export, or paste one here.' });
  const exportCount = el('span', { class: 'muted small' });
  const exportFile = el('input', { type: 'file', accept: '.json,.md,.markdown,.txt,application/json,text/markdown,text/plain' });
  const useSession = el('button', { type: 'button', class: 'secondary', text: 'Use the session from Draw the DreamGen Scene' });
  const sessionNote = el('div', { class: 'muted small' });
  const imagePrompt = el('textarea', { name: 'image_prompt', rows: 3, placeholder: 'Optional: what the picture shows (filled in from Draw the DreamGen Scene).' });
  // The chat model and its options, in the settings panel; shared with the other tools.
  const chatForm = el('form', { class: 'tool-form', 'data-kind': 'chat', onsubmit: (e) => e.preventDefault() },
    el('div', { class: 'model-picker', 'data-category': 'chat', 'data-curated': 'on' }),
    el('label', {}, 'Max tokens', el('input', { name: 'max_tokens', type: 'number', min: 1, placeholder: 'default' })),
    el('details', {}, el('summary', { text: 'System prompt' }),
      el('textarea', { name: 'system', rows: 12 }, MOTION_SYSTEM_PROMPT),
      el('button', { type: 'button', class: 'secondary small-btn', text: 'Reset to default', onclick: () => { chatForm.elements.system.value = MOTION_SYSTEM_PROMPT; } })));
  const motionForm = el('form', { class: 'tool-form' },
    el('div', { class: 'row' }, useSession, el('label', { class: 'inline' }, 'or load an export ', exportFile)),
    sessionNote,
    el('label', {}, el('span', {}, 'Session to send ', exportCount), exportBox),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'secondary', text: 'Keep only the last 10k tokens of the Session', onclick: () => {
        const { text, cut, error } = trimSessionTo(exportBox.value, 10000);
        sessionNote.textContent = error || (cut ? `Cut ${cut.toLocaleString()} paragraphs from the start of the Session.` : 'The Session is already within 10k tokens.');
        if (cut) { exportBox.value = text; countExport(); }
      } })),
    el('label', {}, 'What the picture shows (optional)', imagePrompt),
    el('button', { type: 'submit', class: 'primary', text: 'Write motion prompt' }));
  const motionOut = el('div', { class: 'result' });
  const motion = el('textarea', { name: 'motion', rows: 3, placeholder: 'e.g. The man on the wall turns his head toward the empty space beside him; the streetlight flickers; the river runs on.' });
  const style = sceneStylePicker();
  const countExport = () => {
    exportCount.textContent = exportBox.value ? `(about ${tokensFor(exportBox.value).toLocaleString()} tokens)` : '';
  };
  exportBox.addEventListener('input', countExport);

  // 3. The clip. The video model and its options are in the settings panel (shared with the Video
  // Generator); the price stays here, by the button that spends it.
  const settings = videoSettings({ firstFrameOnly: true });
  const clipForm = el('form', { class: 'tool-form' },
    settings.price,
    el('button', { type: 'submit', class: 'primary', text: 'Make video' }));
  const clipOut = el('div', { class: 'result' });

  const main = [
    aboutBox('dreamgen-video',
      el('ol', {},
        el('li', {}, 'Start from a scene picture: the last one drawn in ', el('a', { href: '#tools/dreamgen-scene', text: 'Draw the DreamGen Scene' }), ', or one you upload. It is the clip\'s first frame.'),
        el('li', { text: 'A chat model reads the same session export and writes a short motion prompt: what moves in the next few seconds of the last scene.' }),
        el('li', { text: 'Pick a video model that takes a first frame: one we have tested (some keep a face, some refuse realistic faces; each card says which), or any other your key has, untested. The cheapest settings are chosen first, and the price is shown before you start: the provider\'s listed price, or $ to $$$$$ where only an estimate is possible.' }),
        el('li', { text: 'The clip plays here when it is done, which can take a minute or two, and can be downloaded.' })),
      el('p', { class: 'small' }, el('strong', { text: 'Privacy. ' }),
        'As with Draw the DreamGen Scene: nothing is sent to us or to any third party except your own requests, with your own key, to the provider you chose. ',
        'The picture and the session stay in this browser; the picture is passed between the two tools in memory and is gone after a reload.')),
    el('section', { class: 'tool-step' }, el('h3', { text: '1. Scene picture' }),
      preview, el('div', { class: 'row' }, useLast, el('label', { class: 'inline' }, 'or upload ', upload)), pictureNote),
    el('section', { class: 'tool-step' }, el('h3', { text: '2. Motion prompt' }), motionForm, motionOut,
      el('label', {}, 'Motion prompt (sent to the video model)', motion)),
    el('section', { class: 'tool-step' }, el('h3', { text: '3. Make the clip' }),
      el('div', { class: 'muted small', text: 'With the video model and options chosen under Settings.' }), clipForm, clipOut)];

  // The settings panel: what is chosen once and left alone. The steps hold what changes each run.
  const layout = toolLayout(root, {
    panel: [
      panelSection('Prompt writer', el('p', { class: 'muted small', text: 'The chat model that reads the export and writes the motion prompt (step 2).' }), chatForm),
      panelSection('Video model', settings.root),
      panelSection('Picture style',
        el('label', {}, 'Style', style.select),
        el('label', { class: 'style-custom', hidden: '' }, 'Your style', style.custom),
        el('p', { class: 'muted small', text: 'Added to the end of the motion prompt ("Style: …"). Shared with Draw the DreamGen Scene, so it starts as the style the picture was drawn in.' })),
    ],
    main,
    // While folded, say so when the shared video model doesn't work here and a new pick is needed.
    summary: () => [chosenModel(chatForm), settings.blocked() ? 'Video model: pick one that starts from a picture' : settings.model()?.label].filter(Boolean).join(' · '),
  });

  for (const picker of $$('.model-picker', root)) setupPicker(picker);
  // Shared with the other tools: the same chat model as Draw the DreamGen Scene.
  rememberModel(chatForm, 'chat', ['max_tokens']);
  layout.refresh();
  style.sync();
  keepDrafts(root, 'dgvideo', { skip: ['generate_audio', 'video-model', 'style_custom', 'max_tokens'] });
  countExport();

  // The handoff from Draw the DreamGen Scene: offered when there is one, and taken at once when
  // the tool opens with nothing chosen yet.
  const syncHandoff = () => {
    const s = scenePicture();
    useLast.disabled = !s;
    useSession.disabled = !s?.exportText;
    useLast.title = s ? '' : 'Draw a picture in Draw the DreamGen Scene first (this page, since the last reload).';
  };
  const takeHandoff = () => {
    const s = scenePicture();
    if (!s) return;
    setFrame(s.file, `From Draw the DreamGen Scene${s.title ? `: ${s.title}` : ''}.`);
    if (s.exportText) { exportBox.value = s.exportText; countExport(); sessionNote.textContent = 'The session as it was sent for that picture.'; }
    if (s.prompt) imagePrompt.value = s.prompt;
  };
  useLast.addEventListener('click', () => { const s = scenePicture(); if (s) setFrame(s.file, `From Draw the DreamGen Scene${s.title ? `: ${s.title}` : ''}.`); });
  useSession.addEventListener('click', () => {
    const s = scenePicture();
    if (!s?.exportText) return;
    exportBox.value = s.exportText;
    countExport();
    if (s.prompt) imagePrompt.value = s.prompt;
    sessionNote.textContent = 'The session as it was sent for the last drawn picture.';
  });
  document.addEventListener('scene-picture', syncHandoff);
  syncHandoff();
  if (scenePicture() && !st.frame) takeHandoff();

  upload.addEventListener('change', () => { if (upload.files[0]) setFrame(upload.files[0], `Uploaded: ${upload.files[0].name}.`); upload.value = ''; });
  exportFile.addEventListener('change', async () => {
    const f = exportFile.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const isJson = /\.json$/i.test(f.name) || /^\s*[{[]/.test(text);
      const s = isJson ? dreamGenJsonToMarkdown(JSON.parse(text)) : readDreamGenMarkdown(text, f.name);
      exportBox.value = s.text;
      countExport();
      sessionNote.textContent = `${s.title} · ${s.format} · ${s.turns.toLocaleString()} turns.`;
    } catch (err) {
      sessionNote.textContent = `Could not read ${f.name}: ${err.message}`;
    }
    exportFile.value = '';
  });

  motionForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runStep(motionForm, motionOut, async () => {
      const exported = exportBox.value.trim();
      if (!exported) throw new Error('Load or paste a session export first.');
      const model = chosenModel(chatForm);
      if (!model) throw new Error('Pick or type a chat model first (Settings).');
      const seen = imagePrompt.value.trim();
      const text = `${exported}\n\n---\n\n${seen ? `The picture the clip starts from was drawn from this prompt:\n${seen}\n\n` : ''}Write the motion prompt for the next few seconds of the final moment of the last scene.`;
      const system = chatForm.elements.system.value.trim();
      const { resp, request: body } = await send('chat', {
        model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: text }],
        max_tokens: num(chatForm, 'max_tokens'),
      }, { signal: motionForm._abort?.signal });
      let rendered;
      if (resp.ok) {
        const reply = (read('chat', resp).text || '').trim().replace(/^["']|["']$/g, '');
        if (reply) motion.value = reply;
        rendered = el('div', {},
          el('div', { class: 'output', text: reply ? 'Motion prompt written below. Edit it if you like.' : 'The reply was empty.' }),
          el('div', { class: 'muted small', text: usageLine(resp.data, resp.data?.choices?.[0]) }));
      }
      const shortBody = { ...body, messages: body.messages.map((m) => ({ ...m, content: m.content.length > 1200 ? `${m.content.slice(0, 600)}\n… ${(m.content.length - 1000).toLocaleString()} characters …\n${m.content.slice(-400)}` : m.content })) };
      const { path, base } = ep('chat');
      renderResult(motionOut, { resp, request: shortBody, curl: curlFor(path, { base, json: shortBody }), rendered, quiet: true });
    });
  });

  clipForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runStep(clipForm, clipOut, async () => {
      if (!st.frame) throw new Error('Choose a scene picture first (step 1).');
      const motionText = motion.value.trim();
      if (!motionText) throw new Error('Write a motion prompt first (step 2).');
      // The picture style goes at the end, as Draw the DreamGen Scene adds it to the image prompt.
      const prompt = style.withStyle(motionText);
      const m = settings.model();
      if (!m) throw new Error(settings.blocked() || 'Pick a video model first (Settings).');
      const est = settings.priceNow();
      const status = el('div', { class: 'muted' });
      clipOut.replaceChildren(status);
      const job = await runVideoJob({ ...settings.read(), prompt, first_frame: st.frame, last_frame: undefined }, {
        signal: clipForm._abort?.signal,
        onStatus: (j, s) => { status.textContent = `Job ${j.id}: ${j.status || 'submitted'} · ${s} s. Checking every 5 s…`; },
      });
      // Prices only as the 1-5 scale ($$$$$): billed, and what was estimated before sending.
      const facts = () => el('div', { class: 'muted small' }, `Took ${job.seconds} s.`,
        job.cost != null ? ' Billed ' : '', job.cost != null ? priceTag(Number(job.cost), { amount: Number(job.cost) }) : null,
        est ? ' · estimated ' : '', est ? priceTag(est.usd, { approx: est.approx, amount: est.listedUsd }) : null);
      const raw = el('details', { class: 'request-details' }, el('summary', { text: 'Request details' }),
        el('pre', { class: 'mono', text: JSON.stringify({ request: job.request, response: job.resp?.data }, null, 2) }));
      const notes = job.notes.map((n) => el('div', { class: 'muted small', text: n }));
      if (!job.ok || !job.blob) {
        const refused = /guideline|policy|safety|sensitive|face|person/i.test(job.error || '');
        clipOut.replaceChildren(...[el('div', { class: 'output error', text: job.error || 'The job failed.' }),
          refused ? el('div', { class: 'small', text: 'A refusal like this usually means the model won\'t take this picture (for example a realistic face). Try a model whose card says it kept the face, rather than rewording the prompt.' }) : null,
          ...notes, facts(), raw].filter(Boolean));
        return;
      }
      // Only the newest clip is shown, so the one before it can be freed.
      if (st.clipUrl) URL.revokeObjectURL(st.clipUrl);
      const url = URL.createObjectURL(job.blob);
      st.clipUrl = url;
      clipOut.replaceChildren(el('div', { class: 'output' },
        el('video', { controls: '', src: url, autoplay: '', muted: '', loop: '', playsinline: '' }),
        el('div', {}, el('a', { href: url, download: `scene-${job.id}.mp4`, text: 'Download' }))),
      ...notes, facts(), raw);
    });
  });

  $('.tool-step', root)?.scrollIntoView?.({ block: 'nearest' });
}
