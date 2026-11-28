// Test-only compiler. The caller owns a fresh working directory containing main.tex.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, openSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function runStep(command, args, {cwd, logPath, timeout = 240000, env = process.env, index = 1}) {
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error('Invalid timeout');
  const stdout = logPath + '.' + index + '.stdout.log';
  const stderr = logPath + '.' + index + '.stderr.log';
  const out = openSync(stdout, 'w');
  const err = openSync(stderr, 'w');
  let child;
  let timedOut = false;
  const posix = process.platform !== 'win32';
  let timer;
  let result;
  try {
    child = spawn(command, args, {cwd, env, shell: false, detached: posix, stdio: ['ignore', out, err]});
    const completion = new Promise(resolveStep => {
      child.on('error', error => resolveStep({status: error.code === 'ENOENT' ? 127 : 1, error: error.message}));
      child.on('close', (status, signal) => resolveStep({status: timedOut ? 124 : (status ?? 1), exitCode: status, signal}));
    });
    timer = setTimeout(() => {
      timedOut = true;
      if (!child.pid) return;
      if (posix) {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') child.kill('SIGKILL'); }
      } else {
        spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {stdio:'ignore', timeout:10000});
        child.kill();
      }
    }, timeout);
    result = await completion;
  } finally {
    clearTimeout(timer);
    closeSync(out);
    closeSync(err);
  }
  const record = {command, args, cwd, timeout, timedOut, ...result, stdout, stderr};
  appendFileSync(logPath, [JSON.stringify(record), readFileSync(stdout), readFileSync(stderr), ''].join('\n'));
  return record;
}

export function validateCompiler(engine, driver) {
  if (!['xelatex', 'lualatex'].includes(engine)) throw new Error('Unsupported TeX engine');
  if (!['latexmk', 'direct'].includes(driver)) throw new Error('Unsupported driver');
}

export async function compile({cwd, engine = 'xelatex', driver = 'latexmk', backend = null,
  logPath = join(cwd, 'compile.log'), env = process.env, timeout = 240000}) {
  validateCompiler(engine, driver);
  if (![null, 'bibtex', 'biblatex', 'biber'].includes(backend)) throw new Error('Unsupported bibliography backend');
  for (const artifact of ['main.pdf', 'main.aux', 'main.log', 'main.fdb_latexmk']) {
    if (existsSync(join(cwd, artifact))) throw new Error('Expected a fresh compilation directory: ' + cwd);
  }
  const flags = ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', '-synctex=1', '-recorder', 'main.tex'];
  const tex = [engine, flags];
  const steps = driver === 'latexmk' ? [['latexmk', ['-norc', '-bibtex', '-' + engine, ...flags]]] : [tex];
  if (driver === 'direct' && backend) steps.push([backend === 'biblatex' ? 'biber' : backend, ['main']], tex, tex);
  let index = 0;
  for (const [command, args] of steps) {
    const result = await runStep(command, args, {cwd, logPath, timeout, env, index: ++index});
    if (result.status) throw Object.assign(new Error(command + ' failed; see ' + logPath), {status:result.status});
  }
  const pdf = join(cwd, 'main.pdf');
  if (!existsSync(pdf) || readFileSync(pdf).subarray(0,5).toString() !== '%PDF-') throw new Error('Missing valid PDF header in ' + cwd);
}

// CLI runs only main.tex in the caller-provided directory. No source is interpolated into argv.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , cwd, engine, driver, timeout] = process.argv;
  try {
    await compile({cwd:resolve(cwd), engine, driver, timeout:timeout === undefined ? undefined : Number(timeout)});
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.status ?? 1;
  }
}
