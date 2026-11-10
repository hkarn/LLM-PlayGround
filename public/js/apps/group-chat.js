/* LLM PlayGround: Game: AI Group Chat. */
import { read, send } from '../adapter.js';
import { errorMessage, modelsIn, provider, PROVIDERS, state, store } from '../core.js';
import { comboBox } from '../ui/combo.js';
import { el } from '../ui/dom.js';

// Each character is a persona on its own chat model. A round works like this: the active
// characters are put in a queue by the chosen turn-order strategy, then each one in the queue
// gets the whole conversation so far and writes one message. When the queue is empty the
// user posts a message (which starts a new round) or presses "Another round".

// Turn-order strategies. order({ characters, log, userName, settings, signal }) gets the active
// characters and the log, and returns (or resolves to) the characters to ask this round, in order,
// or { order, odds, cost } when it has a probability per character (odds: id → 0..1, shown on the
// queue chips; cost: what deciding cost). It may leave some out or repeat one. A failure throws,
// and the round falls back to Random with a note in the chat.
export const GC_ORDER = {
  random: {
    label: 'Random',
    order: ({ characters }) => {
      const list = [...characters];
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    },
  },
  fixed: { label: 'List order', order: ({ characters }) => [...characters] },
  decision: { label: 'Decision model', order: (ctx) => decideOrder(ctx) },
};

// Decision model: a decisions endpoint (Requesty, OpenRouter alpha) gets the chat so far as plain
// text and one `choice` question whose options are the characters, each described by its persona,
// and answers with a probability per character. The player's messages are in the chat but the
// player is never an option. When the user passed (Another round, so a character spoke last), that
// character is left out too, counts as 0 % and goes last, so nobody answers themselves.
const DECISION_STATE_CHARS = 12000; // the end of the chat, about 3k tokens
async function decideOrder({ characters, log, settings, signal }) {
  const p = provider();
  if (p.unsupported?.includes('decision')) throw new Error(`${p.label} has no decisions endpoint`);
  const model = (settings.decisionModels?.[state.provider] || '').trim();
  if (!model) throw new Error('no decision model chosen (Chat settings)');
  const said = log.filter((m) => !m.error && m.from !== 'note');
  const last = said[said.length - 1];
  const passed = last && last.from !== 'user' ? last.from : null;
  const options = characters.filter((c) => c.id !== passed);
  const odds = Object.fromEntries(characters.map((c) => [c.id, 0]));
  const sorted = () => [...characters].sort((a, b) => odds[b.id] - odds[a.id]);
  if (options.length < 2) { // nothing to decide
    for (const c of options) odds[c.id] = 1;
    return { order: sorted(), odds, cost: 0 };
  }
  // Option names must be unique: a repeated name gets " (2)".
  const label = new Map();
  for (const c of options) {
    let name = c.name.trim() || 'Someone';
    for (let n = 2; [...label.values()].includes(name); n++) name = `${c.name} (${n})`;
    label.set(c.id, name);
  }
  let chat = said.map((m) => `${m.name}: ${m.text}`).join('\n\n');
  if (chat.length > DECISION_STATE_CHARS) chat = `…${chat.slice(-DECISION_STATE_CHARS)}`;
  const stateText = [
    settings.scenario?.trim() ? `Setting: ${settings.scenario.trim()}` : '',
    chat ? `The group chat so far:\n\n${chat}` : 'The group chat has not started yet.',
  ].filter(Boolean).join('\n\n');
  const questions = {
    next: {
      type: 'choice',
      instructions: 'Who should talk next in this conversation?',
      criteria: Object.fromEntries(options.map((c) => [label.get(c.id), c.persona.trim() || null])),
    },
  };
  const { resp } = await send('decision', { model, state: stateText, questions }, { signal });
  if (!resp.ok) throw new Error(errorMessage(resp));
  const { answers, usage } = read('decision', resp);
  const a = answers?.next;
  if (!a || a.type === 'refusal') throw new Error(a?.refusal || a?.reason || 'no answer');
  // Probabilities keyed by option name, or by index with a legend, or a list of {value, probability}.
  const byName = {};
  const probs = a.probabilities;
  if (Array.isArray(probs)) for (const x of probs) byName[a.legend?.[x.value] ?? x.value] = Number(x.probability);
  else for (const [k, v] of Object.entries(probs || {})) byName[a.legend?.[k] ?? k] = Number(v);
  if (!Object.keys(byName).length && a.choice) byName[a.choice] = 1;
  for (const c of options) odds[c.id] = Number.isFinite(byName[label.get(c.id)]) ? byName[label.get(c.id)] : 0;
  if (!options.some((c) => odds[c.id] > 0)) throw new Error('the answer named none of the characters');
  return { order: sorted(), odds, cost: Number(usage?.cost) || 0 };
}

