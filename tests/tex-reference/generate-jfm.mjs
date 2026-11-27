// Measure Fandol and the loaded JFM from the packed nodes; no frozen line ends are inputs.
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';
const output=resolve(process.argv[2]);
mkdirSync(output);
const letters=[...'中（），“”‘’。？！：；【】《》〈〉、…—「」『』〔〕［］｛｝・', 'A', '$x$'];
const lua=String.raw`local f=assert(io.open('measure.tsv','w'))
function inspect(i,j)
 local w,s,r,p,left,glyph,count=0,0,0,0,0,0,0; local breakNode=false
 for n in node.traverse(tex.box[0].head) do
  local t=node.type(n.id)
  if t=='glyph' or t=='hlist' then
   count=count+1
   if count==1 then
    local g=n
    if t=='hlist' then
      for h in node.traverse(n.head) do
        if node.type(h.id)=='glyph' then g=h;break end
        left=left+(h.kern or h.width or 0)
      end
    end
    left=left+(g.xoffset or 0)
    glyph=g.width or 0
   end
  elseif count==1 then
   if t=='glue' then breakNode=true;w=w+n.width;s=s+n.stretch;r=r+n.shrink
   elseif t=='penalty' then breakNode=true;p=p+n.penalty
   elseif t=='kern' then w=w+n.kern end
  end
 end
 f:write(table.concat({i,j,count,tex.box[0].width,left,glyph,w,s,r,breakNode and p or 10000},'\t'),'\n')
end`;
const doc=String.raw;
const variants=[
 ['article-quanjiao',doc`\documentclass{article}\usepackage{luatexja-fontspec}\setmainjfont[Scale=1,JFM=quanjiao,BoldFont=FandolSong-Bold.otf]{FandolSong-Regular.otf}`],
 ['ctex-quanjiao',doc`\documentclass[fontset=fandol]{ctexart}\setCJKmainfont[Scale=1,JFM=quanjiao,BoldFont=FandolSong-Bold.otf]{FandolSong-Regular.otf}`],
 ['ctex-zh-cn',doc`\documentclass[fontset=fandol]{ctexart}`],
];
const results={};
for (const [name,preamble] of variants){
 if(process.argv[3] && !name.startsWith(process.argv[3]))continue;
 const dir=join(output,name);mkdirSync(dir);writeFileSync(join(dir,'probe.lua'),lua);
 const lines=[preamble,doc`\setmainfont{lmroman10-regular.otf}\begin{document}\fontsize{10pt}{12pt}\selectfont\directlua{dofile("probe.lua")}`];
 for(const [i,a] of letters.entries()){
   lines.push(doc`\setbox0=\hbox{${a}}\directlua{inspect(${i},-1)}`);
   for(const [j,b] of letters.entries())lines.push(doc`\setbox0=\hbox{${a}${b}}\directlua{inspect(${i},${j})}`);
 }
 lines.push(doc`中文 Lineae\end{document}`);writeFileSync(join(dir,'main.tex'),lines.join('\n'));
 const args=['-no-shell-escape','-interaction=nonstopmode','-file-line-error','-halt-on-error','-recorder','main.tex'];
 const run=spawnSync('lualatex',args,{cwd:dir,timeout:240000});
 writeFileSync(join(dir,'compile.log'),Buffer.concat([run.stdout??Buffer.alloc(0),run.stderr??Buffer.alloc(0)]));
 writeFileSync(join(dir,'command.json'),JSON.stringify({args,cwd:dir,status:run.status,error:run.error?.message}));
 if(run.status!==0)throw Error('See '+join(dir,'compile.log'));
 const rows=readFileSync(join(dir,'measure.tsv'),'utf8').trim().split(/\r?\n/).map(row=>row.split('\t').map(Number));
 const single=rows.filter(row=>row[1]===-1);
 const boundaries=[],ids=[],em=655360;
 for(const [i,a] of letters.entries()){
  const row=[];
  for(const [j,b] of letters.entries()){
   const m=rows.find(r=>r[0]===i && r[1]===j);
   const boundary=[m[3]-single[i][3]-single[j][3],m[7],m[8]].map(v=>v/em).concat(m[9]);
   const encoded=JSON.stringify(boundary); if(!ids.includes(encoded)){ids.push(encoded);boundaries.push(boundary);}
   row.push(ids.indexOf(encoded));
  }
  single[i].push(row);
 }
 const lookup=single.map(r=>r.at(-1));
 const distinct=[];
 const rowIds=lookup.map(r=>{const s=r.join(',');if(!distinct.includes(s))distinct.push(s);return distinct.indexOf(s);});
 results[name]={alphabet:letters,boxes:single.map(r=>[r[3]/em,r[4]/em]),boundaries,rowIds,rows:distinct.map(s=>s.split(',').map(Number))};
}
writeFileSync(join(output,'jfm-measurements.json'),JSON.stringify(results,null,1)+'\n');
