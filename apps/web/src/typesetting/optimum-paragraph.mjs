// Paragraph-wide shortest path over TeX boxes, glue and discretionary penalties.
// Units are supplied by the font metric adapter, never inferred from character count.
export function optimumParagraph(items,widths,options={}){
  const o={pretolerance:100,tolerance:200,linePenalty:10,hyphenPenalty:50,adjDemerits:10000,doubleHyphenDemerits:10000,finalHyphenDemerits:5000,emergencyStretch:0,...options};
  const width=line=>typeof widths==='function'?widths(line):Array.isArray(widths)?widths[Math.min(line,widths.length-1)]:widths;
  const nonnegative=items.every(item=>item.type==='penalty'||item.width>=0);
  const sums=Array.from({length:3},()=>[0]);
  for(const item of items){sums[0].push(sums[0].at(-1)+(item.type==='penalty'?0:item.width));sums[1].push(sums[1].at(-1)+(item.stretch??0));sums[2].push(sums[2].at(-1)+(item.shrink??0));}
  const breaks=items.flatMap((item,i)=>(item.type==='glue'&&items[i-1]?.type==='box'||item.type==='penalty'&&(item.cost??0)<10000)?[i]:[]);
  function solve(tolerance,hyphenate,emergency,finalPass=false){
    let active=[{index:-1,next:0,line:0,fitness:1,cost:0,previous:null,hyphen:false}],final=[];
    for(const end of breaks){
      const last=end===items.length-1,item=items[end],forced=item.type==='penalty'&&item.cost<=-10000;
      if(item.hyphen&&!hyphenate)continue;
      const best=new Map();
      let survivors=active.length;
      for(const previous of active){
        const start=previous.next;if(start>end)continue;
        const natural=sums[0][end]-sums[0][start]+(item.type==='penalty'?item.width:0);
        const stretch=sums[1][end]-sums[1][start]+emergency,shrink=sums[2][end]-sums[2][start];
        const delta=width(previous.line)-natural;
        const ratio=delta>=0?(last?0:stretch?delta/stretch:delta===0?0:Infinity):(shrink?delta/shrink:-Infinity);
        const scaledRatio = Math.floor(297*Math.abs(ratio));
        const badness = o.texFinalPass ? Math.min(10000,Math.round(scaledRatio**3 / 262144))
          : Math.min(10000,Math.round(100*Math.abs(ratio)**3));
        // On the final TeX pass the last surviving active node is allowed to
        // form an overfull line. TeX packs it with at most the finite shrink.
        const deactivate = ratio < -1 || forced;
        const artificial = finalPass && deactivate && survivors === 1 && !best.size && (ratio < -1 || badness > tolerance);
        if(deactivate)survivors--;
        if(!artificial && (ratio< -1||badness>tolerance))continue;
        const fitness = o.texFinalPass ? (badness<=12 ? 1 : ratio<0 ? 0 : badness<=99 ? 2 : 3)
          : ratio<-.5?0:ratio<=.5?1:ratio<=1?2:3;
        const penalty=item.type==='penalty'?(item.cost??(item.hyphen?o.hyphenPenalty:0)):0;
        let cost=previous.cost+(o.linePenalty+badness)**2;
        if(penalty>=0)cost+=penalty**2;else if(!forced)cost-=penalty**2;
        if(previous.index>=0&&Math.abs(fitness-previous.fitness)>1)cost+=o.adjDemerits;
        if(item.hyphen&&previous.hyphen)cost+=o.doubleHyphenDemerits;
        if(last&&previous.hyphen)cost+=o.finalHyphenDemerits;
        if(artificial)cost=previous.cost;
        let next=end+1;while(next<items.length&&items[next].type!=='box') {if(items[next].type==='penalty'&&items[next].cost<=-10000)break;next++;}
        const key=(previous.line+1)+':'+fitness;
        const candidate={index:end,next,line:previous.line+1,fitness,cost,previous,hyphen:!!item.hyphen,start,natural,ratio:artificial?Math.max(-1,ratio):ratio,badness,width:width(previous.line)};
        if(!best.has(key)||best.get(key).cost>cost)best.set(key,candidate);
      }
      const added=[...best.values()];
      if(last)final=added;
      active=forced?added:active.filter(previous=>{
        // Negative punctuation pair kerns can restore fit at a later boundary.
        if(!nonnegative)return true;
        // Nonnegative box/glue widths make this lower bound monotonic.
        // Do not retain paths that cannot fit even after all allowed shrink.
        const start=previous.next;
        return sums[0][end]-sums[0][start]-(sums[2][end]-sums[2][start])<=width(previous.line);
      }).concat(added);
    }
    if(!final.length)return null;
    let node=final.reduce((a,b)=>a.cost<b.cost?a:b),lines=[];
    while(node.previous){lines.push({start:node.start,end:node.index,width:node.width,natural:node.natural,ratio:node.ratio,badness:node.badness,hyphen:node.hyphen});node=node.previous;}
    return {lines:lines.reverse(),demerits:final.reduce((a,b)=>a.cost<b.cost?a:b).cost};
  }
  const passes = [[o.pretolerance,false,0],[o.tolerance,true,0]];
  if(!o.texFinalPass || o.emergencyStretch>0)passes.push([o.texFinalPass?o.tolerance:10000,true,o.emergencyStretch]);
  for(const [index,[tolerance,hyphenate,emergency]] of passes.entries()){
    if(tolerance<0)continue;
    const plan=solve(tolerance,hyphenate,emergency,o.texFinalPass && index===passes.length-1);if(plan)return {...plan,hyphenationPass:hyphenate};
  }
  return null;
}