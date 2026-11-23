import {t} from './i18n.mjs';

// Keyboard Lock accepts physical codes, not modifier combinations. Include
// chord suffixes too, since users may keep the prefix modifier held down.
export function keyboardLockCodes(bindings) {
  const named = {
    backtick:'Backquote', minus:'Minus', equal:'Equal', plus:'Equal', ',':'Comma', '.':'Period',
    '/':'Slash', '\\':'Backslash', '[':'BracketLeft', ']':'BracketRight', ';':'Semicolon', "'":'Quote',
    space:'Space', enter:'Enter', tab:'Tab', backspace:'Backspace', delete:'Delete',
    home:'Home', end:'End', pageup:'PageUp', pagedown:'PageDown',
    arrowup:'ArrowUp', arrowdown:'ArrowDown', arrowleft:'ArrowLeft', arrowright:'ArrowRight',
  };
  const codes = new Set();
  for (const entries of bindings.scopes.values()) for (const entry of entries) {
    for (const stroke of [entry.first, entry.second].filter(Boolean)) {
      const parts = stroke.split('+'), key = parts.at(-1);
      if (key === 'escape' || (!entry.second && !parts.some(part => ['ctrl','alt','meta'].includes(part)))) continue;
      const code = /^[a-z]$/.test(key) ? 'Key' + key.toUpperCase() :
        /^\d$/.test(key) ? 'Digit' + key : /^f\d+$/.test(key) ? key.toUpperCase() : named[key];
      if (code) codes.add(code);
    }
  }
  return [...codes].sort();
}

