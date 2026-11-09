/* LLM PlayGround: the welcome page (the Providers tab, the first tab). Says what the site is, links
   the tools and games, and explains each provider's setup from the `guide` in its
   providers/<id>.json file, with its sign-up link and a button that picks it in the top bar. */
import { keyReady, PROVIDERS, state } from './core.js';
import { el } from './ui/dom.js';

const REPO = 'https://github.com/hkarn/LLM-PlayGround';

// container: the panel. unavailable(p): true when p cannot work on this page (needsServer on a
// static host). choose(id): picks a provider in the top bar. apps: [{ href, title, blurb, icon,
// status?, video? }] for the "What you can do" cards; icon(paths) draws an app's icon.
export function renderProviderGuide(container, { unavailable, choose, apps = [], icon }) {
  // Video: the providers with tested video models (videoModels, today OpenRouter) first, then any
  // other whose file doesn't mark video unsupported (LLM Gateway: its models, untested).
  const videoRouters = Object.values(PROVIDERS).filter((p) => p.videoModels).map((p) => p.label);
  const videoUntested = Object.values(PROVIDERS)
    .filter((p) => !p.videoModels && !p.unsupported?.includes('video') && !p.keyOptional && !p.extends)
    .map((p) => `${p.label}${p.needsServer ? ' (through your own server)' : ''}`);
  const videoNote = videoRouters.length
    ? `Video works with ${videoRouters.join(' or ')}${videoUntested.length ? `, and with ${videoUntested.join(' or ')}, whose video models are untested here` : ''}. The other providers have no video.`
    : '';
  const easiest = Object.values(PROVIDERS).find((p) => p.guide && !unavailable(p));

  const card = (a) => el('a', { class: 'app-card', href: a.href },
    a.icon && icon ? el('span', { class: 'app-icon' }, icon(a.icon)) : null,
    el('strong', { text: a.title }),
    el('span', { class: 'muted small', text: a.blurb }),
    a.video && videoRouters.length ? el('span', { class: 'tag', text: `Video: ${videoRouters.join(', ')}` }) : null,
    a.status ? el('span', { class: 'tag', text: a.status }) : null);

  const providerCards = Object.entries(PROVIDERS).filter(([, p]) => p.guide).map(([id, p]) => {
    const g = p.guide;
    const off = unavailable(p);
    const list = (title, items) => items?.length ? el('div', {}, [el('strong', { text: title }), el('ul', {}, items.map((t) => el('li', { text: t })))]) : null;
    const pick = el('button', { type: 'button', text: id === state.provider ? 'In use' : 'Use this one', disabled: off || undefined, title: off ? p.needsServerReason : undefined });
    pick.addEventListener('click', () => choose(id));
    pick.dataset.provider = id;
    return el('article', { class: `provider-card${off ? ' off' : ''}` }, [
      el('div', { class: 'provider-main' }, [
        el('div', { class: 'provider-head' }, [
          el('h3', {}, [p.label, p.videoModels ? el('span', { class: 'tag', text: 'Video' }) : null].filter(Boolean)),
          el('span', { class: 'ease', title: `Setup: ${g.level} of 4 (1 is easiest)` }, [
            el('span', { class: 'dots', 'aria-hidden': 'true', text: '●'.repeat(g.level) + '○'.repeat(4 - g.level) }),
            ` ${g.ease}`,
          ]),
        ]),
        el('p', { text: g.summary }),
        el('div', { class: 'row' }, [
          p.signup ? el('a', { class: 'button-link', href: p.signup.href, target: '_blank', rel: 'noopener', text: p.signup.text }) : null,
          pick,
        ].filter(Boolean)),
      ]),
      el('div', { class: 'provider-steps' }, [el('strong', { text: 'Setup' }), el('ol', {}, g.steps.map((t) => el('li', { text: t })))]),
      el('div', { class: 'provider-notes' }, [list('Good', g.good), list('Watch out', g.watch)].filter(Boolean)),
    ]);
  });

  const toProviders = el('a', { href: '#provider-list', text: 'Pick a provider below' });
  toProviders.addEventListener('click', (e) => {
    e.preventDefault(); // keep the hash for the tab routes
    container.querySelector('#provider-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Getting started follows the connection: the steps with the ones done ticked and the next one
  // marked while there is no key or model list, and "You're set" (steps folded) once both are in.
  const start = el('section', { class: 'welcome-start' });
  const openChip = el('button', { type: 'button', class: 'link-btn', text: 'Open the connection chip',
    onclick: () => { const chip = document.getElementById('conn-chip'); if (chip?.getAttribute('aria-expanded') !== 'true') chip?.click(); document.getElementById('api-key')?.focus(); } });
  const drawStart = () => {
    const p = PROVIDERS[state.provider];
    const hasKey = keyReady();
    const loaded = hasKey && state.models.length > 0;
    const step = (done, current, ...children) => el('li', { class: done ? 'done' : current ? 'current' : '' },
      done ? el('span', { class: 'tick', 'aria-label': 'done', text: '✓ ' }) : null, ...children);
    const steps = el('ol', {}, [
      // A provider that needs no key (keyOptional, e.g. Custom) has nothing to get: its step says so.
      p?.keyOptional
        ? step(true, false, toProviders, `; ${p.label} needs no API key, only its address (base URL) in the connection chip.`)
        : step(hasKey, !hasKey, toProviders, ' and get an API key from it', easiest ? `; ${easiest.label} is the easiest start.` : '.'),
      step(loaded, hasKey && !loaded, openChip, hasKey ? ' and press Load models.' : ' at the top right, paste the key and press Load models.'),
      step(false, loaded, 'Pick a tool or game below, or try any model in the API tester.'),
    ]);
    const note = videoNote ? el('p', { class: 'muted', text: videoNote }) : null;
    start.classList.toggle('ready', loaded);
    start.replaceChildren(...(loaded
      ? [el('h3', { text: 'You\'re set' }),
        el('p', {}, `Connected to ${p?.label || state.provider} with ${state.models.length.toLocaleString()} models. Pick a tool or game below, or try any model in the `, el('a', { href: '#chat', text: 'API tester' }), '.'),
        el('details', {}, el('summary', { text: 'Getting started' }), steps), note]
      : [el('h3', { text: 'Getting started' }), steps, note]).filter(Boolean));
  };
  drawStart();
  document.addEventListener('models-changed', drawStart);
  document.getElementById('provider')?.addEventListener('change', () => setTimeout(drawStart));
  document.getElementById('api-key')?.addEventListener('input', drawStart);
  // The connection status line changes on every load (started, failed, done), also when a saved key
  // is put back at start-up without an input event, so the steps follow that too.
  const status = document.getElementById('models-status');
  if (status) new MutationObserver(drawStart).observe(status, { childList: true, characterData: true, subtree: true });

  container.replaceChildren(
    el('div', { class: 'welcome' }, [
      el('section', { class: 'welcome-hero' }, [
        el('h2', { text: 'Welcome to LLM PlayGround' }),
        el('p', { text: 'A playground for AI models reached through routers such as OpenRouter and Requesty: try any model on the raw API endpoints, and use a few tools and games built on them. It runs in your browser on your own API key.' }),
      ]),
      start,
      el('section', {}, [
        el('h3', { text: 'What you can do' }),
        el('div', { class: 'launcher' }, apps.map(card)),
      ]),
      el('section', { class: 'welcome-privacy' }, [
        el('h3', { text: 'Privacy' }),
        el('p', { text: 'Nothing is sent anywhere but your own requests to the provider you pick, and the key stays in your browser. When you run your own server (Docker or node server.js), it passes requests on without storing or logging them. No analytics, no outside resources.' }),
        el('p', { class: 'small' }, [
          el('a', { href: `${REPO}/tree/main/docs/guides`, target: '_blank', rel: 'noopener', text: 'User guides' }),
          ' · ',
          el('a', { href: REPO, target: '_blank', rel: 'noopener', text: 'Source on GitHub' }),
        ]),
      ]),
      el('section', { id: 'provider-list' }, [
        el('div', { class: 'providers-intro' }, [
          el('h2', { text: 'Pick a provider' }),
          el('p', { text: 'Everything here runs on your own API key from one of these providers. The key is kept only in your browser and sent only to the provider you pick: directly from the page, or through your own server when you run one, which passes it on without storing it.' }),
        ]),
        el('div', { class: 'provider-cards' }, providerCards),
      ]),
    ]),
  );
  // Keep the "In use" button in step with the top bar.
  document.getElementById('provider').addEventListener('change', () => {
    container.querySelectorAll('button[data-provider]').forEach((b) => { b.textContent = b.dataset.provider === state.provider ? 'In use' : 'Use this one'; });
  });
}
