/* LLM PlayGround: Game: AI Group Chat. */
import { read, send } from '../adapter.js';
import { errorMessage, modelsIn, store } from '../core.js';
import { $, el } from '../ui/dom.js';

// Each character is a persona on its own chat model. A round works like this: the active
// characters are put in a queue by the chosen turn-order strategy, then each one in the queue
// gets the whole conversation so far and writes one message. When the queue is empty the
// user posts a message (which starts a new round) or presses "Another round".

// Turn-order strategies. order({ characters, log, userName }) gets the active characters and
// the log, and returns (or resolves to) the characters to ask this round, in order. It may
// leave some out or repeat one. A ranking model can be added here later, for example by
// calling callApi() with the log and returning the characters sorted by its scores.
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
};

const GC_COLORS = ['#7c5cd6', '#d6705c', '#3f9e7a', '#c79a1e', '#3a86c8', '#c2477f', '#6b8e23', '#8a5a44'];
const GC_DEFAULT = () => ({
  userName: 'You',
  scenario: 'A relaxed group chat between friends. Keep messages short, like real chat messages.',
  defaultModel: '',
  order: 'random',
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

// Fills the model suggestions with the loaded chat models. Called on render and whenever a
// model field gets focus, since models may load (or the provider change) after the app opens.
function fillGroupChatModels(root) {
  const list = $('#gc-models', root);
  if (list) list.replaceChildren(...modelsIn('chat').map((m) => el('option', { value: m.id })));
}

export function renderGroupChat(root) {
  const s = gcStore.load();
  const run = { busy: false, stop: false, queue: [], current: null, abort: null };
  const save = () => gcStore.save(s);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const charById = (id) => s.characters.find((c) => c.id === id);
  const modelOf = (c) => c.model.trim() || s.defaultModel.trim();

  const avatar = (name, color) => el('span', { class: 'gc-avatar', style: `background:${color}`, text: (name || '?')[0].toUpperCase() });

  /* ---- Prompt building ---- */
  // The character's own earlier messages are `assistant`, everyone else's are `user` lines
  // prefixed with the speaker's name. Consecutive user lines are joined, since some providers
  // reject two user messages in a row.
  function buildMessages(c) {
    const others = s.characters.filter((o) => o.active && o.id !== c.id);
    const system = [
      `You are ${c.name}. ${c.persona}`.trim(),
      `You are in a group chat with ${[`${s.userName} (a human)`, ...others.map((o) => `${o.name} (${o.persona})`)].join(', ')}.`,
      s.scenario.trim() ? `Setting: ${s.scenario.trim()}` : '',
      `Write exactly one chat message as ${c.name}. Stay in character. Do not start with your name, and do not write messages for anyone else.`,
    ].filter(Boolean).join('\n\n');
    const messages = [{ role: 'system', content: system }];
    for (const m of s.log) {
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

  async function askCharacter(c, signal) {
    const model = modelOf(c);
    if (!model) throw new Error(`No model for ${c.name}. Set a default model or one for the character.`);
    const { resp } = await send('chat', { model, messages: buildMessages(c), max_tokens: s.maxTokens || undefined, temperature: s.temperature ?? undefined }, { signal });
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
      run.queue = (await strategy.order({ characters: active, log: s.log, userName: s.userName })).map((c) => ({ c, status: 'waiting' }));
      renderQueue();
      for (const item of run.queue) {
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

  function note(text) {
    s.log.push({ id: uid(), from: 'note', name: '', text, error: true });
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
    const total = s.characters.reduce((sum, c) => sum + costOf(c).cost, 0);
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
      ...(total ? [el('div', { class: 'muted small', text: `Total cost $${+total.toFixed(6)}` })] : []),
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
      el('label', {}, 'Model', el('input', { name: 'model', value: c.model, list: 'gc-models', placeholder: s.defaultModel ? `default: ${s.defaultModel}` : 'model id', spellcheck: 'false' })),
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
      if (m.from === 'note') return el('div', { class: 'gc-note', text: m.text });
      const c = m.from === 'user' ? null : charById(m.from);
      const color = m.from === 'user' ? 'var(--accent)' : c?.color || '#888';
      return el('div', { class: `gc-msg${m.from === 'user' ? ' me' : ''}${m.error ? ' failed' : ''}` },
        avatar(m.name, color),
        el('div', { class: 'bubble' },
          el('div', { class: 'small muted gc-meta' },
            el('span', { text: m.name }),
            m.model ? el('span', { text: ` · ${m.model}` }) : null,
            m.error ? el('span', { text: ' · failed' }) : null,
            el('button', {
              type: 'button', class: 'icon-btn', title: 'Delete message', 'aria-label': `Delete message from ${m.name}`, text: '×', disabled: run.busy || undefined,
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
    if (!run.queue.length) { queueBar.replaceChildren(el('span', { class: 'muted small', text: 'Turn order is picked when a round starts.' })); return; }
    queueBar.replaceChildren(el('span', { class: 'muted small', text: run.busy ? 'This round:' : 'Last round:' }),
      ...run.queue.map((q) => el('span', { class: `gc-chip ${q.status}`, title: q.status },
        el('span', { class: 'dot', style: `background:${q.c.color}` }), q.c.name)));
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
  const settings = el('details', { class: 'gc-settings' },
    el('summary', { text: 'Chat settings' }),
    el('div', { class: 'grid3' },
      field('Your name', bind(el('input', { value: s.userName }), 'userName', (v) => v.trim() || 'You')),
      field('Default model', bind(el('input', { value: s.defaultModel, list: 'gc-models', placeholder: 'used when a character has none', spellcheck: 'false' }), 'defaultModel', (v) => v.trim())),
      field('Turn order', bind(el('select', {}, ...Object.entries(GC_ORDER).map(([id, o]) => el('option', { value: id, text: o.label, selected: id === s.order || undefined }))), 'order')),
      field('Max tokens per answer', bind(el('input', { type: 'number', min: 1, value: s.maxTokens }), 'maxTokens', (v) => Number(v) || null)),
      field('Temperature', bind(el('input', { type: 'number', min: 0, max: 2, step: 0.1, value: s.temperature }), 'temperature', (v) => (v === '' ? null : Number(v))))),
    field('Setting (shared by everyone)', bind(el('textarea', { rows: 2 }, s.scenario), 'scenario')),
    el('div', { class: 'row' },
      el('button', {
        type: 'button', class: 'secondary', text: 'Clear chat',
        onclick: () => { if (run.busy || !s.log.length || !confirm('Delete all messages in this chat?')) return; s.log = []; run.queue = []; save(); renderLog(); renderQueue(); renderCharacters(); },
      }),
      el('button', {
        type: 'button', class: 'secondary', text: 'Reset characters',
        onclick: () => { if (run.busy || !confirm('Replace the characters with the three examples?')) return; s.characters = GC_DEFAULT().characters; save(); renderCharacters(); },
      })));

  root.append(
    el('datalist', { id: 'gc-models' }),
    el('div', { class: 'groupchat' },
      side,
      el('div', { class: 'gc-main' },
        settings,
        log,
        queueBar,
        el('div', { class: 'gc-compose' }, input, el('div', { class: 'gc-buttons' }, sendBtn, roundBtn, stopBtn)))));
  root.addEventListener('focusin', (e) => { if (e.target.getAttribute?.('list') === 'gc-models') fillGroupChatModels(root); });
  fillGroupChatModels(root);
  renderCharacters(); renderLog(); renderQueue(); renderControls();
}
