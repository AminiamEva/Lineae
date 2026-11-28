import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const output=fileURLToPath(new URL('../apps/web/vendor/mathlive/',import.meta.url));
const temporary=mkdtempSync(join(tmpdir(),'lineae-mathlive-'));
try {
  const archive=execFileSync(process.execPath,[process.env.npm_execpath,'pack','mathlive@0.108.0',
    '--ignore-scripts','--silent'],{cwd:temporary,encoding:'utf8'}).trim();
  mkdirSync(output,{recursive:true});
  execFileSync('tar',['-xzf',archive,'-C',output,'--strip-components=1',
    'package/mathlive.min.js','package/fonts'],{cwd:temporary,stdio:'inherit'});
  const file=join(output,'mathlive.min.js'),source=readFileSync(file,'utf8');
  // Computer Modern symbol font, fontdimen 8 (num1) at text size.
  // This feeds fraction layout itself, including its struts and nested boxes.
  const table='num1:[.5,.732,.925]';
  if(source.indexOf(table)<0 || source.indexOf(table)!==source.lastIndexOf(table))
    throw new Error('Review the display fraction metric for this MathLive release');
  writeFileSync(file,source.replace(table,'num1:[.676508,.732,.925]'));
} finally {
  rmSync(temporary,{recursive:true,force:true});
}
