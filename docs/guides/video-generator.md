# Video Generator

Make short video clips from a prompt, and optionally from a first and last picture. The models we have tested come first, each with only the settings it really supports and the price shown before you send.

Open it: **Tools → Video Generator**, or <https://hkarn.github.io/LLM-PlayGround/#tools/video-generator>.

## Before you start

You need an API key for a provider with video models, loaded in the connection panel at the top. OpenRouter is the one we have tested; Requesty has no video. Video costs real money per clip, so start with the cheapest settings.

## Make a clip

1. **Prompt:** describe the clip: what moves, how the camera moves, the light.
2. **Video model:** pick a card. Each card shows:
   - which pictures the model takes (first frame, or first and last);
   - its **audio**: always on, optional, or none;
   - what happened with a realistic **face** in our tests;
   - its **price** for the cheapest clip. That is the provider's listed price, or **$** (cheapest) to **$$$$$** where only an estimate is possible.

   **Other video model** lists every other video model your key can use. These are untested: their options and prices come from the provider's list, and they may refuse some settings or pictures.
3. **Settings:** duration, resolution and aspect ratio offer only what the chosen model supports, starting from the cheapest. Audio is a checkbox only where turning it off works.
4. **First frame / Last frame** (optional): the clip starts from your picture, and ends on the other where the model supports it. Some models need a first frame (the card says "(needed)"). WebP, GIF and other formats are converted to PNG automatically.
5. Check the **Price** line and press **Generate video**.

The job runs at the provider; the page checks every 5 seconds. A clip usually takes 15 seconds to a couple of minutes. **Cancel** stops waiting, but the provider may still finish and charge for it.

## Your clips

Finished clips play right away and can be downloaded. They are listed under **Your clips**, with the model, settings, price and time.

- The list survives a reload, but the videos themselves aren't stored in your browser.
- **Fetch the video again** downloads an older clip from the provider without paying again, while the provider still keeps it. It works only with the provider that made the clip; elsewhere the clip says which provider that was.
- **×** removes a clip from the list.

## What we found when testing

These are cheap tests, one or two runs per model with plain pictures (November 2026):

| Model | Good to know |
| --- | --- |
| Mischief 1 | The cheapest. Needs a first frame; 16:9, 3 or 5 s. Kept a realistic face |
| Grok Imagine 1.5 lite | Text or first frame, 1–15 s. Always has audio. Keeps the frame's shape whatever aspect ratio you ask for. Kept a realistic face |
| Seedance 1.5 Pro | First and last frame, 4–12 s, from 480p. Kept AI-made faces (unlike Seedance 2.0). Audio can be turned off (half the price); with audio on it may invent dialogue that fits the scene. Priced per video token (an estimate) |
| HeyGen Video 1 | First frame, 5–30 s, from 480p. No audio. Kept an AI-made alien face. A test was billed half its listed price, which its price scale includes |
| Grok Imagine | Like 1.5 lite, about twice the price |
| Gemini Omni 1.2 Flash | Text, first frame, or first and last. 360p is the cheap tier. Always has audio |
| Seedance 2.0 fast | First and last frame, 4–15 s, 480p or 720p. Kept an AI-made alien face (unlike Seedance 2.0 mini). Audio can be turned off. Priced per video token (an estimate) |
| Runway Gen-4.5 | First frame, 2–10 s, 720p. No audio. Kept an AI-made alien face. Billed exactly its listed price |
| Kling 3.0 Standard | First and last frame, 3–15 s, 720p. Audio can be turned on or off (off is cheaper). Kept realistic characters with mildly alien faces |
| HappyHorse 1.1 | First frame, 3–15 s, from 720p. Kept an AI-made alien face. Always has audio. Billed about 1.6× its listed price, which its price scale includes |
| Hailuo 3 Max | 5–15 s. Its clips had an audio track |
| Wan 3.0 | First and last frame. Billed about twice its listed price in a test, which its price scale includes |

Veo 3.1 Lite and Seedance 2.0 mini were tested too, and are no longer suggested: they refuse faces, even AI-made, non-human ones, so they don't suit DreamGen scenes. They worked for text-only clips and frames without faces, and are still under **Other video model**.

Six more were tested in November 2026 and kept an AI-made face, but are not suggested, because there is a cheaper or better choice on the list: Gemini Omni 1.1 Flash (older than 1.2), Grok Imagine Video 1.5 (dearer than Grok Imagine), Wan 3.0 Prime and Wan 2.7 (billed about 2.5 times their listed price, and they add sound even with audio off), Wan 2.6 ($0.50 for 5 s) and Seedance 2.5 (about 3 minutes a clip). They are all under **Other video model**.

For any video model with the raw request and response, use the **Video** tab under **API tester**.
