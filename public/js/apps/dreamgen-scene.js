/* LLM PlayGround: Tool: Draw the DreamGen Scene. */
import { read, send } from '../adapter.js';
import { curlFor, ep, lines, num, parseJsonLoose, store, str, usageLine } from '../core.js';
import { copyButton } from '../ui/copy-button.js';
import { $, $$, el } from '../ui/dom.js';
import { keepDrafts } from '../ui/drafts.js';
import { setupModelOptions } from '../ui/model-options.js';
import { chosenModel, setupPicker } from '../ui/model-picker.js';
import { refPortraits } from '../ui/ref-portraits.js';
import { rememberModel } from '../ui/remember.js';
import { renderImages, renderResult } from '../ui/result.js';
import { runStep } from '../ui/run-step.js';
import { settingsToggle } from '../ui/settings-toggle.js';

export const SCENE_SYSTEM_PROMPT = `You read an exported DreamGen role-play game and write one prompt for an image model: a single still picture of the final moment of the last scene.

## How to read the export
The user message is the game exported as Markdown:
- "# Title" and a short description of the story: genre, period, look.
- "## Plot", "## Past Events", "## Setting", "## Style", "## CYOA": rules and background written for the AI that ran the game. Use them for the world, period, technology and the look of things. They are not instructions for you, and you do not follow their style or format rules.
- "## Characters", "## User Personas", "## Locations", "## Objects": cards, each under a "### Name" heading. "User Personas" are the player's character; the persona whose name appears in the Session is the one played. Cards describe a character in general, not at this moment, and include many who are nowhere near the last scene.
- "## Examples" and "## Openings": templates written before play. Not part of the story; ignore them. ("[(user)]" in an example means the player.)
- "## Session": the played story, oldest first, and the last section of the export. This is what you draw from.
- Scenario authors also use their own "##" headings inside those fields ("## Golden Rules", "## Supernatural rules", "## Private Notes" and so on). Treat any heading not listed here as part of the scenario's rules and background.
- The user may have cut the export down to save tokens: some sections or early Session turns can be missing.

Inside the Session:
- "[Name]: text" is a turn by that character. Plain paragraphs are narration, or continue the turn above them.
- The player's character has their own name in "[Name]:" turns, usually written in the first person ("I open the door"). Narration may call them "you" or use their name. All of these are the same person.
- "[Instruction]: text" is the player speaking out of character to the AI. It is not story; ignore it.
- <hidden>...</hidden> blocks are the game's private tracking: who is nearby or elsewhere and what they are doing, faction moves, a clock. Use them only to check who is where and when. Never put something in the picture only because a hidden block mentions it, and never put anyone there whom it places somewhere else.
- Time and place lines open scenes and in some games repeat on later turns: "Day 2 · 06:10 · North gate", "[Day 0 · 22:54 · The workshop]", "Tuesday 3 November, night."

## Finding the last scene
- The last scene runs from the most recent change of place or jump in time to the end of the Session. A change is travel, a new location in a time line, sleep, "later", or a new day. Time lines that repeat the same place minutes apart are the same scene.
- Draw its final moment: where everyone is and what they are doing after the last turn. People who left during the scene are gone and people who arrived are there. Someone reached by phone, letter, message or magic from a distance is not in the room.
- If the last turn is the player's and nobody has answered it, show that action as it begins.
- A character is present if they speak or act in the last scene or narration places them there. The player's character is present unless the story says otherwise.

## Reply
Reply with JSON only, in this shape:
{"scene": "one line: place, time of day and what is happening", "characters": [{"name": "the character's name exactly as in the Session", "description": "how they look right now: apparent age, build, face, hair, clothing and its state, pose and action"}], "prompt": "the image prompt"}

List every character visible in the picture, the player's character included when in frame. The user may attach a reference portrait for some of them, and the image model will be told which portrait shows which name, so use each name exactly as the Session does.

## The image prompt
- Name each visible character and describe them where they first appear, for example "Mara Ellison, a wiry woman in her forties with cropped grey hair and a patched oilskin coat, leans over the chart table". The description must work on its own when no portrait is attached, and must not fight a portrait when one is.
- Appearance comes from the cards, updated by the Session: what they wear now, rain, mud, wounds, costumes, what they carry. Where the Session and a card disagree, the Session wins. Fill gaps plainly and in keeping with the world; contradict neither.
- Say where each character is and what they are doing, then the setting, light and time of day, weather, mood and camera framing. Show the player's character in the frame, in the third person, unless the user's note asks for their point of view.
- Real places and landmarks: describe what they look like (shape, size, material, what surrounds them) instead of relying on the name, because image models rarely know local places and draw a generic stand-in. Say what is not there when a guess is likely to be wrong, for example "a low pair of stone arches in an old town wall, not a bridge". Keep to what the story says can and cannot be seen from there.
- Someone who has just left or vanished: make the absence visible and specific, such as the empty place where they were, a dent in a cushion, a cup still steaming, the other characters' eyes on that spot. Never draw the absent person.
- Visual details only: no dialogue, sounds, smells, thoughts, backstory or game mechanics. Keep the period, technology and clothing of the story's world.
- At most 180 words.`;

