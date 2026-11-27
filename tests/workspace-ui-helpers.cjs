const assert=require('node:assert/strict');
async function revealToolbar(page){if(await page.locator('#toolbar-collapse').getAttribute('aria-expanded')==='false')await page.locator('#toolbar-collapse').click();}
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
async function openEngineSettings(page){
  await page.locator('#settings-open').click();
  const group=page.locator('[data-settings-group=typesetting]');
  if(!await group.evaluate(n=>n.open))await group.locator('summary').click();
  return group;
}
async function chooseEngine(page,value){
  const group=await openEngineSettings(page);
  await group.locator('#engine-choice').selectOption(value);
  await page.locator('#settings-apply').click();
  await page.locator('#settings-close').click();
}
async function readEngineSettings(page){
  const group=await openEngineSettings(page);
  const state={choice:await group.locator('#engine-choice').inputValue(),status:await group.locator('output').innerText(),
    diagnostics:await group.locator('li').allTextContents()};
  await page.locator('#settings-close').click();
  return state;
}
module.exports={openEngineSettings,chooseEngine,readEngineSettings,revealToolbar,setIndentOnSave,createTreeEntry};
