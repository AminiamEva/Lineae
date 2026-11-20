import {patterns,exceptions} from './english-patterns.mjs';
const trie={};
for(const pattern of patterns){
 let node=trie,weights=[0],length=0;
 for(const character of pattern){
  if(/[0-9]/.test(character))weights[length]=Number(character);
  else {node=node[character]??=(Object.create(null));length++;weights[length]=0;}
 }
 node.weights=weights;
}
const known=new Map(exceptions.map(word=>[word.replaceAll('-',''),word.split('-')]));
export function englishHyphenation(word,{leftMin=2,rightMin=3}={}){
 const original=word,lower=word.toLowerCase();
 if(!/^[a-z]+$/.test(lower))return [original];
 let cuts=[];
 if(known.has(lower)){
  let position=0;for(const part of known.get(lower).slice(0,-1)){position+=part.length;cuts.push(position);}
 }else{
  const text='.'+lower+'.',points=Array(text.length+1).fill(0);
  for(let start=0;start<text.length;start++){
   let node=trie;
   for(let cursor=start;cursor<text.length;cursor++){
    node=node[text[cursor]];if(!node)break;
    if(node.weights)for(let index=0;index<node.weights.length;index++)points[start+index]=Math.max(points[start+index],node.weights[index]);
   }
  }
  for(let position=leftMin;position<=lower.length-rightMin;position++)if(points[position+1]%2)cuts.push(position);
 }
 cuts=cuts.filter(position=>position>=leftMin&&position<=lower.length-rightMin);
 const result=[];let previous=0;for(const position of cuts){result.push(original.slice(previous,position));previous=position;}result.push(original.slice(previous));return result;
}