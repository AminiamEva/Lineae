// Pin the bootstrap input and verify the profile installed on the real editor.
const assert = require('node:assert/strict');
async function openXeReference(page,url,options) {
  await page.addInitScript(() => {
    const pin = () => {document.documentElement.dataset.typesettingEngine = 'xelatex';};
    if (document.documentElement) pin();
    else document.addEventListener('readystatechange',pin,{once:true});
  });
  const response = await page.goto(url,options);
  const view = page.locator('.ProseMirror[data-paragraph-profile]').first();
  await view.waitFor({state:'attached'});
  assert.equal(await view.getAttribute('data-paragraph-profile'),'xelatex');
  return response;
}
module.exports = {openXeReference};