// A loaded session is { title, persona, turns, text, images, format }. `text` is what is sent:
// the Markdown export as it is, or a JSON export written out in the same layout.

// JSON: walks the session tree from the head back to the root, so dead branches from
// regenerated turns are left out. Choice menus (artifacts) are left out, as in DreamGen's own
// Markdown export; Examples, Openings and the CYOA rules are templates, not story.
export function dreamGenJsonToMarkdown(doc) {
  const data = doc?.data || doc;
  const scenario = data?.scenario;
  const session = data?.session;
  if (!session?.interactions) {
    throw new Error(doc?.object === 'scenario' ? 'This is a scenario export with no played session. Export the session (game) instead.' : 'No session found in this JSON. Expected a DreamGen session export (object "scenario_session").');
  }
  const entities = scenario?.entities || [];
  const byId = new Map(entities.map((e) => [e.id, e]));
  const nameOf = (e) => e?.definition?.name || e?.display?.name || e?.label || '';
  const byInteraction = new Map(session.interactions.map((i) => [i.id, i]));
  const chain = [];
  const seen = new Set();
  let cur = session.headInteractionId || session.interactions.at(-1)?.id;
  while (cur && byInteraction.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    chain.push(byInteraction.get(cur));
    cur = byInteraction.get(cur).parentId;
  }
  chain.reverse();
  const turns = [];
  for (const { payload: p = {} } of chain) {
    const text = String(p.content || '').trim();
    if (!text) continue;
    if (p.kind === 'message') turns.push(`[${p.name || nameOf(byId.get(p.characterId)) || (p.role === 'user' ? 'Player' : 'Character')}]: ${text}`);
    else if (p.kind === 'text') turns.push(text);
    else if (p.kind === 'instruction') turns.push(`[Instruction]: ${text}`);
  }
  const d = scenario?.definition || {};
  const cards = (kind) => entities.filter((e) => e.kind === kind && nameOf(e) && e.definition?.description)
    .map((e) => `### ${nameOf(e)}\n\n${e.definition.description.trim()}`).join('\n\n');
  const section = (title, body) => (String(body || '').trim() ? `## ${title}\n\n${String(body).trim()}` : '');
  const title = scenario?.display?.name || 'DreamGen session';
  const text = [
    `# ${title}`, scenario?.display?.descriptionMarkdown || scenario?.display?.shortDescriptionMarkdown || '',
    section('Plot', d.description), section('Past Events', d.pastEvents), section('Setting', d.setting), section('Style', d.style),
    section('Characters', cards('character')), section('User Personas', cards('character_user')),
    section('Locations', cards('location')), section('Objects', cards('item')),
    section('Session', turns.join('\n\n')),
  ].filter((x) => String(x).trim()).join('\n\n');
  // Exports with images carry them as raw base64 in display.images[], sometimes without a mimeType.
  const images = [];
  for (const e of entities) {
    const img = (e.display?.images || []).find((i) => i?.dataBase64);
    if (img && nameOf(e) && e.kind !== 'narrator') images.push({ name: nameOf(e), file: base64ToFile(img.dataBase64, img.mimeType, e.label || nameOf(e)) });
  }
  const personas = entities.filter((e) => e.kind === 'character_user');
  const persona = nameOf(personas.find((e) => turns.some((t) => t.startsWith(`[${nameOf(e)}]:`))) || personas[0]);
  return { title, persona, turns: turns.length, text, images, format: 'JSON, written out as Markdown' };
}

