export const theoremNames = Object.freeze({theorem:'Theorem',lemma:'Lemma',proposition:'Proposition',corollary:'Corollary',definition:'Definition',remark:'Remark',proof:'Proof'});

export function theoremParts(source) {
  const match=/^\\begin\{([a-z]+)\}(?:\[([^\]\r\n]*)\])?([\s\S]*?)\\end\{\1\}$/.exec(source.trim());
  if(!match || !Object.hasOwn(theoremNames,match[1]))return null;
  return {kind:match[1],title:match[2]??null,body:match[3]};
}
