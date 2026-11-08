# LLM PlayGround

A web playground for LLM providers and routers, plus a place for small LLM-based experiments such as games. Live at https://hkarn.github.io/LLM-PlayGround/. Forked by copy from requesty-tester, so Requesty is the only provider so far; more providers and routers are planned.

- Run: `node server.js` (Node 18+, no dependencies), then open http://127.0.0.1:3000. Docker: `docker compose up`.
- `server.js` serves `public/` and proxies `/api/*` to `REQUESTY_BASE_URL` (default `https://router.requesty.ai/v1`).
- Without `server.js` (GitHub Pages), `app.js` finds no `config` and calls Requesty directly, which allows CORS. Keep every path in `public/` relative so it works from the `/LLM-PlayGround/` subfolder.
- Workflows: `docker.yml` pushes `ghcr.io/hkarn/llm-playground` on `main`; `pages.yml` publishes `public/` to Pages.
- The UI is plain JS in `public/app.js`, with one handler per tab in `handlers`.
- The Requesty API source of truth is `docs/requesty-inference-openapi.json`. Check request and response formats there before changing a handler. Put specs for new providers in `docs/` too.
- Keep it dependency-free: no build step and no npm packages.

## Where the live Requesty API differs from the spec
Found by testing with a real key; keep handling both shapes.
- Decision `score` answers: `probabilities` is an object keyed by index (`"0"`…), with a `legend` mapping index → label. `score` is the expected index.
- Only chat models have `input_price`/`output_price`/`context_window`. Others have a `pricing` object of per-unit keys (`input_character`, `input_second`, `output_image`, …). Chat `pricing` is an array of tiers.
- Speech: non-OpenAI models (e.g. DeepInfra MiMo) return `500 [provider]` for OpenAI voice names like `alloy`. Leaving the voice out works. `/models/all` has no voice names, so `SPEECH_VOICES` in `app.js` lists them per model, taken from each provider's docs. Update it when Requesty adds speech models.
- Transcriptions also return `language`, `duration` and `segments`. DeepInfra models can take about a minute on a cold start.
