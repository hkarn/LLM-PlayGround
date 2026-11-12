# Providers

The playground sends your requests to one provider (or router) at a time. Pick it in the connection panel at the top of the page (click the chip), or with **Use this one** in its box on the Welcome page (click the logo at the top left). Video works with OpenRouter (tested models first) and with LLM Gateway through your own server (its models untested, without prices).

## The providers

| Provider | Default base URL | Key | Notes |
| --- | --- | --- | --- |
| **OpenRouter** (default) | `https://openrouter.ai/api/v1` | [openrouter.ai/keys](https://openrouter.ai/keys) | Every tab, including Video and Rerank. Decisions go to `/api/alpha/decisions`; images and image edits both to `/v1/images` (reference images as `input_references`) |
| **Requesty** | `https://router.requesty.ai/v1` | [Sign up through my referral link](https://app.requesty.ai/join?ref=b1f2b1e1) or at [requesty.ai](https://requesty.ai). Keys start with `rqsty-sk-` | Every tab except Rerank and Video, which are greyed out |
| **Anthropic (Claude)** | `https://api.anthropic.com/v1` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys). Keys start with `sk-ant-`. New accounts may get a small starter credit (the amount is not published) | **Chat only**, through Anthropic's OpenAI-compatible endpoint: every other tab is greyed out. Works from GitHub Pages: the page sends `anthropic-dangerous-direct-browser-access`, which Anthropic's CORS requires (the name is its warning that a key used from a browser is visible to that page). Thinking is not returned and some options are ignored. Server key: `ANTHROPIC_API_KEY` |
| **LLM Gateway** | `https://api.llmgateway.io/v1` | [Sign up through my referral link](https://llmgateway.io/?ref=LucsNqyxkxzf3rsY9aaN) | **Only with your own server** (Docker or `node server.js`): its API doesn't allow calls from a browser page, so on GitHub Pages it is greyed out and only the sign-up link is shown. A model's tab comes from what it outputs. Image edits go as JSON `images[]`, with no mask. Video goes in LLM Gateway's own shape (`seconds`, which it requires, `size` such as `1280x720`, `audio`, and the start picture as `image`); each video model's durations, sizes, audio and whether it takes a start picture come from its model list, but no price is shown. One model has been run here: Grok Imagine Video 1.5 lite, 6 s at 848x480, done in 34 s for $0.12, with sound. Server key: `LLMGATEWAY_API_KEY` |
| **LLM Gateway (self-hosted)** | `http://localhost:4001/v1` through your own server; empty on GitHub Pages (enter your gateway's URL) | Your own gateway's key | [LLM Gateway](https://github.com/theopenco/llmgateway) run by yourself with your own provider keys. Works from GitHub Pages too, once your gateway allows the page's origin (`GATEWAY_CORS_ORIGINS`, e.g. `https://hkarn.github.io`). A gateway on another machine needs https when the page is https |
| **Custom** | (empty) | Only if the endpoint needs one | Any OpenAI-compatible API, such as a local Ollama at `http://localhost:11434/v1`. Decision, Rerank and Video are greyed out, since OpenAI has no standard format for them |

The base URL can be edited, for example for a regional endpoint; **↺** puts the default back. Each provider keeps its own key and its own edited URL in the browser, so switching back and forth loses nothing.

## Keys

- A key is needed before the page loads models or sends anything: one typed in the panel, or a server key (see [Running and hosting](running.md)). OpenRouter's and Requesty's model lists are public, so without this rule the page would look connected while every request failed. **Custom** is the exception, since local servers often take no key.
- The connection chip turns green only with a key *and* a loaded model list. It shows the provider, the host and how many models were loaded.
- When a provider refuses the key (401 or 403), the status says so, and suggests checking that the key was copied whole and is still active in the provider's dashboard.
- **Remember** saves the key in this browser's local storage, on this device. Without it, the key is kept only until the tab closes.

## Models and their options

**Load models** fetches the provider's model list. Each tab's dropdown lists only the models of its kind:

- **Requesty:** `GET /v1/models/all` returns only the models approved for your key's organization. The tab is taken from each model's `api` field (`chat`, `decision`, `embedding`, `image`, `speech`, `transcription`).
- **OpenRouter:** `GET /v1/models?output_modalities=all`; without that parameter, `/models` lists text models only. The tab comes from each model's `endpoints` list. `/images/models` and `/videos/models` are merged in, giving each image and video model its own options.
- **LLM Gateway:** the tab comes from what the model outputs (`architecture.output_modalities`).
- **Custom:** `GET /v1/models`.

Tick **show all**, or type any model id, to use a model the list doesn't put in that tab. The [model filter](guides/api-tester.md#the-model-filter) on the Filter models tab narrows every list on the page.

Option dropdowns follow the chosen model:

- On OpenRouter, image options (aspect ratio, resolution, quality, …) come from `/images/models`, and video options (durations, resolutions, aspect ratios, which frames) from `/videos/models`.
- Speech voices come from each model's `supported_voices`.
- Options a model doesn't take are greyed out and left out of the request.
- Where no list gives the choices, the page uses suggestions from the provider's settings file in `public/providers/` (`suggest`, and voice lists such as `speech-voices.json`).

## Video models

The Video Generator and Animate the DreamGen Scene list the video models we have run for real first, from `videoModels` in the provider's settings file (OpenRouter has twelve). Each is one row: its name, small marks for which pictures it takes, its sound and whether it kept a face in our tests (a legend explains them), and its price; its tooltip, and the box under the list for the chosen model, say the same in words. Any other video model your key can use is under **Other video model**, marked untested; on LLM Gateway, which has no tested models yet, that is all of them. See the [Video Generator guide](guides/video-generator.md).

## Adding a provider

A provider is one settings file, `public/providers/<id>.json`, plus its id in `public/providers/index.json`. See [Code](code.md#provider-files).
