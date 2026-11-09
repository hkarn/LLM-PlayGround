# LLM PlayGround

A web playground for LLM providers and routers. Pick a model, fill in a short form, send it, and see exactly what came back: the rendered answer, the raw JSON, the headers and a ready-to-run `curl` command. It's also a place for small LLM-based experiments, such as games.

It grew out of [requesty-tester](https://github.com/hkarn/requesty-tester). It covers chat, decisions, embeddings, rerank, image generation and editing, video, text-to-speech and speech-to-text.

**Try it at <https://hkarn.github.io/LLM-PlayGround/>.** You need an API key for the endpoint you pick.

## Endpoints

Pick an endpoint at the top of the page. Its base URL is filled in for you, and you can edit it, for example for a regional endpoint. **↺** puts the default back. An edited URL is remembered per endpoint in the browser.

| Endpoint | Default base URL | Key | Notes |
| --- | --- | --- | --- |
| **Requesty** | `https://router.requesty.ai/v1` | [Sign up through my referral link](https://app.requesty.ai/join?ref=b1f2b1e1) or at [requesty.ai](https://requesty.ai) | Every tab except Rerank and Video, which are greyed out |
| **OpenRouter** | `https://openrouter.ai/api/v1` | [openrouter.ai/keys](https://openrouter.ai/keys) | Every tab. Decisions go to `/api/alpha/decisions`, images and image edits to `/v1/images` (reference images as `input_references`) |
| **LLM Gateway** | `https://api.llmgateway.io/v1` | [Sign up through my referral link](https://llmgateway.io/?ref=LucsNqyxkxzf3rsY9aaN) | **Only with your own server** (Docker or `node server.js`): its API does not allow calls from a browser page, so on GitHub Pages it is greyed out and only the sign-up link is shown. A model's tab comes from what it outputs; image edits go as JSON `images[]`, no mask. Server key: `LLMGATEWAY_API_KEY` |
| **Custom** | (empty) | If the endpoint needs one | Any OpenAI-compatible API, e.g. a local Ollama at `http://localhost:11434/v1`. Decision, Rerank and Video are greyed out, since OpenAI has no standard format for them |

Each endpoint keeps its own key, so switching back and forth doesn't lose it.

Option dropdowns follow the chosen model. On OpenRouter, image options (aspect ratio, resolution, quality, …) come from `/images/models` and video options (durations, resolutions, aspect ratios) from `/videos/models`, and speech voices from each model's `supported_voices`. Options a model doesn't take are greyed out and left out of the request. Where no list gives the choices, the page uses hardcoded suggestions from each provider's settings file in `public/providers/` (`suggest`, and voice lists such as `speech-voices.json`).

## Code map

Plain JavaScript modules, no build step. `public/index.html` loads `public/js/main.js`.

| File | What is in it |
| --- | --- |
| `public/js/ui/dom.js` | `el()`, `$()`, `$$()`: building and finding page elements. Everything uses these |
| `public/js/core.js` | Shared by everything, no screens of its own: the providers list, sending requests (`callApi`) and cURL, loading the models list, storage and small text helpers |
| `public/js/adapter.js` | Turns what an app wants (a chat, an image, an image edit) into the provider's request using the templates in the provider files, and reads the answer back into plain values (text, images, usage) |
| `public/js/ui/*.js` | Reusable pieces that apps put together: result panel, model picker, option dropdowns that follow the model, Send/Cancel, drafts kept across reloads, remembered choices, hide-settings toggle, copy button, named reference portraits |
| `public/js/testers.js` | The endpoint tabs (Chat, Decision, Embeddings, …): plain raw debuggers, one handler per tab |
| `public/js/apps/*.js` | One file per tool or game, named after its link: `dreamgen-scene.js`, `dreamgen-video.js`, `group-chat.js`, `video-generator.js` |
| `public/js/hubs.js` | The Games and Tools launchers, the list of apps, and direct links (`#tools/…`) |
| `public/js/main.js` | Start-up: wires the tabs, the endpoint picker and the forms |
| `public/providers/*.json` | One settings file per provider (base URL, model lists, paths that differ, key and sign-up link, hardcoded option and voice lists, and request/response templates where it differs from the standard). `openai-standard.json` holds the standard OpenAI-style templates every provider starts from. `index.json` sets the order; `server.js` reads the same files |
| `public/style.css` | All styles, with light and dark colours as variables at the top |
| `server.js` | Optional local server: serves `public/` and forwards `/api/*` to the chosen endpoint |

## Privacy

Run at https://hkarn.github.io/LLM-PlayGround/ or in your own Docker container or `node server.js`, the playground sends nothing to us or to any third party and saves nothing outside your browser. GitHub Pages only serves the page files; with your own server, `server.js` forwards your requests to the endpoint you chose and logs only the method, path and status. What reaches a third party is what you send, with your own key, to the provider you picked (Requesty, OpenRouter or a custom endpoint), and what that provider and its models do with it is between you and them. The browser keeps your settings, chosen models and, if you tick Remember, your key in its own local storage, and the text you type in the forms in session storage (this tab only, gone when it closes) so a reload does not clear it.

## Games and Tools

The first two tabs open a launcher of icon cards. Picking one fills the page under the tab bar, and **← All games** / **← All tools** goes back. The page remembers which one was open.

| Tab | App | Status |
| --- | --- | --- |
| **Games** | AI Group Chat: several AI characters, each on its own model, chat with you and each other | Placeholder layout |
| **Tools** | Draw the DreamGen Scene: load a DreamGen session export (Markdown or JSON); a chat model reads it, finds the last scene and writes an image prompt with the characters named and described (edit the export down first to save tokens); add reference portraits with names if you like, then draw it on the selected endpoint, or copy the prompt to use in DreamGen's own image generator. A picture style (photoreal, painting, anime, comic, your own…) can be added to the prompt. Each step's settings can be hidden once its model is chosen, and the choices are remembered. Feedback goes to Zorander on the DreamGen Discord | Working |
| **Tools** | Animate the DreamGen Scene: turn the scene picture from Draw the DreamGen Scene into a short clip, with a motion prompt written from the same session | Placeholder layout |
| **Tools** | Video Generator: only video models we have tested, with the options each one really supports | Placeholder layout |

The other tabs are the endpoint testers: one per API, with the raw request and response.

Every tab, hub and app has a direct link: add the tab's hash to the page address, for example
https://hkarn.github.io/LLM-PlayGround/#tools/dreamgen-scene (Draw the DreamGen Scene),
`#games/group-chat`, `#tools`, `#games`, or a tab such as `#chat`, `#image` or `#video`.
The address follows your clicks, so you can copy it from the address bar.

## Plans

- More providers and routers (e.g. OpenAI, Anthropic, Google, local Ollama) as presets in the endpoint picker.
- Build out AI Group Chat and Video Generator, and add more games and tools.

## Two ways it runs

The same page works with or without its small server, and picks the mode by itself: if `server.js` isn't there, it calls the endpoint straight from the browser.

| | With the server (`node server.js` or Docker) | Static only (e.g. GitHub Pages) |
| --- | --- | --- |
| Where requests go | Browser → your server → endpoint | Browser → endpoint |
| Your API key | Typed into the page and sent with each request to your server, which passes it on to the endpoint. The server doesn't store or log it. | Typed into the page and sent only to the endpoint. No other server sees it. |
| Server-side key | Optional: set `REQUESTY_API_KEY` or `OPENROUTER_API_KEY` so nobody has to type a key. Only do this on a private setup, since anyone who can open the page can then use your key. | Not possible |
| Custom endpoints | Allowed when the server listens on `127.0.0.1` (and in the compose setup). Elsewhere set `ALLOW_ANY_UPSTREAM=1` | Only if the endpoint allows CORS |
| Extras | Full response headers and upstream timing | Browsers show only a few response headers |

In both modes the key stays in that browser tab, unless you tick **Remember**, which saves it in the browser's `localStorage` on that device.

## What each tab does

| Tab | Endpoint | What you get |
| --- | --- | --- |
| **Chat** | `POST /v1/chat/completions` | Multi-turn message builder (system + user/assistant), temperature/max_tokens/top_p, extra JSON fields |
| **Decision** | `POST /v1/decisions` (OpenRouter: `/api/alpha/decisions`) | Content (`state`, optionally with an image) plus typed questions (`noul` yes/no, `choice`, `score`), with calibrated answers and probability bars |
| **Embeddings** | `POST /v1/embeddings` | One input per line, shows vector previews and a cosine-similarity matrix |
| **Rerank** | `POST /v1/rerank` | A query and one document per line, ranked by relevance score |
| **Image** | `POST /v1/images/generations` | Size, n, quality, background and output format. Renders the returned images |
| **Image edit** | `POST /v1/images/edits` (OpenRouter: `POST /v1/images`) | Up to 16 reference images (multipart `image[]` fields, or `input_references` data URLs on OpenRouter), an optional mask (Requesty only), size and quality. Renders the returned images |
| **Video** | `POST /v1/videos` | Prompt, duration, resolution, aspect ratio, audio and an optional first frame. Polls the job every 5 s and plays the video when it's done |
| **Speech** | `POST /v1/audio/speech` | Plays the audio in the browser and lets you download it |
| **Transcriptions** | `POST /v1/audio/transcriptions` | Upload a file (≤ 32 MB) or record from your mic, with optional language |
| **All models** | `GET /v1/models/all` (Requesty), `GET /v1/models?output_modalities=all` (OpenRouter), `GET /v1/models` (custom) | Searchable table plus the raw response |

Paste your API key and click **Load models**. On Requesty, `GET /v1/models/all` only returns the models approved for your key's organization, and each tab's dropdown is filtered by the model's `api` field (`chat`, `decision`, `embedding`, `image`, `speech`, `transcription`). On OpenRouter the filter uses each model's `endpoints` list; without `output_modalities=all`, OpenRouter's `/models` only returns text models. Tick **show all** or type any model ID to override that.

Every response shows the status, latency, rendered output, raw response, request body, response headers and a ready-to-run `curl` command.

## Run with Docker (recommended)

The GitHub Actions workflow publishes a multi-arch image (amd64 and arm64) to `ghcr.io/hkarn/llm-playground`.

```bash
docker compose up -d
```

Then open http://localhost:3000.

Or, without compose:

```bash
docker run --rm -p 127.0.0.1:3000:3000 ghcr.io/hkarn/llm-playground:latest
```

Optional: copy `.env.example` to `.env` and set `REQUESTY_API_KEY=sk-...` and/or `OPENROUTER_API_KEY=sk-or-...` so you don't have to type a key. A key typed in the UI always takes precedence.

To build from source, switch `image:` to `build: .` in `docker-compose.yml`, or run:

```bash
docker build -t llm-playground . && docker run --rm -p 3000:3000 llm-playground
```

> **Note:** If the GHCR package is private (the default for a new package), either run `docker login ghcr.io` first, or make the package public under **GitHub → Packages → llm-playground → Package settings**.

## Run without Docker

Needs Node 18 or later. There are no dependencies.

```bash
node server.js
```

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `REQUESTY_API_KEY` | – | Requesty key used when the browser doesn't send one. Only sent to `*.requesty.ai` |
| `OPENROUTER_API_KEY` | – | OpenRouter key used when the browser doesn't send one. Only sent to `*.openrouter.ai` |
| `ALLOW_ANY_UPSTREAM` | on when `HOST` is loopback, else off (on in `docker-compose.yml`) | Let the proxy forward to any URL typed in the UI, not just Requesty and OpenRouter |
| `PORT` | `3000` | Listen port |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Listen address |

## Hosting it publicly

Any host that runs Node 18 or later works. Upload `server.js`, `package.json` and `public/`, and set the start file to `server.js`. `PORT` can be a port number or a pipe/socket path, as some hosts (iisnode, Passenger) provide. If the host connects to the app over TCP from another machine, set `HOST=0.0.0.0`.

**Don't set `REQUESTY_API_KEY` or `OPENROUTER_API_KEY` on a public site.** Anyone who opens it could then send requests billed to your keys. Without them, every visitor uses their own key, which stays in their browser and passes through the server per request. Request bodies are capped at 40 MB. Leave `ALLOW_ANY_UPSTREAM` off there too, or anyone could use your server to reach other hosts, including ones on its internal network.

## GitHub Pages (static, no server)

Requesty and OpenRouter allow CORS from any origin, so `public/` also works as a static site. When the page finds no `server.js` (its `config` request fails), it calls the chosen base URL directly from the browser. All paths are relative, so it works from a subfolder such as `https://<owner>.github.io/LLM-PlayGround/`.

The `GitHub Pages` workflow publishes `public/` on every push to `main` that changes it. Enable it once under **Settings → Pages → Source: GitHub Actions**.

Compared with running `server.js`: there are no server-side keys, so each visitor pastes their own key. Browsers also only expose a few response headers on cross-origin calls, so the response-headers view is shorter and there's no upstream timing.

## How it works

`server.js` serves the static UI from `public/` and forwards `/api/*` to the base URL the page sends in the `X-Upstream-Base` header. It passes the request body through byte-for-byte, so JSON, multipart audio uploads and binary audio responses all work. On load the page requests `config`. If that fails, there's no server, and the page sends its requests to the base URL directly.
