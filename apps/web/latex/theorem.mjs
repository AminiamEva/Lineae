export const theoremNames = Object.freeze({theorem:'Theorem',lemma:'Lemma',proposition:'Proposition',corollary:'Corollary',definition:'Definition',remark:'Remark',proof:'Proof'});

export function theoremParts(source) {
  const trimmed=source.trim();
  const match=/^\\begin\{([a-z]+)\}(?:\[([^\]\r\n]*)\])?([\s\S]*?)\\end\{\1\}$/.exec(trimmed);
  if(!match || !Object.hasOwn(theoremNames,match[1]))return null;
  const body=match[3], closingLength=6+match[1].length;
  const bodyFrom=source.indexOf(trimmed)+trimmed.length-closingLength-body.length;
  return {kind:match[1],title:match[2]??null,body,bodyFrom};
}
