/* LLM PlayGround: Start-up: wires the tabs, endpoint picker, forms and hubs. Loaded by index.html. */
import { read } from './adapter.js';
import { apiKey, baseUrl, defaultBaseUrl, keyReady, loadModels, loadProviders, provider, PROVIDERS, renderModelsTable, serverConfig, state, store } from './core.js';
import { renderProviderGuide } from './providers-guide.js';
import { APPS, hubPanel, route, setHash, setupHubs, showTab, svgIcon } from './hubs.js';
import { addMessage, addQuestion, handlers, setupRecorder, setupRefImages, setupVoicePicker } from './testers.js';
import { $, $$, el } from './ui/dom.js';
import { keepDrafts, keepRows } from './ui/drafts.js';
import { loadModelFilter, setupModelFilter } from './ui/model-filter.js';
import { setupModelOptions } from './ui/model-options.js';
import { chosenModel, refreshPickers, setupPicker } from './ui/model-picker.js';
import { rememberModel } from './ui/remember.js';
import { renderException } from './ui/result.js';
import { runStep } from './ui/run-step.js';

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */
export async function init() {
  // Tabs
  $$('.tabs button').forEach((btn) => btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    showTab(tab);
    const app = hubPanel(tab)?._app;
    setHash(app ? `${tab}/${app}` : tab);
  }));
  const savedTab = store.get('tab');
  if (savedTab) showTab(savedTab);

  // Endpoint and key. Keys are remembered per provider. The provider list comes from providers/*.json.
  try {
    await loadProviders();
  } catch (err) {
    $('#models-status').textContent = `Could not load the provider list: ${err.message}`;
    return;
  }
  const keyName = () => `key_${state.provider}`;
  const legacyKey = store.get('requesty_key');
  if (legacyKey && !store.get('key_requesty')) store.set('key_requesty', legacyKey);
  store.del('requesty_key');
  // A provider marked needsServer (no CORS, e.g. LLM Gateway) works only through server.js. On a
  // static page it is greyed out, and its sign-up link is shown next to the others instead.
  await serverConfig;
  const unavailable = (p) => Boolean(p.needsServer && !state.viaServer);
  const providerSelect = $('#provider');
  providerSelect.replaceChildren(...Object.entries(PROVIDERS).map(([id, p]) => el('option', {
    value: id, text: unavailable(p) ? `${p.label} (needs your own server)` : p.label,
    disabled: unavailable(p) || undefined, title: unavailable(p) ? p.needsServerReason : undefined,
  })));
  state.provider = Object.keys(PROVIDERS).find((id) => !unavailable(PROVIDERS[id]));
  showSignupLinks(state.provider, unavailable);
  const savedProvider = store.get('provider');
  if (PROVIDERS[savedProvider] && !unavailable(PROVIDERS[savedProvider])) state.provider = savedProvider;
  providerSelect.value = state.provider;
  $('#base-url').addEventListener('change', () => {
    const url = baseUrl();
    if (url && url !== defaultBaseUrl()) store.set(`base_${state.provider}`, url); else store.del(`base_${state.provider}`);
  });
  $('#reset-url').addEventListener('click', () => {
    $('#base-url').value = defaultBaseUrl();
    store.del(`base_${state.provider}`);
    $('#base-url').focus();
  });
  providerSelect.addEventListener('change', () => {
    state.keys[state.provider] = apiKey();
    state.provider = providerSelect.value;
    store.set('provider', state.provider);
    applyProvider();
  });
  // The welcome page's cards: every tool and game, then the API tester and the model filter.
  const TESTER_ICON = '<path d="M8 6l-6 6 6 6"/><path d="M16 6l6 6-6 6"/>';
  const FILTER_ICON = '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>';
  const welcomeApps = [
    ...['tools', 'games'].flatMap((hub) => APPS[hub].map((a) => ({ ...a, href: `#${hub}/${a.id}` }))),
    { href: '#chat', title: 'API tester', icon: TESTER_ICON, blurb: 'Send a raw request to any endpoint (chat, images, video, speech, embeddings …) and see the full answer.' },
    { href: '#models', title: 'Filter models', icon: FILTER_ICON, blurb: 'Narrow every model list on the page to the makers and models you care about.' },
  ];
  // The title opens the welcome page, at the top, even when its hash is already #providers.
  $('.topbar h1 a').addEventListener('click', (e) => {
    e.preventDefault();
    showTab('providers');
    setHash('providers');
    window.scrollTo({ top: 0 });
  });
  // "Which provider?" in the connection panel jumps to the provider boxes further down.
  $('.conn-signup a[href="#providers"]').addEventListener('click', (e) => {
    e.preventDefault();
    showTab('providers');
    setHash('providers');
    openConnection(false);
    $('#provider-list')?.scrollIntoView({ block: 'start' });
  });
  renderProviderGuide($('[data-panel=providers]'), {
    unavailable,
    apps: welcomeApps,
    icon: svgIcon,
    choose: (id) => {
      providerSelect.value = id;
      providerSelect.dispatchEvent(new Event('change'));
      openConnection(true);
      $('#api-key').focus();
    },
  });
  $('#key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('#remember-key').checked && apiKey()) store.set(keyName(), apiKey()); else store.del(keyName());
    loadModels();
  });
  $('#remember-key').addEventListener('change', (e) => { if (!e.target.checked) store.del(keyName()); });
  setupConnectionChip();
  // API tester: opens the endpoint tab used last; the row of endpoint tabs shows while one is open.
  $('#tester-toggle').addEventListener('click', () => {
    const last = store.get('testerTab');
    const btn = $$('#tester-tabs [data-tab]').find((b) => b.dataset.tab === last) || $('#tester-tabs [data-tab]');
    btn.click();
  });

  // Pickers & forms
  $$('.model-picker').forEach(setupPicker);
  const chatForm = $('form[data-kind=chat]');
  addMessage(chatForm, 'user', 'Say hello and tell me which model you are.');
  $('.add-message', chatForm).addEventListener('click', () => addMessage(chatForm));
  setupRecorder($('form[data-kind=transcription]'));
  setupVoicePicker($('form[data-kind=speech]'));
  setupRefImages($('form[data-kind=imageEdit]'));
  for (const kind of ['image', 'imageEdit', 'video', 'speech']) setupModelOptions($(`form[data-kind=${kind}]`));
  const decisionForm = $('form[data-kind=decision]');
  addQuestion(decisionForm, { id: 'positive', type: 'noul', instructions: 'The review is positive.' });
  addQuestion(decisionForm, { id: 'genre', type: 'choice', instructions: 'Which genre is the book?', criteria: 'fantasy: Magic, myth or invented worlds\nmystery: A crime or puzzle to solve\nromance: A love story' });
  addQuestion(decisionForm, { id: 'rating', type: 'score', instructions: 'How much did the reviewer enjoy the book?', criteria: 'Hated it\nDisliked it\nNeutral\nLiked it\nLoved it' });
  $('.add-question', decisionForm).addEventListener('click', () => addQuestion(decisionForm));
  // After the tab pickers: an open app sets up its own pickers.
  setupHubs();
  // A link with a hash wins over the remembered tab and app.
  route();
  window.addEventListener('hashchange', route);

  $$('form.request-form').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = $('.result', form.closest('.panel'));
    if (!chosenModel(form)) { renderException(out, new Error('Pick or type a model first.')); return; }
    await runStep(form, out, () => handlers[form.dataset.kind](form, out));
  }));

  // Typed text comes back after a reload; the model and its options are remembered per provider.
  for (const form of $$('form.request-form')) {
    const kind = form.dataset.kind;
    rememberModel(form, `tab_${kind}`, $$('select[name]', form).map((x) => x.name).filter((n) => n !== 'model'));
    keepDrafts(form, kind);
  }
  keepRows(chatForm, 'chat:messages', $('.messages', chatForm), {
    read: () => $$('.message', chatForm).map((row) => ({ role: $('.role', row).value, content: $('.content', row).value })),
    rebuild: (r) => addMessage(chatForm, r.role, r.content, { focus: false }),
  });
  keepRows(decisionForm, 'decision:questions', $('.questions', decisionForm), {
    read: () => $$('.questions > *', decisionForm).map((q) => ({ id: $('.qid', q).value, type: $('.qtype', q).value, instructions: $('.qinstr', q).value, criteria: $('.qcriteria', q).value })),
    rebuild: (r) => addQuestion(decisionForm, r),
  });

  $('#model-filter').addEventListener('input', renderModelsTable);
  setupModelFilter($('#model-filter-editor'));

  applyProvider();
}

