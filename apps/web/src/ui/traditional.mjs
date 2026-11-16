import {CHARACTER_PAIRS} from './traditional-data.mjs';

const characters = Array.from(CHARACTER_PAIRS.replace(/\s/g,''));
const substitutions = new Map();
for (let offset = 0; offset + 1 < characters.length; offset += 2) {
  substitutions.set(characters[offset],characters[offset + 1]);
}

export function toTraditional(value) {
  return Array.from(String(value ?? ''),character => substitutions.get(character) ?? character).join('');
}
