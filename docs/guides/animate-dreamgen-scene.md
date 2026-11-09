# Animate the DreamGen Scene

Turn a scene picture into a short video clip of what happens next. A chat model reads the same DreamGen session and writes a motion prompt, then a video model brings the picture to life for a few seconds.

Open it: **Tools → Animate the DreamGen Scene**, or <https://hkarn.github.io/LLM-PlayGround/#tools/dreamgen-video>.

## Before you start

- An API key for a provider with video models. OpenRouter is the one we have tested; Requesty has no video.
- A scene picture. The easiest is to draw one first in [Draw the DreamGen Scene](draw-dreamgen-scene.md) and press **Animate this picture →**, which brings the picture, its prompt and the session along. You can also upload any picture.

## Settings

The **settings panel** on the right holds what you choose once and then leave alone. On a phone it folds into a **Settings** button above the steps, which shows the chosen models while it is closed. **How it works · Privacy** at the top of the tool is open on your first visit and folded after that; click it to read it again.

- **Prompt writer:** the **chat model** that writes the motion prompt, its **Max tokens** and **System prompt**.
- **Video model:** pick a card. Only models that take a first frame are offered. Each card shows the model's name and price; hover a card, or pick it, to see what it takes and what we found when we tested it (the chosen model's details show under the cards):
  - **Faces:** the suggested models Mischief and Grok Imagine kept a realistic face from the picture, HappyHorse 1.1, HeyGen Video 1, Seedance 2.0 fast and Runway Gen-4.5 kept an AI-made alien face, Kling 3.0 Standard kept mildly alien faces, and Seedance 1.5 Pro kept AI-made faces (with audio on it may invent fitting dialogue). Veo 3.1 Lite and Seedance 2.0 mini were taken off the list because they refuse faces, even AI-made, non-human ones; you can still pick them under Other video model for a scene without faces.
  - **Audio:** some always add sound, some can turn it off, some have none.
  - **Price:** the provider's listed price for the cheapest clip, or **$** to **$$$$$** where only an estimate is possible.
  - **Other video model** lists every other video model your key can use, marked untested.
- **Duration, resolution and aspect ratio:** only what the chosen model supports is offered, and the cheapest settings are chosen first.
- **Picture style:** shared with Draw the DreamGen Scene, so it starts as the style the picture was drawn in.

The models are shared between the tools: a chat, image or video model chosen in one tool is the one the next tool opens with, together with its options. Each provider keeps its own choices.

## Step by step

### 1. Scene picture

The picture becomes the clip's first frame.

- **Use the last drawn scene** takes the latest picture from Draw the DreamGen Scene. It is passed in memory, so it is gone after a reload.
- **or upload** takes any picture. WebP, GIF and other formats are converted to PNG automatically, since video models take only PNG or JPEG.

### 2. Motion prompt

1. Give it the session: **Use the session from Draw the DreamGen Scene**, or **load an export**, or paste one. **Keep only the last 10k tokens of the Session** saves tokens.
2. **What the picture shows** is filled in from Draw the DreamGen Scene, so the model knows what's in the frame. You can edit it.
3. Press **Write motion prompt**. It uses the chat model from the settings panel. The model writes one or two sentences about what moves in the next few seconds: people, wind, water, light, and how the camera moves.

Edit the **Motion prompt** as you like; that is what the video model gets.

The **picture style** from the settings panel is added to the end of the motion prompt, such as "Style: Watercolour illustration …".

### 3. Make the clip

Check the **Price** line, then press **Make video**. It uses the video model and options from the settings panel.

The clip takes about 15 seconds to a couple of minutes. **Cancel** stops waiting, but the provider may still finish the job and charge for it. When it's done, the clip plays and can be downloaded, with the time taken and the price billed.

## If a model refuses

A refusal mentioning guidelines, policy or safety usually means the model won't take this picture, often because of a realistic face. Pick a model whose card says it **kept the face**, rather than rewording the prompt.

## Privacy

The picture and the session stay in your browser and go only to the provider you chose, with your own key. Nothing new is stored.
