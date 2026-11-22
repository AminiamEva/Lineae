import {sourceStructure} from './source-structure.mjs';
import {group,trivia,clean,environmentEnd} from './tblr.mjs';

export const imageWidthPattern = /^(?:(?:\d+(?:\.\d+)?|\.\d+)?\\(?:linewidth|textwidth|columnwidth)|(?:\d+(?:\.\d+)?|\.\d+)(?:cm|mm|pt|in))$/;

// A single-image float is editable using the existing image node. Every other
// construct stays Raw: never flatten subfigures or silently drop unknown code.
function figureParts(source) {
  const opening=/^\s*\\begin\{(figure\*?)\}/.exec(source);
  if(!opening || [...sourceStructure(source)].some(t=>t.kind==='invalid'))return null;
  const closing=environmentEnd(source,source.indexOf('\\begin'),opening[1]);
  if(!closing || source.slice(closing.end).trim())return null;
  const attrs={figure:true,placement:null,centered:false,align:null,caption:null,label:null,width:null,captionEnabled:false,captionNumbered:true,captionPosition:'below'};
  const spans={},commands={};let cursor=trivia(source,opening[0].length),graphicsEnd;
  if(source[cursor]==='[') {
    const option=group(source,cursor,'[',']');if(!option)return null;
    attrs.placement=option.value;spans.placement={from:cursor+1,to:option.end-1};
    commands.placement={from:cursor,to:option.end};cursor=trivia(source,option.end);
  }
  while(cursor<closing.start) {
    const from=cursor,command=/^\\(includegraphics|caption|label|centering|raggedleft|raggedright)(?![A-Za-z])/.exec(source.slice(cursor));
    if(!command)return null;
    cursor+=command[0].length;
    const name=command[1];
    if(['centering','raggedleft','raggedright'].includes(name)) {
      if(spans.align)return null;
      attrs.align={centering:'center',raggedleft:'right',raggedright:'left'}[name];
      attrs.centered=attrs.align==='center';spans.align=commands.align={from,to:cursor};
    } else {
      const key=name==='includegraphics'?'path':name;
      if(spans[key])return null;
      if(name==='includegraphics')graphicsEnd=cursor;
      if(name==='caption') {
        attrs.captionEnabled=true;
        attrs.captionNumbered=source[cursor]!=='*';
        if(!attrs.captionNumbered)cursor++;
      }
      cursor=trivia(source,cursor);
      if(name!=='label' && source[cursor]==='[') {
        const option=group(source,cursor,'[',']');if(!option)return null;
        if(name==='includegraphics') {
          const start=trivia(source,cursor+1),keyMatch=/^width\s*=/.exec(source.slice(start,option.end-1));
          if(!keyMatch)return null;
          let valueStart=trivia(source,start+keyMatch[0].length),valueEnd=option.end-1;
          const wrapped=group(source,valueStart);
          if(wrapped && trivia(source,wrapped.end)===valueEnd){valueStart++;valueEnd=wrapped.end-1;}
          const width=clean(source.slice(valueStart,valueEnd));
          if(!imageWidthPattern.test(width))return null;
          valueStart=trivia(source,valueStart);
          if(source.slice(valueStart,valueStart+width.length)!==width)return null;
          attrs.width=width;spans.width={from:valueStart,to:valueStart+width.length};commands.width={from:cursor,to:option.end};
        }
        cursor=trivia(source,option.end);
      }
      const arg=group(source,cursor);if(!arg)return null;
      if(key==='path' && !/^[^{}\\\r\n%]+$/.test(arg.value))return null;
      attrs[key]=arg.value;spans[key]={from:cursor+1,to:arg.end-1};cursor=arg.end;
      commands[key]={from,to:cursor};
    }
    cursor=trivia(source,cursor);
  }
  if(cursor!==closing.start || !spans.path)return null;
  if(commands.caption&&commands.caption.from<commands.path.from)attrs.captionPosition='above';
  return {attrs,spans,commands,graphicsEnd,close:closing.start,placementEnd:opening[0].length};
}

