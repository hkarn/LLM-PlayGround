/* LLM PlayGround: the provider files: loading them, the current provider, its base URL and where each tab sends its request (ep). */
import { $ } from '../ui/dom.js';
import { ASSET_VERSION } from './version.js';
import { state } from './state.js';

// Default paths, relative to the base URL. A provider file can override them under endpoints.
export const ENDPOINT = {
  chat: '/chat/completions', decision: '/decisions', embeddings: '/embeddings', rerank: '/rerank',
  image: '/images/generations', imageEdit: '/images/edits', video: '/videos', speech: '/audio/speech', transcription: '/audio/transcriptions',
};

// Endpoints in the picker, loaded from public/providers/<id>.json by loadProviders() (the list and
// order are in providers/index.json; server.js reads the same files). Each file has: label,
// baseUrl (only a suggestion: the URL field can be edited), modelsPaths (fetched and merged),
// serverBaseUrl (used instead of baseUrl when server.js serves the page), baseUrlHint (placeholder text when the URL is empty), keyEnv (the server.js env var and the name used in cURL), keyHint, signup, server.domain (where a
// server key may be sent), unsupported (tabs that stay usable but are dimmed), endpoints (per tab:
// path relative to the base URL, base {replace: [pattern, with]} applied to the base URL, and the
// request/response template keys described in openai-standard.json), suggest (hardcoded option lists, false = not supported)
// speechVoices (a voice list file in providers/), categorize (which model field decides its tab) and
// needsServer (no browser access: usable only through server.js), attributionHeaders (false: no
// HTTP-Referer / X-Title on direct calls), headers (extra request headers on direct calls, e.g.
// Anthropic's anthropic-dangerous-direct-browser-access) and extends (another provider file to start from).
// "_notes" hold the comments.
export const PROVIDERS = {};
// The shared request/response templates (providers/openai-standard.json), read by adapter.js.
export const TEMPLATES = { endpoints: {} };
// The shared list of tested models (providers/curated-models.json): per kind (chat, image …), entries
// { name, label, price, note, draft? }. One list for every router: the picker matches each name against
// the last part of the current key's model ids (see curatedList in ui/model-picker.js).
export const CURATED = {};

async function fetchData(file) {
  const res = await fetch(`providers/${file}?v=${ASSET_VERSION}`);
  if (!res.ok) throw new Error(`Could not load providers/${file}: ${res.status}`);
  return res.json();
}

// Loads every provider file once. Voice lists are shared between files that name the same one.
export async function loadProviders() {
  const { providers: ids, templates, curated } = await fetchData('index.json');
  if (templates) TEMPLATES.endpoints = (await fetchData(templates)).endpoints || {};
  if (curated) Object.assign(CURATED, await fetchData(curated).catch(() => ({})));
  const lists = {};
  for (const id of ids) {
    let p = await fetchData(`${id}.json`);
    // extends: start from another provider file and override what this one lists (its notes stay its own).
    if (p.extends) {
      const { _notes, ...base } = await fetchData(p.extends);
      p = { ...base, ...p };
    }
    if (p.speechVoices) {
      lists[p.speechVoices] ??= fetchData(p.speechVoices).then((d) => d.voices.map((v) => ({ ...v, match: new RegExp(v.match, v.flags || '') })));
      p.speechVoices = await lists[p.speechVoices];
    }
    PROVIDERS[id] = p;
  }
  return PROVIDERS;
}

// The URL a provider starts with: serverBaseUrl through server.js (e.g. a gateway on localhost), else baseUrl.
export const defaultBaseUrl = (p = provider()) => (state.viaServer && p.serverBaseUrl) || p.baseUrl;

export const provider = () => PROVIDERS[state.provider];
export const baseUrl = () => $('#base-url').value.trim().replace(/\/+$/, '');
// Where a tab sends its request on the current provider: { path, base }. How the request and the
// answer look is in the templates, read by adapter.js.
export function ep(kind) {
  const o = provider().endpoints?.[kind] || {};
  const base = o.base?.replace ? baseUrl().replace(new RegExp(o.base.replace[0]), o.base.replace[1]) : baseUrl();
  return { path: o.path || ENDPOINT[kind], base };
}
