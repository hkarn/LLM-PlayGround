/* LLM PlayGround: Start-up: wires the tabs, endpoint picker, forms and hubs. Loaded by index.html. */
import { read } from './adapter.js';
import { apiKey, baseUrl, defaultBaseUrl, loadModels, loadProviders, provider, PROVIDERS, renderModelsTable, serverConfig, state, store } from './core.js';
import { renderProviderGuide } from './providers-guide.js';
import { hubPanel, route, setHash, setupHubs, showTab } from './hubs.js';
import { addMessage, addQuestion, handlers, setupRecorder, setupRefImages, setupVoicePicker } from './testers.js';
import { $, $$, el } from './ui/dom.js';
import { keepDrafts, keepRows } from './ui/drafts.js';
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
  for (const p of Object.values(PROVIDERS).filter((x) => unavailable(x) && x.signup)) {
    $('#signup-link').after(el('a', { href: p.signup.href, target: '_blank', rel: 'noopener', title: p.needsServerReason, text: `${p.label}: get a key (needs your own server)` }));
  }
  state.provider = Object.keys(PROVIDERS).find((id) => !unavailable(PROVIDERS[id]));
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
  renderProviderGuide($('[data-panel=providers]'), {
    unavailable,
    choose: (id) => {
      providerSelect.value = id;
      providerSelect.dispatchEvent(new Event('change'));
      $('#api-key').focus();
    },
  });
  $('#key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('#remember-key').checked && apiKey()) store.set(keyName(), apiKey()); else store.del(keyName());
    loadModels();
  });
  $('#remember-key').addEventListener('change', (e) => { if (!e.target.checked) store.del(keyName()); });

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
  const link = $('#signup-link');
  link.hidden = !p.signup;
  if (p.signup) { link.href = p.signup.href; link.textContent = p.signup.text; }
  $$('.tabs button').forEach((b) => {
    const off = p.unsupported?.includes(b.dataset.tab);
    b.classList.toggle('unsupported', Boolean(off));
    b.title = off ? `${p.label} has no endpoint for this tab` : '';
  });

  state.models = [];
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
    if (apiKey() || hasEnvKey()) loadModels();
  });
}

init();
