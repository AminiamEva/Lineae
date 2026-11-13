const assert = require('node:assert/strict');
const { build } = require('esbuild');

module.exports = async function checkLifecycle(context, url) {
  const fixture = await build({
    entryPoints: ['apps/web/src/editor/source-workspace.js'],
    bundle: true, format: 'iife', globalName: 'workspaceFixture', write: false,
  });
  const browserPage = await context.newPage();
  try {
    await browserPage.route(url, route => route.fulfill({
      contentType: 'text/html',
      body: '<main><article class="paper" style="display:grid"></article><footer></footer></main>',
    }));
    await browserPage.goto(url);
    await browserPage.addScriptTag({content: fixture.outputFiles[0].text});
    const results = await browserPage.evaluate(async () => {
      const page = document.querySelector('article');
      const parent = page.parentNode;
      const footer = page.nextSibling;
      const failures = [];
      let renders = 0;
      for (const hidden of [null, 'until-found']) {
        if (hidden === null) page.removeAttribute('hidden');
        else page.setAttribute('hidden', hidden);
        page.inert = hidden !== null;
        const original = page.outerHTML;
        for (const mode of ['ordinary', 'expanded', 'collapsed']) {
          const workspace = workspaceFixture.createSourceWorkspace({
            page, render() { renders++; }, metadata: () => ({name:'test.tex', saved:'abc'}),
          });
          const panel = parent.querySelector('.tex-workspace');
          const expand = panel.querySelector('.tex-actions button:last-child');
          let firstEditor;
          for (let i = 0; i < 3; i++) {
            workspace.open('abc');
            const editor = panel.querySelector('.cm-editor');
            if (!editor || (firstEditor && firstEditor !== editor)) failures.push('EditorView reuse');
            firstEditor = editor;
            workspace.close();
            if (page.outerHTML !== original) failures.push('close: ' + mode);
          }
          workspace.open('abc');
          if (mode !== 'ordinary') expand.click();
          if (mode === 'collapsed') expand.click();
          const content = panel.querySelector('.cm-content');
          content.focus();
          document.execCommand('insertText', false, 'x');
          if (workspace.value === 'abc') failures.push('pending edit setup');
          const beforeDestroy = renders;
          workspace.destroy();
          workspace.destroy();
          workspace.open('late');
          workspace.reset('late');
          document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}));
          await new Promise(resolve => setTimeout(resolve, 300));
          if (renders !== beforeDestroy || page.outerHTML !== original || page.parentNode !== parent ||
              page.nextSibling !== footer || parent.childNodes.length !== 2 || panel.querySelector('.cm-editor')) {
            failures.push('destroy: ' + mode + '/' + hidden);
          }
        }
      }
      return failures;
    });
    assert.deepEqual(results, []);
  } finally {
    await browserPage.close();
  }
};
