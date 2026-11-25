import {readGroup} from '../../../latex/table-spans.mjs';
import {textCommands} from '../../../latex/inline.mjs';
import {referenceAt} from '../../../latex/reference-commands.mjs';

const plainTokens=/^(?:\\(?:[%&_#${}]|[A-Za-z]+\{\})|[^\\{}$%&#_^])+/u;
const namedLiteral=/^\\([A-Za-z]+)\{\}/;
const textMarks={textbf:'bold',textit:'italic',emph:'italic',textsl:'italic',texttt:'code',
  underline:'underline',uline:'underline',uuline:'underline',uwave:'underline',sout:'strike',
  textsuperscript:'superscript',textsubscript:'subscript',textsc:'smallcaps',fbox:'boxed',
  textcircled:'circled',textsf:'textStyle',textrm:'textStyle'};
const htmlColor=/^\\(?:textcolor|colorbox)\[HTML\]\{[0-9a-f]{6}\}(?=\{)/i;

export function decodeProse(raw) {
  if(!/[\\~]/.test(raw))return {text:raw};
  const offsets=[0];
  let text='';
  for(let index=0;index<raw.length;index++){
    if(raw[index]==='\\'){
      const command=namedLiteral.exec(raw.slice(index));
      if(command){
        const value=Object.hasOwn(textCommands,command[1])&&textCommands[command[1]];
        if(!value||value.length!==1)return null;
        index+=command[0].length-1;
        text+=value;
        offsets.push(index+1);
        continue;
      }
      index++;
      text+=raw[index];
    }else text+=raw[index]==='~'?'\u00A0':raw[index];
    offsets.push(index+1);
  }
  return {text,offsets};
}

export function markedRuns(text,offset=0,marks=[],inline) {
  const runs=[];
  let cursor=0;
  while(cursor<text.length){
    const start=offset+cursor;
    const math=inline?.get(start);
    if(math&&math.end<=offset+text.length){
      runs.push({kind:'math',from16:start,to16:math.end,latex:math.latex,insideMark:marks.length>0});
      cursor=math.end-offset;
      continue;
    }
    const reference=!marks.length&&text[cursor]==='\\'&&referenceAt(text,cursor);
    if(reference){
      runs.push({kind:'reference',type:reference.kind,key:reference.key,source:reference.sourceCommand,from16:start,to16:offset+reference.end});
      cursor=reference.end;
      continue;
    }
    const lineBreak=!marks.length&&/^(?:\\\\(?:\[[^\]\r\n]*\])?|\\(?:newline|linebreak)(?![A-Za-z]))[ \t]*(?:\r?\n)?/.exec(text.slice(cursor));
    if(lineBreak){
      runs.push({kind:'break',from16:start,to16:start+lineBreak[0].length});
      cursor+=lineBreak[0].length;
      continue;
    }
    const raw=plainTokens.exec(text.slice(cursor))?.[0];
    if(raw){
      const decoded=decodeProse(raw);
      if(!decoded)return null;
      runs.push({kind:'text',from16:start,to16:start+raw.length,...decoded,marks});
      cursor+=raw.length;
      continue;
    }
    const color=htmlColor.exec(text.slice(cursor));
    const command=color??/^\\([a-z]+)(?=\{)/.exec(text.slice(cursor));
    const mark=color?'textStyle':command&&Object.hasOwn(textMarks,command[1])&&textMarks[command[1]];
    if(!mark||marks.includes(mark)||marks.length>=3)return null;
    const argument=cursor+command[0].length;
    const group=readGroup(text,argument);
    if(!group?.value)return null;
    const nested=markedRuns(group.value,offset+argument+1,[...marks,mark],inline);
    if(!nested)return null;
    runs.push(...nested);
    cursor=group.end;
  }
  return runs;
}
