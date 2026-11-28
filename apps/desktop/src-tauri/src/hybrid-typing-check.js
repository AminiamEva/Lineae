// Debug fixture installed only by --lineae-hybrid-typing-check.
window.addEventListener('load', async () => {
  let sequence = 0;
  let pending;
  window.lineaeTestInput = (method, params) => new Promise((resolve, reject) => {
    pending = {id: ++sequence, resolve, reject};
    document.title = 'Lineae hybrid input ' + JSON.stringify([sequence, method, params]);
  });
  window.lineaeTestInputComplete = (id, error) => {
    if (pending?.id !== id) return;
    const {resolve, reject} = pending;
    pending = null;
    if (error) reject(Error(error));
    else resolve();
  };
  try {
    document.title = 'Lineae hybrid passed ' + JSON.stringify(await measureHybridTyping());
  } catch (error) {
    document.title = 'Lineae hybrid failed ' + error.message;
  }
}, {once: true});
