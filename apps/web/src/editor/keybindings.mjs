const modifiers = ['ctrl', 'alt', 'shift', 'meta'];
const aliases = new Map([
  ['control', 'ctrl'], ['cmd', 'meta'], ['command', 'meta'], ['option', 'alt'],
  ['`', 'backtick'], ['-', 'minus'], ['=', 'equal'], ['+', 'plus'], [' ', 'space'],
]);

function canonicalKey(value) {
  const lower = value.toLowerCase();
  return aliases.get(lower) ?? lower;
}

function parseStroke(stroke, isMac) {
  const parts = stroke.split('+').map(canonicalKey);
  const key = parts.pop();
  const held = parts.map(part => part === 'mod' ? (isMac ? 'meta' : 'ctrl') : part);
  if (!key || modifiers.includes(key) || held.some(part => !modifiers.includes(part)) ||
      new Set(held).size !== held.length ||
      !(/^[\p{L}\p{N}\p{P}\p{S}]$/u.test(key) || /^(f[1-9]|f1\d|f2[0-4]|arrow(up|down|left|right)|enter|escape|tab|home|end|page(up|down)|backspace|delete|backtick|minus|equal|plus|space)$/.test(key))) {
    throw new Error(`Invalid keystroke: ${stroke}`);
  }
  return [...modifiers.filter(part => held.includes(part)), key].join('+');
}

export function compileKeybindings(config, { isMac = false } = {}) {
  const { chordTimeoutMs, ...sections } = config;
  const scopes = new Map();
  for (const [scope, bindings] of Object.entries(sections)) {
    const entries = [];
    for (const [command, value] of Object.entries(bindings)) {
      if (value === null) continue;
      for (const shortcut of Array.isArray(value) ? value : [value]) {
        if (typeof shortcut !== 'string') throw new Error(`Invalid shortcut for ${scope}.${command}`);
        const strokes = shortcut.trim().split(/\s+/).map(stroke => parseStroke(stroke, isMac));
        const [first, second] = strokes;
        if (strokes.length > 2 || !(/^(ctrl|alt|meta)\+|^f\d+$/.test(first.replace(/^shift\+/, ''))) || second === 'escape') {
          throw new Error(`Invalid shortcut for ${scope}.${command}: ${shortcut}`);
        }
        const conflict = entries.find(entry => entry.first === first &&
          (!second || !entry.second || entry.second === second));
        if (conflict) throw new Error(`Conflicting shortcuts in ${scope}: ${conflict.command}, ${command}`);
        entries.push({ scope, command, first, second });
      }
    }
    scopes.set(scope, entries);
  }
  return { scopes, chordTimeoutMs };
}

function eventStroke(event) {
  let key = event.key;
  if (event.shiftKey && /^Digit\d$/.test(event.code) && !/^\d$/.test(key)) key = event.code.slice(-1);
  if ((event.ctrlKey || event.altKey || event.metaKey) && /^Key[A-Z]$/.test(event.code) && !/^[a-z]$/i.test(key)) {
    key = event.code.slice(-1);
  }
  const flags = [event.ctrlKey, event.altKey, event.shiftKey, event.metaKey];
  return [...modifiers.filter((_, index) => flags[index]), canonicalKey(key)].join('+');
}

function releasedPrefixModifiers(first, stroke) {
  const prefix = first.split('+').slice(0, -1);
  const parts = stroke.split('+');
  const key = parts.pop();
  return parts.every(part => prefix.includes(part)) ? key : stroke;
}

export function installKeybindings(target, { getBindings, getContext, run }) {
  let pending = null;
  let consumedKey = null;
  const consume = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  target.addEventListener('pointerdown', () => { pending = null; }, true);
  target.addEventListener('blur', () => { pending = null; consumedKey = null; });
  target.addEventListener('keyup', event => {
    if ((event.code || event.key) === consumedKey) consumedKey = null;
  }, true);
  target.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.getModifierState?.('AltGraph')) {
      pending = null;
      return;
    }
    if (modifiers.includes(canonicalKey(event.key))) return;
    if (event.key === 'Escape') { pending = null; return; }
    const physicalKey = event.code || event.key;
    if (event.repeat && physicalKey === consumedKey) { consume(event); return; }
    if (!pending && !event.ctrlKey && !event.metaKey && !event.altKey && !/^F\d+$/.test(event.key)) return;

    const bindings = getBindings();
    const context = getContext(event);
    const stroke = eventStroke(event);
    const candidates = context.scopes.flatMap(scope => bindings.scopes.get(scope) ?? [])
      .filter(entry => !context.only || entry.command === context.only);
    const previous = pending;
    pending = null;
    if (previous && previous.element === context.element && previous.bindings === bindings && performance.now() < previous.expires) {
      const second = releasedPrefixModifiers(previous.first, stroke);
      const choices = candidates.filter(entry => entry.first === previous.first && entry.second);
      const match = choices.find(entry => entry.second === stroke) ?? choices.find(entry => entry.second === second);
      if (match && run(match, context, event) !== false) {
        consumedKey = physicalKey;
        consume(event);
        return;
      }
    }
    for (const entry of candidates) {
      if (entry.first !== stroke) continue;
      if (entry.second) {
        pending = { first: stroke, bindings, element: context.element, expires: performance.now() + bindings.chordTimeoutMs };
        consume(event);
        return;
      }
      if (run(entry, context, event) !== false) { consume(event); return; }
    }
  }, true);
}
