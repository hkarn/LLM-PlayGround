# DreamGen session exports (read by "Draw the DreamGen Scene")

What the Tools hub's DreamGen scene tool reads, from real session exports in both formats (2026-11-08, six games; none are kept in this repository). The whole export is sent to the chat model as Markdown, and a JSON export is first written out in DreamGen's own Markdown layout, so the system prompt only has to explain that one. Finding where the last scene begins is left to the model.

## JSON (object `scenario_session`, version `1.0`)

```text
{ "object": "scenario_session", "version": "1.0",
  "data": {
    "scenario": { "format", "userCharacterMode", "entities": [...], "definition": {...}, "display": {...} },
    "session":  { "headInteractionId": "<id>", "interactions": [ ... ] } } }
```

- `scenario.entities[]`: `id`, `label`, `kind` (`character`, `character_user` = a player persona, `narrator`, `location`, `item`), `display` (`name`, `images[]`) and `definition` (`name`, `description`: the AI-facing card). Use `definition.name`: a persona's `display.name` can be just `user`, the narrator's `Narrative`.
- Images are raw base64 in `display.images[].dataBase64`, sometimes with a `mimeType`, sometimes only with an `nsfw` flag; DreamGen's are WebP (base64 starts `UklGR`). The tool sniffs the type. An image has no caption of its own: the caption DreamGen requires is the entity's `display.name` (the narrator's is empty, shown as "narrator"). The scenario's own cover pictures are in `scenario.display.images[]` (shown as "cover"). An entity can carry several pictures.
- `session.interactions[]` is a **tree**: each has `id`, `parentId` (absent on the root) and `payload`. The played story is the chain from `headInteractionId` back to the root, reversed. Regenerated turns leave dead branches, so always walk from the head.
- `payload.kind`:
  - `message`: `role` `user` or `bot`, `characterId`, `name` (speaker), `content`, `hidden`, `prompt.excluded`.
  - `text`: narration (`content`).
  - `instruction`: the player's out-of-character steering. Left out.
  - `artifact`: the CYOA menu (`body.content.kind` `response-options`). Left out.
- `hidden` and `prompt.excluded` turns are still part of what happened and are kept.

## Markdown

Sent as it is. `# Title`, an intro paragraph (and a `[Tags]:` line), then `## Section` blocks: `Plot`, `Setting`, `Style`, `CYOA`, `Characters`, `User Personas`, `Locations`, `Objects`, `Examples`, `Openings`, `Session`. Scenario authors also write their own `##` headings inside fields ("Golden Rules:", "Supernatural rules", "Private Notes"), so a heading alone does not mark an export section. Cards are `### Name` under Characters, User Personas and Locations. `Session` is the last section and holds the played transcript:

- `[Name]: text` starts a turn by that character; the player's persona uses its own name.
- Unprefixed paragraphs are narration, or the continuation of the turn above (a multi-paragraph NPC message); the export does not mark which, so they stay with the block above.
- `[Instruction]: …` blocks are out-of-character instructions; the model is told to ignore them.
- Examples and Openings use the same layout (`[(user)]:` in examples) but are templates, not story; the model is told to ignore them.

A JSON export is written out with the same headings: title and description, Plot, Past Events, Setting, Style, Characters, User Personas, Locations, Objects and Session (`[Name]:` turns, narration as plain paragraphs, `[Instruction]:` lines). Choice menus are left out, as in DreamGen's own Markdown export, and so are Examples, Openings and the CYOA rules.

## Inside the story text, in both formats

- **Hidden headers** `<hidden>…</hidden>`: the game's private state (nearby and off-scene characters, factions, a clock). They come as their own narration turn or at the end of an NPC's message. The model is told to use them only to check who is where.
- **Time and place lines** open scenes and, in some games, repeat on every turn of the same scene: `Day 0 · 20:47 · Place`, `[Day 0 · 22:54 · Place]`, or prose such as `Sunday 1 November, early afternoon.` Because they repeat, a stamp alone does not mark a new scene; the model is told that a scene changes with the place or a jump in time.
- **Point of view** differs by game: first-person player turns, and narration in the second person ("you") or the third person with the persona's name. All refer to the player's character.

## What the tool sends

1. Chat (`/chat/completions`): the editable system prompt (how to read the export, what "the final moment of the last scene" is, and what the image prompt must contain), then one user message: the export from the editable box, then the user's note or a one-line request. The whole export is sent unless the user cuts it: **Trim session** keeps only the last 5k–30k tokens of the Session (from the last `## Session` heading, cut at a paragraph boundary, with a marker line) and leaves everything above it as it is, with Undo. Tokens are estimated at 4 characters each (`CHARS_PER_TOKEN`), whatever the model. Where the last scene begins is still the model's call; regular expressions on time lines were ruled out because every game marks time and place its own way, or not at all. The model answers with JSON `{scene, characters[{name, description}], prompt}`; any other reply is used as the prompt as it came.
2. Image: without references, the provider's image generation endpoint. With references, its edit endpoint (OpenRouter: JSON `input_references`; Requesty and custom: multipart `image[]`). Every embedded picture is listed, unticked; the first picture of each character the model lists is ticked, and only ticked pictures are sent. Neither API takes a caption per picture, so each portrait's typed name is added to the prompt as "reference image 1 is …".