// Patch only known arguments; comments, indentation, optional captions and EOLs
// outside those arguments remain exact. null means the rich edit is unsafe.
export function serializeSourceFigure(attrs) {
  const source=attrs.figureSource,parsed=typeof source==='string'?figureParts(source):null;
  if(!parsed || !attrs.figure)return null;
  if(attrs.wrap || attrs.height || attrs.scale || attrs.angle || attrs.origin ||
      attrs.flipH || attrs.flipV || attrs.border || attrs.background ||
      attrs.cropLeft || attrs.cropRight || attrs.cropTop || attrs.cropBottom ||
      (attrs.captionPosition && attrs.captionPosition!==parsed.attrs.captionPosition) ||
      (attrs.captionNumbered!==undefined && attrs.captionNumbered!==parsed.attrs.captionNumbered) ||
      (attrs.caption===parsed.attrs.caption && attrs.captionEnabled!==undefined &&
        attrs.captionEnabled!==parsed.attrs.captionEnabled))return null;
  const target={...attrs,placement:attrs.fixed && !attrs.placement ? 'H' : attrs.placement,align:attrs.align??(attrs.centered?'center':null)};
  const edits=[],eol=source.includes('\r\n')?'\r\n':'\n';
  const alignment={center:'\\centering',right:'\\raggedleft',left:'\\raggedright'};
  for(const key of ['placement','path','width','caption','label','align']) {
    const value=target[key]??null;if(value===parsed.attrs[key])continue;
    if(value!==null && typeof value!=='string')return null;
    if(key==='width' && value!==null && !imageWidthPattern.test(value))return null;
    if(key==='path' && (value===null || !/^[^{}\\\r\n%]+$/.test(value)))return null;
    if(key==='align' && value!==null && !alignment[value])return null;
    if(parsed.spans[key]) {
      edits.push({...((value===null)?parsed.commands[key]:parsed.spans[key]),value:value===null?'':key==='align'?alignment[value]:value});
    } else if(value!==null) {
      const at=key==='width'?parsed.graphicsEnd:key==='placement'?parsed.placementEnd:parsed.close;
      const insert=key==='width'?'[width='+value+']':key==='placement'?'['+value+']':
        eol+(key==='align'?alignment[value]:'\\'+key+'{'+value+'}')+eol;
      edits.push({from:at,to:at,value:insert});
    }
  }
  const result=edits.sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.value+s.slice(e.to),source);
  const check=figureParts(result);
  if(!check || ['placement','path','width','caption','label','align'].some(key=>check.attrs[key] !== (target[key]??null)))return null;
  return result;
}

function dimension(value) {
  return imageWidthPattern.test(String(value ?? '').trim()) ? String(value).trim() : null;
}

function parseGraphicsOptions(raw = '') {
  const attrs = {};
  for (const part of raw.split(',')) {
    const [key, ...rest] = part.split('=');
    const name = key.trim();
    const value = rest.join('=').trim();
    if (!name) continue;
    if (name === 'keepaspectratio') attrs.keepAspect = true;
    else if (name === 'width' || name === 'height') attrs[name] = dimension(value);
    else if (name === 'scale') attrs.scale = value;
    else if (name === 'angle') attrs.angle = value;
    else if (name === 'origin') attrs.origin = value;
  }
  return attrs;
}

