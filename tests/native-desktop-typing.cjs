const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const {resolve} = require('node:path');

const tex = resolve('.native-tex/texlive');
const rtex = resolve('.native-tex/rtex/rtex-0.0.8-x86_64-pc-windows-msvc');
const app = spawn(resolve('apps/desktop/src-tauri/target/debug/lineae.exe'), ['--lineae-typing-check'], {
  stdio: ['ignore', 'inherit', 'pipe'],
  env: {...process.env,
    WEBVIEW2_USER_DATA_FOLDER: resolve(process.env.RUNNER_TEMP, 'lineae-typing-profile'),
    LINEAE_RTEX_PATH: resolve(rtex, 'bin/rtex.exe'), RTEX_TEXDIR: resolve(rtex, 'share/rtex/tex'),
    RTEX_TEXLIVE_BIN: resolve(tex, 'bin/windows'), TEXMFVAR: resolve(tex, 'texmf-var'),
    TEXMFCONFIG: resolve(tex, 'texmf-config'), TEXMFHOME: resolve(tex, 'texmf-home')
  }
});
let passed = false;
const timeout = setTimeout(() => {
  console.error('::error::Windows desktop typing check timed out');
  app.kill();
}, 180000);
createInterface({input: app.stderr}).on('line', line => {
  console.log(line);
  if (line.startsWith('Lineae typing result: ')) {
    passed = line === 'Lineae typing result: ok';
    if (!passed) console.error('::error::' + line);
  }
  const formula = line === 'Lineae typing equation';
  if (!formula && line !== 'Lineae typing ready') return;
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$shell = New-Object -ComObject WScript.Shell',
    'if (!$shell.AppActivate(' + app.pid + ')) { throw "Window activation failed" }',
    'Start-Sleep -Milliseconds 300',
    ...(formula ? ["[Windows.Forms.SendKeys]::SendWait('123{BACKSPACE}')"] : [
    "[Windows.Forms.SendKeys]::SendWait('First paragraph!{BACKSPACE} ')",
    '[Windows.Forms.Clipboard]::SetText([string][char]0x6b63 + [char]0x6587)',
    "[Windows.Forms.SendKeys]::SendWait('^v')"])
  ].join('; ');
  const driver = spawn('powershell.exe', ['-NoProfile','-STA','-Command',script],
    {stdio:'inherit', windowsHide:true});
  driver.on('exit', code => {if(code) app.kill()});
});
app.on('exit', code => {clearTimeout(timeout);process.exitCode = passed && code === 0 ? 0 : 1});
