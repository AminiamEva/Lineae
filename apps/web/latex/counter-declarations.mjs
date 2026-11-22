export function counterDeclarationAt(source,index){
 const command=/^\\(renewcommand|newcommand|setcounter|numberwithin|counterwithin|counterwithout)\*?\s*/.exec(source.slice(index));if(!command)return null;
 let cursor=index+command[0].length;
 const read=()=>{while(/\s/.test(source[cursor]??'')&&cursor<source.length)cursor++;if(source[cursor]!=='{')return null;let depth=1;const start=++cursor;while(cursor<source.length){if(source[cursor]==='\\'){cursor+=2;continue;}if(source[cursor]==='{')depth++;else if(source[cursor]==='}'&&!--depth){const value=source.slice(start,cursor++);return value;}cursor++;}return null;};
 let first=read();if(first===null&&/newcommand/.test(command[1])){const name=/^\\[A-Za-z]+/.exec(source.slice(cursor));if(name){first=name[0];cursor+=name[0].length;}}
 const value=read();if(first===null||value===null)return null;
 const kind=command[1],key=first.replace(/^\\/,'');
 if(/newcommand/.test(kind)&&!/^the(?:chapter|section|subsection|subsubsection|equation|figure|table)$|^(?:chaptername|appendixname)$/.test(key))return null;
 if(kind==='setcounter'&&!/^(?:chapter|section|subsection|subsubsection|equation|figure|table|secnumdepth)$/.test(key))return null;
 if(kind==='setcounter'&&!/^-?\d+$/.test(value.trim()))return null;
 if(/within|without/.test(kind)&&(!/^(?:equation|figure|table)$/.test(key)||!/^(?:chapter|section|subsection)$/.test(value)))return null;
 return {kind,key,value,from:index,to:cursor,latex:source.slice(index,cursor)};
}
export function applyCounterDeclaration(profile,counters,declaration){
 const {kind,key,value}=declaration;
 if(/newcommand/.test(kind)){
  if(key.startsWith('the'))profile.formats[key.slice(3)]=value;
  else profile.names[key==='appendixname'?'appendix':'chapter']=value;
 }else if(kind==='setcounter'){
  if(key==='secnumdepth')profile.secnumdepth=Number(value);else counters[key]=Number(value);
 }else if(/within/.test(kind)){
  profile.resets[key]=value;profile.formats[key]='\\the'+value+'.\\arabic{'+key+'}';
 }else if(kind==='counterwithout'){
  profile.resets[key]=null;profile.formats[key]='\\arabic{'+key+'}';
 }
}