function unwrapImage(source) {
  let text = source.trim();
  const attrs = {};
  let changed = true;
  while (changed) {
    changed = false;
    let match = /^\{\\setlength\{\\fboxrule\}\{([^{}]*)\}([\s\S]*)\}$/.exec(text);
    if (match) { attrs.borderWidth = match[1].trim(); text = match[2].trim(); changed = true; continue; }
    match = /^\\fbox\{([\s\S]*)\}$/.exec(text);
    if (match) { attrs.border = true; text = match[1].trim(); changed = true; continue; }
    match = /^\\fcolorbox(?:\[HTML\])?\{([^{}]*)\}\{[^{}]*\}\{([\s\S]*)\}$/.exec(text);
    if (match) { attrs.border = true; if (/^[\da-f]{6}$/i.test(match[1].trim())) attrs.borderColor = '#'+match[1].trim(); text = match[2].trim(); changed = true; continue; }
    match = /^\\colorbox(?:\[HTML\])?\{([^{}]*)\}\{([\s\S]*)\}$/.exec(text);
    if (match) { attrs.background = /^[\da-f]{6}$/i.test(match[1].trim()) ? '#'+match[1].trim() : match[1].trim(); text = match[2].trim(); changed = true; continue; }
    match = /^\\reflectbox\{([\s\S]*)\}$/.exec(text);
    if (match) { attrs.flipH = true; text = match[1].trim(); changed = true; continue; }
    match = /^\\scalebox\{1\}\[-1\]\{([\s\S]*)\}$/.exec(text);
    if (match) { attrs.flipV = true; text = match[1].trim(); changed = true; continue; }
    match = /^\\adjustbox\{([^{}]*)\}\{([\s\S]*)\}$/.exec(text);
    if (match) {
      const trim = /(?:^|,)\s*trim=([^,]+)/.exec(match[1]);
      if (trim) {
        const [left,bottom,right,top] = trim[1].trim().split(/\s+/);
        Object.assign(attrs,{cropLeft:left,cropBottom:bottom,cropRight:right,cropTop:top});
      }
      text = match[2].trim();
      changed = true;
    }
  }
  return {text,attrs};
}

function parseImageMarkup(source) {
  const {text:wrapped,attrs:outer} = unwrapImage(source);
  const match = /^\\includegraphics(?:\[([^\]]*)\])?\{([^{}\\\r\n%]+)\}$/.exec(wrapped);
  if (!match) return null;
  return {
    type:'documentImage',
    attrs:{
      path:match[2],
      ...parseGraphicsOptions(match[1] ?? ''),
      ...outer,
    },
  };
}

export function relativeImageWidth(width, containerWidth) {
  const image = /^(\d*(?:\.\d+)?)(\\textwidth|\\linewidth|\\columnwidth|cm|mm|pt|in)$/.exec(String(width ?? ''));
  if (!image) return '';
  const amount = image[1] ? Number(image[1]) : 1;
  if (!image[2].startsWith('\\')) return width;
  const container = /^(\d+(?:\.\d+)?)(\\textwidth|\\linewidth|\\columnwidth|cm|mm|pt|in)$/.exec(String(containerWidth ?? ''));
  if (image[2] === '\\linewidth' || image[2] === '\\columnwidth') return `${amount * 100}%`;
  if (container && container[2].startsWith('\\') && Number(container[1]) > 0) {
    return `${(amount / Number(container[1])) * 100}%`;
  }
  return `${amount * 100}%`;
}