const GC_COLORS = ['#7c5cd6', '#d6705c', '#3f9e7a', '#c79a1e', '#3a86c8', '#c2477f', '#6b8e23', '#8a5a44'];
const GC_DEFAULT = () => ({
  userName: 'You',
  userBio: '', // what the characters know about the player; empty = "a human"
  scenario: 'A relaxed group chat between friends. Keep messages short, like real chat messages.',
  defaultModel: '',
  order: 'random',
  decisionModels: {}, // per provider: the decision model for the Decision model turn order
  decisionCost: 0, // what deciding the turn order has cost in this chat
  decisionWho: 'all', // with the decision model: 'all' answer, most likely first, or 'threshold'
  decisionThreshold: 20, // with 'threshold': only those at least this likely (%) answer; the top one always
  maxTokens: 300,
  temperature: 0.9,
  characters: [
    { id: 'c1', name: 'Ada', color: GC_COLORS[0], active: true, model: '',
      persona: 'A curious scientist who loves facts and asks follow-up questions.' },
    { id: 'c2', name: 'Bram', color: GC_COLORS[1], active: true, model: '',
      persona: 'A grumpy old pirate who exaggerates everything and distrusts science.' },
    { id: 'c3', name: 'Cleo', color: GC_COLORS[2], active: true, model: '',
      persona: 'A cheerful quiz host who turns every topic into a game.' },
  ],
  log: [], // { id, from: 'user' | characterId, name, text, model?, usage?, error? }
});

const gcStore = {
  load() {
    try {
      const saved = JSON.parse(store.get('groupchat') || 'null');
      if (saved?.characters) return { ...GC_DEFAULT(), ...saved };
    } catch { /* fall through */ }
    return GC_DEFAULT();
  },
  save(s) { store.set('groupchat', JSON.stringify(s)); },
};

// Export and import (JSON). The file holds the whole state (characters, settings, the chat) and the
// provider it was made on; there is never a key in it. On import every field is checked and only
// the known ones are kept, with the right types, so a hand-edited or foreign file can't break the page.
const GC_FORMAT = 'llm-playground/group-chat';
export function exportGroupChat(s) {
  return { format: GC_FORMAT, version: 1, exported: new Date().toISOString(), provider: state.provider, chat: s };
}
export function readGroupChat(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This is not a JSON file.'); }
  // Only the version this page writes is read: a later format may mean something else by a field.
  if (data?.format === GC_FORMAT && data.version !== 1) throw new Error(`This export is version ${data.version}; this page reads version 1. Update the page and try again.`);
  const chat = data?.format === GC_FORMAT ? data.chat : data;
  if (!chat || !Array.isArray(chat.characters)) throw new Error('This is not an AI Group Chat export (it has no characters list).');
  const str = (v, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const ids = new Set();
  const characters = chat.characters.filter((c) => c && typeof c === 'object' && str(c.name).trim()).slice(0, 8).map((c, i) => {
    let id = str(c.id, 40) || `c${i + 1}`;
    while (ids.has(id)) id += 'x';
    ids.add(id);
    return { id, name: str(c.name, 80).trim(), persona: str(c.persona), model: str(c.model, 200),
      color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : GC_COLORS[i % GC_COLORS.length], active: c.active !== false };
  });
  if (!characters.length) throw new Error('The file has no characters with a name.');
  // No messages list at all is not a chat (null); Import chat refuses it, Import characters doesn't need it.
  const log = !Array.isArray(chat.log) ? null : chat.log.filter((m) => m && typeof m.text === 'string').map((m, i) => ({
    id: str(m.id, 40) || `m${i}`, from: str(m.from, 40) || 'user', name: str(m.name, 80), text: str(m.text, 100000),
    ...(m.model ? { model: str(m.model, 200) } : {}), ...(m.usage && typeof m.usage === 'object' ? { usage: m.usage } : {}),
    ...(m.error ? { error: true } : {}), ...(m.warn ? { warn: true } : {}),
  }));
  const d = GC_DEFAULT();
  const num = (v, def) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : def);
  const settings = {
    userName: str(chat.userName, 80).trim() || d.userName, userBio: str(chat.userBio), scenario: typeof chat.scenario === 'string' ? str(chat.scenario) : d.scenario,
    defaultModel: str(chat.defaultModel, 200), order: GC_ORDER[chat.order] ? chat.order : d.order,
    decisionModels: Object.fromEntries(Object.entries(chat.decisionModels && typeof chat.decisionModels === 'object' ? chat.decisionModels : {}).map(([k, v]) => [str(k, 40), str(v, 200)])),
    // Kept within what the fields allow (max tokens at least 1, temperature 0 to 2), as typing would.
    decisionCost: Math.max(0, num(chat.decisionCost, 0)),
    decisionWho: chat.decisionWho === 'threshold' ? 'threshold' : 'all',
    decisionThreshold: Math.min(100, Math.max(1, Math.round(num(chat.decisionThreshold, d.decisionThreshold)))),
    maxTokens: Math.max(1, Math.round(num(chat.maxTokens, d.maxTokens))),
    temperature: Math.min(2, Math.max(0, num(chat.temperature, d.temperature))),
  };
  return { characters, log, settings, provider: str(data?.provider, 40) };
}

