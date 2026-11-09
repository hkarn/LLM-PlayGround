# LLM PlayGround

A playground for AI models from providers and routers such as OpenRouter and Requesty. Pick a model, send it something, and see exactly what comes back. It also has a few small tools and games built on those models.

- **Tools:** draw the last scene of a DreamGen story, turn it into a short video clip, or make videos from your own prompts.
- **Games:** AI Group Chat, where several AI characters, each on its own model, talk with you and with each other.
- **API tester:** one tab per kind of request (chat, images, video, speech, transcription, embeddings and more), showing the answer, the raw response and a ready-to-run `curl` command.

**Try it now at <https://hkarn.github.io/LLM-PlayGround/>.** Nothing to install.

## 1. Get an API key

The page sends your requests to an AI provider with your own key, so you need one. The **Welcome** page, where the page opens (click the logo at the top left to get back to it), says how to start and, further down, compares the providers and links to each sign-up page. For now only OpenRouter has video models.

The easiest is **OpenRouter**: sign in (Google works), add a little credit, create a key at [openrouter.ai/keys](https://openrouter.ai/keys), and every model is available, including some free ones.

Paste the key into the connection panel at the top of the page (click the chip that says **Add API key**) and press **Load models**.

## 2. Run it on your own computer (optional)

The online page works on its own. Running it yourself adds a small local server that can hold your keys, so you don't have to paste them, and that can reach providers a browser page can't call directly (such as LLM Gateway) or a model running on your own machine (such as Ollama).

### With Docker (easiest)

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker on Linux).

1. Download this project: **Code → Download ZIP** on GitHub and unzip it, or `git clone https://github.com/hkarn/LLM-PlayGround.git`.
2. Open a terminal in the project folder and start it:

   ```bash
   docker compose up -d
   ```

3. Open <http://localhost:3000>.

To stop it later, run `docker compose down`.

### With Node.js

You need [Node.js](https://nodejs.org/) 18 or later. There is nothing else to install.

1. Download the project as above.
2. In the project folder, run:

   ```bash
   node server.js
   ```

3. Open <http://127.0.0.1:3000>. Press Ctrl+C in the terminal to stop it.

### Keep your keys on your computer (optional)

So you don't have to paste a key each time:

1. Copy `.env.example` to a new file called `.env` in the same folder.
2. Fill in the keys you have, for example `OPENROUTER_API_KEY=sk-or-...`.
3. Start the playground again. Both Docker and `node server.js` read `.env`.

A key typed in the page always wins over the one in `.env`. Only do this on your own computer: anyone who can open the page could use these keys.

## What's in it

| Where | What |
| --- | --- |
| **Welcome** (the logo) | What the site is, how to start, links to every tool, and for each provider how hard it is to set up, the steps and its sign-up link (click the logo to get back here). The sun, moon or half circle at the top right switches between light, dark and your system's setting |
| **Tools** | Draw the DreamGen Scene · Animate the DreamGen Scene · Video Generator |
| **Games** | AI Group Chat |
| **API tester ▸** | Chat, Decision, Embeddings, Rerank, Image, Image edit, Video, Speech, Transcriptions |
| **Filter models** | A model filter that narrows every model list on the page, and the full model list |

Every tab and tool has its own link, such as `#tools/dreamgen-scene` or `#chat`, so you can bookmark it or share it.

## Privacy

Nothing is sent to us or to any third party except your own requests, with your own key, to the provider you choose. Your settings, and your key if you tick **Remember**, stay in your browser. The local server only passes your requests on and logs no content.

## More

**User guides**, step by step:

- [Draw the DreamGen Scene](docs/guides/draw-dreamgen-scene.md)
- [Animate the DreamGen Scene](docs/guides/animate-dreamgen-scene.md)
- [Video Generator](docs/guides/video-generator.md)
- [AI Group Chat](docs/guides/ai-group-chat.md)
- [API tester](docs/guides/api-tester.md), including the model filter and direct links

**Reference** (all of it in [`docs/`](docs/README.md)):

- [Providers](docs/providers.md): every supported provider, its URLs, keys and quirks.
- [Running and hosting](docs/running.md): the two ways it runs, all settings, Docker, hosting it publicly, GitHub Pages, and how the server works.
- [Code](docs/code.md): how the code is laid out, for anyone changing it.

Planned: more providers as presets (such as OpenAI, Anthropic, Google and a local Ollama), and more games and tools.

It grew out of [requesty-tester](https://github.com/hkarn/requesty-tester). Ideas and problems are welcome as [GitHub issues](https://github.com/hkarn/LLM-PlayGround/issues).
