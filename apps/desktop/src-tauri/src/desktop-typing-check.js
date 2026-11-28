window.addEventListener('load', async () => {
  const panel = () => document.querySelector('#native-tex-preview');
  async function until(read, description) {
    const deadline = performance.now() + 45000;
    while (performance.now() < deadline) {
      const result = read();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    const focus = document.activeElement;
    throw Error(description + ' state=' + panel()?.dataset.state +
      ' status=' + panel()?.querySelector('[role=status]')?.textContent +
      ' focus=' + focus?.tagName + '.' + focus?.className +
      ' model=' + document.querySelector('.document-page .ProseMirror')?.textContent);
  }
  try {
    const canvas = await until(() => panel()?.matches('[data-state=current]') &&
      panel().querySelector('canvas'), 'initial Lua page');
    canvas.click();
    document.title = 'Lineae typing ready';
    const expected = 'First paragraph 正文';
    await until(() => document.querySelector('.document-page .ProseMirror')?.textContent === expected,
      'continuous desktop input');
    document.querySelector('button[data-group="math"]').click();
    const equation = document.querySelector('button[data-source-action="equation"]');
    equation.focus();
    equation.click();
    const field = await until(() => document.activeElement?.matches('.math-display math-field') && document.activeElement,
      'numbered equation keyboard focus');
    document.title = 'Lineae typing equation';
    await until(() => field.value.trim().endsWith('12'), 'continuous desktop equation input and deletion');
    await until(() => panel()?.matches('[data-state=current]'), 'updated Lua page');
    document.querySelector('[data-source-mode=source]').click();
    await until(() => document.querySelector('.cm-content')?.textContent.includes(expected), 'saved source');
    document.title = 'Lineae typing result: ok';
  } catch (error) {
    document.title = 'Lineae typing result: ' + error.message;
  }
}, {once:true});
