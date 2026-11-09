/* LLM PlayGround: UI component: the picture styles of the DreamGen tools. The chosen style is added
   to the end of the prompt ("Style: …"): the image prompt in Draw the DreamGen Scene, the motion
   prompt in Animate the DreamGen Scene. Both tools share one remembered choice, so a clip keeps the
   style its picture was drawn in. */
import { store } from '../core.js';
import { el } from './dom.js';

// "" leaves the style to the prompt; "custom" uses the text the user types.
export const SCENE_STYLES = [
  ['', 'None'],
  ['Photorealistic, like a photograph taken on location: natural light, real skin and fabric texture, shallow depth of field.', 'Photoreal'],
  ['Cinematic film still: anamorphic widescreen look, dramatic but natural lighting, subtle film grain, colour-graded.', 'Cinematic still'],
  ['Digital painting in the style of fantasy concept art: painterly brushwork, rich light and atmosphere.', 'Digital painting'],
  ['Classical oil painting: visible brushstrokes, rich pigments, chiaroscuro lighting, canvas texture.', 'Oil painting'],
  ['Watercolour illustration: soft washes, loose edges, paper texture, muted colours.', 'Watercolour'],
  ['Anime style: clean line art, cel shading, expressive faces, detailed painted background.', 'Anime'],
  ['Comic book / graphic novel panel: bold ink outlines, flat colours with hard shadows.', 'Comic / graphic novel'],
  ['Pencil sketch: graphite on paper, hatching and smudged shading, no colour.', 'Pencil sketch'],
  ['custom', 'Custom…'],
];

// The style dropdown and the custom-style field, remembered under dgscene_style(_custom).
// Returns { select, custom, sync(), text(), withStyle(prompt) }; sync() shows the custom field
// only for "Custom…" (call it once the field is in a label).
export function sceneStylePicker() {
  const select = el('select', { name: 'style' }, ...SCENE_STYLES.map(([v, t]) => el('option', { value: v, text: t })));
  const custom = el('input', { name: 'style_custom', placeholder: 'e.g. 1980s fantasy paperback cover, airbrushed' });
  const sync = () => { const label = custom.closest('label'); if (label) label.hidden = select.value !== 'custom'; };
  select.value = SCENE_STYLES.some(([v]) => v === store.get('dgscene_style')) ? store.get('dgscene_style') : '';
  custom.value = store.get('dgscene_style_custom') || '';
  select.addEventListener('change', () => { store.set('dgscene_style', select.value); sync(); });
  custom.addEventListener('input', () => store.set('dgscene_style_custom', custom.value));
  const text = () => (select.value === 'custom' ? custom.value.trim() : select.value);
  const withStyle = (prompt) => (text() ? `${prompt}\n\nStyle: ${text()}` : prompt);
  return { select, custom, sync, text, withStyle };
}