// Keyboard Lock is best-effort and only effective in API-requested fullscreen.
// Never enter fullscreen or resume capture without an explicit user action.
export function installShortcutPriority({host, before, getBindings}) {
  const root = document.documentElement;
  const keyboard = navigator.keyboard;
  const desktop = Boolean(window.__TAURI__?.core);
  const lifetime = new AbortController();
  const options = {signal:lifetime.signal};
  const button = document.createElement('button');
  button.id = 'keyboard-priority';
  button.type = 'button';
  button.hidden = desktop;
  button.setAttribute('aria-live','polite');
  const message = document.createElement('span');
  message.className = 'shortcut-priority-message';
  message.id = 'keyboard-priority-message';
  message.setAttribute('role','status');
  button.setAttribute('aria-describedby',message.id);
  host.insertBefore(button,before);
  host.insertBefore(message,before);

  let state = 'off', busy = false, destroyed = false, generation = 0;
  let ownsFullscreen = false, waitingForLock = false, lockedBindings = null, error = '';
  const supported = () => !desktop && window.isSecureContext && document.fullscreenEnabled &&
    typeof root.requestFullscreen === 'function' && typeof keyboard?.lock === 'function' &&
    typeof keyboard?.unlock === 'function';

  function relocalize() {
    if (destroyed) return;
    button.dataset.state = supported() ? state : 'unsupported';
    button.disabled = busy || !supported();
    button.setAttribute('aria-pressed',String(state === 'on'));
    button.setAttribute('aria-busy',String(busy));
    button.textContent = !supported() ? t('快捷键优先不可用','Shortcut priority unavailable') :
      busy ? t('正在切换…','Switching…') :
      state === 'on' ? t('退出快捷键优先','Exit shortcut priority') :
      state === 'paused' ? t('恢复快捷键优先','Resume shortcut priority') :
      t('快捷键优先','Shortcut priority');
    button.title = !supported() ? t('需要安全连接及支持 Keyboard Lock 的浏览器（如 Edge / Chrome）',
      'Requires a secure connection and Keyboard Lock support (for example Edge / Chrome)') :
      error || (state === 'on'
        ? t('已请求全屏按键捕获；部分系统组合键仍可能不可用。点击或按 Esc 退出。',
          'Fullscreen key capture requested; some system shortcuts may remain unavailable. Click or press Esc to exit.')
        : state === 'paused' ? t('按键捕获已暂停。点击恢复，或按 Esc 退出全屏。',
          'Key capture paused. Click to resume, or press Esc to leave fullscreen.')
        : t('主动进入全屏并请求网页优先接收现有快捷键；不修改键位表。',
          'Enter fullscreen and request key capture using your existing shortcuts; bindings stay unchanged.'));
    message.textContent = state === 'error' ? t('快捷键优先未开启：','Shortcut priority failed: ') + error : '';
    message.title = message.textContent;
    message.hidden = !message.textContent || desktop;
  }
  async function exitOwnedFullscreen(explicitExit = false) {
    const exit = (ownsFullscreen || explicitExit) && document.fullscreenElement === root;
    ownsFullscreen = false;
    if (exit) {
      try { await document.exitFullscreen(); } catch { /* Esc remains available. */ }
    }
  }
  function pause() {
    if (!['on','starting'].includes(state)) return;
    generation++;
    keyboard.unlock();
    lockedBindings = null;
    state = document.fullscreenElement === root ? 'paused' : 'off';
    relocalize();
  }
  async function start() {
    const attempt = ++generation;
    const focus = document.activeElement;
    lockedBindings = getBindings();
    state = 'starting'; error = ''; busy = true; relocalize();
    try {
      const codes = keyboardLockCodes(lockedBindings);
      // An empty code list means "lock every key", not "lock nothing".
      if (!codes.length) throw new Error(t('没有可捕获的已绑定快捷键','No capturable shortcuts are bound'));
      if (document.fullscreenElement && document.fullscreenElement !== root)
        throw new Error(t('请先退出其他内容的全屏','Exit the other fullscreen content first'));
      if (!document.fullscreenElement) {
        await root.requestFullscreen();
        ownsFullscreen = document.fullscreenElement === root;
      }
      if (attempt !== generation || !document.hasFocus() || document.hidden) {
        if (attempt === generation) pause();
        await exitOwnedFullscreen();
        return;
      }
      waitingForLock = true;
      await keyboard.lock(codes);
      if (attempt !== generation || document.fullscreenElement !== root || !document.hasFocus() || document.hidden) {
        keyboard.unlock();
        if (attempt === generation) pause();
        await exitOwnedFullscreen();
        return;
      }
      state = 'on';
      if (focus?.isConnected) focus.focus({preventScroll:true});
    } catch (failure) {
      if (attempt !== generation) return;
      keyboard.unlock();
      state = 'error';
      error = failure?.message || String(failure);
      lockedBindings = null;
      await exitOwnedFullscreen();
    } finally {
      waitingForLock = false;
      busy = false;
      relocalize();
    }
  }
  async function stop(explicitExit = false) {
    generation++;
    state = 'off'; error = ''; busy = true; lockedBindings = null;
    keyboard.unlock();
    relocalize();
    await exitOwnedFullscreen(explicitExit);
    busy = false;
    relocalize();
  }
  function toggle() {
    if (!supported() || destroyed) return false;
    if (!busy) void (state === 'on' ? stop() : start());
    return true;
  }
  function refresh() {
    if (lockedBindings && lockedBindings !== getBindings()) pause();
    relocalize();
  }
  function destroy() {
    destroyed = true;
    generation++;
    lifetime.abort();
    if (lockedBindings) keyboard?.unlock();
    lockedBindings = null;
    void exitOwnedFullscreen();
    button.remove();
    message.remove();
  }
  button.addEventListener('mousedown',event=>event.preventDefault(),options);
  button.addEventListener('click',toggle,options);
  window.addEventListener('keydown',event=>{
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        (document.fullscreenElement !== root && state !== 'starting') ||
        !['on','starting','paused'].includes(state)) return;
    // Editors may otherwise consume Escape (for example to close Source mode).
    // Keep a direct exit path without requesting that Escape itself be locked.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) { pause(); void exitOwnedFullscreen(true); }
    else void stop(true);
  },{...options,capture:true});
  document.addEventListener('fullscreenchange',()=>{
    if (document.fullscreenElement === root) return;
    ownsFullscreen = false;
    pause();
    if (state === 'paused') { state = 'off'; relocalize(); }
  },options);
  window.addEventListener('blur',()=>{ if (state === 'on' || waitingForLock) pause(); },options);
  document.addEventListener('visibilitychange',()=>{ if (document.hidden) pause(); },options);
  window.addEventListener('pagehide',event=>{ if (event.persisted) pause(); else destroy(); },options);
  relocalize();
  return {button,toggle,refresh,relocalize,destroy};
}
