// Shared by the shipping portable WebView and the in-process Windows CI driver.
// Only the delivery of trusted WebView input differs between the two.
async function measureHybridTyping() {
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  const same=(actual,expected)=>assert(JSON.stringify(actual)===JSON.stringify(expected),
    'Unexpected text '+JSON.stringify({actual,expected}));
  const until=async(read,description)=>{
    const deadline=performance.now()+90000;
    while(performance.now()<deadline){
      if(read())return;
      await new Promise(done=>setTimeout(done,25));
    }
    throw Error(description+'; native state='+document.querySelector('#native-tex-preview')?.dataset.state);
  };
  const send=window.lineaeTestInput;
  async function type(keys){
    for(const key of keys){
      const enter=key==='\n',code=enter?'Enter':key===' '?'Space':key===','?'Comma':'Key'+key.toUpperCase();
      const vk=enter?13:key===','?188:key.toUpperCase().charCodeAt(0);
      const base={key:enter?'Enter':key,code,windowsVirtualKeyCode:vk};
      await send('Input.dispatchKeyEvent',{...base,type:'keyDown',text:enter?'\r':key});
      await send('Input.dispatchKeyEvent',{...base,type:'keyUp'});
    }
  }
  const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const panel=()=>document.querySelector('#native-tex-preview');
  await until(()=>document.querySelector('#native-tex-toggle')?.dataset.engine==='lua' && panel()?.dataset.state==='current','Initial Lua page');
  const canvas=panel().querySelector('canvas');
  canvas.click();
  const editor=document.querySelector('.document-page .ProseMirror'),host=editor.closest('main');
  const confirmed=()=>host.classList.contains('native-ink-confirmed');
  const samples=[];
  let frame=0;
  function record(){
    const selection=document.getSelection(),head=editor.editor.state.selection.$head;
    const rect=selection.rangeCount && selection.getRangeAt(0).getBoundingClientRect();
    if(rect?.height){
      const sheet=panel().querySelector('canvas').getBoundingClientRect();
      const row={paragraph:head.index(0),text:head.parent.textContent,x:rect.left,y:rect.top,sheetY:sheet.top,confirmed:confirmed()};
      const last=samples.at(-1);
      if(!last || Object.keys(row).some(k=>last[k]!==row[k]))samples.push(row);
    }
    frame=requestAnimationFrame(record);
  }
  record();
  try {
    const first='letters typed before a hard break, italic Office';
    await type(first+'\nBy\nC');
    await until(confirmed,'First confirmed paragraph');
    const words=['C中','美','学','国','文'];
    for(const word of words){
      await send('Input.imeSetComposition',{text:'wen',selectionStart:3,selectionEnd:3});
      await paint();
      assert(document.activeElement===editor && editor.textContent.includes('wen'),'Live pinyin preedit and editor focus');
      await send('Input.insertText',{text:word.at(-1)});
      await paint();
      await type('\n');
    }
    const headText=()=>editor.editor.state.selection.$head.parent.textContent;
    await type('NEW');
    await until(()=>confirmed() && headText()==='NEW','Confirmed final Chinese/Latin paragraph');
    await paint();
    await type('\n\n\n\nnext line');
    await until(()=>confirmed() && headText()==='next line','Confirmed paragraph after consecutive Enter');
    await paint();
    const expected=[first,'By',...words,'NEW','','','','next line'];
    same(editor.editor.state.doc.content.content.map(p=>p.textContent),expected);
    const both=text=>{
      const rows=samples.filter(row=>row.text===text);
      assert(rows.some(s=>!s.confirmed) && rows.some(s=>s.confirmed),'Missing local or native ink for '+text);
      return rows;
    };
    const spread=(rows,key='y')=>Math.max(...rows.map(s=>s[key]))-Math.min(...rows.map(s=>s[key]));
    const last=both('NEW'),stable=both('next line');
    const compositionJump=Math.max(...words.map((word,i)=>{
      const rows=samples.filter(s=>s.paragraph===i+2 && (s.text.endsWith('wen')||s.text===word));
      assert(rows.some(s=>s.text.endsWith('wen')) && rows.some(s=>s.text===word),'Missing preedit or committed ink for '+word);
      return spread(rows);
    }));
    const metrics={compositionJump,lastJump:spread(last),horizontalJump:spread(last,'x'),
      paperJump:spread(stable,'sheetY'),nextLineJump:spread(stable)};
    document.querySelector('[data-source-mode=source]').click();
    await until(()=>document.querySelector('.cm-content')?.innerText.includes('next line'),'Authored TeX source');
    const source=document.querySelector('.cm-content').innerText;
    const body=source.split('\\begin{document}')[1].split('\\end{document}')[0].trim();
    same(body.split(/\s*\n\s*/u),expected.filter(Boolean));
    assert(Object.values(metrics).every(n=>n<=2),'Same-line displacement exceeded 2 CSS pixels: '+
      JSON.stringify({metrics,samples:samples.slice(-30)}));
    return metrics;
  } finally {cancelAnimationFrame(frame);}
}
if(typeof module!=='undefined')module.exports=measureHybridTyping;
