# Animate the DreamGen Scene

Turn a scene picture into a short video clip of what happens next. A chat model reads the same DreamGen session and writes a motion prompt, then a video model brings the picture to life for a few seconds.

Open it: **Tools → Animate the DreamGen Scene**, or <https://hkarn.github.io/LLM-PlayGround/#tools/dreamgen-video>. Clicking **Tools** in the top bar opens a menu of every tool, so you can switch straight from it; inside a tool, its title is a drop-down that does the same, and **←** goes back to the list.

## Before you start

- An API key for a provider with video models. OpenRouter is the one we have tested. **LLM Gateway** works too, through your own server (Docker or `node server.js`): its video models are listed as untested, with their own durations and sizes but no price. Requesty has no video. Only models that say they take a starting picture are offered (on LLM Gateway: Veo, Grok Imagine, Kling, MiniMax, FLUX 3 Max and VEED Fabric, not Seedance).
- A scene picture. The easiest is to draw one first in [Draw the DreamGen Scene](draw-dreamgen-scene.md) and press **Animate this picture →**, which brings the picture, its prompt and the session along. You can also upload any picture.

## Settings

The **settings panel** on the right holds what you choose once and then leave alone. On a phone it folds into a **Settings** button above the steps, which shows the chosen models while it is closed. **How it works · Privacy** at the top of the tool is open on your first visit and folded after that; click it to read it again. Click a heading in the panel to fold its section away (or open it again); they all start open.

- **Prompt writer:** the **chat model** that writes the motion prompt, its **Max tokens** and **System prompt**.
- **Picture style:** shared with Draw the DreamGen Scene, so it starts as the style the picture was drawn in.
- **Video model:** pick a row. Only models that take a first frame are offered. Each row shows the model's name, small marks for sound (always, optional or none) and a face kept in our tests (filled when it was a realistic one), explained in a legend under the list, and the price; hover a row, or pick it, for the words (the chosen model's details show under the list):
  - **Faces:** the suggested models Mischief and Grok Imagine kept a realistic face from the picture, HappyHorse 1.1, HeyGen Video 1, Seedance 2.0 fast and Runway Gen-4.5 kept an AI-made alien face, Kling 3.0 Standard kept mildly alien faces, and Seedance 1.5 Pro kept AI-made faces (with audio on it may invent fitting dialogue). Veo 3.1 Lite and Seedance 2.0 mini were taken off the list because they refuse faces, even AI-made, non-human ones; you can still pick them under Other video model for a scene without faces.
  - **Audio:** some always add sound, some can turn it off, some have none.
  - **Price:** the provider's listed price for the cheapest clip, or **$** to **$$$$$** where only an estimate is possible.
  - **Other video model** lists every other video model your key can use, marked untested.
- **Duration, resolution and aspect ratio:** only what the chosen model supports is offered, and the cheapest settings are chosen first.

The models are shared between the tools: a chat, image or video model chosen in one tool is the one the next tool opens with, together with its options. Each provider keeps its own choices. If the video model chosen in the Video Generator can't start from a picture, Animate doesn't swap it for another: it says so above the list (and beside the folded Settings button on a phone) and waits for you to pick one. Your pick then becomes the choice in the Video Generator too.

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

The job is sent to the provider and runs in the background, so you can make the next clip while it runs. It takes about 15 seconds to a couple of minutes. When it's done, the clip plays here, with the time taken and the price billed. The bar under it has **Request details** on the left, and **↻ Retry** (a new job with the same picture and motion, paid again) and the **download** icon on the right. Every job, from this tool and the Video Generator, is also listed under **Video jobs** in the settings panel, where it carries on after a reload; see [Video jobs](video-generator.md#video-jobs) in the Video Generator guide. The clip pause when you go to another tab or tool, and stay paused when you come back: press play to go on.

## If a model refuses

A refusal mentioning guidelines, policy or safety usually means the model won't take this picture, often because of a realistic face. Pick a model with a filled face mark (it **kept the face**), rather than rewording the prompt.

## Privacy

The picture and the session stay in your browser and go only to the provider you chose, with your own key. Nothing new is stored.
