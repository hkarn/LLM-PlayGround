/* LLM PlayGround: UI component: the video jobs of the Video Generator and Animate the DreamGen Scene.
   A job is saved here the moment the provider takes it (id, provider, tool, model, prompt and
   settings; no picture or video data), then watched in the background, so the form is free for the
   next clip, a job keeps going while you use another page, and a reload picks it up again from its
   id. The list sits in each video tool's settings panel. The Video tab, the raw tester, doesn't use
   this. Kept only in this browser (localStorage "tools:videojobs"). */
import { keyReady, PROVIDERS, state, store } from '../core.js';
import { el } from './dom.js';
import { downloadVideo, JOB_DONE, priceTag, submitVideoJob, watchVideoJob } from './video-job.js';

const KEY = 'tools:videojobs';
const OLD_KEY = 'videogen:jobs'; // the Video Generator's clip list before this list
const MAX = 30;
const TOOLS = { 'video-generator': 'Video Generator', 'dreamgen-video': 'Animate the DreamGen Scene' };

const clips = new Map(); // job id → object URL of the video, for this page session
const watching = new Map(); // job id → { ac, done } while it is being checked
const finished = new Map(); // job id → resolve(result) for a tool waiting on a job it started

/* ---- The saved list ---- */
function load() {
  try {
    const list = JSON.parse(store.get(KEY) || 'null');
    if (Array.isArray(list)) return list;
  } catch { /* fall through */ }
  // First run: bring the Video Generator's finished clips over, so none are lost.
  let old = [];
  try { old = JSON.parse(store.get(OLD_KEY) || '[]'); } catch { /* none */ }
  const moved = (Array.isArray(old) ? old : []).map((e) => ({ ...e, tool: 'video-generator', status: 'completed', seen: true }));
  store.set(KEY, JSON.stringify(moved));
  store.del(OLD_KEY);
  return moved;
}
function save(list) {
  const kept = list.slice(0, MAX);
  store.set(KEY, JSON.stringify(kept));
  // Free the video of every job no longer on the list (a Blob of a megabyte or more each).
  for (const [id, url] of clips) {
    if (!kept.some((j) => j.id === id)) { URL.revokeObjectURL(url); clips.delete(id); }
  }
  document.dispatchEvent(new CustomEvent('video-jobs'));
}
const update = (id, patch) => save(load().map((j) => (j.id === id ? { ...j, ...patch } : j)));
const isRunning = (j) => !JOB_DONE.includes(j.status) && j.status !== 'stopped' && !j.error;

// For a tool's folded Settings line: "2 videos running", "1 video ready".
export function videoJobsLine() {
  const list = load().filter((j) => j.provider === state.provider);
  const running = list.filter(isRunning).length;
  const ready = list.filter((j) => j.status === 'completed' && !j.seen).length;
  return [running && `${running} video${running > 1 ? 's' : ''} running`, ready && `${ready} video${ready > 1 ? 's' : ''} ready`].filter(Boolean).join(' · ');
}

/* ---- Sending and watching ---- */
// Sends a job and saves it. meta: { tool, label, est, signal }. Returns what submitVideoJob does,
// plus done: a promise of the finished job ({ ok, blob, url, cost, seconds, error }) for a tool
// that wants to show it in its own step.
export async function startVideoJob(input, { tool, label, est, signal } = {}) {
  const sent = await submitVideoJob(input, { signal });
  if (!sent.ok) return sent;
  const entry = {
    id: sent.id, provider: state.provider, tool, model: input.model, label, prompt: input.prompt,
    duration: input.duration, resolution: input.resolution, aspect_ratio: input.aspect_ratio,
    est: est ? { usd: est.usd, approx: est.approx, listed: est.listedUsd } : undefined,
    status: sent.job.status || 'submitted', at: Date.now(),
  };
  save([entry, ...load().filter((j) => j.id !== entry.id)]);
  const done = new Promise((resolve) => finished.set(entry.id, resolve));
  watch(entry.id);
  return { ...sent, done };
}

function watch(id) {
  const j = load().find((x) => x.id === id);
  if (!j || watching.has(id) || j.provider !== state.provider) return;
  const ac = new AbortController();
  const done = (async () => {
    update(id, { error: undefined, status: JOB_DONE.includes(j.status) ? 'submitted' : j.status });
    const r = await watchVideoJob(id, { signal: ac.signal, since: j.at, onStatus: (job) => update(id, { status: job.status || 'submitted' }) })
      .catch((err) => ({ ok: false, id, error: err.message, aborted: err?.name === 'AbortError' }));
    watching.delete(id);
    if (r.aborted) return r; // stopped watching, or the provider changed: the job keeps its state
    if (r.ok && r.blob) {
      const url = URL.createObjectURL(r.blob);
      clips.set(id, url);
      update(id, { status: 'completed', cost: r.cost, seconds: r.seconds, seen: false });
      r.url = url;
    } else {
      update(id, { status: r.status || load().find((x) => x.id === id)?.status, error: r.error || 'The job failed.', cost: r.cost, seconds: r.seconds });
    }
    finished.get(id)?.(r);
    finished.delete(id);
    return r;
  })();
  watching.set(id, { ac, done });
}

// Picks up every unfinished job made on the chosen provider, and pauses the others: a job id
// only works with the provider that made it. Called at start-up and on a provider switch.
export function resumeVideoJobs() {
  if (!keyReady()) return; // without a key every check would fail; models loading tries again
  for (const [id, w] of watching) {
    if (load().find((j) => j.id === id)?.provider !== state.provider) w.ac.abort();
  }
  for (const j of load()) if (isRunning(j) && j.provider === state.provider) watch(j.id);
  document.dispatchEvent(new CustomEvent('video-jobs'));
}
let started = false;
export function startWatchingVideoJobs() {
  if (started) return;
  started = true;
  document.getElementById('provider')?.addEventListener('change', () => setTimeout(resumeVideoJobs));
  document.addEventListener('models-changed', () => setTimeout(resumeVideoJobs));
  resumeVideoJobs();
}

