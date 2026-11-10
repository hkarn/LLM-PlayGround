/* LLM PlayGround: UI component: video jobs. Sends a job through the adapter's `video` kind, then
   watches it (poll, download) from its id (ui/video-jobs.js keeps the list), and estimates its price from the model's pricing_skus (OpenRouter /videos/models).
   Used by the Video Generator and Animate the DreamGen Scene; the Video tab keeps its own raw handler. */
import { follow, read, send } from '../adapter.js';
import { errorMessage } from '../core/api.js';
import { el } from './dom.js';
import { framePngOrJpeg } from './frame-image.js';
import { wait } from './run-step.js';

export const JOB_DONE = ['completed', 'failed', 'cancelled', 'expired'];

// input: { model, prompt, duration, resolution, aspect_ratio, generate_audio, first_frame, last_frame }
// with the frames as Files (or Blobs).
// Sends a job and returns as soon as the provider has taken it: { ok, id, job, notes, resp, request,
// curl, error }. The video tools then watch it in the background (ui/video-jobs.js), so the form is
// free for the next clip.
export async function submitVideoJob(input, { signal } = {}) {
  const notes = [];
  const frames = {};
  for (const key of ['first_frame', 'last_frame']) {
    if (!input[key]) continue;
    const { file, note } = await framePngOrJpeg(input[key]);
    frames[key] = [file];
    if (note) notes.push(note);
  }
  const { resp, request, curl } = await send('video', { ...input, ...frames }, { signal });
  const job = read('video', resp);
  if (!resp.ok || !job.id) return { ok: false, notes, request, curl, resp, error: errorMessage(resp) };
  return { ok: true, id: job.id, job, notes, request, curl, resp };
}

// Checks a job every 5 s until it ends, then downloads the video. Works from the id alone, so it can
// pick a job up again after a reload (on the provider that made it). since: when the job started (ms).
// Returns { ok, id, status, blob, cost, seconds, error, resp }.
export async function watchVideoJob(id, { signal, since = Date.now(), onStatus } = {}) {
  const seconds = () => Math.round((Date.now() - since) / 1000);
  let job = { id, status: '' };
  let resp;
  while (!JOB_DONE.includes(job.status)) {
    if (resp) await wait(5000, signal); // the first check goes at once (a job picked up after a reload)
    resp = await follow('video', 'poll', { id }, { signal });
    if (!resp.ok) return { ok: false, id, resp, seconds: seconds(), error: errorMessage(resp) };
    job = read('video', resp);
    onStatus?.(job, seconds());
  }
  if (job.status !== 'completed') {
    const why = job.error ? (typeof job.error === 'string' ? job.error : job.error.message || JSON.stringify(job.error)) : '';
    return { ok: false, id, status: job.status, cost: job.cost, resp, seconds: seconds(), error: `Job ${job.status}${why ? `: ${why}` : ''}` };
  }
  const video = await downloadVideo(id, { signal });
  return { ...video, id, status: job.status, cost: job.cost, resp, seconds: seconds() };
}

// The finished video of a job. A provider keeps it for a while after the job, so a download can be
// repeated without paying again.
export async function downloadVideo(id, { signal } = {}) {
  const video = await follow('video', 'content', { id }, { signal });
  if (video.ok && video.blob) return { ok: true, blob: video.blob };
  return { ok: false, error: `The job finished but the video download failed: ${errorMessage(video)}` };
}