// Fills the URL, key and links for the chosen provider, clears the old model list and
// loads the new one when a key is available.
export function applyProvider() {
  const p = provider();
  $('#base-url').value = store.get(`base_${state.provider}`) || defaultBaseUrl(p);
  // A provider without a fixed URL (custom, a self-hosted gateway) can say what to enter.
  $('#base-url').placeholder = p.baseUrlHint || 'Base URL, e.g. http://localhost:11434/v1';
  const saved = store.get(`key_${state.provider}`);
  $('#api-key').value = state.keys[state.provider] ?? saved ?? '';
  $('#remember-key').checked = Boolean(saved);
  $$('.tabs button').forEach((b) => {
    const off = p.unsupported?.includes(b.dataset.tab);
    b.classList.toggle('unsupported', Boolean(off));
    b.title = off ? `${p.label} has no endpoint for this tab` : '';
  });

  state.models = [];
  loadModelFilter(); // each provider keeps its own model filter
  $('#models-raw').textContent = '';
  refreshPickers();
  renderModelsTable();

  const hasEnvKey = () => Boolean(state.config?.providers?.[state.provider]?.hasEnvKey);
  const showKeyHint = () => {
    $('#api-key').placeholder = hasEnvKey() ? `Using ${p.keyEnv} from server (optional override)` : `${p.label} API key (${p.keyHint})`;
  };
  showKeyHint();
  $('#models-status').textContent = 'No models loaded.';
  serverConfig.then((cfg) => {
    if (p !== provider()) return;
    showKeyHint();
    if (!cfg) $('#models-status').textContent = `No models loaded. Calling ${p.label} directly from the browser.`;
    updateChip(); // the server key, if any, is known now
    if (apiKey() || hasEnvKey()) loadModels();
  });
}