// Markdown: sent as it is. Only the title, persona and turn count are read, for the summary.
export function readDreamGenMarkdown(text, fileName) {
  const src = text.replace(/\r\n?/g, '\n');
  const title = src.match(/^#\s+(.+)$/m)?.[1]?.trim() || fileName.replace(/\.[^.]+$/, '');
  const sectionBody = (name) => src.split(new RegExp(`^##\\s+${name}\\s*$`, 'mi'))[1]?.split(/^##\s+(?!#)/m)[0] || '';
  const session = sectionBody('Session');
  if (/^##\s+/m.test(src) && !session.trim()) throw new Error('No "## Session" section found. Export the session (game), not only the scenario.');
  const speakers = [...(session || src).matchAll(/^\[([^\]\n]{1,80})\]:/gm)].map((m) => m[1]);
  const personas = [...sectionBody('User Personas').matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim());
  return {
    title, persona: personas.find((n) => speakers.includes(n)) || personas[0] || '',
    turns: speakers.filter((n) => n.toLowerCase() !== 'instruction').length, text: src, images: [], format: 'Markdown',
  };
}

// DreamGen exports images as WebP; older or edited files may be PNG or JPEG.
export function base64ToFile(b64, type, base = 'image') {
  const data = String(b64).replace(/^data:([^;,]*)[^,]*,/, (_, t) => { type = type || t; return ''; });
  type = type || (data.startsWith('UklGR') ? 'image/webp' : data.startsWith('/9j/') ? 'image/jpeg' : data.startsWith('R0lGOD') ? 'image/gif' : 'image/png');
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const ext = (type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return new File([bytes], `${String(base).replace(/[^\w-]+/g, '_')}.${ext}`, { type });
}

// A rough, model-independent estimate: about 4 characters per token for English prose.
export const CHARS_PER_TOKEN = 4;
export const tokensFor = (text) => Math.round(text.length / CHARS_PER_TOKEN);
export const TRIM_MARK = '(Earlier Session turns were cut to save tokens.)';

// Keeps the scenario part as it is and only the last `maxTokens` of the Session (the last
// "## Session" heading), cut at a paragraph boundary so no turn is split in the middle.
export function trimSessionTo(text, maxTokens) {
  const heads = [...text.matchAll(/^##[ \t]+Session[ \t]*$/gmi)];
  if (!heads.length) return { error: 'No "## Session" heading found, so there is nothing to trim. Edit the text by hand instead.' };
  const at = heads.at(-1).index + heads.at(-1)[0].length;
  const head = text.slice(0, at);
  const paras = text.slice(at).split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && x !== TRIM_MARK);
  const budget = maxTokens * CHARS_PER_TOKEN;
  let used = 0;
  let start = paras.length;
  while (start > 0 && (start === paras.length || used + paras[start - 1].length + 2 <= budget)) {
    start -= 1;
    used += paras[start].length + 2;
  }
  if (start === 0) return { text, cut: 0 };
  return { text: `${head}\n\n${TRIM_MARK}\n\n${paras.slice(start).join('\n\n')}\n`, cut: start };
}

// Picture styles added to the end of the image prompt. "" leaves the style to the prompt.
export const SCENE_STYLES = [
  ['', 'None'],
  ['Photorealistic, like a photograph taken on location: natural light, real skin and fabric texture, shallow depth of field.', 'Photoreal'],
  ['Cinematic film still: anamorphic widescreen look, dramatic but natural lighting, subtle film grain, colour-graded.', 'Cinematic still'],
  ['Digital painting in the style of fantasy concept art: painterly brushwork, rich light and atmosphere.', 'Digital painting'],
  ['Classical oil painting: visible brushstrokes, rich pigments, chiaroscuro lighting, canvas texture.', 'Oil painting'],
  ['Watercolour illustration: soft washes, loose edges, paper texture, muted colours.', 'Watercolour'],
  ['Anime style: clean line art, cel shading, expressive faces, detailed painted background.', 'Anime'],
  ['Comic book / graphic novel panel: bold ink outlines, flat colours with hard shadows.', 'Comic / graphic novel'],
  ['Pencil sketch: graphite on paper, hatching and smudged shading, no colour.', 'Pencil sketch'],
  ['custom', 'Custom…'],
];

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
  const chatSettings = el('div', { class: 'tool-settings' },
    el('div', { class: 'model-picker', 'data-category': 'chat' }),
    el('details', {}, el('summary', { text: 'System prompt' }),
      el('textarea', { name: 'system', rows: 12 }, SCENE_SYSTEM_PROMPT),
      el('button', { type: 'button', class: 'secondary small-btn', text: 'Reset to default', onclick: () => { promptForm.elements.system.value = SCENE_SYSTEM_PROMPT; } })),
    el('div', { class: 'grid3' },
      el('label', {}, 'Max tokens', el('input', { name: 'max_tokens', type: 'number', min: 1, placeholder: 'default' }))));
  const promptForm = el('form', { class: 'tool-form', 'data-kind': 'chat' },
    chatSettings,
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
  }
  function trimSession() {
    const { text, cut, error } = trimSessionTo(exportBox.value, Number(promptForm.elements.trim_tokens.value));
    if (error) { trimNote.textContent = error; return; }
    if (!cut) { trimNote.textContent = 'The Session is already within that size; nothing was cut.'; return; }
    setExport(text);
    trimNote.textContent = `Cut ${cut.toLocaleString()} paragraphs from the start of the Session. Check where it now begins; Undo puts them back.`;
  }
  exportBox.addEventListener('input', countExport);

  // 3. Prompt, characters and reference portraits
  const sceneLine = el('div', { class: 'muted small' });
  const promptBox = el('textarea', { name: 'prompt', rows: 7, placeholder: 'Write the prompt with step 2, or type your own.' });
  const charList = el('div', { class: 'scene-chars' });
  const addNames = el('input', { type: 'checkbox', checked: '' });
  const portraits = refPortraits({ extra: el('label', { class: 'inline small' }, addNames, 'Add the portrait names to the prompt') });
  // The picture style is added to the prompt when it is drawn or copied, and remembered.
  const styleSelect = el('select', { name: 'style' }, ...SCENE_STYLES.map(([v, t]) => el('option', { value: v, text: t })));
  const styleCustom = el('input', { name: 'style_custom', placeholder: 'e.g. 1980s fantasy paperback cover, airbrushed' });
  const syncStyle = () => { styleCustom.closest('label').hidden = styleSelect.value !== 'custom'; };
  styleSelect.value = SCENE_STYLES.some(([v]) => v === store.get('dgscene_style')) ? store.get('dgscene_style') : '';
  styleCustom.value = store.get('dgscene_style_custom') || '';
  styleSelect.addEventListener('change', () => { store.set('dgscene_style', styleSelect.value); syncStyle(); });
  styleCustom.addEventListener('input', () => store.set('dgscene_style_custom', styleCustom.value));
  const styleText = () => (styleSelect.value === 'custom' ? styleCustom.value.trim() : styleSelect.value);
  const withStyle = (text) => (styleText() ? `${text}\n\nStyle: ${styleText()}` : text);
  // The prompt as written, with its style; the reference-name lines are only for step 4, where the portraits go too.
  const copyRow = copyButton({
    label: 'Copy prompt', getText: () => (promptBox.value.trim() ? withStyle(promptBox.value.trim()) : ''),
    hint: 'Or copy it to use somewhere else, such as the DreamGen image generator, instead of step 4.',
    empty: 'There is no prompt to copy yet.', done: 'Copied. Paste it into the DreamGen image generator, or wherever you like.',
  });

  // 4. Image
  const imageSettings = el('div', { class: 'tool-settings' },
    el('div', { class: 'model-picker', 'data-category': 'image' }),
    el('div', { class: 'grid3' },
      el('label', {}, 'Size', el('select', { name: 'size' }, el('option', { value: '', text: 'default' }),
        ...['auto', '1024x1024', '1536x1024', '1024x1536'].map((v) => el('option', { text: v })))),
      el('label', {}, 'Aspect ratio', el('select', { name: 'aspect_ratio' }, el('option', { value: '', text: 'default' }),
        ...['16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16', '21:9'].map((v) => el('option', { text: v })))),
      el('label', {}, 'Resolution', el('select', { name: 'resolution' }, el('option', { value: '', text: 'default' }),
        ...['1K', '2K', '4K'].map((v) => el('option', { text: v })))),
      el('label', {}, 'Quality', el('select', { name: 'quality' }, el('option', { value: '', text: 'default' }),
        ...['auto', 'low', 'medium', 'high'].map((v) => el('option', { text: v }))))));
  const imageForm = el('form', { class: 'tool-form', 'data-kind': 'image' },
    imageSettings,
    el('button', { type: 'submit', class: 'primary', text: 'Draw the scene' }));
  const imageOut = el('div', { class: 'result' });

  root.append(
    el('div', { class: 'placeholder-note' },
      el('strong', { text: 'How it works' }),
      el('ol', {},
        el('li', {}, 'Load a session export from ', el('a', { href: 'https://dreamgen.com/', target: '_blank', rel: 'noopener', text: 'DreamGen' }),
          ' (Markdown or JSON). Nothing leaves the browser until you press a button.'),
        el('li', { text: 'A chat model reads the export, works out where the last scene begins, and writes an image prompt with the characters in it named and described.' }),
        el('li', { text: 'Optionally add a reference portrait for each character, with the name it shows. Portraits embedded in the export are attached for the characters in the scene.' }),
        el('li', { text: 'Draw it with an image model on the selected endpoint. With references, the names are added to the prompt so the model knows who is who.' })),
      el('p', { class: 'small' }, el('strong', { text: 'Privacy. ' }),
        'Run at ', el('a', { href: 'https://hkarn.github.io/LLM-PlayGround/', target: '_blank', rel: 'noopener', text: 'https://hkarn.github.io/LLM-PlayGround/' }),
        ' or in your own Docker or node server.js, this tool sends nothing to us or to any third party and saves nothing anywhere but your browser. ',
        'GitHub Pages only serves the page files; your export, prompts and pictures stay in this browser. Your own server only forwards your requests and logs no content. ',
        'What reaches a third party is what you send with your own key to the provider you chose (Requesty, OpenRouter or your custom endpoint), and what that provider and its models do with it is between you and them. ',
        'The browser keeps your settings, your chosen models and, if you tick Remember, your key in its own local storage, and what you type in session storage (this tab only) so a reload does not clear it.'),
      el('p', { class: 'small' }, el('strong', { text: 'Feedback. ' }), 'Send ideas and problems with this tool to Zorander on the DreamGen Discord.')),
    el('section', { class: 'tool-step' }, el('h3', { text: '1. Session export' }), fileInput, summary),
    el('section', { class: 'tool-step' }, el('h3', { text: '2. Write the image prompt' }), promptForm, promptOut),
    el('section', { class: 'tool-step' }, el('h3', { text: '3. Prompt and reference portraits' }),
      sceneLine,
      el('label', {}, 'Image prompt', promptBox),
      copyRow,
      el('div', { class: 'grid3' },
        el('label', {}, 'Picture style', styleSelect),
        el('label', { class: 'style-custom', hidden: '' }, 'Your style', styleCustom)),
      charList,
      portraits.node),
    el('section', { class: 'tool-step' }, el('h3', { text: '4. Draw' }), imageForm, imageOut),
    el('p', { class: 'muted small' }, 'Next: ', el('a', { href: '#tools/dreamgen-video', text: 'Animate the DreamGen Scene' }),
      ' will turn the picture into a short clip (coming soon; it will take this picture straight from here).'));

  for (const picker of $$('.model-picker', root)) setupPicker(picker);
  setupModelOptions(imageForm);
  syncStyle();
  keepDrafts(root, 'dgscene', { skip: ['max_tokens', 'trim_tokens', 'style_custom'] });
  // The chosen models are remembered per provider, and each step's settings fold away once
  // its model is chosen, so a second run is: load the export, write the prompt, draw.
  rememberModel(promptForm, 'chat', ['max_tokens', 'trim_tokens']);
  rememberModel(imageForm, 'image', ['size', 'aspect_ratio', 'resolution', 'quality']);
  settingsToggle(promptForm, chatSettings, 'chat', () => `Chat model: ${chosenModel(promptForm)}`);
  settingsToggle(imageForm, imageSettings, 'image', () => [`Image model: ${chosenModel(imageForm)}`,
    ...['size', 'aspect_ratio', 'resolution', 'quality'].map((n) => str(imageForm, n) && `${n.replace('_', ' ')} ${str(imageForm, n)}`)].filter(Boolean).join(' · '));

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
          s.images.length ? ` · ${s.images.length} portraits embedded` : ''));
      undo.length = 0;
      setExport(s.text, { keepUndo: true });
      // Embedded portraits are attached in step 3, for the characters the model puts in the scene.
      portraits.set([]);
    } catch (err) {
      st.session = null;
      summary.replaceChildren(el('div', { class: 'output error', text: `Could not read ${f.name}: ${err.message}` }));
    }
  });

  promptForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runStep(promptForm, promptOut, async () => {
      const exported = exportBox.value.trim();
      if (!exported) throw new Error('Load a session export first (step 1), or paste one.');
      const model = chosenModel(promptForm);
      if (!model) throw new Error('Pick or type a chat model first.');
      const focus = promptForm.elements.focus.value.trim();
      const text = `${exported}\n\n---\n\n${focus ? `Note from the user about the picture: ${focus}` : 'Write the prompt for the final moment of the last scene.'}`;
      const system = promptForm.elements.system.value.trim();
      const { resp, request: body } = await send('chat', {
        model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: text }],
        max_tokens: num(promptForm, 'max_tokens'),
      }, { signal: promptForm._abort?.signal });
      let rendered;
      if (resp.ok && resp.data?.choices) {
        const choice = resp.data.choices[0] || {};
        const reply = read('chat', resp).text || '';
        const parsed = parseJsonLoose(reply);
        applyScene(parsed?.prompt ? parsed : { prompt: reply.trim(), characters: [] });
        rendered = el('div', {},
          el('div', { class: 'output', text: parsed?.prompt ? 'Prompt written. Check it in step 3.' : 'The reply was not the JSON asked for; it is in step 3 as it came.' }),
          el('div', { class: 'muted small', text: usageLine(resp.data, choice) }));
      }
      const shortBody = { ...body, messages: body.messages.map((m) => ({ ...m, content: m.content.length > 1200 ? `${m.content.slice(0, 600)}\n… ${(m.content.length - 1000).toLocaleString()} characters …\n${m.content.slice(-400)}` : m.content })) };
      const { path, base } = ep('chat');
      renderResult(promptOut, { resp, request: shortBody, curl: curlFor(path, { base, json: shortBody }), rendered });
    });
  });

  // The characters the model named, each with a button to attach a portrait for them.
  function applyScene({ scene, prompt, characters = [] }) {
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
    // Attach the export's own portrait for each character in the scene, replacing earlier ones.
    const embedded = new Set((st.session?.images || []).map((i) => i.file));
    const refs = portraits.refs.filter((r) => !embedded.has(r.file));
    const norm = (n) => n.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').trim();
    for (const c of chars) {
      const n = norm(c.name);
      const img = (st.session?.images || []).find((i) => norm(i.name) === n)
        || (st.session?.images || []).find((i) => norm(i.name).split(' ')[0] === n.split(' ')[0]);
      if (img && !refs.some((r) => r.file === img.file)) refs.push({ name: c.name, file: img.file });
    }
    portraits.set(refs);
  }

  // With references, "Reference image 1 shows …" lines tell the model who is who.
  function finalPrompt() {
    if (!promptBox.value.trim()) return '';
    const base = withStyle(promptBox.value.trim());
    const named = portraits.refs.map((r, i) => (r.name.trim() ? `reference image ${i + 1} is ${r.name.trim()}` : '')).filter(Boolean);
    if (!addNames.checked || !named.length) return base;
    return `${base}\n\nUse the reference images for the characters' faces and looks: ${named.join('; ')}.`;
  }

  imageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runStep(imageForm, imageOut, async () => {
      const prompt = finalPrompt();
      if (!prompt) throw new Error('Write or generate an image prompt first (steps 2 and 3).');
      const model = chosenModel(imageForm);
      if (!model) throw new Error('Pick or type an image model first.');
      const fields = {
        model, prompt,
        size: str(imageForm, 'size'), aspect_ratio: str(imageForm, 'aspect_ratio'),
        resolution: str(imageForm, 'resolution'), quality: str(imageForm, 'quality'),
      };
      // With portraits it is an image edit; the provider's template decides how they travel.
      const kind = portraits.refs.length ? 'imageEdit' : 'image';
      const input = kind === 'imageEdit' ? { ...fields, images: portraits.refs.map((r) => r.file) } : fields;
      const { resp, request, curl } = await send(kind, input, { signal: imageForm._abort?.signal });
      const { rendered, shown } = renderImages(resp, 'png', kind);
      renderResult(imageOut, { resp: shown, request, curl, rendered });
    });
  });
}
