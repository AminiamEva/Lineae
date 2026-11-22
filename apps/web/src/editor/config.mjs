import {migrateVersion,migrateStoredPreferences} from './config-migrations.mjs';
import { parseDocument, stringify } from 'yaml';
import { compileKeybindings } from './keybindings.mjs';

const storageKey = 'lineae.config';
const themes = ['system', 'light', 'dark'];
const fileTools = ['open', 'saveAs', 'download', 'language', 'assets'];
const isMapping = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseYaml(text) {
  const document = parseDocument(text, { version: '1.2', stringKeys: true });
  const error = document.errors[0] ?? document.warnings[0];
  if (error) throw error;
  const value = document.toJS({ maxAliasCount: 0 });
  if (!isMapping(value)) throw new Error('Expected a YAML configuration mapping');
  return value;
}

export function toYaml(value) {
  return stringify(value, { lineWidth: 0 });
}

export function mergeConfig(base, override) {
  return Object.fromEntries([
    ...Object.entries(base),
    ...Object.entries(override).map(([key, value]) => [key, isMapping(value)
      ? mergeConfig(Object.hasOwn(base, key) && isMapping(base[key]) ? base[key] : {}, value)
      : value]),
  ]);
}

function checkKeys(defaults, override, path = '') {
  if (!isMapping(override)) throw new Error(`Expected a mapping for ${path || 'configuration'}`);
  if (path === 'editing.ligatures.') return;
  for (const [key, value] of Object.entries(override)) {
    if (!Object.hasOwn(defaults, key)) throw new Error(`Unknown setting: ${path}${key}`);
    if (isMapping(defaults[key])) checkKeys(defaults[key], value, `${path}${key}.`);
  }
}

function validateConfig(settings) {
  const { interface: ui, editing, keybindings } = settings;
  if (settings.version !== 2) throw new Error('Unsupported configuration version');
  if (!['auto', 'en', 'zh-CN', 'zh-Hant'].includes(ui.language)) throw new Error('Invalid interface.language');
  if (!Number.isInteger(ui.sourceFontSize) || ui.sourceFontSize<11 || ui.sourceFontSize>32) throw new Error('Source font must be between 11 and 32 px');
  if (!themes.includes(ui.theme)) throw new Error('Invalid interface.theme');
  if (!Number.isInteger(ui.zoom) || ui.zoom < 50 || ui.zoom > 300) throw new Error('Zoom must be an integer from 50 to 300');
  if (!Array.isArray(ui.toolbar) || new Set(ui.toolbar).size !== ui.toolbar.length ||
      ui.toolbar.some(tool => !fileTools.includes(tool))) throw new Error('Invalid interface.toolbar');
  for (const [path, value] of Object.entries({
    'interface.zoomOnCtrlWheel': ui.zoomOnCtrlWheel,
    'interface.continuedTables': ui.continuedTables,
    'interface.formattingMarks': ui.formattingMarks,
    'interface.caretMotion': ui.caretMotion,
    'interface.toolbarAutoHide':ui.toolbarAutoHide,
    'interface.sourceToolbarAutoHide':ui.sourceToolbarAutoHide,
    ...Object.fromEntries(Object.entries(ui.sidebar).map(([key,value])=>['interface.sidebar.'+key,value])),
    'editing.indentOnSave':editing.indentOnSave,
    'editing.smartFences': editing.smartFences,
    'editing.autoReplaceLigatures': editing.autoReplaceLigatures,
  })) {
    if (typeof value !== 'boolean') throw new Error(`Expected true or false for ${path}`);
  }
  for (const [letters, replacement] of Object.entries(editing.ligatures)) {
    if (!/^[a-zA-Z]{2,8}$/.test(letters) || (replacement !== null &&
        (typeof replacement !== 'string' || !/^\p{L}$/u.test(replacement)))) {
      throw new Error(`Invalid ligature replacement: ${letters}`);
    }
  }
  if (!Number.isInteger(keybindings.chordTimeoutMs) || keybindings.chordTimeoutMs < 100 || keybindings.chordTimeoutMs > 10000) {
    throw new Error('Shortcut timeout must be an integer from 100 to 10000 ms');
  }
}

export function createConfigStore(defaultYaml, { storage, isMac = false, onError = () => {} } = {}) {
  const defaults = parseYaml(defaultYaml);
  let overrides = {};
  let settings = defaults;
  validateConfig(settings);
  let bindings = compileKeybindings(settings.keybindings, { isMac });

  function persist() {
    try {
      storage?.setItem(storageKey, toYaml({ ...overrides, version: 2 }));
      storage?.removeItem('lineae.theme');
    } catch (error) { onError(error); }
  }

  function apply(next) {
    checkKeys(defaults, next);
    const merged = mergeConfig(defaults, next);
    validateConfig(merged);
    const compiled = compileKeybindings(merged.keybindings, { isMac });
    overrides = next;
    settings = merged;
    bindings = compiled;
  }

  try {
    const saved = storage?.getItem(storageKey);
    const parsed = saved ? parseYaml(saved) : {};
    const migration = migrateStoredPreferences(parsed,storage);
    apply(migration.profile);
    if (migration.changed) {
      persist();
      for (const key of migration.removals) storage?.removeItem(key);
    }
  } catch (error) { onError(error); }

  return {
    get value() { return settings; },
    get bindings() { return bindings; },
    importYaml(text) { apply(migrateVersion(parseYaml(text))); persist(); },
    exportYaml() { return toYaml(settings); },
    updateInterface(patch) {
      checkKeys(defaults.interface, patch, 'interface.');
      const updated = { ...settings, interface: mergeConfig(settings.interface, patch) };
      validateConfig(updated);
      overrides = mergeConfig(overrides, { interface: patch });
      settings = updated;
      persist();
    },
  };
}
