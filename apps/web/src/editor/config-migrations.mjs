const owns = (object,key) => Object.hasOwn(object ?? {},key);

export function migrateVersion(value) {
  if (value.version !== 1) return value;
  const migrated = {version:2,interface:{}};
  for (const key of ['language','zoom']) {
    if (owns(value.interface,key)) migrated.interface[key] = value.interface[key];
  }
  const math = {};
  for (const [stroke,command] of Object.entries(value.keybindings?.math ?? {})) {
    if (!/^ctrl\+[^+\s]+$/.test(stroke)) continue;
    if (command === 'moveToSuperscript') math.superscript = stroke;
    if (command === 'moveToSubscript') math.subscript = stroke;
    if (command === 'moveAfterParent') math.leaveEnvironment = Array.from(new Set([stroke,'ctrl+j']));
  }
  if (Object.keys(math).length) migrated.keybindings = {math};
  return migrated;
}

export function migrateStoredPreferences(profile, storage) {
  const migrated = migrateVersion(profile);
  let changed = migrated !== profile;
  const removals = [];
  const legacy = [
    {key:'lineae.theme',group:'interface',field:'theme',parse:value => ['light','dark','system'].includes(value) ? value : undefined},
    {key:'lineae.sourceFontSize',group:'interface',field:'sourceFontSize',parse:value => Math.max(11,Math.min(32,Number(value) || 16))},
    {key:'lineae.indentOnSave',group:'editing',field:'indentOnSave',parse:value => value !== 'false'},
  ];
  for (const item of legacy) {
    const value = storage?.getItem(item.key);
    if (value === null || value === undefined || owns(migrated[item.group],item.field)) continue;
    const converted = item.parse(value);
    if (converted === undefined) continue;
    migrated[item.group] = {...migrated[item.group],[item.field]:converted};
    removals.push(item.key);
    changed = true;
  }
  return {profile:migrated,changed,removals};
}

// Older Settings saves included the shipped shortcut even when it was untouched.
export function migrateStoredIntegralShortcut(profile) {
  if (profile.keybindings?.math?.int !== 'mod+i') return profile;
  const next = structuredClone(profile);
  delete next.keybindings.math.int;
  return next;
}
