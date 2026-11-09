/* LLM PlayGround: the theme toggle in the top bar. Auto follows the system's light or dark setting;
   Light and Dark override it for this site. The choice is kept in localStorage under "theme" and
   applied as data-theme on <html> (style.css reads it). A small script in index.html applies it
   before the page draws, so the page never flashes the other theme. Imports only dom. */
import { $ } from './dom.js';

const ORDER = ['auto', 'light', 'dark'];
const LABEL = { auto: 'Auto (follows your system)', light: 'Light', dark: 'Dark' };
const ICON = {
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  dark: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
};

const read = () => { try { return localStorage.getItem('theme'); } catch { return null; } };
const write = (t) => { try { if (t === 'auto') localStorage.removeItem('theme'); else localStorage.setItem('theme', t); } catch { /* storage blocked */ } };

// On a narrow screen the icon leaves the bar and the same choice shows as a "Theme: …" entry in the
// tab drop-down (.theme-item, shown by style.css at the top bar's tight step).
export function setupTheme() {
  const btn = $('#theme-toggle');
  if (!btn) return;
  const item = $('.theme-item');
  if (item) item.hidden = false;
  let theme = ORDER.includes(read()) ? read() : 'auto';
  const apply = () => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[theme]}</svg>`;
    btn.title = `Theme: ${LABEL[theme]}. Click for ${LABEL[next].split(' ')[0]}.`;
    btn.setAttribute('aria-label', `Theme: ${LABEL[theme]}`);
    if (item) item.textContent = `Theme: ${LABEL[theme].split(' ')[0]}`;
  };
  const cycle = () => {
    theme = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    write(theme);
    apply();
  };
  btn.addEventListener('click', cycle);
  item?.addEventListener('click', cycle);
  apply();
}