// A model field with the loaded chat models as suggestions (ui/combo.js): every model when the
// field gets focus, even with a model already in it, narrowed once the user types. The list is read
// each time it opens, since models may load (or the provider change) after the app opens. A pick
// fires "change", as typing does when the field is left.
function modelField(attrs, kind = 'chat') {
  const input = el('input', { name: 'model', ...attrs });
  const combo = comboBox(input, {
    label: kind === 'decision' ? 'Decision models' : 'Chat models',
    // The model's name first, the provider after it, sorted by name, so "haiku" or "qwen" finds a
    // model whatever its provider.
    items: () => modelsIn(kind).map((m) => {
      const id = m.id.replace(/^~/, '');
      const cut = id.lastIndexOf('/');
      return { value: m.id, label: cut < 0 ? id : id.slice(cut + 1), note: cut < 0 ? '' : id.slice(0, cut) };
    }).sort((a, b) => a.label.localeCompare(b.label)),
    pick: (value) => {
      combo.hide();
      if (value === undefined) return; // Enter with nothing highlighted: keep what is typed
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    empty: () => (modelsIn(kind).length ? 'No match in the loaded models. You can still type any model id.' : 'Load models to see suggestions, or type a model id.'),
  });
  return { input, wrap: combo.wrap };
}

export function renderGroupChat(root) {
  const s = gcStore.load();
  const run = { busy: false, stop: false, queue: [], current: null, abort: null, deciding: false };
  const save = () => gcStore.save(s);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const charById = (id) => s.characters.find((c) => c.id === id);
  const modelOf = (c) => c.model.trim() || s.defaultModel.trim();

  const avatar = (name, color) => el('span', { class: 'gc-avatar', style: `background:${color}`, text: (name || '?')[0].toUpperCase() });

  /* ---- Prompt building ---- */
  // The character's own earlier messages are `assistant`, everyone else's are `user` lines
  // prefixed with the speaker's name. Consecutive user lines are joined, since some providers
  // reject two user messages in a row.
  // history: the messages the character sees (a retry passes only those before the failed one).
  function buildMessages(c, history = s.log) {
    const others = s.characters.filter((o) => o.active && o.id !== c.id);
    const system = [
      `You are ${c.name}. ${c.persona}`.trim(),
      `You are in a group chat with ${[`${s.userName} (${s.userBio?.trim() || 'a human'})`, ...others.map((o) => `${o.name} (${o.persona})`)].join(', ')}.`,
      s.scenario.trim() ? `Setting: ${s.scenario.trim()}` : '',
      `Write exactly one chat message as ${c.name}. Stay in character. Do not start with your name, and do not write messages for anyone else.`,
    ].filter(Boolean).join('\n\n');
    const messages = [{ role: 'system', content: system }];
    for (const m of history) {
      if (m.error) continue;
      if (m.from === c.id) { messages.push({ role: 'assistant', content: m.text }); continue; }
      const line = `${m.name}: ${m.text}`;
      const last = messages[messages.length - 1];
      if (last.role === 'user') last.content += `\n\n${line}`; else messages.push({ role: 'user', content: line });
    }
    const last = messages[messages.length - 1];
    if (last.role === 'system') messages.push({ role: 'user', content: '(The chat has just started. Open it with a message.)' });
    else if (last.role === 'assistant') messages.push({ role: 'user', content: '(Nobody else has said anything since your last message. Continue the conversation.)' });
    return messages;
  }

  // Models sometimes add "Name:" in front anyway.
  const cleanReply = (c, text) => text.trim().replace(new RegExp(`^\\**${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\**\\s*:\\s*`, 'i'), '').trim();

  async function askCharacter(c, signal, history) {
    const model = modelOf(c);
    if (!model) throw new Error(`No model for ${c.name}. Set a default model or one for the character.`);
    const { resp } = await send('chat', { model, messages: buildMessages(c, history), max_tokens: s.maxTokens || undefined, temperature: s.temperature ?? undefined }, { signal });
    if (!resp.ok) throw new Error(errorMessage(resp));
    const answer = read('chat', resp);
    const text = cleanReply(c, answer.text || '');
    return { text: text || '(empty reply)', model: answer.model || model, usage: answer.usage };
  }

  /* ---- Rounds ---- */
  async function runRound() {
    const active = s.characters.filter((c) => c.active);
    if (!active.length) { note('No active characters. Tick at least one.'); return; }
    run.busy = true; run.stop = false;
    renderControls();
    try {
      const strategy = GC_ORDER[s.order] || GC_ORDER.random;
      run.abort = new AbortController();
      run.deciding = s.order === 'decision';
      renderQueue();
      let picked;
      try {
        picked = await strategy.order({ characters: active, log: s.log, userName: s.userName, settings: s, signal: run.abort.signal });
      } catch (err) {
        if (err?.name === 'AbortError') return; // Stop while deciding
        note(`Turn order: ${strategy.label} failed (${err.message}), so this round is in random order.`, { warn: true });
        picked = GC_ORDER.random.order({ characters: active });
      } finally {
        run.deciding = false;
        run.abort = null;
      }
      const odds = Array.isArray(picked) ? null : picked.odds;
      if (!Array.isArray(picked) && picked.cost) { s.decisionCost = (Number(s.decisionCost) || 0) + picked.cost; save(); }
      run.queue = (Array.isArray(picked) ? picked : picked.order).map((c) => ({ c, status: 'waiting', odds: odds?.[c.id] }));
      // "Who answers: above a threshold": a character the decision model finds less likely than the
      // threshold sits this round out (shown struck through, with its percentage). The most likely
      // one always answers, so a round never passes in silence.
      if (odds && s.order === 'decision' && s.decisionWho === 'threshold') {
        const min = (Number(s.decisionThreshold) || 0) / 100;
        run.queue.forEach((item, i) => { if (i > 0 && (item.odds ?? 0) < min) item.status = 'left'; });
      }
      renderQueue(); renderCharacters();
      for (const item of run.queue) {
        if (item.status === 'left') continue;
        if (run.stop) { item.status = 'skipped'; continue; }
        // A character switched off mid-round is skipped.
        if (!item.c.active || !charById(item.c.id)) { item.status = 'skipped'; continue; }
        item.status = 'typing'; run.current = item.c;
        renderQueue(); renderLog();
        run.abort = new AbortController();
        try {
          const r = await askCharacter(item.c, run.abort.signal);
          s.log.push({ id: uid(), from: item.c.id, name: item.c.name, text: r.text, model: r.model, usage: r.usage });
          item.status = 'done';
        } catch (err) {
          // Stop cancels the reply in progress; that is not a failure worth a log entry.
          if (err?.name === 'AbortError') item.status = 'skipped';
          else {
            s.log.push({ id: uid(), from: item.c.id, name: item.c.name, text: err.message, error: true });
            item.status = 'failed';
          }
        }
        run.abort = null;
        run.current = null;
        save(); renderLog(); renderQueue();
        if (!editing) renderCharacters(); // keep a half-filled edit form
      }
    } finally {
      run.busy = false; run.current = null;
      renderControls(); renderQueue(); renderLog();
      input.focus();
    }
  }

  // Retry a failed reply in place: the character answers what came before the failed message, with
  // its current model, and the answer (or the new error) replaces the failed one.
  async function retryMessage(m) {
    const c = charById(m.from);
    if (run.busy || !c) return;
    run.busy = true; run.stop = false; run.current = c;
    renderControls(); renderLog();
    run.abort = new AbortController();
    try {
      const r = await askCharacter(c, run.abort.signal, s.log.slice(0, s.log.indexOf(m)));
      Object.assign(m, { name: c.name, text: r.text, model: r.model, usage: r.usage, error: false });
    } catch (err) {
      if (err?.name !== 'AbortError') m.text = err.message;
    } finally {
      run.abort = null; run.busy = false; run.current = null;
      save(); renderControls(); renderLog(); renderCharacters();
    }
  }

  function sendUserMessage() {
    const text = input.value.trim();
    if (run.busy) return;
    if (text) {
      s.log.push({ id: uid(), from: 'user', name: s.userName || 'You', text });
      input.value = '';
      save(); renderLog();
    }
    runRound();
  }

  // warn: something went wrong but was handled (amber), rather than plain information (grey).
  function note(text, { warn = false } = {}) {
    s.log.push({ id: uid(), from: 'note', name: '', text, error: true, warn });
    renderLog();
  }

  /* ---- Characters panel ---- */
  const side = el('div', { class: 'gc-side' });
  let editing = null;

  function costOf(c) {
    let cost = 0; let tokens = 0; let n = 0;
    for (const m of s.log) {
      if (m.from !== c.id || m.error) continue;
      n++;
      if (m.usage?.cost != null) cost += Number(m.usage.cost) || 0;
      tokens += m.usage?.total_tokens || 0;
    }
    return { cost, tokens, n };
  }

  function renderCharacters() {
    const decided = Number(s.decisionCost) || 0;
    const total = s.characters.reduce((sum, c) => sum + costOf(c).cost, 0) + decided;
    side.replaceChildren(
      el('div', { class: 'row gc-side-head' }, el('strong', { text: 'Characters' }),
        el('span', { class: 'muted small', text: 'Ticked ones answer each round' })),
      ...s.characters.map((c) => (editing === c.id ? editForm(c) : personRow(c))),
      el('button', {
        type: 'button', class: 'secondary', text: '+ Add character', disabled: s.characters.length >= 8 || undefined,
        onclick: () => {
          const c = { id: uid(), name: `Guest ${s.characters.length + 1}`, color: GC_COLORS[s.characters.length % GC_COLORS.length], active: true, model: '', persona: '' };
          s.characters.push(c); editing = c.id; save(); renderCharacters();
        },
      }),
      ...(total ? [el('div', { class: 'muted small', text: `Total cost $${+total.toFixed(6)}${decided ? ` (turn order $${+decided.toFixed(6)})` : ''}` })] : []),
    );
  }

  function personRow(c) {
    const { cost, n } = costOf(c);
    const status = run.queue.find((q) => q.c.id === c.id)?.status;
    return el('div', { class: `gc-person${c.active ? '' : ' off'}` },
      el('input', {
        type: 'checkbox', title: 'Answers each round', checked: c.active || undefined,
        onchange: (e) => { c.active = e.target.checked; save(); renderCharacters(); },
      }),
      avatar(c.name, c.color),
      el('div', { class: 'gc-person-text' },
        el('div', {}, el('strong', { text: c.name }), run.busy && status === 'typing' ? el('span', { class: 'muted small', text: ' typing…' }) : null),
        el('div', { class: 'muted small ellip', text: modelOf(c) || 'no model set', title: c.persona }),
        n ? el('div', { class: 'muted small', text: `${n} msg${cost ? ` · $${+cost.toFixed(6)}` : ''}` }) : null),
      el('button', { type: 'button', class: 'icon-btn', title: `Edit ${c.name}`, text: '✎', onclick: () => { editing = c.id; renderCharacters(); } }));
  }

  function editForm(c) {
    const f = el('form', { class: 'gc-edit' },
      el('label', {}, 'Name', el('input', { name: 'name', value: c.name, required: '' })),
      el('label', {}, 'Personality', el('textarea', { name: 'persona', rows: 3, placeholder: 'Who they are and how they talk' }, c.persona)),
      el('label', {}, 'Model', modelField({ value: c.model, placeholder: s.defaultModel ? `default: ${s.defaultModel}` : 'model id' }).wrap),
      el('label', { class: 'inline' }, 'Colour ', el('input', { type: 'color', name: 'color', value: c.color })),
      el('div', { class: 'row' },
        el('button', { type: 'submit', class: 'primary', text: 'Done' }),
        el('button', {
          type: 'button', class: 'secondary danger', text: 'Remove',
          onclick: () => { s.characters = s.characters.filter((x) => x !== c); editing = null; save(); renderCharacters(); },
        })));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      c.name = f.elements.name.value.trim() || c.name;
      c.persona = f.elements.persona.value.trim();
      c.model = f.elements.model.value.trim();
      c.color = f.elements.color.value;
      editing = null; save(); renderCharacters(); renderLog();
    });
    return f;
  }

  /* ---- Chat log ---- */
  const log = el('div', { class: 'gc-log' });
  function renderLog() {
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    const items = s.log.map((m) => {
      // Notes (a failed turn order, no active characters …) are messages from "System": deletable
      // like any other, and never sent to the characters or the decision model.
      const system = m.from === 'note';
      const name = system ? 'System' : m.name;
      const c = m.from === 'user' || system ? null : charById(m.from);
      const color = m.from === 'user' ? 'var(--accent)' : system ? 'var(--muted)' : c?.color || '#888';
      return el('div', { class: `gc-msg${m.from === 'user' ? ' me' : ''}${system ? ` system${m.warn ? ' warn' : ''}` : m.error ? ' failed' : ''}` },
        avatar(name, color),
        el('div', { class: 'bubble' },
          el('div', { class: 'small muted gc-meta' },
            el('span', { text: name }),
            m.model ? el('span', { text: ` · ${m.model}` }) : null,
            m.error && !system ? el('span', { text: ' · failed' }) : null,
            m.error && c ? el('button', {
              type: 'button', class: 'icon-btn', title: `Ask ${c.name} again`, 'aria-label': `Retry ${c.name}'s message`, text: '↻', disabled: run.busy || undefined,
              onclick: () => retryMessage(m),
            }) : null,
            el('button', {
              type: 'button', class: 'icon-btn', title: 'Delete message', 'aria-label': `Delete message from ${name}`, text: '×', disabled: run.busy || undefined,
              onclick: () => { s.log = s.log.filter((x) => x !== m); save(); renderLog(); renderCharacters(); },
            })),
          el('div', { class: 'gc-text', text: m.text })));
    });
    if (run.current) {
      items.push(el('div', { class: 'gc-msg typing' }, avatar(run.current.name, run.current.color),
        el('div', { class: 'bubble' }, el('div', { class: 'small muted', text: run.current.name }), el('span', { class: 'gc-dots', text: '…' }))));
    }
    if (!items.length) items.push(el('div', { class: 'muted gc-empty', text: 'Say something to start, or press "Another round" to let the characters open the chat.' }));
    log.replaceChildren(...items);
    if (atBottom || run.current) log.scrollTop = log.scrollHeight;
  }

  /* ---- Turn queue and controls ---- */
  const queueBar = el('div', { class: 'gc-queue' });
  function renderQueue() {
    if (run.deciding) { queueBar.replaceChildren(el('span', { class: 'muted small', text: 'The decision model is picking who talks next…' })); return; }
    if (!run.queue.length) { queueBar.replaceChildren(el('span', { class: 'muted small', text: 'Turn order is picked when a round starts.' })); return; }
    // With the decision model, each chip shows how likely that character was to talk next.
    const pctOf = (q) => `${Math.round(q.odds * 100)} %`;
    queueBar.replaceChildren(el('span', { class: 'muted small', text: run.busy ? 'This round:' : 'Last round:' }),
      ...run.queue.map((q) => el('span', { class: `gc-chip ${q.status}`, title: q.status === 'left' ? `Left out this round: ${pctOf(q)}, below the ${s.decisionThreshold} % threshold` : q.odds != null ? `${q.status} · ${pctOf(q)} likely to talk next` : q.status },
        el('span', { class: 'dot', style: `background:${q.c.color}` }), q.c.name,
        q.odds != null ? el('span', { class: 'gc-odds', text: pctOf(q) }) : null)));
  }

  const input = el('textarea', { rows: 2, placeholder: 'Write a message… (Enter sends, Shift+Enter for a new line)' });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendUserMessage(); } });
  const sendBtn = el('button', { type: 'button', class: 'primary', text: 'Send', onclick: sendUserMessage });
  const roundBtn = el('button', { type: 'button', class: 'secondary', text: 'Another round', title: 'Let the characters answer again without a new message', onclick: () => !run.busy && runRound() });
  const stopBtn = el('button', { type: 'button', class: 'secondary', text: 'Stop', title: 'Cancel the reply in progress and end this round', onclick: () => { run.stop = true; stopBtn.disabled = true; run.abort?.abort(); } });
  function renderControls() {
    sendBtn.disabled = run.busy; roundBtn.disabled = run.busy;
    stopBtn.hidden = !run.busy; stopBtn.disabled = false;
    sendBtn.textContent = run.busy ? 'Answering…' : 'Send';
  }

  /* ---- Settings ---- */
  const field = (label, node) => el('label', {}, label, node);
  const bind = (node, key, parse = (v) => v) => {
    node.addEventListener('change', () => { s[key] = parse(node.value); save(); renderCharacters(); });
    return node;
  };
  // Export and import. An import replaces what it loads (after a confirm), saves, and draws the app
  // again from the saved state, so every field shows the loaded values.
  function exportFile() {
    const d = new Date();
    const p2 = (x) => String(x).padStart(2, '0');
    const name = `group-chat-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportGroupChat(s), null, 2)], { type: 'application/json' }));
    const a = el('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const importInput = el('input', { type: 'file', accept: '.json,application/json', hidden: '' });
  let importWhat = 'chat';
  const pickFile = (what) => { if (run.busy) return; importWhat = what; importInput.value = ''; importInput.click(); };
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    let loaded;
    try { loaded = readGroupChat(await file.text()); } catch (err) { note(`Import: ${err.message}`, { warn: true }); return; }
    if (importWhat === 'chat' && !loaded.log) { note('Import: this file has characters but no messages list, so it is not a whole chat. Use Import characters… for a cast.', { warn: true }); return; }
    const what = importWhat === 'chat'
      ? `Replace this chat with ${file.name}: ${loaded.characters.length} characters, ${loaded.log.length} messages and its settings?`
      : `Replace the characters with the ${loaded.characters.length} in ${file.name}? The chat and settings stay.`;
    if (!confirm(what)) return;
    const next = importWhat === 'chat' ? { ...GC_DEFAULT(), ...loaded.settings, characters: loaded.characters, log: loaded.log } : { ...s, characters: loaded.characters };
    // Model ids belong to a provider: say so when the file was made on another one.
    if (loaded.provider && loaded.provider !== state.provider) {
      next.log = [...next.log, { id: uid(), from: 'note', name: '', error: true, warn: true,
        text: `Imported from a chat made on ${PROVIDERS[loaded.provider]?.label || loaded.provider}. Model names differ between providers: check each character's model (and the default and decision models) before the next round.` }];
    }
    gcStore.save(next);
    root.replaceChildren();
    renderGroupChat(root);
  });

  // Turn order, and the decision model it needs (kept per provider), shown only with that order.
  const orderSelect = bind(el('select', {}, ...Object.entries(GC_ORDER).map(([id, o]) => el('option', { value: id, text: o.label, selected: id === s.order || undefined }))), 'order');
  const decisionInput = modelField({ name: 'decision_model', value: s.decisionModels?.[state.provider] || '', placeholder: 'a decision model' }, 'decision');
  decisionInput.input.addEventListener('change', () => {
    s.decisionModels = { ...s.decisionModels, [state.provider]: decisionInput.input.value.trim() };
    save();
  });
  const decisionField = field('Decision model', decisionInput.wrap);
  decisionField.title = 'Reads the chat and ranks who should talk next. Kept per provider.';
  // Who answers, with the decision order: everyone (most likely first), or only those at least
  // as likely as the threshold (editable, %); the threshold field shows only with that choice.
  const whoSelect = el('select', { name: 'decision_who' },
    el('option', { value: 'all', text: 'Everyone, most likely first', selected: s.decisionWho !== 'threshold' || undefined }),
    el('option', { value: 'threshold', text: 'Only those above a threshold', selected: s.decisionWho === 'threshold' || undefined }));
  const thresholdInput = el('input', { type: 'number', name: 'decision_threshold', min: 1, max: 100, step: 1, value: s.decisionThreshold ?? 20 });
  const whoField = field('Who answers', whoSelect);
  whoField.title = 'Everyone answers in the order of the decision, or only those it finds likely enough. The most likely one always answers.';
  const thresholdField = field('Threshold (%)', thresholdInput);
  thresholdField.title = 'A character less likely than this to talk next sits the round out.';
  whoSelect.addEventListener('change', () => { s.decisionWho = whoSelect.value; save(); showDecision(); });
  thresholdInput.addEventListener('change', () => {
    s.decisionThreshold = Math.min(100, Math.max(1, Math.round(Number(thresholdInput.value) || 20)));
    thresholdInput.value = s.decisionThreshold;
    save();
  });
  const showDecision = () => {
    decisionField.hidden = s.order !== 'decision';
    whoField.hidden = s.order !== 'decision';
    thresholdField.hidden = s.order !== 'decision' || s.decisionWho !== 'threshold';
  };
  orderSelect.addEventListener('change', showDecision);
  showDecision();
  // The provider may change while the chat is open: show that provider's decision model.
  document.getElementById('provider')?.addEventListener('change', () => { decisionInput.input.value = s.decisionModels?.[state.provider] || ''; });
  // The settings bar: open on the first visit, then as the user left it. Folded, it still shows the
  // main choices, so it is clear there is something to set.
  const settingsLine = el('span', { class: 'gc-settings-line muted' });
  const updateSettingsLine = () => {
    const decision = s.order === 'decision' ? [s.decisionModels?.[state.provider] || 'no decision model', s.decisionWho === 'threshold' ? `≥ ${s.decisionThreshold} %` : ''].filter(Boolean).join(', ') : '';
    settingsLine.textContent = [
      s.userName || 'You',
      `${(GC_ORDER[s.order] || GC_ORDER.random).label}${decision ? ` (${decision})` : ''}`,
      s.defaultModel ? `default ${s.defaultModel}` : 'no default model',
    ].join(' · ');
  };
  const settingsSummary = el('summary', {}, el('strong', { text: '⚙ Chat settings' }), settingsLine);
  const settings = el('details', { class: 'gc-settings', open: store.get('gc_settings_open') !== 'no' || undefined },
    settingsSummary,
    el('div', { class: 'grid3' },
      field('Your name', bind(el('input', { value: s.userName }), 'userName', (v) => v.trim() || 'You')),
      field('Default model', (() => { const f = modelField({ name: 'default_model', value: s.defaultModel, placeholder: 'used when a character has none' }); bind(f.input, 'defaultModel', (v) => v.trim()); return f.wrap; })()),
      field('Turn order', orderSelect),
      decisionField,
      whoField,
      thresholdField,
      field('Max tokens per answer', bind(el('input', { type: 'number', min: 1, value: s.maxTokens }), 'maxTokens', (v) => Number(v) || null)),
      field('Temperature', bind(el('input', { type: 'number', min: 0, max: 2, step: 0.1, value: s.temperature }), 'temperature', (v) => (v === '' ? null : Number(v))))),
    field('About you (what the characters know about you)', bind(el('textarea', { rows: 2, placeholder: 'a human' }, s.userBio || ''), 'userBio')),
    field('Setting (shared by everyone)', bind(el('textarea', { rows: 2 }, s.scenario), 'scenario')),
    el('div', { class: 'row' },
      el('button', {
        type: 'button', class: 'secondary', text: 'Clear chat',
        onclick: () => { if (run.busy || !s.log.length || !confirm('Delete all messages in this chat?')) return; s.log = []; s.decisionCost = 0; run.queue = []; save(); renderLog(); renderQueue(); renderCharacters(); },
      }),
      el('button', {
        type: 'button', class: 'secondary', text: 'Reset characters',
        onclick: () => { if (run.busy || !confirm('Replace the characters with the three examples?')) return; s.characters = GC_DEFAULT().characters; save(); renderCharacters(); },
      })),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'secondary', text: 'Export', title: 'Save the characters, settings and chat as a JSON file', onclick: exportFile }),
      el('button', { type: 'button', class: 'secondary', text: 'Import chat…', title: 'Load a whole chat from an export: characters, settings and messages', onclick: () => pickFile('chat') }),
      el('button', { type: 'button', class: 'secondary', text: 'Import characters…', title: 'Load only the characters from an export; the chat stays', onclick: () => pickFile('characters') }),
      importInput));
  // Only a click on the bar is remembered (the browser also fires "toggle" when it is drawn open).
  settingsSummary.addEventListener('click', () => setTimeout(() => store.set('gc_settings_open', settings.open ? 'yes' : 'no')));
  settings.addEventListener('change', updateSettingsLine);
  document.getElementById('provider')?.addEventListener('change', updateSettingsLine);
  updateSettingsLine();

  root.append(
    el('div', { class: 'groupchat' },
      side,
      el('div', { class: 'gc-main' },
        settings,
        log,
        queueBar,
        el('div', { class: 'gc-compose' }, input, el('div', { class: 'gc-buttons' }, sendBtn, roundBtn, stopBtn)))));
  renderCharacters(); renderLog(); renderQueue(); renderControls();
}
