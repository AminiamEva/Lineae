import {sourceStructure} from '../../latex/source-structure.mjs';
import {KAI_MING_PUNCT,LONG_PUNCT,MIDDLE_PUNCT} from './cjk-characters.mjs';

export function usesCtex(preamble, commands = [...sourceStructure(preamble)].filter(t => t.topLevel && t.kind === 'command')) {
  return commands.some(t =>
    t.value === '\\documentclass' && /^\s*(?:\[[^\]]*\]\s*)?\{ctex(?:art|book|rep)\}/.test(preamble.slice(t.end))
    || t.value === '\\usepackage' && /^\s*(?:\[[^\]]*\]\s*)?\{[^}]*\bctex\b[^}]*\}/.test(preamble.slice(t.end)));
}

// ctex_update_stretch_auxiii distributes the remaining column width over
// the inter-character gaps, reserving one ideograph for line stretch.
export function ctexIntercharStretch(lineWidth, em) {
  const spaces = Math.trunc(lineWidth / em - 2);
  return spaces > 0 ? (lineWidth - em * (spaces + 1)) / spaces : 0;
}

// TeX dimensions are 72.27 pt/in; CSS pt is 72 pt/in.
export function texDimension(value,em=16){
 const match=String(value).trim().match(/^(-?(?:\d*\.)?\d+)\s*(sp|pt|pc|in|bp|cm|mm|em|ex)$/);
 if(!match)return null;
 return Number(match[1])*({sp:96/72.27/65536,pt:96/72.27,pc:12*96/72.27,in:96,bp:96/72,cm:96/2.54,mm:96/25.4,em,ex:em*.430556}[match[2]]);
}
function stripComments(source){
 return String(source??'').replace(/(?<!\\)%[^\r\n]*/g,'');
}
function readGroup(text,start){
 if(text[start]!=='{')return null;
 let depth=0;
 for(let index=start;index<text.length;index++){
  if(text[index]==='\\'){index++;continue;}
  if(text[index]==='{')depth++;
  else if(text[index]==='}'&&--depth===0)return {value:text.slice(start+1,index),end:index+1};
 }
 return null;
}
function splitTopLevel(text){
 const parts=[];let depth=0,start=0;
 for(let index=0;index<text.length;index++){
  const char=text[index];
  if(char==='\\'){index++;continue;}
  if(char==='{')depth++;
  else if(char==='}')depth=Math.max(0,depth-1);
  else if(char===','&&depth===0){parts.push(text.slice(start,index));start=index+1;}
 }
 parts.push(text.slice(start));
 return parts.map(part=>part.trim()).filter(Boolean);
}
function stripBraces(value){
 const text=String(value??'').trim();
 return text.startsWith('{')&&text.endsWith('}')?text.slice(1,-1).trim():text;
}
// A dimension expression may reference the ctex/TeX macros that set CJK glue.
const DIMENSION='(?:-?(?:\\d*\\.)?\\d+\\s*)?(?:sp|pt|pc|in|bp|cm|mm|em|ex|\\\\baselineskip|\\\\ccwd|\\\\ziju)';
export function parseCjkGlue(value){
 const text=stripBraces(String(value??'').trim());
 if(!text)return {width:'0pt',stretch:'0pt',shrink:'0pt',tie:false};
 if(text==='~'||text==='\\nobreakspace{}')return {width:'~',stretch:'0pt',shrink:'0pt',tie:true};
 const match=new RegExp('^('+DIMENSION+')(?:\\s+plus\\s+('+DIMENSION+'))?(?:\\s+minus\\s+('+DIMENSION+'))?$').exec(text.replace(/\s+/g,' '));
 if(!match)return null;
 return {width:match[1].trim(),stretch:match[2]?.trim()??'0pt',shrink:match[3]?.trim()??'0pt',tie:false};
}
function boolean(value,fallback){
 if(value===undefined||value===null||value==='')return fallback;
 if(typeof value==='boolean')return value;
 return !/^(?:false|no|0|off)$/i.test(String(value).trim());
}
const PUNCT_ALIASES={halfwidth:'banjiao',fullwidth:'quanjiao',mixedwidth:'kaiming',marginkerning:'hangmobanjiao'};
const PUNCT_STYLES=new Set(['quanjiao','banjiao','kaiming','hangmobanjiao','plain','CCT']);
export function normalizePunctStyle(value){
 const raw=stripBraces(String(value??'').trim());
 const lower=raw.toLowerCase();
 return PUNCT_ALIASES[lower]??(PUNCT_STYLES.has(raw)?raw:(PUNCT_STYLES.has(lower)?lower:null));
}
function codePoints(value){
 return new Set([...stripBraces(String(value??''))].map(character=>character.codePointAt(0)).filter(codePoint=>Number.isInteger(codePoint)));
}

