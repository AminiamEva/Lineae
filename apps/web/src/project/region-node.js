import {Node} from '@tiptap/core';

export const ProjectRegion=Node.create({
  name:'projectRegion',group:'block',content:'block+',isolating:true,defining:true,selectable:false,
  addAttributes(){
    return {
      regionKey:{default:'',rendered:false,parseHTML:element=>element.dataset.projectRegion??''},
      path:{default:'',rendered:false,parseHTML:element=>element.dataset.filePath??''},
      trail:{default:[],rendered:false,parseHTML:element=>{try{const trail=JSON.parse(element.dataset.fileTrail??'[]');return Array.isArray(trail)?trail:[];}catch{return [];}}},
    };
  },
  addNodeView(){return ({node})=>{
    const dom=document.createElement('section');
    const sync=value=>{
      dom.dataset.projectRegion=value.attrs.regionKey;dom.dataset.filePath=value.attrs.path;dom.dataset.fileTrail=JSON.stringify(value.attrs.trail);
      const empty=value.childCount===1&&value.firstChild.type.name==='paragraph'&&value.firstChild.content.size===0;
      if(empty)dom.dataset.emptyRegion='true';else delete dom.dataset.emptyRegion;
    };
    sync(node);
    return {dom,contentDOM:dom,update(next){if(next.type!==node.type)return false;node=next;sync(next);return true;},ignoreMutation:change=>change.type==='attributes'&&change.target===dom};
  };},
  parseHTML:()=>[{tag:'section[data-project-region]'}],
  renderHTML({node}){
    const empty=node.childCount===1&&node.firstChild.type.name==='paragraph'&&node.firstChild.content.size===0;
    return ['section',{'data-project-region':node.attrs.regionKey,'data-file-path':node.attrs.path,...(empty?{'data-empty-region':'true'}:{})},0];
  },
});
