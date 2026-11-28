import fs from 'node:fs';
const tables=JSON.parse(fs.readFileSync(process.argv[2]));
const classes={};
for(const name of ['article-quanjiao','ctex-zh-cn']){
  const {alphabet,boxes,boundaries,rowIds,rows}=tables[name];
  const keys=[],members=[],boxesByClass=[],representatives=[];
  for(let i=0;i<alphabet.length;i++){
    const key=JSON.stringify([boxes[i],rowIds[i],rows.map(r=>r[i])]);
    let id=keys.indexOf(key);
    if(id===-1){id=keys.push(key)-1;members.push([]);representatives.push(i);boxesByClass.push(boxes[i]);}
    members[id].push(alphabet[i]);
  }
  classes[name]={members,boxes:boxesByClass,boundaries,
    matrix:representatives.map(i=>representatives.map(j=>rows[rowIds[i]][j]))};
}
const format=a=>JSON.stringify(a);
const source=['// Generated from real Fandol LuaTeX-ja hboxes at 10 TeX pt in tests/tex-reference/generate-jfm.mjs.',
  '// boxes = [advance, glyphOffset], boundaries = [width, stretch, shrink, penalty]. Dimensions are em.',
  'export const jfmTables = {'];
for(const [name,table] of Object.entries(classes)){
  source.push('  '+format(name)+': {');
  for(const [key,rows] of Object.entries(table))source.push('    '+key+': [',...rows.map(r=>'      '+format(r)+','),'    ],');
  source.push('  },');
}
source.push('};','');
fs.writeFileSync(process.argv[3],source.join('\n'));
