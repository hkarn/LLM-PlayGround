/* LLM PlayGround: Tool: Animate the DreamGen Scene. Turns a scene picture (from Draw the DreamGen
   Scene, or uploaded) into a short clip: a chat model writes the motion from the last scene of the
   same session export, and one of the tested video models in the provider's videoModels makes it. */
import { read, send } from '../adapter.js';
import { ep } from '../core/providers.js';
import { curlFor } from '../core/api.js';
import { num } from '../core/helpers.js';
import { $, $$, el } from '../ui/dom.js';
import { clip, fileName } from '../ui/media.js';
import { keepDrafts } from '../ui/drafts.js';
import { exportPictures } from '../ui/export-pictures.js';
import { helpTip } from '../ui/help-tip.js';
import { rememberFold } from '../ui/fold.js';
import { dreamGenJsonToMarkdown, EXPORT_GUIDE, readDreamGenMarkdown, tokensFor, trimSessionTo } from '../ui/dreamgen-export.js';
import { chosenModel, setupPicker } from '../ui/model-picker.js';
import { rememberModel } from '../ui/remember.js';
import { answerFacts, renderResult } from '../ui/result.js';
import { runStep } from '../ui/run-step.js';
import { scenePicture } from '../ui/scene-handoff.js';
import { SCENE_MARK, scenePicker } from '../ui/scene-picker.js';
import { sceneStylePicker } from '../ui/scene-styles.js';
import { aboutBox, panelSection, toolLayout } from '../ui/tool-layout.js';
import { priceTag } from '../ui/video-job.js';
import { startVideoJob, videoJobsLine, videoJobsList } from '../ui/video-jobs.js';
import { videoSettings } from '../ui/video-settings.js';

// When the first frame was drawn with Will animate (faces turned to the camera, see Draw the DreamGen
// Scene), this opens the motion prompt, so the clip turns the characters back into the scene at once.
export const POSED_MOTION_NOTE = 'The clip opens with the characters facing the camera, as in the picture. Within the first second they turn naturally away from the camera and into the action below, keeping their faces and looks.';

export const MOTION_SYSTEM_PROMPT = `You read an exported DreamGen role-play game and write a motion prompt for an image-to-video model. The clip starts from a still picture of the final moment of the last scene and lasts a few seconds: the user message says how many. The image prompt the picture was drawn from may follow the export: it says who is in the frame and how they look.

${EXPORT_GUIDE}

## What the clip shows
The picture is the end of the Session. The clip carries that moment on for its length: the action each person is in the middle of plays through, and the next beat the last turns set up begins, such as a knock landing and the man outside leaning in, or a head turning towards whoever just spoke. Go no further than that beat: no answers, decisions or events the Session has not reached, no new characters, no cuts or scene changes.
- If the last turn is the player's and nobody has answered it, the clip shows that action happening.
- If the user message says the picture shows the first moment of the last scene, the clip plays that scene out instead: its main physical action, in story order, condensed into the clip, and ending where the Session ends.
- The people must visibly move. Never write that someone stays still, holds their position or remains motionless: even a quiet moment has a breath, a shift of weight, a turn of the head, a hand that moves.

## Fitting the clip's length
A video model shows about one clear action every three seconds. Size the motion to the clip:
- Up to 6 seconds: one beat. One main action by one person, or one person acting and one reacting, plus background motion.
- 7 to 10 seconds: two beats, one after the other ("then").
- 11 to 15 seconds: three or four beats in story order, as a short sequence.
- More than 15 seconds: one beat for every three or four seconds.
- When the scene has more than fits, keep its main physical action, the moment a viewer would remember, and leave the rest out. Everyone else in frame only reacts: a glance, a turn of the head, a breath.
- Before replying, count the beats and the people who act, and cut back to the limit for the clip's length.

## The motion prompt
One paragraph in the present tense that a video model can follow shot by shot:
1. One sentence that sets the frame as the image prompt describes it: where it is, the light, and who and what is where. Keep to what is in the picture: the video model starts from it.
2. The action, beat by beat in story order, each with a clear start and end.
3. Everything else that moves: weather, water, smoke, fire, sparks, debris, light flickering or shifting, crowds, ships and engines.
4. The camera: framing and movement (static wide shot, slow push in, handheld tracking, orbit), and the lighting and mood held through the clip.

## Spell out every action
A video model fills any gap with a guess, and a short verb invites the wrong one: "Ares opens fire" can become a man drawing a pistol and shooting the screen, when the story means a commander ordering a warship's guns to fire. So for every action write out:
- Who does it, and with what: their hands, a tool, a console, a weapon they already hold, or the ship, vehicle or creature itself.
- How the body moves, in plain physical steps: "raises his right hand and gives a short nod", "presses a glowing key on the console", "pulls the lever back with both hands".
- Where the effect happens and how it is seen: outside the ship, on a display screen, through a window, across the room. An order is given by voice or gesture, and the people carry it out; what happens far away is seen only on a screen or through a window.
- What it is not, when a likely misreading would spoil the clip: "nobody draws a weapon; the shots come from the warship's own guns, seen on the display".

## Naming and describing
- Call people and things what they are in the story's world, as a fan would: "a Cylon Basestar", "a Colonial Viper", "an ornithopter", "a Mord-Sith in red leather", "the Zocalo". Never shrink a specific thing to a generic word such as "ship", "creature", "building" or "weapon".
- A name alone is not enough: the video model may not know it. The first time a person or thing appears, describe it in full: shape, size, colour, material, parts, how it moves. Take the look from the export (character, location and object cards, the Setting, the Session) or the image prompt where they describe it, and keep to the story's world where they don't. For example, "a Cylon Basestar, a vast grey warship shaped like two three-armed stars joined at the centre, its armoured arms ribbed and lit along the edges".
- People: a well-known character of the world by name and look ("Kara 'Starbuck' Thrace, a blonde pilot in an orange flight suit"); anyone else, the player's character included, by how they look in the picture ("the grey-haired man in the oilskin coat").
- Only what can be seen: no dialogue, sounds, thoughts or backstory.

## Length
About 80 to 120 words for a clip of up to 6 seconds, 120 to 170 for 7 to 10 seconds, and 160 to 230 for longer clips. Spend the words on detail, not on more action: how the beats that fit the clip's length are done, what the people and things look like, what is around them and the camera. The number of beats and of people who act stays as set above. Reply with the motion prompt only.`;

