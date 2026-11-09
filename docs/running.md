# Running and hosting

The same page works with or without its small server (`server.js`), and picks the mode by itself: when the server isn't there, it calls the provider straight from the browser.

## Two ways it runs

| | With the server (`node server.js` or Docker) | Static only (e.g. GitHub Pages) |
| --- | --- | --- |
| Where requests go | Browser → your server → provider | Browser → provider |
| Your API key | Typed into the page and sent with each request to your server, which passes it on. The server doesn't store or log it | Typed into the page and sent only to the provider |
| Server-side keys | Optional: `REQUESTY_API_KEY`, `OPENROUTER_API_KEY`, `LLMGATEWAY_API_KEY` in `.env` or the environment, so nobody has to type a key. Only on a private setup | Not possible |
| Providers that block browser calls (LLM Gateway) | Work | Greyed out |
| Custom endpoints | Allowed when the server listens on `127.0.0.1` (and in the compose setup); elsewhere set `ALLOW_ANY_UPSTREAM=1` | Only if the endpoint allows CORS |
| Extras | Full response headers and upstream timing | Browsers show only a few response headers |

In both modes the key stays in that browser tab, unless you tick **Remember**, which saves it in the browser's `localStorage` on that device.

## Docker

The GitHub Actions workflow publishes a multi-arch image (amd64 and arm64) to `ghcr.io/hkarn/llm-playground` on every push to `main`.

With the compose file in this repository:

```bash
docker compose up -d
```

Then open <http://localhost:3000>. The port is published on `127.0.0.1` only, so custom endpoints are allowed.

Without compose:

```bash
docker run --rm -p 127.0.0.1:3000:3000 ghcr.io/hkarn/llm-playground:latest
```

To build from source, switch `image:` to `build: .` in `docker-compose.yml`, or run:

```bash
docker build -t llm-playground . && docker run --rm -p 127.0.0.1:3000:3000 llm-playground
```

The `127.0.0.1:` in these commands keeps the playground on your own computer. A plain `-p 3000:3000` would publish it on every network interface, so anyone on your network could open it, and use any server key you gave it.

> If the GHCR package is private (the default for a new package), run `docker login ghcr.io` first, or make it public under **GitHub → Packages → llm-playground → Package settings**.

The image contains only `package.json`, `server.js` and `public/`. Your `.env` is never copied into it (`.dockerignore`); compose passes its keys to the container when it starts.

## Node.js

Needs Node 18 or later. There are no dependencies.

```bash
node server.js
```

It reads `.env` next to `server.js` at start-up. Variables already set in the environment win over the file.

## Settings

Set these in `.env` (copy `.env.example`) or in the environment.

| Variable | Default | Purpose |
| --- | --- | --- |
| `REQUESTY_API_KEY` | – | Requesty key used when the browser sends none. Only ever sent to `*.requesty.ai` |
| `OPENROUTER_API_KEY` | – | OpenRouter key used when the browser sends none. Only ever sent to `*.openrouter.ai` |
| `LLMGATEWAY_API_KEY` | – | LLM Gateway key used when the browser sends none. Only ever sent to `*.llmgateway.io` |
| `ALLOW_ANY_UPSTREAM` | on when `HOST` is a loopback address, else off (on in `docker-compose.yml`) | Let the server forward to any URL typed in the page, not only the known providers |
| `PORT` | `3000` | Listen port, or a pipe/socket path on hosts such as iisnode or Passenger |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Listen address. Use `0.0.0.0` to accept connections from other machines |

A key typed in the page always wins over a server key.

## Hosting it publicly

Any host that runs Node 18 or later works. Upload `server.js`, `package.json` and `public/`, and set the start file to `server.js`. If the host connects to the app over TCP from another machine, set `HOST=0.0.0.0`.

**Don't set any `*_API_KEY` on a public site.** Anyone who opens it could then send requests billed to your keys. Without them, every visitor uses their own key, which stays in their browser and passes through the server per request. Leave `ALLOW_ANY_UPSTREAM` off too, or anyone could use your server to reach other hosts, including ones on its internal network. Request bodies are capped at 40 MB.

## GitHub Pages (static, no server)

OpenRouter and Requesty allow calls from any web page, so `public/` also works as a static site. When the page finds no server (its `config` request fails), it calls the chosen base URL directly. All paths are relative, so it works from a subfolder such as `https://<owner>.github.io/LLM-PlayGround/`.

The `GitHub Pages` workflow publishes `public/` on every push to `main` that changes it. Enable it once under **Settings → Pages → Source: GitHub Actions**. The workflow tags the scripts and stylesheet with the commit (`?v=<commit>`), so a new version never runs with old cached files.

Compared with running `server.js`: there are no server-side keys, LLM Gateway is greyed out, the response-headers view is shorter, and there's no upstream timing.

## How the server works

`server.js` serves the page from `public/` and forwards `/api/*` to the base URL the page sends in the `X-Upstream-Base` header. It passes the request body through byte for byte, so JSON, multipart audio uploads and binary audio and video responses all work.

- **Server keys:** a provider's key is added only when the browser sent none, only to that provider's own domain, and only over https.
- **Upstream checks:** any other host needs `ALLOW_ANY_UPSTREAM`.
- **Logging:** the server logs the method, the forwarded URL, the status and the time taken; never request or response content.
- **`config`:** tells the page which providers have a server key (yes or no, never the key).

## Privacy

Run at <https://hkarn.github.io/LLM-PlayGround/> or in your own Docker container or `node server.js`, the playground sends nothing to us or to any third party and saves nothing outside your browser.

- **GitHub Pages** only serves the page files.
- **Your own server** forwards your requests to the provider you chose and logs no content.
- **Third parties** see only what you send, with your own key, to the provider you picked. What that provider and its models do with it is between you and them.
- **Your browser** keeps your settings, chosen models and, if you tick Remember, your key in its own local storage. The text you type in the forms goes in session storage (this tab only, gone when it closes), so a reload doesn't clear it.
