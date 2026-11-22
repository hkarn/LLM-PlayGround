/* LLM PlayGround: UI component: pick the scene. A chat model suggests how a DreamGen session's
   played story splits into scenes; the user picks one (the last is picked by default) and can move
   its start and end in a pop-out that shows the transcript. The pick becomes the export text the
   tool sends: the Session cut after the scene's end, with SCENE_MARK where the scene starts, so the
   prompts treat it as the last scene. The suggested split is kept in this tab (sessionStorage),
   keyed to the session, so loading the same export again costs nothing. */
import { read, send, spec } from '../adapter.js';
import { num, parseJsonLoose } from '../core/helpers.js';
import { CHARS_PER_TOKEN, SCENE_MARK, TRIM_MARK, tokensFor } from './dreamgen-export.js';
import { chosenModel } from './model-picker.js';
import { el } from './dom.js';
import { drafts } from './drafts.js';
import { runStep } from './run-step.js';

export { SCENE_MARK };

export const SPLIT_SYSTEM_PROMPT = `You split the played story of a DreamGen role-play game into scenes, so the player can pick one to draw or animate.

The user message is the game's Session: the played story, oldest first, with every paragraph numbered "¶N".
- "[Name]: text" is a turn by that character; plain paragraphs are narration or continue the turn above.
- "[Instruction]: text" is the player speaking out of character to the AI: not story.
- <hidden>...</hidden> blocks are the game's private tracking. Use their time and place lines as clues, but they are not scenes.
- Time and place lines ("Day 2 · 06:10 · North gate", "[Day 0 · 22:54 · The workshop]") often open a scene.

## What a scene is
A continuous stretch in one place and time, with the same people present, that would make one picture or one short clip.
- A new scene starts at a change of place (travel, entering another building or room), a jump in time ("later", "the next morning", sleep, a new day), or a cut to other characters somewhere else.
- The same people talking on in the same place is one scene, even when the topic changes. Someone arriving or leaving does not start a new scene by itself.
- A long journey or montage that covers days in a few paragraphs is one scene.
- Every paragraph belongs to exactly one scene: the first scene starts at ¶0, and each scene runs until the next one starts.

- Keep the list short. A stretch of only a few paragraphs belongs to the scene around it unless the place or time really changes. A long game usually has 10 to 40 scenes.

## Reply
One line per scene, in story order, and nothing else:
¶start | title | place, time | what happens
- start: the ¶ number of the scene's first paragraph. The first scene starts at ¶0.
- title: three to five words.
- place, time: a few words; the time as the story gives it, or leave it out.
- what happens: at most twelve words.
For example:
¶0 | Arrival at the gate | North gate, dusk | The travellers are stopped and questioned by the guard.`;

// The export split at its last "## Session" heading: `head` is everything up to and including
// that line, `paras` the Session's paragraphs (blank-line separated, the same unit as trimming).
export function sessionParts(text) {
  const heads = [...text.matchAll(/^##[ \t]+Session[ \t]*$/gmi)];
  if (!heads.length) return null;
  const at = heads.at(-1).index + heads.at(-1)[0].length;
  const paras = text.slice(at).split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && x !== TRIM_MARK && x !== SCENE_MARK);
  return { head: text.slice(0, at), paras };
}

// The export text for a picked scene: the Session ends with the scene, SCENE_MARK goes before its
// first paragraph, and paragraphs before it are kept, newest first, while they fit in maxTokens
// (the scene itself is always kept whole). Cut paragraphs leave TRIM_MARK, as trimming does.
export function composeScene(text, { start, end }, maxTokens) {
  const parts = sessionParts(text);
  if (!parts) return text;
  const { head, paras } = parts;
  const scene = paras.slice(start, end + 1);
  let budget = maxTokens * CHARS_PER_TOKEN - scene.join('\n\n').length;
  let from = start;
  while (from > 0 && budget - paras[from - 1].length - 2 >= 0) { from -= 1; budget -= paras[from].length + 2; }
  return [head.trimEnd(), ...(from > 0 ? [TRIM_MARK] : []), ...paras.slice(from, start), SCENE_MARK, ...scene].join('\n\n');
}

// Reads the reply: one "¶start | title | place, time | what happens" line per scene (the format
// asked for, short so a long game's list is written quickly), or a JSON {"scenes": [...]} from an
// edited system prompt.
export function parseSceneReply(text) {
  // Some models run every scene together on one line: a "¶N |" inside a line starts a new one too.
  const lines = String(text || '').replace(/\s+(?=¶\s*\d+\s*\|)/g, '\n').split(/\r?\n/).map((l) => l.trim().replace(/^[-*]\s*/, '').replace(/^`+|`+$/g, ''))
    .map((l) => l.match(/^¶?\s*(\d+)\s*[|:.)-]\s*(.*)$/)).filter(Boolean);
  if (lines.length) {
    return lines.map(([, start, rest]) => {
      const [title = '', where = '', ...summary] = rest.split('|').map((x) => x.trim());
      return { start: Number(start), title, place: where, time: '', who: [], summary: summary.join(' | ') };
    });
  }
  return parseJsonLoose(String(text || ''))?.scenes || [];
}

