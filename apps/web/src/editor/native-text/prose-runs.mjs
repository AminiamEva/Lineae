import {readGroup} from '../../../latex/table-spans.mjs';

const plainTokens=/^(?:\\[%&_#${}]|[^\\{}$%&#_^~])+/u;
const textMarks={textbf:'bold',textit:'italic',texttt:'code',underline:'underline',
  sout:'strike',textsuperscript:'superscript',textsubscript:'subscript'};

export function decodeProse(raw) {
  if(!raw.includes('\\'))return {text:raw};
  const offsets=[0];
  let text='';
  for(let index=0;index<raw.length;index++){
    if(raw[index]==='\\')index++;
    text+=raw[index];
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
    const lineBreak=!marks.length&&/^(?:\\\\(?:\[[^\]\r\n]*\])?|\\(?:newline|linebreak)(?![A-Za-z]))[ \t]*(?:\r?\n)?/.exec(text.slice(cursor));
    if(lineBreak){
      runs.push({kind:'break',from16:start,to16:start+lineBreak[0].length});
      cursor+=lineBreak[0].length;
      continue;
    }
    const raw=plainTokens.exec(text.slice(cursor))?.[0];
    if(raw){
      runs.push({kind:'text',from16:start,to16:start+raw.length,...decodeProse(raw),marks});
      cursor+=raw.length;
      continue;
    }
    const command=/^\\([a-z]+)(?=\{)/.exec(text.slice(cursor));
    const mark=command&&Object.hasOwn(textMarks,command[1])&&textMarks[command[1]];
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
