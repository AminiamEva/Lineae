import {Extension} from '@tiptap/core';

function read(element,key) {
  try{return JSON.parse(element.getAttribute(key));}catch{return null;}
}
function cellCSS(style) {
  const css=[];
  for(const [key,value] of Object.entries(style??{})) {
    const valid=key==='verticalAlign'?['top','middle','bottom'].includes(value)
      :key==='fontWeight'?['400','700'].includes(value)
      :key==='fontStyle'?['normal','italic'].includes(value)
      :key==='width'?/^(?:\d+(?:\.\d+)?|\.\d+)(?:%|px|pt|cm|mm|in|em|ex)$/.test(value)
      :['paddingLeft','paddingRight'].includes(key)?value==='0px'
      :/^border(Top|Bottom|Left|Right)$/.test(key)&&/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|pt|em) (?:solid|dashed|dotted) (?:currentColor|black|white|red|blue|green|gray|#[\da-f]{6})$/i.test(value);
    // Inherited table fonts are layout, not inline marks. Direct font-weight
    // styles would be consumed as bold marks by ProseMirror's HTML parser.
    if(valid)css.push((key.startsWith('font')?'--tblr-':'')+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+':'+value);
  }
  return css.join(';');
}

// Extend existing Table/Cell nodes without replacing their schema or node views.
export const TblrSource=Extension.create({
  name:'tblrSource',
  addGlobalAttributes(){return [{types:['table'],attributes:{tblr:{
    default:null,
    parseHTML:element=>read(element,'data-tblr-source'),
    renderHTML:({tblr})=>tblr?{'data-tblr':'','data-tblr-source':JSON.stringify(tblr)}:{},
  }}},{types:['tableCell','tableHeader'],attributes:{tblrStyle:{
    default:null,
    parseHTML:element=>read(element,'data-tblr-style'),
    renderHTML:({tblrStyle})=>tblrStyle?{'data-tblr-style':JSON.stringify(tblrStyle),style:cellCSS(tblrStyle)}:{},
  }}}];},
});
