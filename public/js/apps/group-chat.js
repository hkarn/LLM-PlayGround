/* LLM PlayGround: Game placeholder: AI Group Chat. */
import { $, el } from '../core.js';

// Placeholder: the layout the group chat will have, with nothing wired up yet.
export function renderGroupChatPlaceholder(root) {
  const people = [
    { name: 'Ada', color: '#7c5cd6', role: 'curious scientist', model: 'pick a chat model' },
    { name: 'Bram', color: '#d6705c', role: 'grumpy pirate', model: 'pick a chat model' },
    { name: 'Cleo', color: '#3f9e7a', role: 'quiz host', model: 'pick a chat model' },
  ];
  const avatar = (p) => el('span', { class: 'gc-avatar', style: `background:${p.color}`, text: p.name[0] });
  const msg = (p, text) => el('div', { class: `gc-msg${p ? '' : ' me'}` },
    p ? avatar(p) : el('span', { class: 'gc-avatar', style: 'background:var(--accent)', text: 'You'[0] }),
    el('div', { class: 'bubble' }, el('div', { class: 'small muted', text: p ? p.name : 'You' }), text));
  root.append(
    el('div', { class: 'placeholder-note' },
      el('strong', { text: 'What this will be' }),
      el('ul', {},
        el('li', { text: 'Add 2–6 AI characters, each with a name, a personality and any chat model from the chosen endpoint.' }),
        el('li', { text: 'They take turns answering you and each other, so different models talk in one conversation.' }),
        el('li', { text: 'Modes such as free chat, a debate or a guessing game, and a cost counter per character.' }))),
    el('div', { class: 'groupchat mock' },
      el('div', { class: 'gc-side' },
        el('strong', { text: 'Characters' }),
        ...people.map((p) => el('div', { class: 'gc-person' }, avatar(p),
          el('div', {}, el('div', { text: `${p.name} · ${p.role}` }), el('div', { class: 'muted small', text: p.model })))),
        el('button', { type: 'button', class: 'secondary', disabled: '', text: '+ Add character' })),
      el('div', { class: 'gc-main' },
        el('div', { class: 'gc-log' },
          msg(null, 'Hi all! What should we play?'),
          msg(people[2], 'A quiz! First question: which planet has the most moons?'),
          msg(people[0], 'Saturn, last I checked. The count keeps changing as new ones are found.'),
          msg(people[1], 'Arr, I only count the ones I can see from the deck.')),
        el('div', { class: 'row' },
          el('input', { disabled: '', placeholder: 'Coming soon', style: 'flex:1' }),
          el('button', { type: 'button', class: 'primary', disabled: '', text: 'Send' })))));
}
