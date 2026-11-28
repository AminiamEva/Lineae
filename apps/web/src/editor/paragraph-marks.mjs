// All positions are in the same coordinate system as the supplied font size.
// unit is one unzoomed CSS pixel in that system (DOM, page pixels or TeX sp).
export function markCenter(baseline,fontSize) {
  return baseline-.32*fontSize;
}

export function indentStroke(column,first,center,unit=1) {
  const left=column+2*unit,right=first-4*unit,tick=3*unit;
  if(right<=left)return '';
  return 'M'+left+' '+center+'H'+right+'m0 '+(-tick)+'v'+(2*tick);
}

export function paragraphEndMarker(doc) {
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','native-rich-endmark');
  svg.setAttribute('aria-hidden','true');
  const text=doc.createElementNS(svg.namespaceURI,'text');
  text.setAttribute('dominant-baseline','middle');
  text.textContent='¶';
  svg.append(text);
  return svg;
}
