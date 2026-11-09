/* LLM PlayGround: the welcome page (the Providers tab, the first tab). Says what the site is, links
   the tools and games, and explains each provider's setup from the `guide` in its
   providers/<id>.json file, with its sign-up link and a button that picks it in the top bar. */
import { PROVIDERS, state } from './core.js';
import { el } from './ui/dom.js';

const REPO = 'https://github.com/hkarn/LLM-PlayGround';

// container: the panel. unavailable(p): true when p cannot work on this page (needsServer on a
// static host). choose(id): picks a provider in the top bar. apps: [{ href, title, blurb, icon,
// status?, video? }] for the "What you can do" cards; icon(paths) draws an app's icon.
export function renderProviderGuide(container, { unavailable, choose, apps = [], icon }) {
  // Video tools need a provider file with tested video models (videoModels); today only OpenRouter.
  const videoRouters = Object.values(PROVIDERS).filter((p) => p.videoModels).map((p) => p.label);
  const videoNote = videoRouters.length
    ? `Video works only with ${videoRouters.join(' or ')} for now; the other providers here have no video models.`
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

  container.replaceChildren(
    el('div', { class: 'welcome' }, [
      el('section', { class: 'welcome-hero' }, [
        el('h2', { text: 'Welcome to LLM PlayGround' }),
        el('p', { text: 'A playground for AI models reached through routers such as OpenRouter and Requesty: try any model on the raw API endpoints, and use a few tools and games built on them. It runs in your browser on your own API key.' }),
      ]),
      el('section', { class: 'welcome-start' }, [
        el('h3', { text: 'Getting started' }),
        el('ol', {}, [
          el('li', {}, [toProviders, ' and get an API key from it', easiest ? `; ${easiest.label} is the easiest start.` : '.']),
          el('li', { text: 'Open the connection chip at the top right, paste the key and press Load models.' }),
          el('li', { text: 'Pick a tool or game below, or try any model in the API tester.' }),
        ]),
        videoNote ? el('p', { class: 'muted', text: videoNote }) : null,
      ].filter(Boolean)),
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
