/* LLM PlayGround: the asset version. Imports nothing. pages.yml writes the commit into this file. */
// The asset version: "dev" locally; pages.yml writes the commit here so data files fetched at
// start-up (providers/*.json) are never an old cached copy next to new code.
export const ASSET_VERSION = 'dev';
