# API tester

The **API tester** tabs send one raw request each, so you can see exactly what a provider takes and gives back. Click **API tester ▸** in the top bar: it opens the tab you used last, and the tabs appear as a row under the bar.

Tabs the chosen provider can't serve are greyed out.

## The tabs

| Tab | Request | What you get |
| --- | --- | --- |
| **Chat** | `POST /v1/chat/completions` | A message builder (system prompt, user and assistant turns), temperature, max tokens and top p, and extra JSON fields |
| **Decision** | `POST /v1/decisions` (OpenRouter: `/api/alpha/decisions`) | Content (optionally with an image) and typed questions (yes/no, choice, score), with calibrated answers and probability bars |
| **Embeddings** | `POST /v1/embeddings` | One input per line; vector previews and a cosine-similarity matrix |
| **Rerank** | `POST /v1/rerank` | A query and one document per line, ranked by relevance |
| **Image** | `POST /v1/images/generations` | Size, number, quality, background and format; the pictures are shown |
| **Image edit** | `POST /v1/images/edits` (OpenRouter: `POST /v1/images`) | Up to 16 reference pictures, an optional mask (Requesty only), size and quality |
| **Video** | `POST /v1/videos` | Prompt, duration, resolution, aspect ratio, audio, and an optional first and last frame (other formats go as PNG). The job is checked every 5 s and the video plays when it's done |
| **Speech** | `POST /v1/audio/speech` | Plays the audio and lets you download it |
| **Transcriptions** | `POST /v1/audio/transcriptions` | Upload a file (up to 32 MB) or record from your microphone, with an optional language |

Every answer shows the status, the time it took, the rendered result, the raw response, the request body, the response headers and a ready-to-run `curl` command.

Each tab has a model picker that lists the loaded models of its kind. Tick **show all** to see every model, or type any model id. The option dropdowns follow the chosen model, and options it doesn't take are greyed out and left out of the request. See [Providers](../providers.md#models-and-their-options).

## The model filter

The **Filter models** tab, in the top bar after API tester, holds the **Model filter**, a searchable table of every model and the raw model list. The filter narrows every model list on the page: every tab's picker, the tools, and the Group Chat suggestions. It's handy when a router lists hundreds of models and you only want a few.

- **Providers** lists makers, matched exactly: `z-ai` keeps `z-ai/…` models.
- **Models** lists names, matched from the start: `GLM-5.3` keeps `glm-5.3`, `glm-5.3-flash`, `glm-5.3:batch` and every region or variant. A row with a `/`, like `z-ai/glm-4.5*`, matches the whole id.
- A model is shown when it matches both lists. An empty list matches everything.
- Add rows from the suggestions or type your own; **×** removes one, and **Clear filter** empties both.

Each provider keeps its own filter, since routers name makers differently. Pickers say "Model filter on" while it is active.

## Direct links

Every tab, tool and game has its own address. Add its name after `#`:

- Tabs: `#chat`, `#image`, `#video` …, and `#models` (Filter models)
- Hubs: `#tools`, `#games`, `#providers`
- Tools and games: `#tools/dreamgen-scene`, `#tools/dreamgen-video`, `#tools/video-generator`, `#games/group-chat`

The address follows your clicks, so you can copy it from the address bar.