export function renderDreamGenVideo(root) {
  const st = { frame: null, frameUrl: null }; // the frame's object URL is freed when replaced

  // 1. Scene picture
  const preview = el('div', { class: 'vg-stage', text: 'No picture yet.' });
  const upload = el('input', { type: 'file', accept: 'image/*' });
  const useLast = el('button', { type: 'button', class: 'secondary', text: 'Use the last drawn scene' });
  const pictureNote = el('div', { class: 'muted small' });
  // Ticked when the picture comes from Draw the DreamGen Scene drawn with Will animate: the faces were
  // turned to the camera for the video model, so the motion prompt starts by turning them back.
  const posed = el('input', { type: 'checkbox' });
  const posedRow = el('label', { class: 'inline small', title: 'Starts the motion prompt with the characters turning from the camera into the scene. Ticked by itself when the picture was drawn with Will animate.' },
    posed, 'Faces posed for the camera: turn them back into the scene at the start');
  // Ticked when the picture shows the first moment of the last (or picked) scene: Draw the DreamGen
  // Scene with Will animate draws that. The motion prompt then plays the scene out from there.
  const opening = el('input', { type: 'checkbox' });
  const openingRow = el('label', { class: 'inline small', title: 'The motion prompt plays the scene out from its start, instead of carrying the final moment on. Ticked by itself when the picture was drawn with Will animate.' },
    opening, 'The picture shows the scene’s first moment: play the scene out');
  // Pictures embedded in a JSON export (a location, a character): any can be the first frame.
  const pictures = exportPictures({ actions: [{ label: 'Use as first frame', onclick: (i) => setFrame(i.file, `From the export: ${i.name || i.kind}.`, false, { what: `the export's ${i.kind || 'picture'}${i.name ? ` "${i.name}"` : ''}` }) }] });
  // Where the frame came from: { scene: true, opening } for a picture drawn from this session's last
  // (or picked) scene in Draw the DreamGen Scene, `opening` when it shows the scene's first moment;
  // otherwise { what } (an upload, an export picture). Only a scene picture belongs to the scene; for
  // the others the motion writer is told what it is.
  function setFrame(file, note = '', facesPosed = false, source = null) {
    st.frameAt = Date.now();
    posed.checked = !!facesPosed;
    opening.checked = !!source?.opening;
    st.source = source;
    // A description from an earlier scene picture would be wrong for an upload or an export picture.
    if (!source?.scene) imagePrompt.value = '';
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
    rememberFold(el('details', {}, el('summary', { text: 'System prompt' }),
      el('textarea', { name: 'system', rows: 12 }, MOTION_SYSTEM_PROMPT),
      el('button', { type: 'button', class: 'secondary small-btn', text: 'Reset to default', onclick: () => { chatForm.elements.system.value = MOTION_SYSTEM_PROMPT; } })), 'system_prompt'));
  // Pick the scene, as in Draw the DreamGen Scene: works on the whole export as loaded (st.full), and
  // shares its kept split, so a scene picked there is picked here too for the same session.
  const picker = scenePicker({
    chatForm, getText: () => st.full || '', budget: () => 10000,
    onPick: (text) => { if (st.full) { exportBox.value = text ?? st.full; countExport(); } },
  });
  // The clip's length beside the button: a copy of Duration from the video settings (made below).
  const lengthSlot = el('span');
  const motionForm = el('form', { class: 'tool-form' },
    el('div', { class: 'row' }, useSession, el('label', { class: 'inline' }, 'or load an export ', exportFile)),
    sessionNote,
    el('details', { class: 'scene-pick-fold' }, el('summary', { text: 'Pick the scene (optional)' }), picker.node),
    el('label', {}, el('span', {}, 'Session to send ', exportCount), exportBox),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'secondary', text: 'Keep only the last 10k tokens of the Session', onclick: () => {
        const { text, cut, error } = trimSessionTo(exportBox.value, 10000);
        sessionNote.textContent = error || (cut ? `Cut ${cut.toLocaleString()} paragraphs from the start of the Session.` : 'The Session is already within 10k tokens.');
        if (cut) { exportBox.value = text; countExport(); picker.sync(text); }
      } })),
    el('label', {}, 'What the picture shows (optional)', imagePrompt),
    el('div', { class: 'row' },
      el('button', { type: 'submit', class: 'primary', text: 'Write motion prompt' }),
      el('label', { class: 'inline', title: 'The length of the clip: the same choice as Duration under Video model in the settings. The motion prompt is written to fit it.' }, 'for a clip of ', lengthSlot, ' seconds')));
  const motionOut = el('div', { class: 'result' });
  const motion = el('textarea', { name: 'motion', rows: 3, placeholder: 'e.g. The man on the wall turns his head toward the empty space beside him; the streetlight flickers; the river runs on.' });
  const style = sceneStylePicker();
  style.select.setAttribute('aria-label', 'Style');
  const countExport = () => {
    exportCount.textContent = exportBox.value ? `(about ${tokensFor(exportBox.value).toLocaleString()} tokens)` : '';
  };
  // Typing or pasting: a marker that is gone un-picks the scene, and an export pasted in by hand
  // (no file or handoff) becomes what the scenes are found in, after a pause in typing.
  let pasteTimer;
  exportBox.addEventListener('input', () => {
    countExport();
    picker.sync(exportBox.value);
    if (st.loaded || exportBox.value.includes(SCENE_MARK)) return;
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(() => { st.full = exportBox.value; picker.reset(); }, 600);
  });

  // 3. The clip. The video model and its options are in the settings panel (shared with the Video
  // Generator); the price stays here, by the button that spends it.
  const settings = videoSettings({ firstFrameOnly: true });
  lengthSlot.append(settings.durationMirror());
  const clipForm = el('form', { class: 'tool-form' },
    settings.price,
    el('button', { type: 'submit', class: 'primary', text: 'Make video' }));
  const clipOut = el('div', { class: 'result' });

  const main = [
    aboutBox('dreamgen-video',
      el('ol', {},
        el('li', {}, 'Start from a scene picture: the last one drawn in ', el('a', { href: '#tools/dreamgen-scene', text: 'Draw the DreamGen Scene' }), ', or one you upload. It is the clip\'s first frame.'),
        el('li', { text: 'A chat model reads the same session export and writes a short motion prompt: the moment the picture holds, played on for a few seconds.' }),
        el('li', { text: 'Pick a video model that takes a first frame: one we have tested (some keep a face, some refuse realistic faces; each card says which), or any other your key has, untested. The cheapest settings are chosen first, and the price is shown before you start: the provider\'s listed price, or $ to $$$$$ where only an estimate is possible.' }),
        el('li', { text: 'The job runs in the background, so you can make the next clip meanwhile. Each clip plays here when it is done (a minute or two), and every job is listed under Video jobs in the settings panel, even after a reload.' })),
      el('p', { class: 'small' }, el('strong', { text: 'Privacy. ' }),
        'As with Draw the DreamGen Scene: nothing is sent to us or to any third party except your own requests, with your own key, to the provider you chose. ',
        'The picture and the session stay in this browser; the picture is passed between the two tools in memory and is gone after a reload.')),
    el('section', { class: 'tool-step' }, el('h3', { text: '1. Scene picture' }),
      preview, el('div', { class: 'row' }, useLast, el('label', { class: 'inline' }, 'or upload ', upload)), pictureNote, posedRow, openingRow, pictures.node),
    // As in Draw the DreamGen Scene: the details of the last run sit under its button, and the text it
    // wrote is in the box below, which may have been edited since.
    el('section', { class: 'tool-step' }, el('h3', { text: '2. Motion prompt' }), motionForm, motionOut,
      el('label', {}, 'Motion prompt (sent to the video model)', motion)),
    el('section', { class: 'tool-step' }, el('h3', { text: '3. Make the clip' }),
      el('div', { class: 'muted small', text: 'With the video model and options chosen under Settings.' }), clipForm, clipOut)];

  // The settings panel: what is chosen once and left alone. The steps hold what changes each run.
  const layout = toolLayout(root, {
    panel: [
      panelSection('Prompt writer', el('p', { class: 'muted small', text: 'The chat model that reads the export and writes the motion prompt (step 2).' }), chatForm),
      // The style goes with the prompt it is added to; the video choice after it, its jobs last.
      panelSection('Picture style',
        el('div', {}, el('div', { class: 'tip-row' }, el('span', { text: 'Style' }), helpTip('Added to the end of the motion prompt ("Style: …"). Shared with Draw the DreamGen Scene, so it starts as the style the picture was drawn in.')), style.select),
        el('label', { class: 'style-custom', hidden: '' }, 'Your style', style.custom)),
      panelSection('Video model', settings.root),
      panelSection('Video jobs', el('p', { class: 'muted small', text: 'Clips from this tool and the Video Generator, kept in this browser (not the videos).' }), videoJobsList()),
    ],
    main,
    // While folded, say so when the shared video model doesn't work here and a new pick is needed.
    summary: () => [chosenModel(chatForm), settings.blocked() ? 'Video model: pick one that starts from a picture' : settings.model()?.label, videoJobsLine()].filter(Boolean).join(' · '),
  });

  for (const picker of $$('.model-picker', root)) setupPicker(picker);
  // Shared with the other tools: the same chat model as Draw the DreamGen Scene.
  rememberModel(chatForm, 'chat', ['max_tokens']);
  layout.refresh();
  document.addEventListener('video-jobs', () => { if (root.isConnected) layout.refresh(); });
  style.sync();
  keepDrafts(root, 'dgvideo', { skip: ['generate_audio', 'video-model', 'style_custom', 'max_tokens'] });
  countExport();
  // A box restored after a reload (keepDrafts) is the source until a file or the handoff replaces it.
  if (!exportBox.value.includes(SCENE_MARK)) st.full = exportBox.value;
  picker.reset();

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
    setFrame(s.file, `From Draw the DreamGen Scene${s.title ? `: ${s.title}` : ''}.`, s.posed, { scene: true, opening: s.opening });
    takeSession(s);
    if (s.prompt) imagePrompt.value = s.prompt;
    if (s.pictures?.length) pictures.set(s.pictures);
  };
  useLast.addEventListener('click', () => { const s = scenePicture(); if (s) setFrame(s.file, `From Draw the DreamGen Scene${s.title ? `: ${s.title}` : ''}.`, s.posed, { scene: true, opening: s.opening }); });
  useSession.addEventListener('click', () => {
    const s = scenePicture();
    if (!s?.exportText) return;
    takeSession(s);
    if (s.prompt) imagePrompt.value = s.prompt;
    if (s.pictures?.length) pictures.set(s.pictures);
    sessionNote.textContent = 'The session as it was sent for the last drawn picture.';
  });
  // The session from Draw: the text it sent (cut to its picked scene, if any), and the whole export
  // for picking another scene here.
  function takeSession(s) {
    if (!s.exportText) return;
    st.full = s.fullText || s.exportText;
    st.loaded = true;
    picker.reset();
    exportBox.value = s.exportText;
    countExport();
    sessionNote.textContent = 'The session as it was sent for that picture.';
  }
  document.addEventListener('scene-picture', syncHandoff);
  syncHandoff();
  if (scenePicture() && !st.frame) takeHandoff();
  // This view is kept while another tool is open (hubs.js). Back on it, a picture drawn since in
  // Draw the DreamGen Scene is taken, as when the tool first opens, unless a frame was chosen here
  // after that picture was drawn.
  document.addEventListener('app-shown', (e) => {
    const s = scenePicture();
    if (e.detail?.contains(root) && s && s.at > (st.frameAt || 0)) takeHandoff();
  });

  upload.addEventListener('change', () => { if (upload.files[0]) setFrame(upload.files[0], `Uploaded: ${upload.files[0].name}.`, false, { what: `a picture the user uploaded (${upload.files[0].name})` }); upload.value = ''; });
  exportFile.addEventListener('change', async () => {
    const f = exportFile.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const isJson = /\.json$/i.test(f.name) || /^\s*[{[]/.test(text);
      const s = isJson ? dreamGenJsonToMarkdown(JSON.parse(text)) : readDreamGenMarkdown(text, f.name);
      st.full = s.text;
      st.loaded = true;
      exportBox.value = s.text;
      picker.reset();
      countExport();
      sessionNote.textContent = `${s.title} · ${s.format} · ${s.turns.toLocaleString()} turns.`;
      pictures.set(s.images);
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
      const secs = settings.read().duration;
      const length = secs ? `The clip is ${secs} seconds long.` : 'The clip is about 5 seconds long (the video model’s default length).';
      // Only a picture drawn from this session's last scene belongs to it. Any other frame (an upload,
      // an export picture) is described as what it is, so the motion fits the actual picture.
      const fromScene = !st.source || st.source.scene;
      const about = fromScene
        ? (seen ? `The picture the clip starts from was drawn from this prompt:\n${seen}\n\n` : '')
        : `The picture the clip starts from is not a drawing of the last scene: it is ${st.source.what}. ${seen ? `The user describes it as:\n${seen}` : 'Nothing more is known about what it shows.'}\n\n`;
      const ask = !fromScene
        ? 'Write a motion prompt that fits that picture, not the last scene: use the story only for who the people are and their mood. If it shows a place or an object without people, move the place instead: light, weather, water, smoke and the camera. If little is known about it, keep the motion general (a slow camera move, light, a breath) rather than inventing what is in it.'
        : opening.checked ? 'The picture shows the first moment of the last scene. Write the motion prompt that plays the scene out from there.'
          : 'Write the motion prompt for the moment the picture holds: the final moment of the last scene.';
      const text = `${exported}\n\n---\n\n${length}\n\n${about}${posed.checked ? 'The picture was posed with every face turned to the camera, so the video model can keep the faces. A line before your prompt already has them turn away from the camera at the start; describe what they do once they have turned.\n\n' : ''}${ask}`;
      const system = chatForm.elements.system.value.trim();
      const t0 = Date.now();
      const { resp, request: body } = await send('chat', {
        model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: text }],
        max_tokens: num(chatForm, 'max_tokens'),
      }, { signal: motionForm._abort?.signal });
      const seconds = Math.round((Date.now() - t0) / 1000);
      // The prompt goes into the editable box below; this box holds only the request details and the stats.
      if (resp.ok) {
        const reply = (read('chat', resp).text || '').trim().replace(/^["']|["']$/g, '');
        if (reply) motion.value = reply;
      }
      const shortBody = { ...body, messages: body.messages.map((m) => ({ ...m, content: m.content.length > 1200 ? `${m.content.slice(0, 600)}\n… ${(m.content.length - 1000).toLocaleString()} characters …\n${m.content.slice(-400)}` : m.content })) };
      const { path, base } = ep('chat');
      renderResult(motionOut, { resp, request: shortBody, curl: curlFor(path, { base, json: shortBody }), quiet: true });
      const facts = resp.ok ? answerFacts(resp.data?.usage, seconds) : null;
      if (facts) motionOut.append(facts);
    });
  });

  clipForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runStep(clipForm, clipOut, async () => {
      if (!st.frame) throw new Error('Choose a scene picture first (step 1).');
      const motionText = motion.value.trim();
      if (!motionText) throw new Error('Write a motion prompt first (step 2).');
      // The picture style goes at the end, as Draw the DreamGen Scene adds it to the image prompt.
      const prompt = style.withStyle(posed.checked ? `${POSED_MOTION_NOTE}\n\n${motionText}` : motionText);
      const m = settings.model();
      if (!m) throw new Error(settings.blocked() || 'Pick a video model first (Settings).');
      await sendClip({ ...settings.read(), prompt, first_frame: st.frame, last_frame: undefined }, m, settings.priceNow());
    });
  });

  // Sends one clip job and shows it. Retry (in the finished clip's bar) sends this same input again
  // as a new job: the same picture, motion, style and settings, whatever has changed since.
  async function sendClip(input, m, est) {
    clipOut.replaceChildren(el('div', { class: 'muted', text: 'Sending the job…' }));
    const job = await startVideoJob(input, { tool: 'dreamgen-video', label: m.label || m.id, est, signal: clipForm._abort?.signal });
    const rawFor = (resp) => rememberFold(el('details', { class: 'request-details' }, el('summary', { text: 'Request details' }),
      el('pre', { class: 'mono', text: JSON.stringify({ request: job.request, response: resp?.data }, null, 2) })), 'request_details');
    const raw = rawFor(job.resp);
    const notes = job.notes.map((n) => el('div', { class: 'muted small', text: n }));
    // A refusal usually means the model won't take this picture, not the wording.
    const refusalHint = (error) => (/guideline|policy|safety|sensitive|face|person/i.test(error || '')
      ? el('div', { class: 'small', text: 'A refusal like this usually means the model won\'t take this picture (for example a realistic face). Try a model whose card says it kept the face, rather than rewording the prompt.' }) : null);
    if (!job.ok) {
      clipOut.replaceChildren(...[el('div', { class: 'output error', text: job.error || 'The job could not be sent.' }), refusalHint(job.error), ...notes, raw].filter(Boolean));
      return;
    }
    // Sent: the button is free again. The clip shows here when it is done, if it is still the
    // latest one, and always under Video jobs.
    clipOut.dataset.job = job.id;
    const estTag = est ? [' Estimated ', priceTag(est.usd, { approx: est.approx, amount: est.listedUsd }), '.'] : [];
    clipOut.replaceChildren(el('div', { class: 'output' }, 'Job sent. It runs in the background, so you can make another clip; it shows here when it is done, and under Video jobs in the settings panel.', ...estTag), ...notes, raw);
    job.done.then((r) => {
      if (clipOut.dataset.job !== job.id) return;
      // Request details as sent, with the job's last answer (its end status and cost).
      const raw = rawFor(r.resp || job.resp);
      // Prices only as the 1-5 scale ($$$$$), or the provider's billed amount.
      const facts = el('div', { class: 'muted small' }, `Took ${r.seconds} s.`,
        r.cost != null ? ' Billed ' : '', r.cost != null ? priceTag(Number(r.cost), { amount: Number(r.cost) }) : null);
      if (!r.ok || !r.url) {
        clipOut.replaceChildren(...[el('div', { class: 'output error', text: r.error || 'The job failed.' }), refusalHint(r.error), ...notes, facts, raw].filter(Boolean));
        return;
      }
      // In the clip's bar: Request details, Retry (a new job with the same picture and motion) and Download.
      const retry = () => runStep(clipForm, clipOut, () => sendClip(input, m, est));
      clipOut.replaceChildren(el('div', { class: 'output' }, clip({ src: r.url, name: fileName('scene-clip', 'mp4'), left: raw, retry })),
        ...notes, facts);
    });
  }

  $('.tool-step', root)?.scrollIntoView?.({ block: 'nearest' });
}