// Cleans the model's list: whole numbers in range, in order, no repeats, the first at ¶0; each
// scene ends where the next one starts.
export function readScenes(list, count) {
  const seen = new Set();
  const scenes = (Array.isArray(list) ? list : [])
    .map((s) => ({ ...s, start: Math.round(Number(s?.start)) }))
    .filter((s) => Number.isFinite(s.start) && s.start >= 0 && s.start < count && !seen.has(s.start) && seen.add(s.start))
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ start: s.start, title: String(s.title || '').trim() || 'Untitled scene', place: String(s.place || '').trim(), time: String(s.time || '').trim(), who: Array.isArray(s.who) ? s.who.map(String).filter(Boolean) : [], summary: String(s.summary || '').trim() }));
  if (scenes.length && scenes[0].start !== 0) scenes.unshift({ start: 0, title: 'Opening', place: '', time: '', who: [], summary: '' });
  return scenes.map((s, i) => ({ ...s, end: i + 1 < scenes.length ? scenes[i + 1].start - 1 : count - 1 }));
}

const short = (p, n) => { const t = p.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// The kept split belongs to one Session: a 53-bit hash of all of its text (cyrb53), with the paragraph
// count, so another export (even a copy of the same game played on) never restores it.
const hash = (str) => {
  let h1 = 0xdeadbeef; let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};
const sigOf = (paras) => `${paras.length}:${hash(paras.join('\n\n'))}`;

// chatForm: the tool's chat model form (model, max_tokens). getText(): the full export, before any
// trimming. budget(): the trim size in tokens. onPick(text | null, range): the export text for the
// pick, or null for "no scene picked" (the whole export as loaded).
export function scenePicker({ chatForm, getText, budget, onPick }) {
  let parts = null; // { head, paras } of the loaded export
  let scenes = [];
  let pick = null; // { start, end } or null
  const key = 'dgscene:scenes';

  const out = el('div', { class: 'result' });
  const findBtn = el('button', { type: 'submit', class: 'secondary', text: 'Find scenes' });
  const cost = el('span', { class: 'muted small' });
  const form = el('form', { class: 'tool-form scene-find' }, el('div', { class: 'row' }, findBtn, cost));
  const list = el('div', { class: 'scene-list', role: 'radiogroup', 'aria-label': 'Scenes' });
  const picked = el('div', { class: 'small scene-picked' });
  const node = el('div', { class: 'scene-picker' },
    el('p', { class: 'muted small', text: 'A chat model suggests where the scenes start, so you can draw or animate an earlier one. The suggestion is rough: adjust the start and end of the scene you pick.' }),
    form, out, list, picked);

  const save = () => { if (parts) drafts.set(key, JSON.stringify({ sig: sigOf(parts.paras), scenes, pick })); };
  const apply = () => {
    save();
    if (!parts || !pick) { picked.textContent = ''; onPick(null); return; }
    const n = pick.end - pick.start + 1;
    const s = scenes.find((x) => x.start <= pick.start && pick.start <= x.end);
    picked.replaceChildren(el('strong', { text: 'Picked: ' }), `${s?.title || 'a scene'}, ¶${pick.start}–¶${pick.end} (${n} paragraph${n > 1 ? 's' : ''}). `,
      'The session sent below ends with this scene, and marks where it starts; earlier paragraphs fill up to the trim size.');
    onPick(composeScene(getText(), pick, budget()), pick);
  };

  function draw() {
    list.replaceChildren();
    if (!scenes.length) return;
    const row = (value, title, meta, summary, range) => {
      const radio = el('input', { type: 'radio', name: 'scene-pick', value });
      const on = range ? pick && pick.start === range.start && pick.end === range.end : !pick;
      radio.checked = !!on;
      radio.addEventListener('change', () => { pick = range ? { ...range } : null; apply(); draw(); });
      const adjust = range ? el('button', { type: 'button', class: 'secondary small-btn', text: 'Adjust start and end', onclick: () => editRange(range) }) : null;
      return el('label', { class: `scene-row${on ? ' on' : ''}` }, radio,
        el('span', { class: 'scene-row-body' }, el('strong', { text: title }), meta ? el('span', { class: 'muted small', text: meta }) : null,
          summary ? el('span', { class: 'small', text: summary }) : null, on && adjust ? adjust : null));
    };
    // The picked range may have been moved off the suggested scenes: it is shown as its own row.
    const custom = pick && !scenes.some((s) => s.start === pick.start && s.end === pick.end);
    list.append(row('none', 'Whole session', 'No scene picked: the export as loaded, the last scene found by the prompt writer.', '', null));
    if (custom) list.append(row('custom', 'Your range', `¶${pick.start}–¶${pick.end}`, short(parts.paras[pick.start], 120), pick));
    for (const s of [...scenes].reverse()) {
      const meta = [`¶${s.start}–¶${s.end}`, s.place, s.time, s.who.join(', ')].filter(Boolean).join(' · ');
      list.append(row(String(s.start), s.title, meta, s.summary, { start: s.start, end: s.end }));
    }
  }

  // The pop-out: the whole Session as a list, the scene highlighted. Each paragraph has Start and End
  // buttons; the suggested scenes show as dividers that pick that scene when clicked.
  function editRange(range) {
    let r = { ...range };
    const status = el('span', { class: 'small' });
    const body = el('div', { class: 'scene-edit-body' });
    const rows = [];
    const set = (patch) => {
      r = { ...r, ...patch };
      if (r.start > r.end) r = patch.start !== undefined ? { ...r, end: r.start } : { ...r, start: r.end };
      paint();
    };
    const starts = new Map(scenes.map((s) => [s.start, s]));
    parts.paras.forEach((p, i) => {
      const s = starts.get(i);
      if (s) body.append(el('button', { type: 'button', class: 'scene-divider', title: 'Pick this suggested scene', text: `${s.title}${s.place ? ` · ${s.place}` : ''}`, onclick: () => set({ start: s.start, end: s.end }) }));
      const text = el('span', { class: 'scene-para-text', text: short(p, 280), title: 'Click to show it all' });
      text.addEventListener('click', () => { text.textContent = text.textContent.endsWith('…') ? p : short(p, 280); });
      const line = el('div', { class: 'scene-para' },
        el('span', { class: 'scene-para-n muted small', text: `¶${i}` }), text,
        el('span', { class: 'scene-para-btns' },
          el('button', { type: 'button', class: 'secondary small-btn', text: 'Start', title: 'The scene starts here', onclick: () => set({ start: i }) }),
          el('button', { type: 'button', class: 'secondary small-btn', text: 'End', title: 'The scene ends here', onclick: () => set({ end: i }) })));
      rows.push(line);
      body.append(line);
    });
    function paint() {
      rows.forEach((line, i) => {
        line.classList.toggle('in', i >= r.start && i <= r.end);
        line.classList.toggle('first', i === r.start);
        line.classList.toggle('last', i === r.end);
      });
      status.textContent = `Start ¶${r.start} · End ¶${r.end} · ${r.end - r.start + 1} paragraphs, about ${tokensFor(parts.paras.slice(r.start, r.end + 1).join('\n\n')).toLocaleString()} tokens`;
    }
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const jump = (i) => rows[i]?.scrollIntoView({ block: 'center' });
    const box = el('div', { class: 'scene-edit', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Adjust the scene' },
      el('div', { class: 'scene-edit-panel' },
        el('div', { class: 'scene-edit-bar' },
          el('strong', { text: 'Adjust the scene' }), status,
          el('span', { class: 'scene-edit-actions' },
            el('button', { type: 'button', class: 'secondary small-btn', text: 'Go to start', onclick: () => jump(r.start) }),
            el('button', { type: 'button', class: 'secondary small-btn', text: 'Go to end', onclick: () => jump(r.end) }),
            el('button', { type: 'button', class: 'secondary', text: 'Cancel', onclick: close }),
            el('button', { type: 'button', class: 'primary', text: 'Use this scene', onclick: () => { pick = { ...r }; close(); apply(); draw(); } }))),
        el('p', { class: 'muted small', text: 'Press Start or End on a paragraph to move the scene\'s first or last paragraph. Click a paragraph\'s text to read all of it; a scene heading picks that suggested scene.' }),
        body));
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', onKey);
    document.body.append(box);
    paint();
    jump(r.start);
    box.querySelector('.primary').focus({ preventScroll: true });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runStep(form, out, async () => {
      if (!parts) throw new Error('Load a session export first (step 1).');
      const model = chosenModel(chatForm);
      if (!model) throw new Error('Pick or type a chat model first (Settings).');
      const user = parts.paras.map((p, i) => `¶${i} ${p}`).join('\n\n');
      const t0 = Date.now();
      // Little thinking: a reasoning model otherwise spends most of its time reasoning about the
      // boundaries, and on a long game runs past the provider's time limit. The provider file says
      // how to ask (chat.lowReasoning: a list to try in order, such as thinking off, then low); a
      // model that refuses one (a 4xx answer) gets the next, and finally the request without any.
      const low = spec('chat').lowReasoning;
      const tries = [...(Array.isArray(low) ? low : [low]).filter(Boolean), undefined];
      const ask = (extra) => send('chat', {
        model, messages: [{ role: 'system', content: SPLIT_SYSTEM_PROMPT }, { role: 'user', content: user }],
        max_tokens: num(chatForm, 'max_tokens'), extra,
      }, { signal: form._abort?.signal });
      let resp;
      for (const extra of tries) {
        ({ resp } = await ask(extra));
        if (resp.ok || resp.status < 400 || resp.status >= 500) break;
      }
      if (!resp.ok) {
        const detail = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data?.error || resp.data).slice(0, 300);
        // The provider (or a proxy before it) cut the connection while the model was still writing:
        // a long game with a slow model can run past its time limit (LLM Gateway: about 2-3 minutes).
        const dropped = /fetch failed|other side closed|socket|timed? ?out|ECONNRESET|terminated/i.test(detail) || [502, 504, 524].includes(resp.status);
        throw new Error(dropped
          ? `The split failed after ${Math.round((Date.now() - t0) / 1000)} s: the provider closed the connection before ${model} finished. A long game takes a slow model too long. Try a faster chat model (on LLM Gateway, Claude Haiku 5.5 and GPT-5.6 Luna took 8–30 s on 1,500-paragraph games), or try again. (${resp.status} ${detail})`
          : `The split failed: ${resp.status} ${detail}`);
      }
      const found = readScenes(parseSceneReply(read('chat', resp).text), parts.paras.length);
      if (!found.length) throw new Error('The reply had no scene list. Try again, or another chat model.');
      scenes = found;
      const last = scenes.at(-1);
      pick = { start: last.start, end: last.end };
      apply();
      draw();
      const u = read('chat', resp).usage || resp.data?.usage || {};
      const c = u.cost ?? u.total_cost;
      out.replaceChildren(el('div', { class: 'muted small', text: `${scenes.length} scenes found in ${Math.round((Date.now() - t0) / 1000)} s${c != null ? `, $${Number(c).toFixed(4)}` : ''}. The last one is picked.` }));
    });
  });

  return {
    node,
    // A newly loaded export: restores the split kept for it, if any; otherwise waits for Find scenes.
    reset() {
      const text = getText();
      parts = text ? sessionParts(text) : null;
      scenes = []; pick = null;
      out.replaceChildren(); picked.textContent = '';
      findBtn.disabled = !parts;
      cost.textContent = parts ? `Sends the whole Session, about ${tokensFor(parts.paras.join('\n\n')).toLocaleString()} tokens.` : '';
      try {
        const kept = parts && JSON.parse(drafts.get(key) || 'null');
        if (kept?.sig === sigOf(parts.paras)) { scenes = kept.scenes || []; pick = kept.pick || null; if (pick) apply(); }
      } catch { /* none kept */ }
      draw();
    },
    // The trim size changed: the pick is composed again.
    refresh() { if (pick) apply(); },
    // The text being sent was changed some other way (restored, trimmed, edited by hand): if it no
    // longer has the scene's marker, the pick no longer applies, so the list shows Whole session.
    // It does not change the text.
    sync(text) {
      if (!pick || text.includes(SCENE_MARK)) return;
      pick = null;
      picked.textContent = '';
      save();
      draw();
    },
  };
}
