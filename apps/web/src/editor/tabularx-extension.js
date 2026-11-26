import {Extension} from '@tiptap/core';

function cssWidth(value) {
  return typeof value==='string'&&/^(?:\d+(?:\.\d+)?|\.\d+)(?:%|px|pt|cm|mm|in|em|ex)$/.test(value)?value:'';
}

export const TabularxSource=Extension.create({
  name:'tabularxSource',
  addGlobalAttributes(){return [{types:['table'],attributes:{atomicTabular:{
    default:false,parseHTML:element=>element.hasAttribute('data-atomic-tabular'),
    renderHTML:({atomicTabular})=>atomicTabular?{'data-atomic-tabular':''}:{},
  },longtable:{
    default:null,
    parseHTML:element=>{try{return JSON.parse(element.dataset.longtableSource);}catch{return null;}},
    renderHTML:({longtable})=>longtable?{'data-longtable-source':JSON.stringify(longtable)}:{},
  },tabularx:{
    default:null,
    parseHTML:element=>{try{return JSON.parse(element.getAttribute('data-tabularx-source'));}catch{return null;}},
    renderHTML:({tabularx})=>tabularx?{'data-tabularx':'','data-tabularx-source':JSON.stringify(tabularx),
      style:'table-layout:fixed;'+(cssWidth(tabularx.widthCSS)?'width:'+cssWidth(tabularx.widthCSS):'')}:{},
  }}}];},
});

// Tiptap's resizable TableView owns the colgroup. Apply parsed column widths to
// that existing view; X columns use the remaining width, without a new NodeView.
export function syncTabularxWidths(table,metadata) {
  if(!metadata){
    if(table.hasAttribute('data-tabularx')) {
      table.style.removeProperty('width');table.style.removeProperty('table-layout');
      table.querySelectorAll(':scope > colgroup > col').forEach(col=>col.style.removeProperty('width'));
    }
    delete table.dataset.tabularx;return;
  }
  table.dataset.tabularx='';table.style.tableLayout='fixed';
  const width=cssWidth(metadata.widthCSS);if(width)table.style.width=width;
  [...table.querySelectorAll(':scope > colgroup > col')].forEach((col,i)=>{
    // The document stylesheet resets col widths with !important for ordinary
    // tables. Source-declared tabularx widths must override that reset locally.
    col.style.setProperty('width',cssWidth(metadata.specs?.[i]?.widthCSS)||'auto','important');
  });
}
