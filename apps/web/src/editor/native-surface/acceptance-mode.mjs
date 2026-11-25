export function nativeOnlyAcceptance() {
  return Boolean(window.__TAURI__?.core?.invoke) &&
    new URLSearchParams(location.search).get('native-only-acceptance') === '1';
}
