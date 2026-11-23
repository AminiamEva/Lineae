import test from 'node:test';
import assert from 'node:assert/strict';
import {fontspecDeclarations, createFontMeasurement} from '../apps/web/src/typesetting/font-measurement.mjs';

const xe={engine:'xelatex',version:1}, lua={engine:'lualatex',version:1};
const style={font:'13px "Latin Modern Roman"', fontFamily:'"Latin Modern Roman"', letterSpacing:'normal'};
const office='office AV';
const tex=[
  '\\setmainfont[Ligatures=Common]{lmroman10-regular.otf}',
  '% \\setmainfont{unused}',
  '\\setmainjfont{FandolSong-Regular.otf}[JFM=quanjiao]',
  '\\newcommand{\\showexample}{\\setmainfont{Unused Font}}',
].join('\n');
function fixture() {
  const calls=[];
  const face={family:'Latin Modern Roman',style:'normal',weight:'400',status:'loaded'};
  const faces=new Set([face]);
  const metrics=createFontMeasurement({
    font:'',measureText(text){calls.push(text); return {width:text.length*1.125};},
  },faces);
  return {metrics,face,faces,count:()=>calls.filter(text=>text===office).length};
}
test('reads literal font names and OpenType options on either side of the name',()=>{
  assert.deepEqual(fontspecDeclarations(tex),[
    {command:'setmainfont',name:'lmroman10-regular.otf',options:'Ligatures=Common'},
    {command:'setmainjfont',name:'FandolSong-Regular.otf',options:'JFM=quanjiao'},
  ]);
});
test('switching engine in either direction or changing profile version requires a fresh measurement',()=>{
  const {metrics,count}=fixture();
  for(const [i,profile] of [xe,lua,xe,{...xe,version:2}].entries()){
    metrics.select(profile,tex);
    metrics.measure(office,style);
    assert.equal(count(),i+1);
    metrics.select(profile,tex);
    metrics.measure(office,style);
    assert.equal(count(),i+1);
  }
});
test('font identity follows the selected engine branch and skips unresolved conditionals',()=>{
  const source='\\ifXeTeX\\setCJKmainfont{Xe}\\else\\setmainjfont{Lua}\\fi\n'
    +'\\ifdraft\\setmainfont{Draft}\\else\\setmainfont{Release}\\fi';
  assert.deepEqual(fontspecDeclarations(source,'xelatex').map(d=>d.name),['Xe']);
  assert.deepEqual(fontspecDeclarations(source,'lualatex').map(d=>d.name),['Lua']);
});
test('font file, fontspec features, browser face identity and run features isolate widths',()=>{
  const {metrics,face,faces,count}=fixture();
  for(const source of [tex,tex.replace('lmroman10','lmroman12'),tex.replace('Common','NoCommon')]){
    metrics.select(xe,source);
    metrics.measure(office,style); metrics.measure(office,style);
  }
  assert.equal(count(),3);
  faces.delete(face);faces.add({...face});
  metrics.select(xe,tex.replace('Common','NoCommon'));metrics.measure(office,style);
  assert.equal(count(),4);
  const off={...style,fontFeatureSettings:'"liga" 0'};
  metrics.measure(office,off);metrics.measure(office,off);
  assert.equal(count(),5);
  metrics.clear();metrics.measure(office,off);
  assert.equal(count(),6);
});