const CJK_DEFAULTS={
 punctStyle:'quanjiao',
 cjkGlue:{width:'0pt',stretch:'0.08\\baselineskip',shrink:'0pt',tie:false},
 cjkGlueTouched:false,
 cjkEcGlue:{width:'~',stretch:'0pt',shrink:'0pt',tie:true},
 xCJKecGlue:false,
 cjkSpace:false,
 cjkMath:false,
 rubberPunctSkip:true,
 checkSingle:false,
 checkFullRight:false,
 allowBreakBetweenPuncts:false,
 linestretch:'1\\ccwd',
 ccwd:'1em',
 ziju:'0pt',
 linespread:1,
};

// Resolves xeCJK/ctex CJK parameters to evaluable expressions. Later
// declarations win; unknown keys are reported but never skip TeX layout.
export function resolveCjkOptions(source,layoutProfile={}){
 const text=stripComments(source);
 const options={
  ...CJK_DEFAULTS,
  cjkGlue:{...CJK_DEFAULTS.cjkGlue},
  cjkEcGlue:{...CJK_DEFAULTS.cjkEcGlue},
  punctOverrides:{kaiMingPunct:new Set(KAI_MING_PUNCT),longPunct:new Set(LONG_PUNCT),middlePunct:new Set(MIDDLE_PUNCT)},
  enabled:Boolean(layoutProfile?.enabled||layoutProfile?.hasOtherCjkProvider),
  ctex:Boolean(layoutProfile?.enabled),
  scheme:layoutProfile?.scheme??'plain',
  diagnostics:[],
 };
 if(layoutProfile?.linestretch!==undefined&&layoutProfile?.linestretch!==null)options.linestretch=`${layoutProfile.linestretch}\\ccwd`;
 if(layoutProfile?.linespread!==undefined&&layoutProfile?.linespread!==null)options.linespread=layoutProfile.linespread;
 if(layoutProfile?.space==='true')options.cjkSpace=true;
 if(layoutProfile?.punct){const style=normalizePunctStyle(layoutProfile.punct);if(style)options.punctStyle=style;}

 const applyKey=(key,value)=>{
  const name=String(key??'').trim();
  const lower=name.toLowerCase();
  if(lower==='punctstyle'||lower==='punct'){
   const style=normalizePunctStyle(value);
   if(style)options.punctStyle=style;
   else options.diagnostics.push({key:name,value,reason:'unknown punctuation style'});
   return;
  }
  if(lower==='cjkglue'){const glue=parseCjkGlue(value);if(glue){options.cjkGlue=glue;options.cjkGlueTouched=true;}else options.diagnostics.push({key:name,value,reason:'invalid glue'});return;}
  if(lower==='cjkecglue'){const glue=parseCjkGlue(value);if(glue)options.cjkEcGlue=glue;else options.diagnostics.push({key:name,value,reason:'invalid glue'});return;}
  if(lower==='xcjkecglue'){options.xCJKecGlue=boolean(value,options.xCJKecGlue);return;}
  if(lower==='cjkspace'){options.cjkSpace=boolean(value,options.cjkSpace);return;}
  if(lower==='cjkmath'){options.cjkMath=boolean(value,options.cjkMath);return;}
  if(lower==='rubberpunctskip'){options.rubberPunctSkip=boolean(value,options.rubberPunctSkip);return;}
  if(lower==='checksingle'){options.checkSingle=boolean(value,options.checkSingle);return;}
  if(lower==='checkfullright'){options.checkFullRight=boolean(value,options.checkFullRight);return;}
  if(lower==='allowbreakbetweenpuncts'){options.allowBreakBetweenPuncts=boolean(value,options.allowBreakBetweenPuncts);return;}
  if(lower==='linestretch'){options.linestretch=stripBraces(value);return;}
  if(lower==='ccwd'){options.ccwd=stripBraces(value);return;}
  if(lower==='ziju'){options.ziju=stripBraces(value);return;}
  if(lower==='kaimingpunct'){options.punctOverrides.kaiMingPunct=codePoints(value);return;}
  if(lower==='longpunct'){options.punctOverrides.longPunct=codePoints(value);return;}
  if(lower==='middlepunct'){options.punctOverrides.middlePunct=codePoints(value);return;}
  if(lower==='kaimingpunct+'||lower==='longpunct+'||lower==='middlepunct+'){
   const set=options.punctOverrides[lower.slice(0,-1)==='kaimingpunct'?'kaiMingPunct':lower.slice(0,-1)==='longpunct'?'longPunct':'middlePunct'];
   for(const codePoint of codePoints(value))set.add(codePoint);
   return;
  }
  if(lower==='punctwidth'||lower==='punctboundwidth'){options.punctOverrides[lower]=stripBraces(value);return;}
  options.diagnostics.push({key:name,value,reason:'unsupported xeCJK key'});
 };

 // Single pass in source order so later declarations override earlier ones.
 const pattern=/\\(xeCJKsetup|punctstyle|CJKsetecglue|CJKsetglue|ziju|setlength|(?:re)?newcommand|def)\s*/g;
 for(const match of text.matchAll(pattern)){
  const command=match[1];
  let cursor=match.index+match[0].length;
  if(command==='xeCJKsetup'){
   const group=readGroup(text,cursor);
   if(!group)continue;
   for(const part of splitTopLevel(group.value)){
    const equal=part.indexOf('=');
    if(equal<0)applyKey(part.trim(),true);
    else applyKey(part.slice(0,equal).trim(),part.slice(equal+1).trim());
   }
   continue;
  }
  if(command==='setlength'){
   const name=readGroup(text,cursor);
   if(!name)continue;
   cursor=name.end;
   const value=readGroup(text,cursor);
   const key=stripBraces(name.value).replace(/^\\/,'');
   if(value)applyKey(key,value.value);
   continue;
  }
  if(command==='newcommand'||command==='renewcommand'||command==='def'){
   const name=readGroup(text,cursor);
   if(!name)continue;
   cursor=name.end;
   const value=readGroup(text,cursor);
   const key=stripBraces(name.value).replace(/^\\/,'');
   if(value)applyKey(key,value.value);
   continue;
  }
  const value=readGroup(text,cursor);
  if(!value)continue;
  if(command==='punctstyle')applyKey('PunctStyle',value.value);
  else if(command==='CJKsetecglue'||command==='CJKsetglue')applyKey('CJKecglue',value.value);
  else if(command==='ziju')applyKey('ziju',value.value);
 }
 return options;
}

