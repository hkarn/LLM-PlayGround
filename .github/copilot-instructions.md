# LLM PlayGround project instructions

The project instructions for coding agents and contributors are in [`CLAUDE.md`](../CLAUDE.md)
at the repo root. Read it before reviewing or changing anything, and follow it as if it were
written here: it is the single source, so this file doesn't repeat it.

The parts that matter most in a review:

- No build step and no npm packages; plain JS ES modules in `public/js/`, imports one way
  (dom ← core ← adapter ← ui ← testers/apps ← hubs ← main).
- Provider-specific data lives in `public/providers/*.json`, and every request and answer
  goes through `public/js/adapter.js`; never a provider's wire format in an app.
- Every path in `public/` stays relative (the site runs from the `/LLM-PlayGround/` subfolder).
- Nothing leaves the browser except the user's own requests to their provider: no analytics,
  no outside resources, no logging of content in `server.js`.
- A change that alters what a user sees or does updates the matching guide in `docs/guides/`.
