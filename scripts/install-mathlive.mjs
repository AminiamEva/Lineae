import {execFileSync} from 'node:child_process';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const output=fileURLToPath(new URL('../apps/web/vendor/mathlive/',import.meta.url));
const temporary=mkdtempSync(join(tmpdir(),'lineae-mathlive-'));
try {
  const archive=execFileSync(process.execPath,[process.env.npm_execpath,'pack','mathlive@0.108.0',
    '--ignore-scripts','--silent'],{cwd:temporary,encoding:'utf8'}).trim();
  const runtime=join(temporary,'runtime');
  mkdirSync(runtime);
  execFileSync('tar',['-xzf',archive,'-C','runtime','--strip-components=1',
    'package/mathlive.min.js','package/fonts'],{cwd:temporary,stdio:'inherit'});
  const file=join(runtime,'mathlive.min.js');
  let source=readFileSync(file,'utf8');
  function replaceOnce(original,replacement){
    if(!source.includes(original) || source.indexOf(original)!==source.lastIndexOf(original))
      throw new Error('Review the MathLive integration for this release: '+original);
    source=source.replace(original,replacement);
  }
  // Computer Modern symbol font, fontdimen 8 (num1) at text size.
  // This feeds fraction layout itself, including its struts and nested boxes.
  replaceOnce('num1:[.5,.732,.925]','num1:[.676508,.732,.925]');
  // Hand off the latest shaped ink when the paper has to read geometry
  // before the field's scheduled animation frame. Share the upstream paint
  // callback, including its bounds cache and ResizeObserver bookkeeping.
  const paint='it(t)&&t.dirty&&(t.atomBoundsCache=new Map,vt(t,e),t.resizeObserver.observe(t.field),t.resizeObserverStarted=!0)';
  replaceOnce('requestAnimationFrame(()=>{'+paint+'})',
    'requestAnimationFrame(()=>lineaeFlushMathPaint(t,e))');
  replaceOnce('function vt(t,e){','function lineaeFlushMathPaint(t,e){'+paint+'}function vt(t,e){');
  const info='getElementInfo(r){return Xa(this._mathfield,r)}';
  replaceOnce(info,'flushPendingLayout(){if(this._mathfield)lineaeFlushMathPaint(this._mathfield,{interactive:true})}'+info);
  writeFileSync(file,source);
  cpSync(runtime,output,{recursive:true});
} finally {
  rmSync(temporary,{recursive:true,force:true});
}
