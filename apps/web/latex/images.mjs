export const imageWidthPattern = /^\d+(?:\.\d+)?(?:\\linewidth|cm|mm|pt)$/;

export function parseImageBlock(source) {
  const figure = /^\\begin\{figure\}(?:\[([htbp!]+)\])?\s*(\\(?:centering|raggedleft|raggedright)\s*)?(\\includegraphics[^\r\n]+)\s*(?:\\caption\{([^{}\r\n]*)\}\s*)?(?:\\label\{([^{}\r\n]+)\}\s*)?\\end\{figure\}$/.exec(source);
  if (figure) {
    const image = parseImageBlock(figure[3].trim());
    if (!image) return null;
    const alignment = figure[2]?.trim();
    const align = alignment === '\\raggedleft' ? 'right' : alignment === '\\raggedright' ? 'left' :
      alignment === '\\centering' ? 'center' : null;
    return {type:'documentImage',attrs:{...image.attrs,figure:true,placement:figure[1]??null,
      centered:align === 'center',align,caption:figure[4]??null,label:figure[5]??null}};
  }
  const match = /^\\includegraphics(?:\[(width=(?:\d+(?:\.\d+)?)(?:\\linewidth|cm|mm|pt))\])?\{([^{}\\\r\n%]+)\}$/.exec(source);
  return match ? { type: 'documentImage', attrs: { path:match[2], width:match[1]?.slice(6) ?? null } } : null;
}

export function serializeImage({ path, width, figure, placement, centered, align, caption, label }) {
  const graphics='\\includegraphics' + (width ? '[width='+width+']' : '') + '{'+path+'}';
  if(!figure)return graphics+'\n\n';
  const alignment = align ?? (centered ? 'center' : null);
  const centering = alignment === 'center' ? '\\centering\n' : alignment === 'right' ? '\\raggedleft\n' :
    alignment === 'left' ? '\\raggedright\n' : '';
  return '\\begin{figure}'+(placement?'['+placement+']':'')+'\n'
    +centering+graphics+'\n'
    +(caption!==null&&caption!==undefined?'\\caption{'+caption+'}\n':'')
    +(label?'\\label{'+label+'}\n':'')+'\\end{figure}\n\n';
}
