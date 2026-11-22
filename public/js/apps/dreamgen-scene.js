/* LLM PlayGround: Tool: Draw the DreamGen Scene. */
import { read, send } from '../adapter.js';
import { store } from '../core/state.js';
import { ep } from '../core/providers.js';
import { curlFor } from '../core/api.js';
import { MAX_EDIT_IMAGES, num, parseJsonLoose, str, usageSummary } from '../core/helpers.js';
import { copyButton } from '../ui/copy-button.js';
import { dreamGenJsonToMarkdown, EXPORT_GUIDE, readDreamGenMarkdown, tokensFor, trimSessionTo } from '../ui/dreamgen-export.js';
import { $$, el } from '../ui/dom.js';
import { keepDrafts } from '../ui/drafts.js';
import { setupModelOptions } from '../ui/model-options.js';
import { chosenModel, setupPicker } from '../ui/model-picker.js';
import { refPortraits } from '../ui/ref-portraits.js';
import { rememberModel } from '../ui/remember.js';
import { answerFacts, renderImages, renderResult } from '../ui/result.js';
import { rememberFold } from '../ui/fold.js';
import { asJpeg } from '../ui/frame-image.js';
import { imageToFile, setScenePicture } from '../ui/scene-handoff.js';
import { sceneStylePicker } from '../ui/scene-styles.js';
import { runStep } from '../ui/run-step.js';
import { SCENE_MARK, scenePicker } from '../ui/scene-picker.js';
import { seriesView } from '../ui/scene-series.js';
import { aboutBox, panelSection, toolLayout } from '../ui/tool-layout.js';

export const SCENE_SYSTEM_PROMPT = `You read an exported DreamGen role-play game and write one prompt for an image model: a single still picture of the final moment of the last scene.

${EXPORT_GUIDE}

## The picture
- Draw the last scene's final moment: where everyone is and what they are doing after the last turn. People who left during the scene are gone and people who arrived are there. Someone reached by phone, letter, message or magic from a distance is not in the room.
- If the last turn is the player's and nobody has answered it, show that action as it begins.
- If the user message asks for the first moment of the last scene instead, draw that: everyone where they are as the scene opens, about to start what the scene goes on to show.

## Reply
Reply with JSON only, in this shape:
{"scene": "one line: place, time of day and what is happening", "characters": [{"name": "the character's name exactly as in the Session", "description": "how they look right now: apparent age, build, face, hair, clothing and its state, pose and action"}], "things": [{"name": "a named ship, vehicle, creature, object or place in the picture, exactly as the story or its card names it", "description": "how it looks"}], "prompt": "the image prompt"}

List every character visible in the picture, the player's character included when in frame. Under "things", list every named ship, vehicle, creature, object or place that is visible (a card under "## Locations" or "## Objects", or one the Session names): the user's pictures of them are sent to the image model as references too. The user may attach a reference portrait for some of them, and the image model will be told which portrait shows which name, so use each name exactly as the Session does.

## The image prompt
- Name each visible character and describe them where they first appear, for example "Mara Ellison, a wiry woman in her forties with cropped grey hair and a patched oilskin coat, leans over the chart table". The description must work on its own when no portrait is attached, and must not fight a portrait when one is.
- Appearance comes from the cards, updated by the Session: what they wear now, rain, mud, wounds, costumes, what they carry. Where the Session and a card disagree, the Session wins. Fill gaps plainly and in keeping with the world; contradict neither.
- Say where each character is and what they are doing, then the setting, light and time of day, weather, mood and camera framing. Show the player's character in the frame, in the third person, unless the user's note asks for their point of view.
- Real places and landmarks: describe what they look like (shape, size, material, what surrounds them) instead of relying on the name, because image models rarely know local places and draw a generic stand-in. Say what is not there when a guess is likely to be wrong, for example "a low pair of stone arches in an old town wall, not a bridge". Keep to what the story says can and cannot be seen from there.
- Someone who has just left or vanished: make the absence visible and specific, such as the empty place where they were, a dent in a cushion, a cup still steaming, the other characters' eyes on that spot. Never draw the absent person.
- Name ships, vehicles, creatures, objects and places as the story does ("a Cylon Basestar", "an ornithopter"), never a generic word such as "ship", and describe each in full where it first appears: shape, size, colour, material, parts. Take the look from its card or the Session; the image model may not know the name.
- Visual details only: no dialogue, sounds, smells, thoughts, backstory or game mechanics. Keep the period, technology and clothing of the story's world.
- At most 180 words.`;

