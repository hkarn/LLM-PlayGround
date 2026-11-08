/* LLM PlayGround: Tool placeholder: Animate the DreamGen Scene. */
import { el } from '../ui/dom.js';

// Placeholder: the layout of the scene-to-video tool, with nothing wired up yet. It will take its
// first frame from Draw the DreamGen Scene, and its motion from the same session export.
export function renderDreamGenVideoPlaceholder(root) {
  const step = (title, ...body) => el('section', { class: 'tool-step mock' }, el('h3', { text: title }), ...body);
  root.append(
    el('div', { class: 'placeholder-note' },
      el('strong', { text: 'What this will be' }),
      el('ol', {},
        el('li', { text: 'Start from a scene picture: passed straight from Draw the DreamGen Scene, or an image you upload. It becomes the first frame, since few video models take reference portraits.' }),
        el('li', { text: 'A chat model reads the same session export and writes a short motion prompt: what moves in the next few seconds of the last scene, in one or two sentences.' }),
        el('li', { text: 'Pick from video models we have tested with a scene still (some keep a face, some refuse realistic faces), with only the durations and resolutions each one supports.' }),
        el('li', { text: 'The price is shown before you start. The default is a short, cheap clip: low resolution, 3 to 5 seconds, no audio.' }),
        el('li', { text: 'The job runs in the background with a Cancel button; the finished clip plays here and can be downloaded.' })),
      el('div', { class: 'muted small', text: 'For any video model with raw request and response details, use the Video tab.' })),
    step('1. Scene picture',
      el('div', { class: 'vg-stage', text: 'The picture from Draw the DreamGen Scene will appear here' }),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'secondary', disabled: '', text: 'Use the last drawn scene' }),
        el('label', { class: 'inline' }, 'or upload ', el('input', { type: 'file', disabled: '' })))),
    step('2. Motion prompt',
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'secondary', disabled: '', text: 'Use the session from Draw the DreamGen Scene' }),
        el('label', { class: 'inline' }, 'or load an export ', el('input', { type: 'file', disabled: '' }))),
      el('label', {}, 'Motion prompt', el('textarea', { rows: 3, disabled: '', placeholder: 'e.g. The man on the wall turns his head toward the empty space beside him; the streetlight flickers; the river runs on.' })),
      el('button', { type: 'button', class: 'primary', disabled: '', text: 'Write motion prompt' })),
    step('3. Model and settings',
      el('div', { class: 'vg-models' },
        ...['Tested model 1', 'Tested model 2', 'Tested model 3'].map((t) => el('div', { class: 'vg-model' },
          el('div', { text: t }), el('div', { class: 'muted small', text: 'keeps faces? · durations · price/s' })))),
      el('div', { class: 'grid3' },
        el('label', {}, 'Duration', el('select', { disabled: '' }, el('option', { text: '4 s' }))),
        el('label', {}, 'Resolution', el('select', { disabled: '' }, el('option', { text: '480p' }))),
        el('label', {}, 'Audio', el('select', { disabled: '' }, el('option', { text: 'off' })))),
      el('div', { class: 'muted small', text: 'Estimated price: shown here before you start.' })),
    step('4. Make the clip',
      el('button', { type: 'button', class: 'primary', disabled: '', text: 'Make video' }),
      el('div', { class: 'vg-stage', text: 'Your clip will play here' })));
}
