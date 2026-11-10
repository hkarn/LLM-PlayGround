# Draw the DreamGen Scene

Turn the last scene of a [DreamGen](https://dreamgen.com/) role-play into a picture. A chat model reads your session, finds where the last scene happens and who is in it, and writes an image prompt. An image model then draws it, using your character portraits if you add them.

Open it: **Tools → Draw the DreamGen Scene**, or <https://hkarn.github.io/LLM-PlayGround/#tools/dreamgen-scene>. Clicking **Tools** in the top bar goes to the tool you used last (or the list); while you are in Tools, clicking it opens a menu of every tool, so you can switch straight from it; inside a tool, its title is a drop-down that does the same, and **←** goes back to the list.

## Before you start

- An API key, loaded in the connection panel at the top. See [the main README](../../README.md#1-get-an-api-key).
- A DreamGen session export. In DreamGen, export the **session** (the game you played), not only the scenario. Both the Markdown and the JSON export work.

## Settings

The **settings panel** on the right holds what you choose once and then leave alone. On a phone it folds into a **Settings** button above the steps, which shows the chosen models while it is closed. **How it works · Privacy** at the top of the tool is open on your first visit and folded after that; click it to read it again. Click a heading in the panel to fold its section away (or open it again); they all start open.

- **Prompt writer:** the **chat model** that reads the export and writes the image prompt. Any good general model works. **curated** shows only the models we have tested for this tool. **Max tokens** and the **System prompt** (with **Reset to default**) are there too.
- **Image model:** the model that draws, and its size, aspect ratio, resolution and quality (the choices follow the model).
- **Picture style** adds a style to the end of the prompt: Photoreal, Cinematic still, Digital painting, Oil painting, Watercolour, Anime, Comic, Pencil sketch, or your own with **Custom…**. Animate the DreamGen Scene uses the same one.

The models are shared between the tools: a chat, image or video model chosen in one tool is the one the next tool opens with, together with its options. Each provider keeps its own choices.

## Step by step

### 1. Session export

Load the export file. The tool shows its title, how many turns it has, the player's character, and how many pictures are embedded in it (JSON exports with images carry them: characters, personas, locations, objects, the narrator and the cover).

### 2. Write the image prompt

1. Check the **Session to send**. The whole export is sent, and a long game costs many tokens, so you can edit it down first:
   - **Trim session** keeps only the last part of the Session (pick 5k–30k tokens), cut at a paragraph so no turn is split.
   - **Undo** puts back what was cut; **Restore the full export** starts over.
   - Above the Session, you can delete what the picture doesn't need, such as Examples, Openings and game rules.
2. Optionally add a **Note for this picture**, such as "focus on the moment she opens the letter; wide shot".
3. Press **Write image prompt**. It uses the chat model from the settings panel.

The model's prompt appears in step 3. It names and describes each visible character, so it works even without portraits.

### 3. Prompt and reference portraits

- **Edit the prompt** as you like.
- **Copy prompt** copies the prompt with its style, for example to use in DreamGen's own image generator instead of step 4.
- **Characters in the scene:** each character the model put in the picture is listed with an **Add portrait** button. The export's first picture of each of them is ticked to be sent automatically.
- **Pictures from the export:** all the other embedded pictures (further pictures of a character, locations, objects, the cover) are listed with the rest, **unticked**, each with the caption it has in DreamGen. Tick **Send** on any you want the image model to see, for example a location picture, and change the name if you like. Each picture from the export also has **Download** (as it is, usually WebP) and **JPEG** buttons, to save it as a file, which is a way to get your pictures out of DreamGen without the AVIF format. Loading an export sends nothing; only ticked pictures go, and at most 16.
- **Add portraits** adds any other reference pictures. Type who each one is in **Who is this?**.
- **Add the portrait names to the prompt** (on by default) tells the image model which reference picture is which character.

### 4. Draw

Press **Draw the scene**. It uses the image model and options from the settings panel, and adds the picture style to the prompt.

- With portraits, the picture is made as an image edit, so the model can use their faces and looks.
- Without portraits, it is a plain image generation.
- **Will animate: show every face to the camera:** tick it when the picture will become a clip. It adds an instruction to the prompt to show every character's face clearly to the camera, not from behind, turned away, covered or in deep shadow, because a video model can only keep a face it sees in the first frame. The choice is remembered in this browser. Animate this picture → then turns them back into the scene at the start of the clip (see **Faces posed for the camera** in that guide).

When the picture is done, **Animate this picture →** opens [Animate the DreamGen Scene](animate-dreamgen-scene.md) with this picture and this session.

## Tips

- Image models rarely know real local places. The prompt describes what a place looks like instead of naming it; if a landmark comes out wrong, describe it more plainly in step 3.
- Some image models refuse realistic faces in reference pictures. If one refuses, try another model rather than rewording the prompt.
- With the settings chosen, a second picture is just: load the export, write the prompt, draw.
- Each step's answer shows first. **Request details** holds the status, the request, the raw response and a cURL command, for when something goes wrong.
- The picture has a bar under it: **Request details** on the left, and on the right **↻ Retry** (draw the same prompt again, at the same price) and the **download** icon (saved as `scene-<date>-<time>.png`). Click the picture to see it larger; Esc or a click outside closes it. Right-click works as usual.
- What you type is kept if the page reloads (this tab only).

## Privacy

Your export, prompts and pictures stay in your browser. They go only to the provider you chose, with your own key. Feedback on this tool goes to Zorander on the DreamGen Discord.
