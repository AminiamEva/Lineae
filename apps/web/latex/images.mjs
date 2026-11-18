export const imageWidthPattern = /^\d+(?:\.\d+)?(?:\\textwidth|\\linewidth|\\columnwidth|cm|mm|pt|in)$/;

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
  const image = /^(\d+(?:\.\d+)?)(\\textwidth|\\linewidth|\\columnwidth|cm|mm|pt|in)$/.exec(String(width ?? ''));
  if (!image) return '';
  if (!image[2].startsWith('\\')) return width;
  const container = /^(\d+(?:\.\d+)?)(\\textwidth|\\linewidth|\\columnwidth|cm|mm|pt|in)$/.exec(String(containerWidth ?? ''));
  if (container && container[2].startsWith('\\') && Number(container[1]) > 0) {
    return `${(Number(image[1]) / Number(container[1])) * 100}%`;
  }
  return `${Number(image[1]) * 100}%`;
}

export function parseImageBlock(source) {  const text = String(source ?? '').trim();
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
    return {...image,attrs:{...image.attrs,wrap:true,wrapSide:wrap[2],wrapWidth:wrap[4]||'0.4\\textwidth',
      wrapOverhang:wrap[3]||null,wrapLines:wrap[1]||null,figure:false,caption:captionMatch?.[2]??null,
      captionEnabled:Boolean(captionMatch),captionNumbered:captionMatch? !captionMatch[1]:true,
      captionPosition:captionIndex>=0&&captionIndex<imageIndex?'above':'below',
      label:/\\label\{([^{}\r\n]+)\}/.exec(inner)?.[1]??null}};
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
    return {
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
  }
  return parseImageMarkup(text);
}

function graphicsOptions(attrs) {
  const options = [];
  if (attrs.width) options.push('width=' + attrs.width);
  if (attrs.height) options.push('height=' + attrs.height);
  if (attrs.scale) options.push('scale=' + attrs.scale);
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
  const graphic = serializeGraphic(attrs);
  const caption = captionLine(attrs);
  const label = attrs.label ? '\\label{' + attrs.label + '}\n' : '';
  if (attrs.wrap) {
    const lines = attrs.wrapLines ? '[' + attrs.wrapLines + ']' : '';
    const overhang = attrs.wrapOverhang ? '[' + attrs.wrapOverhang + ']' : '';
    const body = attrs.captionPosition === 'above' ? caption + graphic : graphic + '\n' + caption;
    return '\\begin{wrapfigure}' + lines + '{' + (attrs.wrapSide ?? 'r') + '}' + overhang
      + '{' + (attrs.wrapWidth ?? '0.4\\textwidth') + '}\n'
      + body + (body.endsWith('\n') ? '' : '\n') + label + '\\end{wrapfigure}\n\n';
  }
  if (!attrs.figure) return graphic + '\n\n';
  const alignment = attrs.align ?? (attrs.centered ? 'center' : null);
  const centering = alignment === 'center' ? '\\centering\n' : alignment === 'right' ? '\\raggedleft\n' :
    alignment === 'left' ? '\\raggedright\n' : '';
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