export function parseImageBlock(source) {
  const precise=figureParts(source);
  if(precise)return {type:'documentImage',attrs:{...precise.attrs,figureSource:source}};
  const text = String(source ?? '').trim();
  const wrap = /^\\begin\{wrapfigure\}(?:\[([^\]]*)\])?\{([rRlLiIoO])\}(?:\[([^\]]*)\])?\{([^{}]*)\}([\s\S]*?)\s*\\end\{wrapfigure\}$/.exec(text);
  if (wrap) {
    const inner = wrap[5];
    const imageMatch = /\\includegraphics(?:\[[^\]]*\])?\{[^{}\\\r\n%]+\}/.exec(inner);
    if (!imageMatch) return null;
    const imageExpression = inner
      .replace(/\\(?:centering|raggedleft|raggedright)\b/g,'')
      .replace(/\\caption\*?\{[^{}]*\}/g,'')
      .replace(/\\label\{[^{}]*\}/g,'')
      .trim();
    const image = parseImageMarkup(imageExpression) ?? parseImageMarkup(imageMatch[0]);
    if (!image) return null;
    const captionMatch = /\\caption(\*)?\{([^{}\r\n]*)\}/.exec(inner);
    const captionIndex = inner.search(/\\caption\*?\{/);
    const imageIndex = inner.indexOf(imageMatch[0]);
    const alignment = /\\centering\b/.test(inner) ? 'center' : /\\raggedleft\b/.test(inner) ? 'right' : /\\raggedright\b/.test(inner) ? 'left' : null;
    return {...image,attrs:{...image.attrs,wrap:true,wrapSide:wrap[2],wrapWidth:wrap[4]||'0.4\\textwidth',
      wrapOverhang:wrap[3]||null,wrapLines:wrap[1]||null,figure:false,centered:alignment==='center',align:alignment,caption:captionMatch?.[2]??null,
      captionEnabled:Boolean(captionMatch),captionNumbered:captionMatch? !captionMatch[1]:true,
      captionPosition:captionIndex>=0&&captionIndex<imageIndex?'above':'below',
      label:/\\label\{([^{}\r\n]+)\}/.exec(inner)?.[1]??null}};
  }
  const centerMatch = /^\\begin\{center\}\s*([\s\S]*?)\s*\\end\{center\}$/.exec(text);
  if (centerMatch) {
    const centeredImage = parseImageMarkup(centerMatch[1].trim());
    if (centeredImage) return {...centeredImage,attrs:{...centeredImage.attrs,centered:true,align:'center'}};
  }
  const subfigureMatch = /^\\begin\{figure\}(?:\[([^\]]*)\])?\s*([\s\S]*?)\\end\{figure\}$/.exec(text);
  if (subfigureMatch && /\\begin\{subfigure\}/.test(subfigureMatch[2])) {
    const inner = subfigureMatch[2];
    const subs = [];
    const subRe = /\\begin\{subfigure\}\{([^{}]*)\}([\s\S]*?)\\end\{subfigure\}/g;
    let sub;
    while ((sub = subRe.exec(inner)) !== null) {
      const body = sub[2];
      const graphic = parseImageMarkup(/\\includegraphics(?:\[[^\]]*\])?\{[^{}\\\r\n%]+\}/.exec(body)?.[0] ?? '');
      if (!graphic) continue;
      const cap = /\\caption(\*)?\{([^{}\r\n]*)\}/.exec(body);
      subs.push({ type:'documentImage', attrs:{ ...graphic.attrs,
        width:/\\textwidth$/.test(sub[1]) ? sub[1] : '0.48\\textwidth',
        caption:cap?.[2] ?? null, captionEnabled:Boolean(cap), captionNumbered:cap ? !cap[1] : true,
        figure:false, centered:true, wrap:false } });
    }
    if (!subs.length) return null;
    const tail = inner.slice(inner.lastIndexOf('\\end{subfigure}'));
    const mainCap = /\\caption(\*)?\{([^{}\r\n]*)\}/.exec(tail);
    return { type:'subfigures', attrs:{
      placement:subfigureMatch[1] || null, fixed:subfigureMatch[1]?.includes('H') || false,
      caption:mainCap?.[2] ?? null, captionEnabled:Boolean(mainCap), captionNumbered:mainCap ? !mainCap[1] : true,
      label:/\\label\{([^{}\r\n]+)\}/.exec(tail)?.[1] ?? null }, content:subs };
  }
  const figure = /^\\begin\{figure\}(?:\[([^\]]*)\])?\s*([\s\S]*?)\\end\{figure\}$/.exec(text);
  if (figure) {
    const inner = figure[2];
    const imageMatch = /\\includegraphics(?:\[[^\]]*\])?\{[^{}\\\r\n%]+\}/.exec(inner);
    if (!imageMatch) return null;
    const image = parseImageMarkup(imageMatch[0]);
    if (!image) return null;
    const alignment = /\\centering\b/.test(inner) ? 'center'
      : /\\raggedleft\b/.test(inner) ? 'right'
        : /\\raggedright\b/.test(inner) ? 'left' : null;
    const captionMatch = /\\caption(\*)?\{([^{}\r\n]*)\}/.exec(inner);
    const caption = captionMatch?.[2] ?? null;
    const label = /\\label\{([^{}\r\n]+)\}/.exec(inner)?.[1] ?? null;
    const captionIndex = inner.search(/\\caption\*?\{/);
    const imageIndex = inner.indexOf(imageMatch[0]);
    const imageExpression = inner
      .replace(/\\(?:centering|raggedleft|raggedright)\b/g,'')
      .replace(/\\caption\*?\{[^{}]*\}/g,'')
      .replace(/\\label\{[^{}]*\}/g,'')
      .trim();
    const parsedImage = parseImageMarkup(imageExpression) ?? image;
    const node = {
      ...parsedImage,
      attrs:{
        ...parsedImage.attrs,
        figure:true,
        placement:figure[1] || null,
        fixed:figure[1]?.includes('H') || false,
        centered:alignment === 'center',
        align:alignment,
        caption,
        captionEnabled:Boolean(captionMatch),
        captionNumbered:captionMatch? !captionMatch[1]:true,
        captionPosition:captionIndex >= 0 && captionIndex < imageIndex ? 'above' : 'below',
        label,
      },
    };
    // Accept advanced floats only when the complete original is represented.
    return serializeImage(node.attrs).trim()===text ? node : null;
  }
  return parseImageMarkup(text);
}