// Added to the image prompt when "Will animate" is ticked: the picture becomes a clip's first frame
// in Animate the DreamGen Scene, and a video model cannot keep a face that is turned away.
export const ANIMATE_NOTE = "This picture will be the first frame of a video clip, so the faces matter most: show every character's face clearly to the camera, facing the viewer or in three-quarter view. No one is seen from behind, turned away, in profile with the face hidden, or with the face covered, in deep shadow or cut off by the frame. Keep each face large and sharp enough to recognise.";

export function renderDreamGenScene(root) {
  const st = { session: null };

  // 1. Session file
  const fileInput = el('input', { type: 'file', accept: '.json,.md,.markdown,.txt,application/json,text/markdown,text/plain' });
  const summary = el('div', { class: 'muted small', text: 'No session loaded.' });

  // 2. Prompt from a chat model. The whole export is the user message; it can be edited first.
  const exportBox = el('textarea', { name: 'export', rows: 14, class: 'mono scene-export', spellcheck: 'false', placeholder: 'Load a session export, or paste one here.' });
  const exportCount = el('span', { class: 'muted small' });
  const undo = []; // earlier versions of the box, newest last
  const undoBtn = el('button', { type: 'button', class: 'secondary', text: 'Undo', disabled: '', onclick: () => { if (undo.length) setExport(undo.pop(), { keepUndo: true }); } });
  const trimNote = el('div', { class: 'muted small' });
  // The chat model and its options, in the settings panel; shared with the other tools.
  const chatForm = el('form', { class: 'tool-form', 'data-kind': 'chat', onsubmit: (e) => e.preventDefault() },
    el('div', { class: 'model-picker', 'data-category': 'chat', 'data-curated': 'on' }),
    el('label', {}, 'Max tokens', el('input', { name: 'max_tokens', type: 'number', min: 1, placeholder: 'default' })),
    rememberFold(el('details', {}, el('summary', { text: 'System prompt' }),
      el('textarea', { name: 'system', rows: 12 }, SCENE_SYSTEM_PROMPT),
      el('button', { type: 'button', class: 'secondary small-btn', text: 'Reset to default', onclick: () => { chatForm.elements.system.value = SCENE_SYSTEM_PROMPT; } })), 'system_prompt'));
  // For a picture that will be animated: it shows the first moment of the last (or picked) scene,
  // so the clip can play the scene out, and asks for every face turned to the camera, since a video
  // model can only keep a face it can see in the first frame. Remembered in this browser.
  const willAnimate = el('input', { type: 'checkbox' });
  willAnimate.checked = store.get('dgscene_animate') === '1';
  willAnimate.addEventListener('change', () => store.set('dgscene_animate', willAnimate.checked ? '1' : '0'));
  const promptForm = el('form', { class: 'tool-form' },
    el('label', {}, el('span', {}, 'Session to send ', exportCount), exportBox),
    el('div', { class: 'notice small' },
      'The whole export is sent, so a long game costs many tokens. To save tokens, edit it down here before sending: ',
      'Trim session keeps only the end of the Session. Above it, you can delete what the picture does not need, such as Examples, Openings and game rules.'),
    el('div', { class: 'row' },
      el('label', { class: 'inline' }, 'Keep the last',
        el('select', { name: 'trim_tokens' }, ...[5, 10, 15, 20, 30].map((k) => el('option', { value: k * 1000, text: `${k}k`, selected: k === 15 || undefined }))),
        'tokens of the Session'),
      el('button', { type: 'button', class: 'secondary', text: 'Trim session', onclick: () => trimSession() }),
      undoBtn,
      el('button', { type: 'button', class: 'secondary', text: 'Restore the full export', onclick: () => { if (st.session) setExport(st.session.text); } })),
    trimNote,
    el('label', { class: 'inline', title: 'The prompt describes the first moment of the scene instead of its last, and asks for every face turned to the camera, so Animate the DreamGen Scene can play the scene out from this picture.' },
      willAnimate, 'Will animate: draw the scene’s first moment, every face to the camera'),
    el('label', {}, 'Note for this picture (optional)', el('input', { name: 'focus', placeholder: 'e.g. focus on the moment she opens the letter; wide shot' })),
    el('button', { type: 'submit', class: 'primary', text: 'Write image prompt' }));
  const promptOut = el('div', { class: 'result' });
  const countExport = () => {
    const n = exportBox.value.length;
    exportCount.textContent = n ? `(${n.toLocaleString()} characters, about ${tokensFor(exportBox.value).toLocaleString()} tokens)` : '';
    undoBtn.disabled = !undo.length;
  };
  // Replacing the text (trim, restore) can be undone; typing in the box uses the browser's own undo.
  function setExport(text, { keepUndo = false } = {}) {
    if (!keepUndo && exportBox.value && exportBox.value !== text) undo.push(exportBox.value);
    exportBox.value = text;
    trimNote.textContent = '';
    countExport();
    picker.sync(text); // a restore, trim or undo that drops the scene's marker un-picks it
  }
  function trimSession() {
    const { text, cut, error } = trimSessionTo(exportBox.value, Number(promptForm.elements.trim_tokens.value));
    if (error) { trimNote.textContent = error; return; }
    if (!cut) { trimNote.textContent = 'The Session is already within that size; nothing was cut.'; return; }
    setExport(text);
    trimNote.textContent = `Cut ${cut.toLocaleString()} paragraphs from the start of the Session. Check where it now begins; Undo puts them back.`;
  }
  exportBox.addEventListener('input', () => { countExport(); picker.sync(exportBox.value); pastedChanged(); });
  // An export pasted into the box (no file loaded) is what the scenes are found in. Checked after a
  // pause in typing, and at start-up for a box restored after a reload.
  let pasteTimer;
  const pastedChanged = () => {
    if (st.session || exportBox.value.includes(SCENE_MARK)) return;
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(() => { st.pasted = exportBox.value; picker.reset(); }, 600);
  };
  const sourceText = () => st.session?.text || st.pasted || '';
  // Pick the scene: a suggested split of the Session; the pick becomes the text above (cut after the
  // scene's end, marked where it starts). "Whole session" puts the export back as loaded.
  const picker = scenePicker({
    chatForm, getText: sourceText, budget: () => Number(promptForm.elements.trim_tokens.value),
    onPick: (text) => { if (sourceText()) setExport(text ?? sourceText()); },
    onMarks: (n) => seriesMarks(n),
  });

  // 3. Prompt, characters and reference portraits
  const sceneLine = el('div', { class: 'muted small' });
  const promptBox = el('textarea', { name: 'prompt', rows: 7, placeholder: 'Write the prompt with step 2, or type your own.' });
  const charList = el('div', { class: 'scene-chars' });
  const addNames = el('input', { type: 'checkbox', checked: '' });
  const portraits = refPortraits({ extra: el('label', { class: 'inline small' }, addNames, 'Add the portrait names to the prompt') });
  // The picture style is added to the prompt when it is drawn or copied, and remembered (shared
  // with Animate the DreamGen Scene, so the clip keeps the picture's style).
  const { select: styleSelect, custom: styleCustom, sync: syncStyle, withStyle } = sceneStylePicker();
  // The prompt as written, with its style; the reference-name lines are only for step 4, where the portraits go too.
  const copyRow = copyButton({
    label: 'Copy prompt', getText: () => (promptBox.value.trim() ? withStyle(promptBox.value.trim()) : ''),
    hint: 'Or copy it to use somewhere else, such as the DreamGen image generator, instead of step 4.',
    empty: 'There is no prompt to copy yet.', done: 'Copied. Paste it into the DreamGen image generator, or wherever you like.',
  });

  // 4. Image. The image model and its options are in the settings panel; shared with the other tools.
  const imageSet = el('form', { class: 'tool-form', 'data-kind': 'image', onsubmit: (e) => e.preventDefault() },
    el('div', { class: 'model-picker', 'data-category': 'image', 'data-curated': 'on' }),
    el('div', { class: 'grid3' },
      el('label', {}, 'Size', el('select', { name: 'size' }, el('option', { value: '', text: 'default' }),
        ...['auto', '1024x1024', '1536x1024', '1024x1536'].map((v) => el('option', { text: v })))),
      el('label', {}, 'Aspect ratio', el('select', { name: 'aspect_ratio' }, el('option', { value: '', text: 'default' }),
        ...['16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16', '21:9'].map((v) => el('option', { text: v })))),
      el('label', {}, 'Resolution', el('select', { name: 'resolution' }, el('option', { value: '', text: 'default' }),
        ...['1K', '2K', '4K'].map((v) => el('option', { text: v })))),
      el('label', {}, 'Quality', el('select', { name: 'quality' }, el('option', { value: '', text: 'default' }),
        ...['auto', 'low', 'medium', 'high'].map((v) => el('option', { text: v }))))));
  const imageForm = el('form', { class: 'tool-form' },
    el('button', { type: 'submit', class: 'primary', text: 'Draw the scene' }));
  const imageOut = el('div', { class: 'result' });

  // A series: the scenes ticked in the scene picker (step 1), drawn one after another, each with one
  // to three pictures (moments in it). Each picture's references are the characters and named things
  // in that moment, and the previous picture if wanted, so the series stays consistent.
  const seriesCount = el('span', { class: 'muted small' });
  const seriesForm = el('form', { class: 'tool-form series-form' },
    el('h4', { text: 'Series' }),
    el('p', { class: 'muted small', text: 'Draws every scene ticked under Pick the scene, in story order, with the image model and options above. Each picture is one request to the chat model and one to the image model.' }),
    el('div', { class: 'grid3' },
      el('label', {}, 'Pictures per scene', el('select', { name: 'per_scene' },
        el('option', { value: '1', text: '1: its last moment' }),
        el('option', { value: '2', text: '2: first and last moment' }),
        el('option', { value: '3', text: '3: first, main action, last' })))),
    el('label', { class: 'inline' }, el('input', { type: 'checkbox', name: 'use_previous', checked: '' }), 'Use the previous picture as a reference, to keep people and places consistent'),
    el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary', text: 'Draw the series' }), seriesCount));
  const seriesOut = el('div', { class: 'result' });
  const series = seriesView();
  const seriesBox = el('div', { class: 'series-box', hidden: '' }, seriesForm, seriesOut, series.node);
  const MOMENTS = {
    first: { label: 'first moment', ask: 'Write the prompt for the first moment of the last scene: everyone where they are as it opens.' },
    main: { label: 'main action', ask: 'Write the prompt for the main moment of the last scene: its most important action, the moment a viewer would remember, as it happens.' },
    last: { label: 'last moment', ask: 'Write the prompt for the final moment of the last scene.' },
  };
  const PLAN = { 1: ['last'], 2: ['first', 'last'], 3: ['first', 'main', 'last'] };
  const SERIES_MAX = 10;
  function seriesMarks(n) {
    seriesBox.hidden = !n && !series.shots().length;
    const per = Number(seriesForm.elements.per_scene.value);
    seriesCount.textContent = n ? `${n} scene${n > 1 ? 's' : ''} ticked: ${n * per} picture${n * per > 1 ? 's' : ''}${n > SERIES_MAX ? ` (at most ${SERIES_MAX} scenes a run)` : ''}` : 'No scenes ticked: tick them under Pick the scene (step 1).';
  }
  seriesForm.elements.per_scene.addEventListener('change', () => seriesMarks(picker.marked().length));

  const main = [
    aboutBox('dreamgen-scene',
      el('ol', {},
        el('li', {}, 'Load a session export from ', el('a', { href: 'https://dreamgen.com/', target: '_blank', rel: 'noopener', text: 'DreamGen' }),
          ' (Markdown or JSON). Nothing leaves the browser until you press a button.'),
        el('li', { text: 'A chat model reads the export, works out where the last scene begins, and writes an image prompt with the characters in it named and described.' }),
        el('li', { text: 'Optionally add a reference portrait for each character, with the name it shows. Pictures embedded in the export are listed, and the ones for the characters in the scene are ticked to be sent; tick any other (a location, say) to send it too.' }),
        el('li', { text: 'Draw it with an image model on the selected endpoint. With references, the names are added to the prompt so the model knows who is who.' })),
      el('p', { class: 'small' }, el('strong', { text: 'Privacy. ' }),
        'Run at ', el('a', { href: 'https://arnoldson.dev/LLM-PlayGround/', target: '_blank', rel: 'noopener', text: 'https://arnoldson.dev/LLM-PlayGround/' }),
        ' or in your own Docker or node server.js, this tool sends nothing to us or to any third party and saves nothing anywhere but your browser. ',
        'GitHub Pages only serves the page files; your export, prompts and pictures stay in this browser. Your own server only forwards your requests and logs no content. ',
        'What reaches a third party is what you send with your own key to the provider you chose, and what that provider and its models do with it is between you and them. ',
        'The browser keeps your settings, your chosen models and, if you tick Remember, your key in its own local storage, and what you type in session storage (this tab only) so a reload does not clear it.'),
      el('p', { class: 'small' }, el('strong', { text: 'Feedback. ' }), 'Send ideas and problems with this tool to Zorander on the DreamGen Discord.')),
    el('section', { class: 'tool-step' }, el('h3', { text: '1. Session export' }), fileInput, summary,
      el('details', { class: 'scene-pick-fold' }, el('summary', { text: 'Pick the scene (optional)' }), picker.node)),
    el('section', { class: 'tool-step' }, el('h3', { text: '2. Write the image prompt' }), promptForm, promptOut),
    el('section', { class: 'tool-step' }, el('h3', { text: '3. Prompt and reference portraits' }),
      sceneLine,
      el('label', {}, 'Image prompt', promptBox),
      copyRow,
      charList,
      portraits.node),
    el('section', { class: 'tool-step' }, el('h3', { text: '4. Draw' }), imageForm, imageOut, seriesBox),
    el('p', { class: 'muted small' }, 'Next: ', el('a', { href: '#tools/dreamgen-video', text: 'Animate the DreamGen Scene' }),
      ' turns the picture into a short clip. It takes the picture and this session straight from here.')];

  // The settings panel: what is chosen once and left alone. The steps hold what changes each run.
  const layout = toolLayout(root, {
    panel: [
      panelSection('Prompt writer', el('p', { class: 'muted small', text: 'The chat model that reads the export and writes the image prompt (step 2).' }), chatForm),
      panelSection('Image model', imageSet),
      panelSection('Picture style',
        el('label', {}, 'Style', styleSelect),
        el('label', { class: 'style-custom', hidden: '' }, 'Your style', styleCustom),
        el('p', { class: 'muted small', text: 'Added to the end of the image prompt ("Style: …"). Shared with Animate the DreamGen Scene.' })),
    ],
    main,
    summary: () => [chosenModel(chatForm), chosenModel(imageSet)].filter(Boolean).join(' · '),
  });

  for (const picker of $$('.model-picker', root)) setupPicker(picker);
  setupModelOptions(imageSet);
  syncStyle();
  keepDrafts(root, 'dgscene', { skip: ['max_tokens', 'trim_tokens', 'style_custom'] });
  // The chosen models and their options are remembered per provider, and shared with the other tools.
  rememberModel(chatForm, 'chat', ['max_tokens']);
  rememberModel(imageSet, 'image', ['size', 'aspect_ratio', 'resolution', 'quality']);
  layout.refresh();
  st.pasted = exportBox.value.includes(SCENE_MARK) ? '' : exportBox.value; // restored after a reload
  picker.reset();
  const trimSelect = promptForm.elements.trim_tokens;
  if ([...trimSelect.options].some((o) => o.value === store.get('dgscene_trim'))) trimSelect.value = store.get('dgscene_trim');
  trimSelect.addEventListener('change', () => { store.set('dgscene_trim', trimSelect.value); picker.refresh(); });

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const isJson = /\.json$/i.test(f.name) || /^\s*[{[]/.test(text);
      st.session = isJson ? dreamGenJsonToMarkdown(JSON.parse(text)) : readDreamGenMarkdown(text, f.name);
      const s = st.session;
      summary.replaceChildren(
        el('div', {}, el('strong', { text: s.title }), ` · ${s.format} · ${s.turns.toLocaleString()} turns`,
          s.persona ? ` · player: ${s.persona}` : '',
          s.images.length ? ` · ${s.images.length} pictures embedded` : ''));
      undo.length = 0;
      setExport(s.text, { keepUndo: true });
      picker.reset();
      // Every embedded picture is listed in step 3, unticked; the ones for the characters the
      // model puts in the scene are ticked when the prompt is written. Nothing is sent by loading.
      portraits.set(s.images.map((i) => ({ name: i.name, file: i.file, kind: i.kind, send: false, fromExport: true, index: i.index, caption: i.name, alias: i.alias })));
    } catch (err) {
      st.session = null;
      picker.reset();
      summary.replaceChildren(el('div', { class: 'output error', text: `Could not read ${f.name}: ${err.message}` }));
    }
  });

  promptForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runStep(promptForm, promptOut, async () => {
      const exported = exportBox.value.trim();
      if (!exported) throw new Error('Load a session export first (step 1), or paste one.');
      const model = chosenModel(chatForm);
      if (!model) throw new Error('Pick or type a chat model first (Settings).');
      const focus = promptForm.elements.focus.value.trim();
      const text = `${exported}\n\n---\n\n${willAnimate.checked ? 'Write the prompt for the first moment of the last scene: this picture is the first frame of a video clip that plays the scene out.' : 'Write the prompt for the final moment of the last scene.'}${focus ? `\n\nNote from the user about the picture: ${focus}` : ''}`;
      const system = chatForm.elements.system.value.trim();
      const t0 = Date.now();
      const { resp, request: body } = await send('chat', {
        model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: text }],
        max_tokens: num(chatForm, 'max_tokens'),
      }, { signal: promptForm._abort?.signal });
      const seconds = Math.round((Date.now() - t0) / 1000);
      // The prompt and characters go into step 3; this box holds the request details and the stats.
      let note;
      if (resp.ok && resp.data?.choices) {
        const reply = read('chat', resp).text || '';
        const parsed = parseJsonLoose(reply);
        applyScene(parsed?.prompt ? parsed : { prompt: reply.trim(), characters: [] });
        if (!parsed?.prompt) note = el('div', { class: 'muted small', text: 'The reply was not the JSON asked for; it is in step 3 as it came.' });
      }
      const shortBody = { ...body, messages: body.messages.map((m) => ({ ...m, content: m.content.length > 1200 ? `${m.content.slice(0, 600)}\n… ${(m.content.length - 1000).toLocaleString()} characters …\n${m.content.slice(-400)}` : m.content })) };
      const { path, base } = ep('chat');
      renderResult(promptOut, { resp, request: shortBody, curl: curlFor(path, { base, json: shortBody }), quiet: true });
      if (note) promptOut.append(note);
      const facts = resp.ok ? answerFacts(resp.data?.usage, seconds) : null;
      if (facts) promptOut.append(facts);
    });
  });

  // The characters the model named, each with a button to attach a portrait for them.
  function applyScene({ scene, prompt, characters = [], things = [] }) {
    sceneLine.textContent = scene ? `Scene: ${scene}` : '';
    promptBox.value = prompt || '';
    const chars = Array.isArray(characters) ? characters.filter((c) => c?.name) : [];
    charList.replaceChildren(...(chars.length ? [el('strong', { class: 'small', text: 'Characters in the scene' })] : []),
      ...chars.map((c) => {
        const pick = el('input', { type: 'file', accept: 'image/*', hidden: '' });
        pick.addEventListener('change', () => {
          if (pick.files[0]) portraits.add(c.name, pick.files[0]);
          pick.value = '';
        });
        return el('div', { class: 'scene-char' },
          el('div', {}, el('strong', { text: c.name }), c.description ? el('div', { class: 'muted small', text: c.description }) : null),
          el('button', { type: 'button', class: 'secondary', text: 'Add portrait', onclick: () => pick.click() }), pick);
      }));
    // Tick the export's first picture of each character and named thing in the scene (named as the
    // model named them); the rest of the export's pictures go back to unticked, with their own captions.
    for (const r of portraits.refs.filter((x) => x.fromExport)) { r.send = false; r.name = r.caption; }
    for (const { ref, name } of matchRefs({ characters, things })) { ref.send = true; ref.name = name; }
    portraits.refresh();
  }

  // The reference pictures for a scene's characters and named things: the export's first picture of
  // each (a character's among people's pictures, a thing's among locations and objects), and any
  // picture the user added under the same name. Returns [{ ref, name }], characters first.
  function matchRefs({ characters = [], things = [] }) {
    const norm = (n) => String(n || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').trim();
    const names = (r) => [r.caption, r.alias, r.name].map(norm).filter(Boolean);
    const firsts = portraits.refs.filter((r) => r.fromExport && r.index === 0);
    // The user's own pictures count only while ticked to send; the export's are matched by name.
    const own = portraits.refs.filter((r) => !r.fromExport && r.send);
    const out = [];
    const take = (list, wanted, ofKind) => {
      for (const w of (Array.isArray(list) ? list : []).filter((x) => x?.name)) {
        const n = norm(w.name);
        const pool = [...own, ...firsts.filter(ofKind)];
        const ref = pool.find((r) => names(r).includes(n))
          || pool.find((r) => names(r).some((x) => x.split(' ')[0] === n.split(' ')[0]));
        if (ref && !out.some((o) => o.ref === ref)) out.push({ ref, name: w.name });
      }
    };
    take(characters, 'character', (r) => r.kind !== 'location' && r.kind !== 'item');
    take(things, 'thing', (r) => r.kind === 'location' || r.kind === 'item');
    return out;
  }

  // With references, "Reference image 1 shows …" lines tell the model who is who.
  function finalPrompt() {
    if (!promptBox.value.trim()) return '';
    const base = withStyle(promptBox.value.trim()) + (willAnimate.checked ? `\n\n${ANIMATE_NOTE}` : '');
    const named = portraits.active().map((r, i) => (r.name.trim() ? `reference image ${i + 1} is ${r.name.trim()}` : '')).filter(Boolean);
    if (!addNames.checked || !named.length) return base;
    return `${base}\n\nUse the reference images for the characters' faces and looks: ${named.join('; ')}.`;
  }

  imageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runStep(imageForm, imageOut, async () => {
      const prompt = finalPrompt();
      if (!prompt) throw new Error('Write or generate an image prompt first (steps 2 and 3).');
      const model = chosenModel(imageSet);
      if (!model) throw new Error('Pick or type an image model first (Settings).');
      const fields = {
        model, prompt,
        size: str(imageSet, 'size'), aspect_ratio: str(imageSet, 'aspect_ratio'),
        resolution: str(imageSet, 'resolution'), quality: str(imageSet, 'quality'),
      };
      // With portraits it is an image edit; the provider's template decides how they travel.
      portraits.check();
      const sent = portraits.active();
      const kind = sent.length ? 'imageEdit' : 'image';
      // References go as JPEG, the one format every tested image model takes (DreamGen saves AVIF,
      // and JSON exports embed WebP).
      const input = kind === 'imageEdit' ? { ...fields, images: await Promise.all(sent.map((r) => asJpeg(r.file))) } : fields;
      await draw(kind, input, { prompt: promptBox.value.trim(), exportText: exportBox.value, title: st.session?.title, pictures: st.session?.images, posed: willAnimate.checked, opening: willAnimate.checked, fullText: st.session?.text });
    });
  });

  // Sends one picture request and shows it. Retry (in the picture's bar) sends this same request
  // again, as it was, whatever has been edited in the form since.
  seriesForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runStep(seriesForm, seriesOut, async () => {
      const scenes = picker.marked();
      if (!scenes.length) throw new Error('Tick some scenes under Pick the scene (step 1) first.');
      if (scenes.length > SERIES_MAX) throw new Error(`${scenes.length} scenes are ticked; at most ${SERIES_MAX} are drawn in one run. Untick some.`);
      const chatModel = chosenModel(chatForm);
      if (!chatModel) throw new Error('Pick or type a chat model first (Settings).');
      const imageModel = chosenModel(imageSet);
      if (!imageModel) throw new Error('Pick or type an image model first (Settings).');
      const plan = PLAN[seriesForm.elements.per_scene.value] || PLAN[1];
      const usePrevious = seriesForm.elements.use_previous.checked;
      const system = chatForm.elements.system.value.trim();
      const focus = promptForm.elements.focus.value.trim();
      const signal = seriesForm._abort?.signal;
      const shots = scenes.flatMap((sc) => plan.map((m) => ({ title: sc.title, moment: MOMENTS[m].label, range: { start: sc.start, end: sc.end }, sceneText: sc.text, ask: MOMENTS[m].ask })));
      series.start(shots);
      seriesBox.hidden = false;
      // One shot: its prompt, then its picture. `previous` is the last good picture before it. Every
      // card gets a Retry, also when the prompt or the picture failed: it runs the whole shot again
      // (a new prompt and picture), with the picture before it as it is then.
      const previousFor = (i) => { for (let n = i - 1; n >= 0; n -= 1) { const f = series.shots()[n]?.file; if (f) return f; } return null; };
      const runShot = async (i, shot, previous, sig) => {
        series.update(i, { busy: true, status: 'Writing the prompt…', error: '' });
        const text = `${shot.sceneText}\n\n---\n\n${shot.ask}${willAnimate.checked ? ' This picture may become the first frame of a video clip.' : ''}${focus ? `\n\nNote from the user about the pictures: ${focus}` : ''}`;
        const { resp } = await send('chat', {
          model: chatModel, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: text }],
          max_tokens: num(chatForm, 'max_tokens'),
        }, { signal: sig });
        if (!resp.ok) throw new Error(`The prompt writer failed: ${resp.status} ${JSON.stringify(resp.data?.error || resp.data).slice(0, 200)}`);
        const reply = read('chat', resp).text || '';
        const parsed = parseJsonLoose(reply) || { prompt: reply.trim() };
        if (!parsed.prompt) throw new Error('The prompt writer gave no prompt.');
        // References: this moment's characters and named things, then the previous picture; at most
        // the image model's limit, the previous picture left out first.
        const refs = matchRefs(parsed).map(({ ref, name }) => ({ file: ref.file, name }));
        if (usePrevious && previous) refs.push({ file: previous, name: 'the previous picture in this series, for looks only: keep the people, their clothes and the places consistent with it, but take the framing, camera angle and poses from this prompt, as this is a later moment' });
        const sent = refs.slice(0, MAX_EDIT_IMAGES);
        let prompt = withStyle(parsed.prompt.trim()) + (willAnimate.checked ? `\n\n${ANIMATE_NOTE}` : '');
        if (sent.length) prompt += `\n\nUse the reference images for the looks of the people and things in the picture: ${sent.map((r, n) => `reference image ${n + 1} is ${r.name}`).join('; ')}.`;
        const fields = {
          model: imageModel, prompt,
          size: str(imageSet, 'size'), aspect_ratio: str(imageSet, 'aspect_ratio'),
          resolution: str(imageSet, 'resolution'), quality: str(imageSet, 'quality'),
        };
        const kind = sent.length ? 'imageEdit' : 'image';
        const input = kind === 'imageEdit' ? { ...fields, images: await Promise.all(sent.map((r) => asJpeg(r.file))) } : fields;
        series.update(i, { busy: true, status: 'Drawing…', prompt: parsed.prompt });
        const { resp: img, request } = await send(kind, input, { signal: sig });
        const details = JSON.stringify({ references: sent.map((r) => r.name), request, response: img.ok ? undefined : img.data }, null, 2);
        const first = img.ok ? read(kind, img).images?.[0] : undefined;
        const file = first && await imageToFile(first, 'scene');
        if (!file) throw Object.assign(new Error(img.ok ? 'No picture came back that the page can read.' : `The image model failed: ${img.status} ${JSON.stringify(img.data?.error || img.data).slice(0, 200)}`), { details });
        series.update(i, { busy: false, file, details, error: '' });
        return file;
      };
      const retryFor = (i, shot) => () => runStep(seriesForm, seriesOut, async () => {
        try { await runShot(i, shot, previousFor(i), seriesForm._abort?.signal); } catch (err) {
          series.update(i, { busy: false, error: err?.name === 'AbortError' ? 'Cancelled.' : err.message, details: err.details });
        }
      });
      shots.forEach((shot, i) => series.update(i, { retry: retryFor(i, shot) }));
      let previous = null;
      let done = 0;
      for (const [i, shot] of shots.entries()) {
        if (signal?.aborted) break;
        try {
          previous = await runShot(i, shot, previous, signal);
          done += 1;
        } catch (err) {
          if (err?.name === 'AbortError') { series.update(i, { busy: false, error: 'Cancelled.' }); break; }
          // A failed picture doesn't stop the series; the next one uses the last good picture.
          series.update(i, { busy: false, error: err.message, details: err.details });
        }
      }
      seriesOut.replaceChildren(el('div', { class: 'muted small', text: `${done} of ${shots.length} pictures drawn. Download all saves them as a .zip with the prompts.` }));
    });
  });

  async function draw(kind, input, handoff) {
    const { resp, request, curl } = await send(kind, input, { signal: imageForm._abort?.signal });
    const retry = () => runStep(imageForm, imageOut, () => draw(kind, input, handoff));
    const { rendered, shown } = renderImages(resp, 'png', kind, { name: 'scene', retry });
    renderResult(imageOut, { resp: shown, request, curl, rendered, quiet: true });
    // Hand the first picture to Animate the DreamGen Scene (in memory, this page only).
    const img = resp.ok ? read(kind, resp).images?.[0] : undefined;
    const file = img && await imageToFile(img, 'scene');
    // The tokens and cost on the left; the Animate button on the right, with its line under it.
    const usage = resp.ok ? usageSummary(resp.data?.usage) : '';
    if (file) setScenePicture({ file, ...handoff });
    if (file || usage) {
      rendered?.append(el('div', { class: 'handoff-row' },
        el('span', { class: 'muted small', text: usage }),
        file ? el('div', { class: 'handoff-action' },
          el('a', { class: 'button-link', href: '#tools/dreamgen-video', text: 'Animate this picture →' }),
          el('span', { class: 'muted small', text: 'Opens Animate the DreamGen Scene with this picture and this session.' })) : null));
    }
    if (!file && img) {
      rendered?.append(el('div', { class: 'muted small', text: 'This picture can\'t be passed on directly (the provider\'s image link can\'t be read from the page). Save it and upload it in Animate the DreamGen Scene.' }));
    }
  }
}
