export const THEME_PREFERENCES = Object.freeze(['light', 'dark', 'system']);

export function normalizeTheme(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return THEME_PREFERENCES.includes(normalized) ? normalized : 'system';
}

export function resolveTheme(preference, systemDark = false) {
  const normalized = normalizeTheme(preference);
  if (normalized === 'system') return systemDark ? 'dark' : 'light';
  return normalized;
}

export function themeState(preference, systemDark = false) {
  const normalized = normalizeTheme(preference);
  const resolved = resolveTheme(normalized, systemDark);
  return { preference: normalized, resolved, colorScheme: resolved };
}

export function createThemeController({
  root = globalThis.document?.documentElement,
  storage = globalThis.localStorage,
  media = globalThis.matchMedia?.('(prefers-color-scheme: dark)'),
  key = 'lineae.theme',
  preference = 'system',
} = {}) {
  let current = normalizeTheme(storage?.getItem?.(key) ?? preference);
  let state = themeState(current, Boolean(media?.matches));
  const apply = () => {
    state = themeState(current, Boolean(media?.matches));
    if (root) {
      if (!root.dataset) root.dataset = {};
      root.dataset.theme = state.resolved;
      if (root.style) root.style.colorScheme = state.colorScheme;
      if (typeof globalThis.CustomEvent === 'function' && typeof root.dispatchEvent === 'function') {
        root.dispatchEvent(new globalThis.CustomEvent('lineae-theme-change', { detail: state }));
      }
    }
    return state;
  };
  const onMediaChange = () => { if (current === 'system') apply(); };
  media?.addEventListener?.('change', onMediaChange);
  apply();
  const set = next => {
    current = normalizeTheme(next);
    try { storage?.setItem?.(key, current); } catch {}
    return apply();
  };
  return {
    getPreference: () => current,
    getResolved: () => state.resolved,
    getState: () => state,
    set,
    toggle: () => set(resolveTheme(current, Boolean(media?.matches)) === 'dark' ? 'light' : 'dark'),
    destroy() {
      media?.removeEventListener?.('change', onMediaChange);
    },
  };
}
