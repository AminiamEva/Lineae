import {Node} from '@tiptap/core';

export const ProjectRegion=Node.create({
  name:'projectRegion',group:'block',content:'block+',isolating:true,defining:true,
  addAttributes(){
    return {
      regionKey:{default:'',rendered:false,parseHTML:element=>element.dataset.projectRegion??''},
      path:{default:'',rendered:false,parseHTML:element=>element.dataset.filePath??''},
    };
  },
  parseHTML:()=>[{tag:'section[data-project-region]'}],
  renderHTML({node}){
    return ['section',{'data-project-region':node.attrs.regionKey,'data-file-path':node.attrs.path},0];
  },
});