export function paragraphParameters(source){
 const text=stripComments(source);
 const number=(name,fallback)=>{const matches=[...text.matchAll(new RegExp('\\\\'+name+'\\s*(?:=\\s*)?(-?\\d+)\\b','g'))];return matches.length?Number(matches.at(-1)[1]):fallback;};
 const dimension='-?(?:\\d*\\.)?\\d+\\s*(?:sp|pt|pc|in|bp|cm|mm|em|ex)';
 const glue=name=>{const assignment=new RegExp('\\\\'+name+'\\s*(?:=\\s*)?('+dimension+')(?:\\s+plus\\s+('+dimension+'))?(?:\\s+minus\\s+('+dimension+'))?','g');const match=[...text.matchAll(assignment)].at(-1);return match?{width:match[1],stretch:match[2]??'0pt',shrink:match[3]??'0pt'}:null;};
 const exceptions=new Map();for(const match of text.matchAll(/\\hyphenation\s*\{([^}]*)\}/g))for(const entry of match[1].trim().split(/\s+/))exceptions.set(entry.replaceAll('-','').toLowerCase(),entry.split('-'));
 const spacing=[...text.matchAll(/\\(nonfrenchspacing|frenchspacing)\b/g)].at(-1)?.[1];
 return {frenchSpacing:spacing==='frenchspacing',pretolerance:number('pretolerance',100),tolerance:number('tolerance',200),linePenalty:number('linepenalty',10),hyphenPenalty:number('hyphenpenalty',50),adjDemerits:number('adjdemerits',10000),doubleHyphenDemerits:number('doublehyphendemerits',10000),finalHyphenDemerits:number('finalhyphendemerits',5000),leftHyphenMin:number('lefthyphenmin',2),rightHyphenMin:number('righthyphenmin',3),spaceSkip:glue('spaceskip'),emergency:glue('emergencystretch')?.width,exceptions};
}
// space is the current face's normal interword advance. For the calibrated
// Latin Modern face its extra-space dimension is one third of that advance.
export function interwordGlue({space, em, skip, factor, extra, profile}) {
  const custom = skip && texDimension(skip.width, em) !== 0;
  const sentenceSpace = extra && (!custom || profile.engine === 'lualatex') ? space / 3 : 0;
  return {
    width: (custom ? texDimension(skip.width, em) : space) + sentenceSpace,
    stretch: (custom ? texDimension(skip.stretch, em) : space / 2) * factor,
    shrink: (custom ? texDimension(skip.shrink, em) : space / 3) / factor,
  };
}