/* ------------------------------------------------------------------ */
/* Connection chip                                                     */
/* ------------------------------------------------------------------ */
// The chip in the top bar names the provider and host and shows the model status; it opens the
// panel with the provider, base URL and key. The status text itself is written by loadModels.
function setupConnectionChip() {
  const chip = $('#conn-chip');
  const panel = $('#conn-panel');
  chip.addEventListener('click', () => openConnection(panel.hidden));
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !e.target.closest('.conn')) openConnection(false);
  });
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) openConnection(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { openConnection(false); chip.focus(); }
  });
  new MutationObserver(updateChip).observe($('#models-status'), { childList: true, characterData: true, subtree: true });
  $('#base-url').addEventListener('input', updateChip);
  $('#api-key').addEventListener('input', updateChip);
}

function openConnection(open) {
  $('#conn-panel').hidden = !open;
  $('#conn-chip').setAttribute('aria-expanded', String(open));
}

function updateChip() {
  const p = provider();
  const status = $('#models-status');
  const text = status.textContent;
  let host = '';
  try { host = new URL(baseUrl()).host; } catch { /* no URL yet, or not a full URL */ }
  $('#conn-label').textContent = host ? `${p.label} · ${host}` : p.label;
  // Green needs a key as well as a model list: lists are often public, requests never are.
  const ready = keyReady();
  // Once a key is typed, the "add a key" message has done its job.
  if (ready && text.startsWith('Add an API key first')) { status.textContent = 'No models loaded. Press Load models.'; return; }
  const loading = text.startsWith('Loading');
  const [chipState, short] = loading ? ['loading', 'Loading…']
    : !ready ? ['', 'Add API key']
      : text.startsWith('Could not') ? ['err', 'Not connected']
        : state.models.length ? ['ok', `${state.models.length} models`] : ['', 'No models'];
  const btn = $('#key-form button');
  btn.disabled = loading || !ready;
  btn.title = ready ? '' : 'Type an API key first';
  $('#conn-chip').dataset.state = chipState;
  $('#conn-state').textContent = short;
  $('#conn-chip').title = `${p.label}: ${text}`;
  status.classList.toggle('err', chipState === 'err');
}

// "No key? Get one at …": the easiest provider (the default, first in providers/index.json) and the
// ones whose signup link is a referral (signup.referral in their file). The Providers tab has the rest.
function showSignupLinks(easiest, unavailable) {
  const links = Object.entries(PROVIDERS)
    .filter(([id, p]) => p.signup && (id === easiest || p.signup.referral))
    .map(([id, p]) => el('a', {
      href: p.signup.href, target: '_blank', rel: 'noopener',
      title: unavailable(p) ? p.needsServerReason : p.signup.text,
      text: id === easiest ? `${p.label} (easiest)` : unavailable(p) ? `${p.label} (needs your own server)` : p.label,
    }));
  $('#signup-links').replaceChildren(...links.flatMap((a, i) => (i ? [' · ', a] : [a])));
}

init();
