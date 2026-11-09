/* LLM PlayGround: Games and Tools hubs (icon launcher, apps list) and direct links (#tab, #hub, #hub/app-id). */
import { fill } from './adapter.js';
import { renderDreamGenScene } from './apps/dreamgen-scene.js';
import { renderDreamGenVideo } from './apps/dreamgen-video.js';
import { renderGroupChat } from './apps/group-chat.js';
import { renderVideoGenerator } from './apps/video-generator.js';
import { store } from './core.js';
import { $, $$, el } from './ui/dom.js';

/* ------------------------------------------------------------------ */
/* Games and Tools                                                     */
/* ------------------------------------------------------------------ */
// Each hub tab shows a launcher of icon cards. Opening one fills the page under the tab bar.
// An app is { id, title, blurb, icon (inline SVG), status?, render(container) }.
export const svgIcon = (paths) => {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  return wrap.firstElementChild;
};
export const ICONS = {
  groupChat: '<path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M17 9h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-4a2 2 0 0 1-2-2v-1"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>',
  scene: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  sceneVideo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/><path d="M3 9h2M3 15h2M19 9h2M19 15h2"/>',
};

export const HUBS = {
  games: { title: 'Games', blurb: 'Small games and experiments played with LLMs.' },
  tools: { title: 'Tools', blurb: 'Focused tools built on the endpoints, with only the options we have checked.' },
};

export const APPS = {
  games: [
    { id: 'group-chat', title: 'AI Group Chat', icon: ICONS.groupChat, status: 'Prototype',
      blurb: 'Several AI characters, each on its own model, chat with you and with each other.', render: renderGroupChat },
  ],
  tools: [
    { id: 'dreamgen-scene', title: 'Draw the DreamGen Scene', icon: ICONS.scene,
      blurb: 'Turn the last scene of a DreamGen session export into an image prompt, add reference portraits, and draw it.', render: renderDreamGenScene },
    { id: 'dreamgen-video', title: 'Animate the DreamGen Scene', icon: ICONS.sceneVideo,
      blurb: 'Turn a scene picture into a short clip, with motion written from the last scene of the session.', render: renderDreamGenVideo },
    { id: 'video-generator', title: 'Video Generator', icon: ICONS.video,
      blurb: 'Make short clips with video models we have tested, each with its own settings and the price shown first.', render: renderVideoGenerator },
  ],
};

export function setupHubs() {
  for (const panel of $$('.panel.hub')) {
    const hub = panel.dataset.hub;
    const showLauncher = () => {
      store.del(`app_${hub}`);
      panel._app = null;
      setHash(hub);
      panel.replaceChildren(
        el('div', { class: 'hub-head' }, el('h2', { text: HUBS[hub].title }), el('span', { class: 'muted', text: HUBS[hub].blurb })),
        el('div', { class: 'launcher' },
          ...APPS[hub].map((app) => el('button', { type: 'button', class: 'app-card', onclick: () => openApp(app) },
            el('span', { class: 'app-icon' }, svgIcon(app.icon)),
            el('strong', { text: app.title }),
            el('span', { class: 'muted small', text: app.blurb }),
            app.status ? el('span', { class: 'tag', text: app.status }) : null)),
          el('div', { class: 'app-card soon' }, el('strong', { text: 'More to come' }), el('span', { class: 'small', text: 'New ideas land here.' }))));
    };
    const openApp = (app) => {
      store.set(`app_${hub}`, app.id);
      setHash(`${hub}/${app.id}`);
      if (panel._app === app.id) return; // already open: keep its state
      panel._app = app.id;
      const body = el('div', { class: 'app-view' });
      panel.replaceChildren(
        el('div', { class: 'hub-head' },
          el('button', { type: 'button', class: 'secondary', text: `← All ${HUBS[hub].title.toLowerCase()}`, onclick: showLauncher }),
          el('h2', { text: app.title }),
          app.status ? el('span', { class: 'tag', text: app.status }) : null),
        body);
      app.render(body);
    };
    // Route to "#hub" (launcher) or "#hub/app-id" (that app).
    panel._show = (appId) => {
      const app = APPS[hub].find((a) => a.id === appId);
      if (app) openApp(app); else showLauncher();
    };
    const saved = APPS[hub].find((a) => a.id === store.get(`app_${hub}`));
    const quiet = hashLock++;
    if (saved) openApp(saved); else showLauncher();
    hashLock = quiet;
  }
}

/* ------------------------------------------------------------------ */
/* Direct links                                                        */
/* ------------------------------------------------------------------ */
// "#chat", "#image" … open a tab; "#tools" or "#games" a hub's launcher; "#tools/<app-id>"
// opens that app. The hash follows clicks, and the browser's back button works through it.
export let hashLock = 0; // while > 0, navigation does not write the hash (start-up, routing)
export function setHash(h) {
  if (hashLock || location.hash === `#${h}`) return;
  location.hash = h;
}
// The hash is whatever the user typed or linked, so tabs and hubs are found by comparing
// values, never by building a selector from it.
export const tabButton = (tab) => $$('.tabs button').find((b) => b.dataset.tab === tab);
export const hubPanel = (hub) => $$('.panel.hub').find((x) => x.dataset.hub === hub);
export function showTab(tab) {
  const btn = tabButton(tab);
  if (!btn) return false;
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  $$('.panel').forEach((x) => x.classList.toggle('active', x.dataset.panel === tab));
  store.set('tab', tab);
  // The endpoint tabs (API tester) fold into one toggle in the top bar and show while one is open.
  const inTester = Boolean(btn.closest('#tester-tabs'));
  $('#tester-tabs').hidden = !inTester;
  const toggle = $('#tester-toggle');
  toggle.classList.toggle('active', inTester);
  toggle.setAttribute('aria-expanded', String(inTester));
  $('.caret', toggle).textContent = inTester ? '▾' : '▸';
  if (inTester) store.set('testerTab', tab);
  return true;
}
export function route() {
  let path;
  try { path = decodeURIComponent(location.hash.slice(1)); } catch { return false; } // e.g. "#%": not one of our links
  const [tab, appId] = path.split('/');
  if (!tab) return false;
  hashLock += 1;
  try {
    if (!showTab(tab)) return false;
    const hub = hubPanel(tab);
    if (hub?._show) hub._show(appId);
    return true;
  } finally {
    hashLock -= 1;
  }
}
