const {chromium} = require('playwright');
const {spawn} = require('node:child_process');
const {once} = require('node:events');

async function run() {
  const port = process.env.LINEAE_SOURCE_PORT || '39849';
  const server = spawn(process.execPath, ['scripts/serve.mjs', 'apps/web', port], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await Promise.race([
      once(server.stdout, 'data'),
      once(server, 'exit').then(([code]) => { throw new Error('Server exited with code ' + code); }),
    ]);
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        locale: 'zh-CN', viewport: {width:1280, height:1400},
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      await require('./source-workspace.cjs')(context, 'http://127.0.0.1:' + port + '/');
      console.log('PASS standalone source workspace with real clipboard', browser.version());
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