function graphicsOptions(attrs) {
  const options = [];
  if (attrs.width) options.push('width=' + attrs.width);
  if (attrs.height) options.push('height=' + attrs.height);
  if (attrs.scale && !attrs.width && !attrs.height) options.push('scale=' + attrs.scale);
  if (attrs.angle) options.push('angle=' + attrs.angle);
  if (attrs.origin) options.push('origin=' + attrs.origin);
  if (attrs.keepAspect && attrs.width && attrs.height) options.push('keepaspectratio');
  return options;
}

function cropOptions(attrs) {
  const trim = [attrs.cropLeft,attrs.cropBottom,attrs.cropRight,attrs.cropTop];
  if (!trim.some(Boolean)) return '';
  return 'trim=' + trim.map(value => value || '0cm').join(' ') + ',clip';
}

function serializeGraphic(attrs) {
  const options = graphicsOptions(attrs);
  let graphic = '\\includegraphics' + (options.length ? '[' + options.join(',') + ']' : '') + '{' + attrs.path + '}';
  if (attrs.flipH) graphic = '\\reflectbox{' + graphic + '}';
  if (attrs.flipV) graphic = '\\scalebox{1}[-1]{' + graphic + '}';
  const crop = cropOptions(attrs);
  if (crop) graphic = '\\adjustbox{' + crop + '}{' + graphic + '}';
  if (attrs.border) {
    const framed = /^#[\da-f]{6}$/i.test(attrs.borderColor ?? '') && attrs.borderColor.toLowerCase() !== '#000000'
      ? '\\fcolorbox[HTML]{' + attrs.borderColor.slice(1).toUpperCase() + '}{white}{' + graphic + '}'
      : '\\fbox{' + graphic + '}';
    graphic = attrs.borderWidth && attrs.borderWidth !== '0.4pt'
      ? '{\\setlength{\\fboxrule}{' + attrs.borderWidth + '}' + framed + '}'
      : framed;
  }
  if (/^#[\da-f]{6}$/i.test(attrs.background ?? '')) {
    graphic = '\\colorbox[HTML]{' + attrs.background.slice(1).toUpperCase() + '}{' + graphic + '}';
  }
  return graphic;
}

function captionEnabled(attrs) {
  return attrs.captionEnabled ?? (attrs.caption !== null && attrs.caption !== undefined);
}

function captionLine(attrs) {
  return captionEnabled(attrs)
    ? '\\caption' + (attrs.captionNumbered === false ? '*' : '') + '{' + (attrs.caption ?? '') + '}\n'
    : '';
}

