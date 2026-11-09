/* LLM PlayGround: the Providers tab. Explains each provider's setup from the `guide` in its
   providers/<id>.json file, with its sign-up link and a button that picks it in the top bar. */
import { PROVIDERS, state } from './core.js';
import { el } from './ui/dom.js';

// container: the panel. unavailable(p): true when p cannot work on this page (needsServer on a
// static host). choose(id): picks a provider in the top bar.
export function renderProviderGuide(container, { unavailable, choose }) {
  const cards = Object.entries(PROVIDERS).filter(([, p]) => p.guide).map(([id, p]) => {
    const g = p.guide;
    const off = unavailable(p);
    const list = (title, items) => items?.length ? el('div', {}, [el('strong', { text: title }), el('ul', {}, items.map((t) => el('li', { text: t })))]) : null;
    const pick = el('button', { type: 'button', text: id === state.provider ? 'In use' : 'Use this one', disabled: off || undefined, title: off ? p.needsServerReason : undefined });
    pick.addEventListener('click', () => choose(id));
    pick.dataset.provider = id;
    return el('article', { class: `provider-card${off ? ' off' : ''}` }, [
      el('div', { class: 'provider-head' }, [
        el('h3', { text: p.label }),
        el('span', { class: 'ease', title: `Setup: ${g.level} of 4 (1 is easiest)` }, [
          el('span', { class: 'dots', 'aria-hidden': 'true', text: '●'.repeat(g.level) + '○'.repeat(4 - g.level) }),
          ` ${g.ease}`,
        ]),
      ]),
      el('p', { text: g.summary }),
      el('ol', {}, g.steps.map((t) => el('li', { text: t }))),
      list('Good', g.good),
      list('Watch out', g.watch),
      el('div', { class: 'row' }, [
        p.signup ? el('a', { class: 'button-link', href: p.signup.href, target: '_blank', rel: 'noopener', text: p.signup.text }) : null,
        pick,
      ].filter(Boolean)),
    ].filter(Boolean));
  });
  container.replaceChildren(
    el('div', { class: 'providers-intro' }, [
      el('h2', { text: 'Pick a provider' }),
      el('p', { text: 'Everything here runs on your own API key from one of these providers. Get a key, paste it at the top and press Load models. The key is kept only in your browser and sent only to the provider you pick: directly from the page, or through your own server when you run one (Docker or node server.js), which passes it on without storing it.' }),
    ]),
    el('div', { class: 'provider-cards' }, cards),
  );
  // Keep the "In use" button in step with the top bar.
  document.getElementById('provider').addEventListener('change', () => {
    container.querySelectorAll('button[data-provider]').forEach((b) => { b.textContent = b.dataset.provider === state.provider ? 'In use' : 'Use this one'; });
  });
}
