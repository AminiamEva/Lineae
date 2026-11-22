// Opt-in check of the signed app's actual WKWebView and embedded resources.
window.addEventListener('load', async () => {
  try {
    if (location.protocol !== 'tauri:' || !document.querySelector('.ProseMirror')?.editor) {
      throw new Error('the packaged editor did not initialize');
    }
    if (!customElements.get('math-field')) throw new Error('MathLive did not load');
    const paper = document.querySelector('.ProseMirror');
    paper.editor.commands.setContent('<p>Lineae</p>');
    paper.editor.commands.setTextSelection(2);
    paper.editor.view.focus();
    const command = new KeyboardEvent('keydown', {
      key: 'b', code: 'KeyB', metaKey: true, bubbles: true, cancelable: true,
    });
    paper.dispatchEvent(command);
    if (!command.defaultPrevented || !paper.editor.isActive('bold')) {
      throw new Error('Command+B did not reach the editor shortcut router');
    }
    const fonts = await document.fonts.load('10pt "Latin Modern Roman"', 'Lineae');
    if (!fonts.length) throw new Error('the packaged Latin Modern font did not load');
    const symbols = await fetch('assets/tikz-symbols.svg');
    if (!symbols.ok || !(await symbols.text()).includes('<svg')) {
      throw new Error('the packaged symbol library did not load');
    }
    const invoke = window.__TAURI__.core.invoke;
    const rejection = await invoke('write_tex', {
      path: '/tmp/lineae-smoke-not-authorized.tex',
      contents: '',
    }).then(() => '', String);
    if (rejection !== 'The file was not selected through a native dialog') {
      throw new Error('the native file bridge did not reject an unauthorized path');
    }
    document.title = 'Lineae smoke: ok';
  } catch (error) {
    document.title = 'Lineae smoke: ' + error.message;
  }
}, { once: true });
