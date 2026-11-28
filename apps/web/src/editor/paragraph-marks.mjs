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