/* ---- The list ---- */
// The provider's status words, as a user would say them.
const STATUS = { submitted: 'Sent', pending: 'Waiting in line', queued: 'Waiting in line', in_progress: 'Running', processing: 'Running' };
const ago = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

// The jobs list for a tool's settings panel. Redraws on any change, and each second while a job runs.
export function videoJobsList() {
  const root = el('div', { class: 'vj-list' });
  let timer = null;
  const draw = () => {
    const list = load();
    // Seen once the list is on screen (on a narrow screen the panel may be folded away).
    if (root.offsetParent && list.some((j) => j.status === 'completed' && !j.seen && j.provider === state.provider)) {
      store.set(KEY, JSON.stringify(list.map((j) => (j.status === 'completed' && j.provider === state.provider ? { ...j, seen: true } : j))));
      // Tell the tool's folded Settings line ("1 video ready") once this draw is done.
      setTimeout(() => document.dispatchEvent(new CustomEvent('video-jobs')));
    }
    root.replaceChildren(...(list.length ? list.map(row) : [el('p', { class: 'muted small', text: 'No video jobs yet. A clip you make shows here while it runs and after it is done.' })]));
    clearTimeout(timer);
    if (root.isConnected && list.some((j) => isRunning(j) && watching.has(j.id))) timer = setTimeout(draw, 1000);
  };
  const row = (j) => {
    const here = j.provider === state.provider;
    const url = clips.get(j.id);
    const running = isRunning(j);
    const status = j.status === 'completed' ? 'Done'
      : j.status === 'stopped' ? 'Not watched'
        : j.error ? (JOB_DONE.includes(j.status) ? `Ended: ${j.status}` : 'Check failed')
          : !here ? 'Waiting (other provider)'
            : `${STATUS[j.status] || 'Running'} · ${ago(Date.now() - j.at)}`;
    const buttons = [];
    if (running && here && watching.has(j.id)) {
      buttons.push(el('button', { type: 'button', class: 'secondary small-btn', text: 'Stop watching',
        title: 'Stops checking this job here. The provider may still finish it and bill for it.',
        onclick: () => { watching.get(j.id)?.ac.abort(); update(j.id, { status: 'stopped' }); } }));
    }
    if (here && (j.status === 'stopped' || (j.error && !JOB_DONE.includes(j.status)))) {
      buttons.push(el('button', { type: 'button', class: 'secondary small-btn', text: 'Check again', onclick: () => { update(j.id, { error: undefined, status: 'submitted' }); watch(j.id); } }));
    }
    if (j.status === 'completed' && !url && here) {
      const again = el('button', { type: 'button', class: 'secondary small-btn', text: 'Fetch the video again',
        title: 'The provider keeps a finished video for a while, so this costs nothing.',
        onclick: async () => {
          again.disabled = true;
          const v = await downloadVideo(j.id).catch((err) => ({ ok: false, error: err.message }));
          if (v.ok) { clips.set(j.id, URL.createObjectURL(v.blob)); draw(); } else again.replaceWith(el('span', { class: 'error small', text: v.error }));
        } });
      buttons.push(again);
    }
    return el('div', { class: `vj-row${running ? ' running' : ''}${j.error ? ' failed' : ''}` },
      el('div', { class: 'vj-head' },
        el('strong', { text: j.label || j.model }),
        el('span', { class: 'muted small', text: [TOOLS[j.tool], new Date(j.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })].filter(Boolean).join(' · ') }),
        el('button', { type: 'button', class: 'icon-btn', title: 'Remove from the list', 'aria-label': 'Remove from the list', text: '×',
          onclick: () => { watching.get(j.id)?.ac.abort(); save(load().filter((x) => x.id !== j.id)); } })),
      url ? el('video', { controls: '', src: url, muted: '', loop: '', playsinline: '' }) : null,
      el('div', { class: 'small' }, el('span', { class: `vj-status${running ? ' live' : ''}`, text: status }),
        j.cost != null ? ' · ' : '', j.cost != null ? priceTag(Number(j.cost), { amount: Number(j.cost) }) : null,
        [j.duration && ` · ${j.duration} s`, j.resolution && ` · ${j.resolution}`].filter(Boolean).join('')),
      j.error ? el('div', { class: 'error small', text: j.error }) : null,
      !here ? el('div', { class: 'muted small', text: `Made on ${PROVIDERS[j.provider]?.label || j.provider}: switch to it to check or fetch it.` }) : null,
      el('div', { class: 'muted small vj-prompt', text: j.prompt || '' }),
      (buttons.length || url) ? el('div', { class: 'row' }, ...buttons, url ? el('a', { href: url, download: `video-${j.id}.mp4`, text: 'Download' }) : null) : null);
  };
  // A tool drawn again leaves its old list behind: that one stops listening once it is off the page.
  let shown = false;
  const onChange = () => {
    if (root.isConnected) { shown = true; draw(); } else if (shown) document.removeEventListener('video-jobs', onChange);
  };
  document.addEventListener('video-jobs', onChange);
  // Opening the folded settings panel (narrow screen) shows the list: draw it then, which also marks
  // finished clips as seen.
  new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) draw(); }).observe(root);
  draw();
  // Drawn into the panel after this returns: draw again once it is on the page.
  setTimeout(() => { shown = root.isConnected; draw(); });
  return root;
}
