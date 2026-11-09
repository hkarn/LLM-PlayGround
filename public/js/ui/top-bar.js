/* LLM PlayGround: the top bar keeps to one line for as long as it can. As the window narrows it
   tries, in order, until everything sits on one line:
     1. short: drops the optional words (.opt: "models" in Filter models, the host in the chip,
        "Source on" in the GitHub link);
     2. menu: folds the tabs (Welcome … Filter) into one drop-down button named after the open tab;
     3. tight: also drops the model count from the chip and the GitHub link;
     4. tiny: a smaller title and no ☰ on the menu button.
   If even that wraps (a very narrow phone), the bar wraps after the title, with the menu on the left
   and the chip on the right below it, and is no longer pinned (.wrapped).
   The chip always shows the provider. It also keeps --masthead-h, the pinned bar's height, for
   scroll-padding and the tools' sticky settings panel. */
import { $, $$, el } from './dom.js';

const STEPS = ['short', 'menu', 'tight', 'tiny'];

export function setupTopBar() {
  const masthead = $('.masthead');
  const bar = $('.topbar');
  const nav = $('#nav-wrap');
  const menuBtn = $('#nav-menu');
  const title = $('h1', bar);

  // One line: every visible item's middle is level with the title's.
  const oneLine = () => {
    const mid = (r) => r.top + r.height / 2;
    const ref = mid(title.getBoundingClientRect());
    return [...bar.children].every((c) => {
      if (c === nav && bar.classList.contains('menu')) return true;
      const r = c.getBoundingClientRect();
      return !r.width || Math.abs(mid(r) - ref) < 12;
    });
  };
  const setHeight = () => document.documentElement.style.setProperty('--masthead-h',
    `${getComputedStyle(masthead).position === 'sticky' ? masthead.offsetHeight : 0}px`);
  let queued = false;
  const fit = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      bar.classList.remove(...STEPS, 'wrapped');
      masthead.classList.remove('wrapped');
      let ok = oneLine();
      for (const step of STEPS) {
        if (ok) break;
        bar.classList.add(step);
        ok = oneLine();
      }
      if (!ok) { bar.classList.add('wrapped'); masthead.classList.add('wrapped'); }
      if (!bar.classList.contains('menu')) openMenu(false);
      placeTesterRow();
      setHeight();
    });
  };

  // The API tester's endpoint tabs: a second row under the bar, or, once the tabs are folded into
  // the drop-down, a list that folds out from its "API tester" entry (to the right where there is
  // room, otherwise indented under it). The same buttons move; their click handlers come along.
  const testerRow = $('#tester-tabs');
  const testerToggle = $('#tester-toggle');
  const home = { parent: testerRow.parentNode, next: testerRow.nextSibling };
  const caret = () => { $('.caret', testerToggle).textContent = testerToggle.classList.contains('active') ? '▾' : '▸'; };
  function placeTesterRow() {
    if (bar.classList.contains('menu')) {
      if (testerRow.parentNode !== nav) testerToggle.after(testerRow);
    } else if (testerRow.parentNode !== home.parent) {
      home.parent.insertBefore(testerRow, home.next);
      nav.classList.remove('sub-open');
      caret();
    }
  }
  const openSub = (open) => {
    nav.classList.toggle('sub-open', open);
    $('.caret', testerToggle).textContent = open ? '▾' : '▸';
    if (!open) return;
    nav.classList.toggle('sub-below', window.innerWidth - nav.getBoundingClientRect().right < 180);
    testerRow.style.top = nav.classList.contains('sub-below') ? '' : `${testerToggle.offsetTop - 6}px`;
  };
  // In the drop-down, "API tester" opens its list instead of jumping to the last endpoint. Capture
  // at the button runs before main.js's handler, and stopping it also keeps the drop-down open.
  testerToggle.addEventListener('click', (e) => {
    if (!bar.classList.contains('menu')) return;
    e.stopImmediatePropagation();
    openSub(!nav.classList.contains('sub-open'));
  }, true);

  // The drop-down: the same tab buttons, shown as a list under the menu button. It opens with the
  // endpoint list folded out when an endpoint tab is open.
  const openMenu = (open) => {
    nav.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) { nav.style.left = `${menuBtn.offsetLeft}px`; openSub(testerToggle.classList.contains('active')); } else if (bar.classList.contains('menu')) openSub(false);
  };
  menuBtn.addEventListener('click', () => openMenu(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('button')) openMenu(false); });
  document.addEventListener('pointerdown', (e) => {
    if (nav.classList.contains('open') && !e.target.closest('#nav-wrap, #nav-menu')) openMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) { openMenu(false); menuBtn.focus(); }
  });
  // The menu button says which tab is open ("API tester" for an endpoint tab, whose own row shows
  // which endpoint).
  // Every label sits in the button, stacked in one grid cell with only the current one visible, so
  // the button is as wide as the longest and the bar looks the same whichever tab is open.
  const name = (b) => (b.id === 'tester-toggle' ? 'API tester'
    : [...b.childNodes].filter((n) => !n.classList?.contains('opt')).map((n) => n.textContent).join('').trim());
  const items = $$('.tabs button, #tester-toggle', nav);
  const current = $('.nav-current', menuBtn);
  current.replaceChildren(...items.map((b) => el('span', { text: name(b) })));
  const label = () => {
    const open = $('#tester-toggle').classList.contains('active') ? $('#tester-toggle') : items.find((b) => b.classList.contains('active'));
    items.forEach((b, i) => current.children[i].classList.toggle('on', b === open));
    fit();
  };
  // Watch only the tab buttons and the chip's text, not the bar's own classes (fit sets those).
  const watch = new MutationObserver(label);
  for (const b of $$('.tabs button, #tester-toggle', masthead)) watch.observe(b, { attributes: true, attributeFilter: ['class'] });
  watch.observe($('#conn-chip'), { subtree: true, childList: true, characterData: true });

  window.addEventListener('resize', fit);
  document.fonts?.ready.then(fit);
  label();
}
