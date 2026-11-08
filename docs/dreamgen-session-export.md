# DreamGen session export (read by "Draw the DreamGen Scene")

What the Tools hub's DreamGen scene tool reads. Taken from a real export (object `scenario_session`, version `1.0`, 2026-11-08) and the DreamGen Studio notes on the scenario format. No story content is kept here.

```text
{ "object": "scenario_session", "version": "1.0",
  "data": {
    "scenario": { "format", "userCharacterMode", "entities": [...], "definition": {...}, "display": {...} },
    "session":  { "headInteractionId": "<id>", "interactions": [ ... ] } } }
```

- `scenario.entities[]`: `id`, `label`, `kind` (`character`, `character_user` = the player's persona, `narrator`, `location`, `item`), `display` (`name`, `images[]`) and `definition` (`name`, `description`: the AI-facing card). An export with images carries each one as raw base64 in `images[].dataBase64` with a `mimeType`; the tool offers those as reference portraits.
- `session.interactions[]` is a **tree**: each has `id`, `parentId` (absent on the root) and `payload`. The played story is the chain from `headInteractionId` back to the root, reversed. Regenerated turns leave dead branches, so always walk from the head.
- `payload.kind`:
  - `message`: `role` `user` or `bot`, `characterId`, `name` (speaker), `content`, `hidden`, `prompt.excluded`.
  - `text`: narrator prose (`content`). Some games put a hidden world-state header here, starting with `<hidden>` (who is present, factions, clock and place); the tool keeps it, labelled, because it says who is in the scene.
  - `instruction`: the player's out-of-character steering. Left out.
  - `artifact`: the CYOA menu (`body.content.kind` `response-options`). Left out.
- `hidden` and `prompt.excluded` turns are still part of what happened and are kept.

Markdown or text exports have no structure the tool relies on: blocks between blank lines count as turns and are sent as they are.

## What the tool sends

1. Chat (`/chat/completions`): the editable system prompt, then one user message with the story title, the player's persona name, optional `<cast_cards>` (characters and locations, each cut to 1,500 characters) and `<role_play>` holding the last turns that fit the character budget (default 24,000), whole turns only. The model answers with JSON `{scene, characters[{name, description}], prompt}`; any other reply is used as the prompt as it came.
2. Image: without references, the provider's image generation endpoint. With references, its edit endpoint (OpenRouter: JSON `input_references`; Requesty and custom: multipart `image[]`). Neither takes a caption per picture, so each portrait's typed name is added to the prompt as "reference image 1 is …".
