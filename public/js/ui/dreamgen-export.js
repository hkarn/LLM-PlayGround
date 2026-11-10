/* LLM PlayGround: UI component: reading DreamGen session exports (Markdown, or JSON written out as
   Markdown) and trimming them to a token budget. Used by Draw the DreamGen Scene and Animate the
   DreamGen Scene. Format notes: docs/dreamgen-session-export.md. */

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
  // Every picture is listed: { name (its caption), kind, index (within its entity), nsfw, file }.
  // DreamGen requires a caption on characters, locations and objects (display.name); the narrator's
  // is "narrator" and the scenario's own pictures are "cover". The caption stays blank if the file has none.
  const images = [];
  const addImages = (list, name, kind, base, alias = '') => (list || []).forEach((img, index) => {
    if (!img?.dataBase64) return;
    images.push({ name, alias, kind, index, nsfw: !!img.nsfw, file: base64ToFile(img.dataBase64, img.mimeType, `${base}${index ? `_${index + 1}` : ''}`) });
  });
  for (const e of entities) {
    const kind = e.kind === 'character_user' ? 'persona' : e.kind;
    addImages(e.display?.images, e.kind === 'narrator' ? 'narrator' : (e.display?.name || ''), kind, e.label || nameOf(e) || kind, nameOf(e));
  }
  addImages(scenario?.display?.images, 'cover', 'cover', 'cover');
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
