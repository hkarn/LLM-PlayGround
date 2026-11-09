# Draw the DreamGen Scene

Turn the last scene of a [DreamGen](https://dreamgen.com/) role-play into a picture. A chat model reads your session, finds where the last scene happens and who is in it, and writes an image prompt. An image model then draws it, using your character portraits if you add them.

Open it: **Tools → Draw the DreamGen Scene**, or <https://hkarn.github.io/LLM-PlayGround/#tools/dreamgen-scene>.

## Before you start

- An API key, loaded in the connection panel at the top. See [the main README](../../README.md#1-get-an-api-key).
- A DreamGen session export. In DreamGen, export the **session** (the game you played), not only the scenario. Both the Markdown and the JSON export work.

## Step by step

### 1. Session export

Load the export file. The tool shows its title, how many turns it has, the player's character, and how many portraits are embedded in it (JSON exports can carry them).

### 2. Write the image prompt

1. Pick a **chat model**. Any good general model works.
2. Check the **Session to send**. The whole export is sent, and a long game costs many tokens, so you can edit it down first:
   - **Trim session** keeps only the last part of the Session (pick 5k–30k tokens), cut at a paragraph so no turn is split.
   - **Undo** puts back what was cut; **Restore the full export** starts over.
   - Above the Session, you can delete what the picture doesn't need, such as Examples, Openings and game rules.
3. Optionally add a **Note for this picture**, such as "focus on the moment she opens the letter; wide shot".
4. Press **Write image prompt**.

The model's prompt appears in step 3. It names and describes each visible character, so it works even without portraits.

### 3. Prompt and reference portraits

- **Edit the prompt** as you like.
- **Picture style** adds a style to the end of the prompt: Photoreal, Cinematic still, Digital painting, Oil painting, Watercolour, Anime, Comic, Pencil sketch, or your own with **Custom…**. The choice is remembered, and Animate the DreamGen Scene uses the same one.
- **Copy prompt** copies the prompt with its style, for example to use in DreamGen's own image generator instead of step 4.
- **Characters in the scene:** each character the model put in the picture is listed with an **Add portrait** button. Portraits embedded in a JSON export are attached for them automatically.
- **Add portraits** adds any other reference pictures. Type who each one is in **Who is this?**.
- **Add the portrait names to the prompt** (on by default) tells the image model which reference picture is which character.

### 4. Draw

Pick an **image model** and, if you like, its size, aspect ratio, resolution and quality (the choices follow the model). Press **Draw the scene**.

- With portraits, the picture is made as an image edit, so the model can use their faces and looks.
- Without portraits, it is a plain image generation.

When the picture is done, **Animate this picture →** opens [Animate the DreamGen Scene](animate-dreamgen-scene.md) with this picture and this session.

## Tips

- Image models rarely know real local places. The prompt describes what a place looks like instead of naming it; if a landmark comes out wrong, describe it more plainly in step 3.
- Some image models refuse realistic faces in reference pictures. If one refuses, try another model rather than rewording the prompt.
- Once a step's model is chosen, **Hide settings** folds that step away, and the choice is remembered. A second picture is then just: load the export, write the prompt, draw.
- What you type is kept if the page reloads (this tab only).

## Privacy

Your export, prompts and pictures stay in your browser. They go only to the provider you chose, with your own key. Feedback on this tool goes to Zorander on the DreamGen Discord.
