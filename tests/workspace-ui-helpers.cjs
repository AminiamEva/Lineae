const assert=require('node:assert/strict');
async function revealToolbar(page){if(!await page.locator('.ribbon').isVisible())await page.locator('#toolbar-collapse').click();}
async function setIndentOnSave(page,enabled){
  await page.locator('#settings-open').click();
  const control=page.locator('[data-setting="editing.indentOnSave"]');
  if(enabled)await control.check();else await control.uncheck();
  await page.locator('#settings-apply').click();
  assert.equal(await control.isChecked(),enabled);
  await page.locator('#settings-close').click();
}
async function createTreeEntry(page,name){
  const input=page.locator('[data-project-name]');await input.fill(name);await input.press('Enter');await input.waitFor({state:'detached'});
}
module.exports={revealToolbar,setIndentOnSave,createTreeEntry};