export function serializeSubfigures(attrs, children) {
  const subs = children.map((child, index) => {
    const width = /^\d+(?:\.\d+)?\\textwidth$/.test(child.attrs.width ?? '') ? child.attrs.width : '0.48\\textwidth';
    const cap = captionEnabled(child.attrs) ? '\\caption{' + (child.attrs.caption ?? '') + '}\n' : '';
    return '\\begin{subfigure}{' + width + '}\n\\centering\n' + serializeGraphic({...child.attrs, width:null, height:null, scale:null})
      + '\n' + cap + '\\end{subfigure}' + (index < children.length - 1 ? '\\hfill\n' : '\n');
  }).join('');
  const body = subs + captionLine(attrs);
  const placement = attrs.fixed ? 'H' : attrs.placement;
  return '\\begin{figure}' + (placement ? '[' + placement + ']' : '') + '\n\\centering\n'
    + body + (body.endsWith('\n') ? '' : '\n') + (attrs.label ? '\\label{' + attrs.label + '}\n' : '')
    + '\\end{figure}\n\n';
}

export function serializeImage(attrs) {
  if(attrs.figureSource)return serializeSourceFigure(attrs)??attrs.figureSource;
  const graphic = serializeGraphic(attrs);
  const caption = captionLine(attrs);
  const label = attrs.label ? '\\label{' + attrs.label + '}\n' : '';
  const alignment = attrs.align ?? (attrs.centered ? 'center' : null);
  const centering = alignment === 'center' ? '\\centering\n' : alignment === 'right' ? '\\raggedleft\n' :
    alignment === 'left' ? '\\raggedright\n' : '';
  if (attrs.wrap) {
    const lines = attrs.wrapLines ? '[' + attrs.wrapLines + ']' : '';
    const overhang = attrs.wrapOverhang ? '[' + attrs.wrapOverhang + ']' : '';
    const body = attrs.captionPosition === 'above' ? caption + graphic : graphic + '\n' + caption;
    return '\\begin{wrapfigure}' + lines + '{' + (attrs.wrapSide ?? 'r') + '}' + overhang
      + '{' + (attrs.wrapWidth ?? '0.4\\textwidth') + '}\n'
      + centering + body + (body.endsWith('\n') ? '' : '\n') + label + '\\end{wrapfigure}\n\n';
  }
  if (!attrs.figure) return graphic + '\n\n';
  const body = attrs.captionPosition === 'above' ? caption + graphic : graphic + '\n' + caption;
  const placement = attrs.fixed ? 'H' : attrs.placement;
  return '\\begin{figure}' + (placement ? '[' + placement + ']' : '') + '\n'
    + centering + body + (body.endsWith('\n') ? '' : '\n') + label + '\\end{figure}\n\n';
}


export const IMAGE_SPACING_DEFAULTS = Object.freeze({
  textfloatsep: '20pt plus 2pt minus 4pt',
  intextsep: '12pt plus 2pt minus 2pt',
  floatsep: '12pt plus 2pt minus 2pt',
  columnsep: '10pt',
});

export function readImageSpacing(preamble = '') {
  const value = name => new RegExp('\\\\setlength\\s*\\{\\\\' + name + '\\}\\s*\\{([^}]*)\\}').exec(preamble)?.[1]?.trim()
    ?? IMAGE_SPACING_DEFAULTS[name];
  return {textfloatsep:value('textfloatsep'),intextsep:value('intextsep'),floatsep:value('floatsep'),columnsep:value('columnsep')};
}

export function writeImageSpacing(preamble = '', spacing = {}) {
  const values = {...IMAGE_SPACING_DEFAULTS,...spacing};
  const lines = Object.entries(values).map(([name,value]) => '\\setlength{\\' + name + '}{' + value + '}');
  const start = '% lineae:image-spacing:start';
  const end = '% lineae:image-spacing:end';
  let text = String(preamble ?? '').replace(new RegExp('\\n?' + start.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '[\\s\\S]*?' + end.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\n?'),'\n');
  const block = start + '\n' + lines.join('\n') + '\n' + end + '\n';
  const begin = text.search(/\\begin\{document\}/);
  return begin < 0 ? text.trimEnd() + '\n' + block : text.slice(0,begin) + block + text.slice(begin);
}