/* ------------------------------------------------------------------ */
/* Price estimate                                                      */
/* ------------------------------------------------------------------ */
// pricing_skus keys seen on OpenRouter (2026-11): dollars per second (duration_seconds,
// duration_seconds_480p, duration_seconds_with_audio_720p, image_to_video_duration_seconds_720p …),
// cents per second (cents_per_video_output_second_480p, cents_per_second_output_2k …), dollars per
// video token (video_tokens, video_tokens_without_audio), and extras (cents_per_image_input,
// minimum_cents_per_generation). A key ending in a resolution wins over the plain one.
// Returns { usd, approx, basis } or null when the model's prices don't fit these shapes.
export function estimateVideoCost(model, { duration, resolution, aspect_ratio: aspect, generate_audio: audio, frames = 0 } = {}) {
  const skus = {};
  for (const [k, v] of Object.entries(model?.pricing_skus || {})) if (Number.isFinite(Number(v))) skus[k.toLowerCase()] = Number(v);
  if (!Object.keys(skus).length || !duration) return null;
  const res = String(resolution || '').toLowerCase();
  const at = (key) => (res && skus[`${key}_${res}`] !== undefined ? skus[`${key}_${res}`] : skus[key]);
  const resText = res ? ` at ${res}` : '';
  let perSecond;
  let basis;
  const mode = frames ? 'image_to_video' : 'text_to_video';
  // With audio on, a with-audio price wins over the plain per-mode one: Kling 3.0 lists
  // image_to_video_duration_seconds_720p (no audio) beside duration_seconds_with_audio.
  const order = audio
    ? ['duration_seconds_with_audio', `${mode}_duration_seconds`, 'duration_seconds']
    : [`${mode}_duration_seconds`, 'duration_seconds_without_audio', 'duration_seconds', 'duration_seconds_with_audio'];
  for (const key of order) {
    if (at(key) !== undefined) { perSecond = at(key); basis = `$${perSecond}/s${resText}`; break; }
  }
  if (perSecond === undefined) {
    for (const key of ['cents_per_video_output_second', 'cents_per_second_output']) {
      if (at(key) !== undefined) { perSecond = at(key) / 100; basis = `${at(key)}¢/s${resText}`; break; }
    }
  }
  let approx = false;
  if (perSecond === undefined) {
    // Token-priced (Seedance): about width × height × 24 fps × seconds / 1024 tokens.
    const perToken = at(audio ? 'video_tokens' : 'video_tokens_without_audio') ?? at('video_tokens');
    const h = parseInt(res, 10);
    if (perToken === undefined || !h) return null;
    const [aw, ah] = String(aspect || '16:9').split(':').map(Number);
    const w = Math.round((h * (aw || 16)) / (ah || 9));
    perSecond = (w * h * 24 * perToken) / 1024;
    basis = `about ${Math.round((w * h * 24) / 1024).toLocaleString()} video tokens/s at $${perToken}/token`;
    approx = true;
  }
  let usd = perSecond * duration;
  if (frames && skus.cents_per_image_input) {
    usd += (frames * skus.cents_per_image_input) / 100;
    basis += ` + ${skus.cents_per_image_input}¢ per frame image`;
  }
  if (skus.minimum_cents_per_generation && usd < skus.minimum_cents_per_generation / 100) {
    usd = skus.minimum_cents_per_generation / 100;
    basis += ' (minimum price)';
  }
  return { usd, approx, basis };
}

// A price is shown one of two ways, never both: the provider's own exact figure (its listed
// prices, or the cost it reports for a job), or, where only an estimate is possible (token-priced
// models, or a test billed differently from the list), a relative scale 1 (cheapest) to 5 drawn as
// $$$$$ with that many signs lit. Amounts from our own tests are never shown. The scale's steps are
// USD per clip, at the top of each step.
export const PRICE_STEPS = [0.025, 0.075, 0.15, 0.4];
export const priceTier = (usd) => 1 + PRICE_STEPS.filter((top) => usd > top).length;
export const formatUsd = (usd) => `$${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)}`;
// opts.amount: the provider's exact figure, shown instead of the scale unless opts.approx says the
// price is only an estimate.
export function priceTag(usd, { approx = false, amount } = {}) {
  if (amount != null && !approx) return el('span', { class: 'price-amount', text: formatUsd(amount) });
  const n = priceTier(usd);
  return el('span', { class: 'price-tag', title: `Estimated price, ${n} of 5`, 'aria-label': `Estimated price ${n} of 5` },
    el('span', { class: 'on', text: '$'.repeat(n) }), el('span', { class: 'off', text: '$'.repeat(5 - n) }));
}
