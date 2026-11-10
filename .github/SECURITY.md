# Security policy

## Reporting a vulnerability

Please report security problems **privately**, not in a public issue: go to the repository's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/hkarn/LLM-PlayGround/security/advisories/new)).

Include what you found, the steps to reproduce it, and which version or commit you tested. You can expect a first answer within about a week. This is a small, volunteer-run project, so a fix may take longer, but you'll be kept informed and credited if you wish.

## What counts

The most relevant problems are those that could expose a user's API key or content:

- the page sending keys or content anywhere other than the provider the user chose;
- `server.js` forwarding a server key (`*_API_KEY` in `.env`) to a host it should not, or the `/api/*` proxy being usable to reach things it should not (for example when `ALLOW_ANY_UPSTREAM` is off);
- script injection (XSS) from model output, a provider response or an imported file.

## Not in scope

- Problems in a provider's own service. Report those to the provider.
- Running the local server on a public address with `ALLOW_ANY_UPSTREAM` on, or with server keys set, and no access control in front of it. [docs/running.md](../docs/running.md) explains why that is unsafe.

## Supported versions

Only the latest version on `main`, which is what <https://hkarn.github.io/LLM-PlayGround/> and the `ghcr.io/hkarn/llm-playground` image are built from.
