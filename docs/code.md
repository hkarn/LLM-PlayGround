# Code

Plain JavaScript modules with no build step and no dependencies. `public/index.html` loads `public/js/main.js`, and everything else is imported from there. All paths in `public/` are relative, so the page works from a subfolder (GitHub Pages).

## Map

| File | What is in it |
| --- | --- |
| `public/js/ui/dom.js` | `el()`, `$()`, `$$()`: building and finding page elements. Everything uses these |
| `public/js/core.js` | Shared by everything, with no screens of its own: the providers, sending requests (`callApi`) and cURL, the key rule (`keyReady`), loading the model list, the model filter (`visibleModels`, `modelsIn`), storage and small text helpers |
| `public/js/adapter.js` | Turns what a tab or tool wants (a chat, an image, a video job, …) into the provider's request using the templates in the provider files (`send`), and reads the answer back into plain values: text, images, usage (`read`). Async jobs use `follow` for polling and downloads |
| `public/js/ui/*.js` | Reusable pieces that tools are built from. The general ones: result panel, model picker, option dropdowns that follow the model, Send/Cancel (`run-step.js`), drafts kept across reloads, remembered choices (one chat, image and video model shared by every tool), the tool layout (`tool-layout.js`: settings panel and steps), copy button, named reference portraits, model filter, the top bar (`top-bar.js`: pinned, and kept to one line by dropping optional words, then folding the tabs into a drop-down), the logo (inline SVG in `index.html`'s `<h1>`, made from `docs/logo.svg`: the icon and the wordmark as two SVGs, black outside the orange discs as `currentColor`, white letter holes as `.lg-paper` in the bar's colour, so it follows the theme; the GAME/TESTER/TOOLS lettering is left out at bar size), the theme toggle (`theme.js`: Auto, Light or Dark; a new colour needs its dark value in both dark blocks of `style.css`). The video ones: `video-job.js` (run a job, price estimate), `video-settings.js` (model cards and options) and `frame-image.js` (frames as PNG/JPEG). The DreamGen ones: `dreamgen-export.js`, `scene-handoff.js` and `scene-styles.js` |
| `public/js/testers.js` | The API tester tabs (Chat, Decision, Embeddings, …): plain raw debuggers, one handler per tab |
| `public/js/apps/*.js` | One file per tool or game, named after its link: `dreamgen-scene.js`, `dreamgen-video.js`, `video-generator.js`, `group-chat.js` |
| `public/js/hubs.js` | The Games and Tools launchers, the list of apps (`APPS`), tab switching and direct links (`#tools/…`) |
| `public/js/providers-guide.js` | The Welcome tab: what the site is, cards for the tools and games (passed in by `main.js`), and one wide box per provider, from the `guide` in its settings file |
| `public/js/main.js` | Start-up: the tabs, the connection chip and panel, and the forms |
| `public/providers/*.json` | One settings file per provider (below) |
| `public/style.css` | All styles, with the light and dark colours as variables at the top |
| `server.js` | The optional local server: serves `public/` and forwards `/api/*` (see [Running and hosting](running.md#how-the-server-works)) |

Imports run one way: `dom` ← `core` ← `adapter` ← `ui/*` ← `testers` and `apps` ← `hubs` ← `main`. `core` tells the pickers about a new model list with a `models-changed` event instead of importing them.

## Provider files

Each provider is `public/providers/<id>.json`, and `index.json` lists them in order. The first one that works on the page is the default for a new visitor. `server.js` reads the same files. A file holds:

| Key | What it is |
| --- | --- |
| `label`, `baseUrl` | Name and default base URL (`serverBaseUrl` when the server is used, `baseUrlHint` as the placeholder when there is none) |
| `modelsPaths` | Where the model list comes from; later paths add detail to the first (OpenRouter's `/images/models`, `/videos/models`) |
| `keyEnv`, `keyHint`, `keyOptional` | The server's env var, the key's look, and whether the page may go without a key (Custom) |
| `signup` | The sign-up link (`referral: true` when it is a referral link) |
| `server.domain` | The only domain a server key is ever sent to |
| `unsupported` | Tabs this provider can't serve (greyed out) |
| `endpoints` | Per-tab paths and request/response templates where the provider differs from the standard |
| `suggest`, `speechVoices` | Option and voice lists where no model list gives them |
| `categorize` | Which field decides a model's tab, when the list has no endpoints or `api` field |
| `videoModels` | The tested video models, with their notes, defaults, audio and face behaviour, and every test run |
| `guide` | The provider's box on the Welcome tab: setup level 1–4, summary, steps, what's good and what to watch |
| `needsServer`, `extends`, `attributionHeaders` | Works only through the server; starts from another file; whether direct calls send `HTTP-Referer`/`X-Title` |

`openai-standard.json` holds the standard OpenAI-style request and response templates every provider starts from. A provider's `endpoints.<kind>` replaces keys of them. The template rules are in that file's `_notes`.

## Adding a tool or game

1. Add `public/js/apps/<id>.js`, built from the `ui/` pieces. Anything a second tool needs goes into `ui/`.
2. Add it to `APPS` in `hubs.js`. Its `id` is its link (`#tools/<id>`), so don't rename it later.
3. Send every request through `runStep` (it gives the Cancel button) and the adapter's `send`, and pass `signal: form._abort?.signal`.
4. Never build a provider's wire format in an app: that belongs in the provider files.

## Working on it

How changes land (issues, branches, pull requests, checks) is in [`CLAUDE.md`](../CLAUDE.md#how-changes-land-pull-requests), along with notes on where the live Requesty API differs from its spec.
