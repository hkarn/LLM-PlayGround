/* LLM PlayGround: Tool placeholder: Video Generator. */
import { el } from '../ui/dom.js';

// Placeholder: a curated video tool. The Video tab stays as the raw endpoint tester.
export function renderVideoGeneratorPlaceholder(root) {
  root.append(
    el('div', { class: 'placeholder-note' },
      el('strong', { text: 'What this will be' }),
      el('ul', {},
        el('li', { text: 'Only video models we have tested, each with the options it really supports (duration, resolution, aspect ratio, audio, first and last frame).' }),
        el('li', { text: 'Price shown before you start, from the model\'s per-second pricing.' }),
        el('li', { text: 'Jobs keep running while you do other things, and finished videos are listed in a gallery.' })),
      el('div', { class: 'muted small', text: 'For any video model with raw request and response details, use the Video tab.' })),
    el('div', { class: 'vidgen mock' },
      el('div', {},
        el('strong', { text: 'Model' }),
        el('div', { class: 'vg-models' },
          ...['Tested model 1', 'Tested model 2', 'Tested model 3'].map((t) => el('div', { class: 'vg-model' },
            el('div', { text: t }), el('div', { class: 'muted small', text: 'durations · resolutions · price/s' })))),
        el('label', {}, 'Prompt', el('textarea', { rows: 3, disabled: '', placeholder: 'Describe the video…' })),
        el('div', { class: 'grid3' },
          el('label', {}, 'Duration', el('select', { disabled: '' }, el('option', { text: '—' }))),
          el('label', {}, 'Resolution', el('select', { disabled: '' }, el('option', { text: '—' }))),
          el('label', {}, 'Aspect ratio', el('select', { disabled: '' }, el('option', { text: '—' })))),
        el('button', { type: 'button', class: 'primary', disabled: '', text: 'Generate' })),
      el('div', {},
        el('strong', { text: 'Preview' }),
        el('div', { class: 'vg-stage', text: 'Your video will play here' }),
        el('strong', { text: 'Gallery' }),
        el('div', { class: 'muted small', text: 'Finished videos will be listed here.' }))));
}

/* ------------------------------------------------------------------ */
/* Tool: Draw the DreamGen Scene                                       */
/* ------------------------------------------------------------------ */
// Sends a DreamGen session export (the Markdown export, or a JSON export written out the same
// way) to a chat model, which finds the last scene and writes an image prompt with the visible
// characters named and described, then sends that prompt, with optional reference portraits,
// to the provider's image endpoint.
// Format notes: docs/dreamgen-session-export.md.
