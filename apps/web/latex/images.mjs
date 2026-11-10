export const imageWidthPattern = /^\d+(?:\.\d+)?(?:\\linewidth|cm|mm|pt)$/;

export function parseImageBlock(source) {
  const figure = /^\\begin\{figure\}(?:\[([htbp!]+)\])?\s*(\\centering\s*)?(\\includegraphics[^\r\n]+)\s*(?:\\caption\{([^{}\r\n]*)\}\s*)?(?:\\label\{([^{}\r\n]+)\}\s*)?\\end\{figure\}$/.exec(source);
  if (figure) {
    const image = parseImageBlock(figure[3].trim());
    if (!image) return null;
    return {type:'documentImage',attrs:{...image.attrs,figure:true,placement:figure[1]??null,centered:Boolean(figure[2]),caption:figure[4]??null,label:figure[5]??null}};
  }
  const match = /^\\includegraphics(?:\[(width=(?:\d+(?:\.\d+)?)(?:\\linewidth|cm|mm|pt))\])?\{([^{}\\\r\n%]+)\}$/.exec(source);
  return match ? { type: 'documentImage', attrs: { path:match[2], width:match[1]?.slice(6) ?? null } } : null;
}

export function serializeImage({ path, width, figure, placement, centered, caption, label }) {
  const graphics='\\includegraphics' + (width ? '[width='+width+']' : '') + '{'+path+'}';
  if(!figure)return graphics+'\n\n';
  return '\\begin{figure}'+(placement?'['+placement+']':'')+'\n'
    +(centered?'\\centering\n':'')+graphics+'\n'
    +(caption!==null&&caption!==undefined?'\\caption{'+caption+'}\n':'')
    +(label?'\\label{'+label+'}\n':'')+'\\end{figure}\n\n';
}
