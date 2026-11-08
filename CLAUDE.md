# LLM PlayGround

A web playground for LLM providers and routers, plus a place for small LLM-based experiments such as games. Live at https://hkarn.github.io/LLM-PlayGround/. Forked by copy from requesty-tester. Endpoints so far: Requesty, OpenRouter and a custom OpenAI-compatible URL.

- Run: `node server.js` (Node 18+, no dependencies), then open http://127.0.0.1:3000. Docker: `docker compose up`.
- Endpoints are `PROVIDERS` in `app.js` (label, suggested `baseUrl`, `modelsPaths`, `keyEnv`, `unsupported` tabs, per-tab `endpoints` overrides via `ep(kind)`, and `suggest` lists). Greyed tabs: Requesty rerank/video; Custom decision/rerank/video (no OpenAI standard).
- Dropdowns follow the model (`setupModelOptions`): model metadata first, then the provider's `suggest` list (`false` = not supported), then the options in `index.html`. Disabled fields are never sent (`str`/`num` skip them). Add hardcoded suggestions only where no API list gives the choices. The base URL field is editable; each provider keeps its own key and edited URL in `localStorage`.
- `server.js` serves `public/` and proxies `/api/*` to the `X-Upstream-Base` header the page sends. Its own `PROVIDERS` maps a provider to its domain and server key env var (`REQUESTY_API_KEY`, `OPENROUTER_API_KEY`); a server key is only sent to that domain over https. Other hosts need `ALLOW_ANY_UPSTREAM` (default on only for a loopback `HOST`). Add new providers in both files.
- Without `server.js` (GitHub Pages), `app.js` finds no `config` and calls the base URL directly. Requesty and OpenRouter allow CORS. Keep every path in `public/` relative so it works from the `/LLM-PlayGround/` subfolder.
- Workflows: `docker.yml` pushes `ghcr.io/hkarn/llm-playground` on `main`; `pages.yml` publishes `public/` to Pages and adds `?v=<commit>` to the `app.js` and `style.css` links in `index.html`, so keep those links as plain `"app.js"` / `"style.css"`.
- The UI is plain JS in `public/app.js`, with one handler per tab in `handlers`.
- The Requesty API source of truth is `docs/requesty-inference-openapi.json`. Check request and response formats there before changing a handler. Put specs for new providers in `docs/` too.
- OpenRouter: `/models` only lists text models unless `output_modalities=all`. Each model's `endpoints` array decides its tab. `/images/models` (per-model `supported_parameters` enums; a missing key = unsupported) and `/videos/models` (`supported_durations` etc.) are merged in by id. Speech voices are in `supported_voices`; `/audio/speech` returns only mp3 or pcm. Pricing is `pricing.prompt`/`completion` as strings per token.
- OpenRouter paths: decisions at `/api/alpha/decisions` (same format as Requesty, alpha); images and image edits both `POST /api/v1/images` (JSON, edits as `input_references` data URLs, no mask, response `b64_json` + `media_type`); video is async: `POST /videos` → poll `GET /videos/{id}` → `GET /videos/{id}/content?index=0`; rerank `{model, query, documents, top_n}` → `results[{index, relevance_score, document}]`. `/embeddings/models` has no CORS.
- Keep it dependency-free: no build step and no npm packages.

## Where the live Requesty API differs from the spec
Found by testing with a real key; keep handling both shapes.
- Decision `score` answers: `probabilities` is an object keyed by index (`"0"`…), with a `legend` mapping index → label. `score` is the expected index.
- Only chat models have `input_price`/`output_price`/`context_window`. Others have a `pricing` object of per-unit keys (`input_character`, `input_second`, `output_image`, …). Chat `pricing` is an array of tiers.
- Speech: non-OpenAI models (e.g. DeepInfra MiMo) return `500 [provider]` for OpenAI voice names like `alloy`. Leaving the voice out works. `/models/all` has no voice names, so `SPEECH_VOICES` in `app.js` lists them per model, taken from each provider's docs. Update it when Requesty adds speech models.
- Transcriptions also return `language`, `duration` and `segments`. DeepInfra models can take about a minute on a cold start.
