const modifiers = ['ctrl', 'alt', 'shift', 'meta'];

export function usesAppleShortcuts({platform, userAgentData, userAgent}) {
  return [platform,userAgentData?.platform,userAgent].some(value=>
    /MacIntel|MacPPC|Macintosh|macOS|Mac OS X|iPhone|iPad|iPod/i.test(value ?? ''));
}
const aliases = new Map([
  ['control', 'ctrl'], ['cmd', 'meta'], ['command', 'meta'], ['option', 'alt'],
  ['`', 'backtick'], ['-', 'minus'], ['=', 'equal'], ['+', 'plus'], [' ', 'space'],
  ['backslash', '\\'],
  ['comma', ','],
]);

function canonicalKey(value) {
  const lower = value.toLowerCase();
  return aliases.get(lower) ?? lower;
}

function parseStroke(stroke, isMac) {
  const shiftedLetter = /^[A-Z]$/.test(stroke.split('+').at(-1));
  const parts = stroke.split('+').map(canonicalKey);
  const key = parts.pop();
  const held = parts.map(part => part === 'mod' ? (isMac ? 'meta' : 'ctrl') : part);
  if (shiftedLetter && !held.includes('shift')) held.push('shift');
  if (!key || modifiers.includes(key) || held.some(part => !modifiers.includes(part)) ||
      new Set(held).size !== held.length ||
      !(/^[\p{L}\p{N}\p{P}\p{S}]$/u.test(key) || /^(f[1-9]|f1\d|f2[0-4]|arrow(up|down|left|right)|enter|escape|tab|home|end|page(up|down)|backspace|delete|backtick|minus|equal|plus|space)$/.test(key))) {
    throw new Error(`Invalid keystroke: ${stroke}`);
  }
  return [...modifiers.filter(part => held.includes(part)), key].join('+');
}

// These sequences stay available when Chrome or Safari handles the Command
// shortcut before sending a key event to the editor.
const macWebAlternatives = {
  global: { 'meta+p':'p', 'meta+o':'o', 'meta+shift+n':'shift+n', 'meta+shift+o':'shift+o', 'meta+,':',' },
  editor: { 'meta+f':'shift+f', 'meta+shift+f':'shift+i', 'meta+alt+f':'shift+e', 'meta+shift+t':'shift+t' },
  math: { 'meta+l':'l', 'meta+r':'shift+r', 'meta+f':'f', 'meta+m':'m', 'meta+2':'shift+2', 'meta+shift+2':'alt+2', 'meta+y':'y' },
  source: { 'meta+f':'f', 'meta+h':'h', 'ctrl+space':'space' },
};

export function compileKeybindings(config, { isMac = false, macWeb = false } = {}) {
  const { chordTimeoutMs = 1500, ...sections } = config;
  const scopes = new Map();
  for (const [scope, bindings] of Object.entries(sections)) {
    const entries = [];
    for (const [command, value] of Object.entries(bindings)) {
      if (value === null) continue;
      for (const shortcut of Array.isArray(value) ? value : [value]) {
        if (typeof shortcut !== 'string') throw new Error(`Invalid shortcut for ${scope}.${command}`);
        const strokes = shortcut.trim().split(/\s+/).map(stroke => parseStroke(stroke, isMac));
        const [first, second] = strokes;
        if (strokes.length > 2 || second === 'escape') {
          throw new Error(`Invalid shortcut for ${scope}.${command}: ${shortcut}`);
        }
        const conflict = entries.find(entry => entry.first === first &&
          (!second || !entry.second || entry.second === second));
        if (conflict?.command === command && conflict.first === first && conflict.second === second) continue;
        if (conflict) throw new Error(`Conflicting shortcuts in ${scope}: ${conflict.command}, ${command}`);
        entries.push({ scope, command, first, second });
      }
    }
    scopes.set(scope, entries);
  }
  if (isMac && macWeb) {
    for (const [scope, entries] of scopes) {
      for (const entry of [...entries]) {
        const second = entry.first === 'meta+e' ? entry.second
          : !entry.second && macWebAlternatives[scope]?.[entry.first];
        if (!second || entries.some(other => other.first === 'ctrl+e' && (!other.second || other.second === second))) continue;
        entries.push({ ...entry, first:'ctrl+e', second });
      }
    }
  }
  return { scopes, chordTimeoutMs };
}

function eventStroke(event) {
  let key = event.key;
  if ((event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) &&
      /^Digit\d$/.test(event.code) && !/^\d$/.test(key)) key = event.code.slice(-1);
  if ((event.ctrlKey || event.altKey || event.metaKey) && /^Key[A-Z]$/.test(event.code) && !/^[a-z]$/i.test(key)) {
    key = event.code.slice(-1);
  }
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
    const punctuation = { Backquote:'backtick', Minus:'minus', Comma:',', Period:'.',
      Slash:'/', Backslash:'\\', BracketLeft:'[', BracketRight:']', Semicolon:';', Quote:"'" };
    key = punctuation[event.code] ?? key;
  }
  const flags = [event.ctrlKey, event.altKey, event.shiftKey, event.metaKey];
  return [...modifiers.filter((_, index) => flags[index]), canonicalKey(key)].join('+');
}

function releasedPrefixModifiers(first, stroke) {
  const prefix = first.split('+').slice(0, -1);
  const parts = stroke.split('+');
  const key = parts.pop();
  return [...parts.filter(part => !prefix.includes(part)), key].join('+');
}

export function installKeybindings(target, { getBindings, getContext, run, nativeBindings }) {
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
    if (event.defaultPrevented || event.isComposing ||
        (!event.metaKey && (event.keyCode === 229 || event.getModifierState?.('AltGraph')))) {
      pending = null;
      return;
    }
    if (modifiers.includes(canonicalKey(event.key))) return;
    if (event.key === 'Escape' && pending) { pending = null; return; }
    const physicalKey = event.code || event.key;
    if (event.repeat && physicalKey === consumedKey) { consume(event); return; }
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
      const result = match && run(match, context, event);
      if (match && result !== false) {
        if (result === 'native') return;
        consumedKey = physicalKey;
        consume(event);
        return;
      }
    }
    for (const entry of candidates) {
      const character = entry.first.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey &&
        entry.first === event.key;
      if (entry.first !== stroke && !character) continue;
      if (entry.second) {
        pending = { first: stroke, bindings, element: context.element, expires: performance.now() + bindings.chordTimeoutMs };
        consume(event);
        return;
      }
      const result = run(entry, context, event);
      if (result !== false) {
        if (result !== 'native') consume(event);
        return;
      }
    }
    // Removed/remapped native bindings must not fall through to another
    // editor's default keymap. Outside editing contexts these remain untouched.
    const native = context.scopes.flatMap(scope => nativeBindings?.scopes.get(scope) ?? []);
    if (native.some(entry => entry.first === stroke)) consume(event);
  }, true);
}
