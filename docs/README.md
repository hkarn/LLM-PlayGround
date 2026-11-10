# LLM PlayGround documentation

New here? Start with the [main README](../README.md): what the playground is, how to get a key and how to run it.

## User guides

Step-by-step guides for each tool and game:

- [Draw the DreamGen Scene](guides/draw-dreamgen-scene.md): turn the last scene of a DreamGen story into a picture.
- [Animate the DreamGen Scene](guides/animate-dreamgen-scene.md): turn that picture into a short video clip.
- [Video Generator](guides/video-generator.md): make short clips from your own prompts.
- [AI Group Chat](guides/ai-group-chat.md): chat with several AI characters at once.
- [API tester](guides/api-tester.md): the raw request tabs, the model list and the model filter.

## Reference

- [Providers](providers.md): every supported provider, its URLs, keys, what each one can do, and their quirks.
- [Running and hosting](running.md): with or without the local server, settings, Docker, hosting it publicly, GitHub Pages, and how the server works.
- [Code](code.md): how the code is laid out, for anyone changing it.

## Project

- [Contributing](../.github/CONTRIBUTING.md): how to report, propose and change things.
- [Code of Conduct](../.github/CODE_OF_CONDUCT.md) and [Security policy](../.github/SECURITY.md).

## Specs and formats

- [`requesty-inference-openapi.json`](requesty-inference-openapi.json): Requesty's API, the source of truth for its request and response formats.
- [`llmgateway-openapi.json`](llmgateway-openapi.json): LLM Gateway's API.
- [`dreamgen-session-export.md`](dreamgen-session-export.md): the DreamGen session export format the DreamGen tools read.
