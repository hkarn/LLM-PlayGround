# Contributing to LLM PlayGround

Thanks for wanting to help. This is a small project, so the process is light.

## Ways to help

- **Report a bug or suggest an idea:** open an [issue](https://github.com/hkarn/LLM-PlayGround/issues/new/choose). Say which provider and which tab or tool you used, and what you expected to happen. Never paste an API key.
- **Try a provider or model and tell us what happened:** a tested model with its options and cost is the most useful kind of report (see the Video Generator's model list for what is recorded).
- **Fix something or add a feature:** open or comment on an issue first, so we agree on the direction before you spend time on it.

## Making a change

1. Run it locally: `node server.js` (Node 18 or later), then open <http://127.0.0.1:3000>. See [docs/running.md](../docs/running.md).
2. Branch from the latest `main`. `main` is protected, so every change is a pull request.
3. Keep to one topic per pull request, and link the issue it belongs to (`Closes #N`).
4. Before you push, run `node --check` on every changed `.js` file, parse every changed `.json` file, and open the page and use what you changed. Say in the pull request what you tested and what you didn't (for example: no real provider call).
5. Open the pull request as a draft. If a change alters what people see or do, update the matching guide in [docs/guides/](../docs/guides/).

## Ground rules for the code

The full rules are in [CLAUDE.md](../CLAUDE.md) and the layout is in [docs/code.md](../docs/code.md). The short version:

- No build step and no npm packages: plain JavaScript ES modules in `public/js/`.
- Provider-specific data lives in `public/providers/*.json`, and every request and answer goes through `public/js/adapter.js`.
- Every path in `public/` stays relative, because the site runs from a subfolder on GitHub Pages.
- Nothing leaves the browser except the user's own requests to their provider: no analytics, no outside resources, no logging of content in `server.js`.

## Conduct and security

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security problem, use the [security policy](SECURITY.md) and not a public issue.

By contributing you agree that your contribution is licensed under the project's [MIT License](../LICENSE).
