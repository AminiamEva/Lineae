import {group,trivia,clean} from './tblr.mjs';

// Lexical parsing only. Dynamic keys and unsupported commands stay in Raw.
export function referenceAt(source,index=0) {
  const match=/^\\(autoref|pageref|eqref|ref|cite|label)(?![A-Za-z])/.exec(source.slice(index));
  if(!match)return null;
  const command=match[1],kind=command==='cite'?'cite':command==='label'?'label':'ref';
  let cursor=index+match[0].length;
  const starred=source[cursor]==='*';
  if(starred){if(command==='label'||command==='eqref')return null;cursor++;}
  cursor=trivia(source,cursor);
  if(kind==='cite')for(let n=0;n<2 && source[cursor]==='[';n++) {
    const option=group(source,cursor,'[',']');if(!option)return null;
    cursor=trivia(source,option.end);
  }
  const arg=group(source,cursor);if(!arg)return null;
  const key=clean(arg.value);
  if(!key || /[\\{}]/.test(key) || (kind==='cite' && key.split(',').some(k=>!k.trim())))return null;
  return {kind,command,key,starred,end:arg.end,keyFrom:cursor+1,keyTo:arg.end-1,
    sourceCommand:source.slice(index,arg.end)};
}

export function referenceCommand(attrs,kind='ref') {
  if(kind!=='ref')return kind;
  return ['ref','eqref','autoref','pageref'].includes(attrs.command)?attrs.command:attrs.equation?'eqref':'ref';
}

export function serializeReference(attrs,kind='ref') {
  const command=referenceCommand(attrs,kind),saved=attrs.sourceCommand;
  const parsed=typeof saved==='string'?referenceAt(saved):null;
  if(parsed && parsed.end===saved.length && parsed.kind===kind && parsed.command===command && parsed.starred===Boolean(attrs.starred)) {
    if(parsed.key===attrs.key)return saved;
    return saved.slice(0,parsed.keyFrom)+attrs.key+saved.slice(parsed.keyTo);
  }
  return '\\'+command+(attrs.starred?'*':'')+'{'+attrs.key+'}';
}

export function serializeHeadingLabel(attrs) {
  if(!attrs.label)return '';
  const saved=attrs.labelSource,start=typeof saved==='string'?trivia(saved,0):0;
  const parsed=typeof saved==='string'?referenceAt(saved,start):null;
  return parsed?.kind==='label' && parsed.end===saved.length
    ? saved.slice(0,start)+serializeReference({key:attrs.label,sourceCommand:saved.slice(start)},'label')
    : '\\label{'+attrs.label+'}';
}
