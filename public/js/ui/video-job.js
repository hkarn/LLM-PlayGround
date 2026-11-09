/* LLM PlayGround: UI component: video jobs. Runs one job through the adapter's `video` kind (submit,
   poll, download), and estimates its price from the model's pricing_skus (OpenRouter /videos/models).
   Used by the Video Generator and Animate the DreamGen Scene; the Video tab keeps its own raw handler. */
import { follow, read, send } from '../adapter.js';
import { errorMessage } from '../core.js';
import { el } from './dom.js';
import { framePngOrJpeg } from './frame-image.js';
import { wait } from './run-step.js';

export const JOB_DONE = ['completed', 'failed', 'cancelled', 'expired'];

// input: { model, prompt, duration, resolution, aspect_ratio, generate_audio, first_frame, last_frame }
// with the frames as Files (or Blobs). onStatus(job, seconds) is called after the submit and each poll.
// Returns { ok, id, status, blob, cost, seconds, error, notes, resp, request, curl }.
export async function runVideoJob(input, { signal, onStatus } = {}) {
  const t0 = Date.now();
  const seconds = () => Math.round((Date.now() - t0) / 1000);
  const notes = [];
  const frames = {};
  for (const key of ['first_frame', 'last_frame']) {
    if (!input[key]) continue;
    const { file, note } = await framePngOrJpeg(input[key]);
    frames[key] = [file];
    if (note) notes.push(note);
  }
  let { resp, request, curl } = await send('video', { ...input, ...frames }, { signal });
  const base = { notes, request, curl };
  let job = read('video', resp);
  if (!resp.ok || !job.id) return { ...base, ok: false, resp, seconds: seconds(), error: errorMessage(resp) };
  const { id } = job;
  onStatus?.(job, seconds());
  while (!JOB_DONE.includes(job.status)) {
    await wait(5000, signal);
    resp = await follow('video', 'poll', { id }, { signal });
    if (!resp.ok) return { ...base, ok: false, id, resp, seconds: seconds(), error: errorMessage(resp) };
    job = read('video', resp);
    onStatus?.(job, seconds());
  }
  if (job.status !== 'completed') {
    const why = job.error ? (typeof job.error === 'string' ? job.error : job.error.message || JSON.stringify(job.error)) : '';
    return { ...base, ok: false, id, status: job.status, cost: job.cost, resp, seconds: seconds(), error: `Job ${job.status}${why ? `: ${why}` : ''}` };
  }
  const video = await downloadVideo(id, { signal });
  return { ...base, ...video, id, status: job.status, cost: job.cost, resp, seconds: seconds() };
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
  for (const key of [`${mode}_duration_seconds`, `duration_seconds_${audio ? 'with' : 'without'}_audio`, 'duration_seconds', 'duration_seconds_with_audio']) {
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

// Prices are shown as a relative scale: 1 (cheapest) to 5, drawn as $$$$$ with that many signs lit.
// The steps are USD per clip, at the top of each step. An exact amount is shown beside it only
// when it comes from the provider (its listed prices, or the cost it reports for a job), never
// from our own tests.
export const PRICE_STEPS = [0.025, 0.075, 0.15, 0.4];
export const priceTier = (usd) => 1 + PRICE_STEPS.filter((top) => usd > top).length;
export const formatUsd = (usd) => `$${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)}`;
// opts.amount: a provider's figure to print after the signs; opts.approx: it is an estimate.
export function priceTag(usd, { approx = false, amount } = {}) {
  const n = priceTier(usd);
  return el('span', { class: 'price-tag', title: `Price ${n} of 5${approx ? ', estimated roughly' : ''}`, 'aria-label': `Price ${n} of 5` },
    el('span', { class: 'on', text: '$'.repeat(n) }), el('span', { class: 'off', text: '$'.repeat(5 - n) }),
    amount != null ? el('span', { class: 'price-amount', text: ` ${approx ? 'about ' : ''}${formatUsd(amount)}` }) : null);
}
