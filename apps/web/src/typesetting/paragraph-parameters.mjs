// TeX dimensions are 72.27 pt/in; CSS pt is 72 pt/in.
export function texDimension(value,em=16){
 const match=String(value).trim().match(/^(-?(?:\d*\.)?\d+)\s*(sp|pt|pc|in|bp|cm|mm|em|ex)$/);
 if(!match)return null;
 return Number(match[1])*({sp:96/72.27/65536,pt:96/72.27,pc:12*96/72.27,in:96,bp:96/72,cm:96/2.54,mm:96/25.4,em,ex:em*.430556}[match[2]]);
}
export function paragraphParameters(source){
 const text=source.replace(/(?<!\\)%[^\r\n]*/g,'');
 const number=(name,fallback)=>{const matches=[...text.matchAll(new RegExp('\\\\'+name+'\\s*(?:=\\s*)?(-?\\d+)\\b','g'))];return matches.length?Number(matches.at(-1)[1]):fallback;};
 const dimension='-?(?:\\d*\\.)?\\d+\\s*(?:sp|pt|pc|in|bp|cm|mm|em|ex)';
 const glue=name=>{const assignment=new RegExp('\\\\'+name+'\\s*(?:=\\s*)?('+dimension+')(?:\\s+plus\\s+('+dimension+'))?(?:\\s+minus\\s+('+dimension+'))?','g');const match=[...text.matchAll(assignment)].at(-1);return match?{width:match[1],stretch:match[2]??'0pt',shrink:match[3]??'0pt'}:null;};
 const exceptions=new Map();for(const match of text.matchAll(/\\hyphenation\s*\{([^}]*)\}/g))for(const entry of match[1].trim().split(/\s+/))exceptions.set(entry.replaceAll('-','').toLowerCase(),entry.split('-'));
 return {pretolerance:number('pretolerance',100),tolerance:number('tolerance',200),linePenalty:number('linepenalty',10),hyphenPenalty:number('hyphenpenalty',50),adjDemerits:number('adjdemerits',10000),doubleHyphenDemerits:number('doublehyphendemerits',10000),finalHyphenDemerits:number('finalhyphendemerits',5000),leftHyphenMin:number('lefthyphenmin',2),rightHyphenMin:number('righthyphenmin',3),spaceSkip:glue('spaceskip'),emergency:glue('emergencystretch')?.width,exceptions};
}