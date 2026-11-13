const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { expect } = require('playwright/test');

module.exports = async function checkLifecycle(context, url) {
  const fixture = await build({
    entryPoints: ['apps/web/src/editor/source-workspace.js'],
    bundle: true, format: 'iife', globalName: 'workspaceFixture', write: false,
  });
  const tab = await context.newPage();
  try {
    await tab.route(url, route => route.fulfill({
      contentType: 'text/html',
      body: '<main><article class="paper" style="display:grid"><p>Original body</p></article><footer></footer></main>',
    }));
    await tab.goto(url);
    await tab.addScriptTag({content: fixture.outputFiles[0].text});
    const start = new Date('2025-01-01T00:00:00Z');
    await tab.clock.install({time: start});
    await tab.clock.pauseAt(new Date(start.getTime() + 60000));

    for (const hidden of [null, 'until-found']) {
      for (const mode of ['ordinary', 'expanded', 'collapsed']) {
        const label = (hidden ?? 'visible') + '/' + mode;
        const scenario = await tab.evaluateHandle(({hidden, mode}) => {
          const article = document.querySelector('article');
          if (hidden === null) article.removeAttribute('hidden');
          else article.setAttribute('hidden', hidden);
          article.inert = hidden !== null;
          const parent = article.parentNode;
          const siblings = [...parent.childNodes];
          let renders = 0;
          const workspace = workspaceFixture.createSourceWorkspace({
            page: article, render() { renders++; }, metadata: () => ({name:'test.tex', saved:'abc'}),
          });
          const panel = parent.querySelector('.tex-workspace');
          const mountedNodes = [...parent.childNodes];
          const expand = panel.querySelector('.tex-actions button:last-child');
          const inputs = [];
          panel.addEventListener('input', e => inputs.push([e.inputType, e.data]), true);
          let firstEditor;
          return {
            open() {
              workspace.open('abc');
              if (mode !== 'ordinary') expand.click();
              if (mode === 'collapsed') expand.click();
              const editor = panel.querySelector('.cm-editor');
              firstEditor ??= editor;
              return {
                expanded: expand.getAttribute('aria-expanded'),
                inPreview: panel.querySelector('.tex-preview').contains(article),
                sameEditor: !!editor && editor === firstEditor,
              };
            },
            close() { workspace.close(); },
            destroy() {
              const before = renders;
              workspace.destroy();
              workspace.destroy();
              workspace.open('late');
              workspace.reset('late');
              document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}));
              return before;
            },
            state(destroyed) {
              const nodes = destroyed ? siblings : mountedNodes;
              const index = nodes.indexOf(article);
              return {
                attributes: Object.fromEntries([...article.attributes].map(a => [a.name, a.value])),
                hiddenState: article.hidden, inertState: article.inert,
                display: getComputedStyle(article).display,
                contentVisibility: getComputedStyle(article).contentVisibility,
                content: article.innerHTML, parent: article.parentNode === parent,
                previous: article.previousSibling === (nodes[index - 1] ?? null),
                next: article.nextSibling === (nodes[index + 1] ?? null),
                childCount: parent.childNodes.length, panelMounted: panel.isConnected,
                editorCount: panel.querySelectorAll('.cm-editor').length,
                shown: panel.isConnected && !panel.hidden,
              };
            },
            edit() {
              return {dom: panel.querySelector('.cm-content').textContent, value: workspace.value, inputs};
            },
            renderCount() { return renders; },
          };
        }, {hidden, mode});
        try {
          const initial = await scenario.evaluate(s => s.state(false));
          const checkPage = (actual, phase, expected) => {
            assert.deepEqual(actual, expected, label + ' ' + phase);
          };
          assert.deepEqual(initial.attributes, {
            class:'paper', style:'display:grid', ...(hidden ? {hidden, inert:''} : {}),
          }, label + ' initial attributes');
          const open = async () => checkPage(await scenario.evaluate(s => s.open()), 'open', {
            expanded: String(mode === 'expanded'), inPreview: mode === 'expanded', sameEditor: true,
          });
          for (let cycle = 0; cycle < 3; cycle++) {
            await open();
            await scenario.evaluate(s => s.close());
            checkPage(await scenario.evaluate(s => s.state(false)), 'close ' + cycle, {...initial, editorCount: 1});
          }

          await open();
          const content = tab.locator('.cm-content');
          assert.deepEqual(await scenario.evaluate(s => s.edit()), {dom:'abc', value:'abc', inputs:[]}, label + ' before input');
          await content.press('End');
          await tab.keyboard.insertText('x');
          const edited = {dom:'abcx', value:'abcx', inputs:[['insertText','x']]};
          await expect.poll(() => scenario.evaluate(s => s.edit()), {message: label + ' input synchronization'}).toEqual(edited);
          const renders = await scenario.evaluate(s => s.destroy());
          // Advance past the pending preview debounce, without sleeping or racing wall time.
          await tab.clock.runFor(300);
          assert.equal(await scenario.evaluate(s => s.renderCount()), renders, label + ' render-after-destroy');
          const restored = await scenario.evaluate(s => s.state(true));
          checkPage(restored, 'destroy', {
            ...initial, childCount: 2, panelMounted: false, editorCount: 0, shown: false,
          });
          console.log('Lifecycle passed', label, 'abc -> abcx, input=1, close=3, destroy=2, renders after destroy=0');
        } finally {
          await scenario.dispose();
        }
      }
    }
  } finally {
    await tab.close();
  }
};
