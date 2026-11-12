const stems='甲乙丙丁戊己庚辛壬癸';
const chinese='一二三四五六七八九';
const counters = {
  decimal:'\\arabic*', 'lower-alpha':'\\protect\\alphalph{\\arabic*}', 'upper-alpha':'\\protect\\AlphAlph{\\arabic*}',
  'lower-roman':'\\roman*', 'upper-roman':'\\Roman*',
  'cjk-heavenly-stem':'\\protect\\lineaeStem{\\arabic*}',
  'cjk-ideographic':'\\protect\\zhnum{\\arabic*}',
  'circled-decimal':'\\protect\\textcircled{\\arabic*}',
};
const forms={dot:['','.'],parens:['(',')'],paren:['',')'],comma:['','、'],bare:['','']};
const roman=/^M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;

export function listMarker(match) {
  const [,open,raw,end]=match;
  const token=/^[①-⑳]$/u.test(raw) ? raw : raw.normalize('NFKC');
  if (open && ![')', '）'].includes(end)) return null;
  const suffix=open ? 'parens' : end===')'||end==='）' ? 'paren' : end==='、' ? 'comma' : end ? 'dot' : 'bare';
  let style='decimal', start=Number(token);
  if (/^[①-⑳]$/u.test(token)) {
    style='circled-decimal'; start=token.codePointAt(0)-'①'.codePointAt(0)+1;
  } else if (stems.includes(token)) {
    style='cjk-heavenly-stem'; start=stems.indexOf(token)+1;
  } else if (/^[一二三四五六七八九十]+$/.test(token)) {
    const digit=c=>c ? chinese.indexOf(c)+1 : 0;
    const [a,b]=token.split('十');
    start=b===undefined ? digit(a) : (digit(a)||1)*10+digit(b);
    style='cjk-ideographic';
  } else if (/^[A-Za-z]+$/.test(token)) {
    const upper=token===token.toUpperCase(), normalized=token.toUpperCase();
    if ((token.length>1 || normalized==='I') && roman.test(normalized)) {
      const values={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};
      start=[...normalized].reduce((n,c,i)=>n+values[c]*(values[c]<values[normalized[i+1]]?-1:1),0);
      style=upper?'upper-roman':'lower-roman';
    } else if (/^([a-z])\1*$/i.test(token) && (upper || token===token.toLowerCase())) {
      start=[...normalized].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
      style=upper?'upper-alpha':'lower-alpha';
    } else return null;
  }
  if (!Number.isSafeInteger(start) || start<1) return null;
  if (suffix==='bare' && !['cjk-heavenly-stem','circled-decimal'].includes(style)) return null;
  return {start,labelStyle:suffix==='dot' ? (style==='decimal'?null:style) : style+'-'+suffix};
}

export const markerInput = /^([(（]?)([1-9１-９][0-9０-９]{0,8}|[A-Za-zＡ-Ｚａ-ｚ]{1,15}|[甲乙丙丁戊己庚辛壬癸]|[一二三四五六七八九]?(?:十[一二三四五六七八九]?)?|[①-⑳])([.．、)）]?)[ 　]$/u;

function markerStyle(style) {
  if (!style) return null;
  const suffix=/-([a-z]+)$/.exec(style)?.[1];
  const form=forms[suffix];
  const name=form ? style.slice(0,-suffix.length-1) : style;
  if (!Object.hasOwn(counters,name)) return null;
  const [left,right]=form ?? forms.dot;
  return {name,left,right};
}

export function listLabel(style) {
  const marker=markerStyle(style);
  return marker && marker.left+counters[marker.name]+marker.right;
}

export function listMarkerCSS(style) {
  const marker=markerStyle(style);
  if (!marker) return null;
  return '--list-counter:'+marker.name+';--list-prefix:'+JSON.stringify(marker.left)+
    ';--list-suffix:'+JSON.stringify(marker.right+' ');
}

export function listStyleForLabel(label) {
  if (label==='\\alph*' || label==='\\alph*.') return 'lower-alpha';
  if (label==='\\Alph*' || label==='\\Alph*.') return 'upper-alpha';
  if (label==='\\chinese*') return 'cjk-heavenly-stem';
  for (const name of Object.keys(counters)) {
    if (label===listLabel(name) ||
        (['decimal','lower-alpha','upper-alpha','lower-roman','upper-roman'].includes(name) && label===counters[name])) return name;
    for (const suffix of Object.keys(forms)) {
      if (label===listLabel(name+'-'+suffix)) return name+'-'+suffix;
    }
  }
  return null;
}
