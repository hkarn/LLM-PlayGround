# Animate the DreamGen Scene

Turn a scene picture into a short video clip of what happens next. A chat model reads the same DreamGen session and writes a motion prompt, then a video model brings the picture to life for a few seconds.

Open it: **Tools → Animate the DreamGen Scene**, or <https://hkarn.github.io/LLM-PlayGround/#tools/dreamgen-video>.

## Before you start

- An API key for a provider with video models. OpenRouter is the one we have tested; Requesty has no video.
- A scene picture. The easiest is to draw one first in [Draw the DreamGen Scene](draw-dreamgen-scene.md) and press **Animate this picture →**, which brings the picture, its prompt and the session along. You can also upload any picture.

## Step by step

### 1. Scene picture

The picture becomes the clip's first frame.

- **Use the last drawn scene** takes the latest picture from Draw the DreamGen Scene. It is passed in memory, so it is gone after a reload.
- **or upload** takes any picture. WebP, GIF and other formats are converted to PNG automatically, since video models take only PNG or JPEG.

### 2. Motion prompt

1. Pick a **chat model**.
2. Give it the session: **Use the session from Draw the DreamGen Scene**, or **load an export**, or paste one. **Keep only the last 10k tokens of the Session** saves tokens.
3. **What the picture shows** is filled in from Draw the DreamGen Scene, so the model knows what's in the frame. You can edit it.
4. Press **Write motion prompt**. The model writes one or two sentences about what moves in the next few seconds: people, wind, water, light, and how the camera moves.

Edit the **Motion prompt** as you like; that is what the video model gets.

**Picture style** adds a style to the end of the motion prompt, such as "Style: Watercolour illustration …". It is shared with Draw the DreamGen Scene, so it starts as the style the picture was drawn in.

### 3. Model, settings and the clip

1. Pick a **video model**. The cards show what each one takes and what we found when we tested it:
   - **Faces:** some models keep a realistic face from the picture (Mischief, Grok Imagine); others refuse realistic faces (Veo, Seedance).
   - **Audio:** some always add sound, some can turn it off, some have none.
   - **Price:** the provider's listed price for the cheapest clip, or **$** to **$$$$$** where only an estimate is possible.
   - **Other video model** lists every other video model your key can use, marked untested.
2. Pick the **duration, resolution and aspect ratio**. Only what the chosen model supports is offered, and the cheapest settings are chosen first.
3. Check the **Price** line, then press **Make video**.

The clip takes about 15 seconds to a couple of minutes. **Cancel** stops waiting, but the provider may still finish the job and charge for it. When it's done, the clip plays and can be downloaded, with the time taken and the price billed.

## If a model refuses

A refusal mentioning guidelines, policy or safety usually means the model won't take this picture, often because of a realistic face. Pick a model whose card says it **kept the face**, rather than rewording the prompt.

## Privacy

The picture and the session stay in your browser and go only to the provider you chose, with your own key. Nothing new is stored.
