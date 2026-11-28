// Keep a backing pixel on one physical screen pixel at fractional page zoom.
// The page box retains TeX's dimensions for layout and pointer coordinates.
export function sizePageCanvas(canvas, width, height, dpr) {
  const w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
  if(canvas.width!==w)canvas.width=w;
  if(canvas.height!==h)canvas.height=h;
  canvas.style.width=w/dpr+'px';
  canvas.style.height=h/dpr+'px';
}

// Centered sheets and fractional scrolling can place the entire raster
// between device pixels. Align its origin without moving the sheet in flow.
export function alignPageCanvas(canvas, box, dpr) {
  const left=(Math.round(box.left*dpr)/dpr-box.left)+'px';
  const top=(Math.round(box.top*dpr)/dpr-box.top)+'px';
  canvas.style.left=left;
  canvas.style.top=top;
  // Native marks use the same physical origin as the glyphs. The sheet
  // itself retains its fractional coordinates for continuous page layout.
  const sheet=canvas.parentElement?.style;
  if(sheet && sheet.getPropertyValue('--native-raster-x')!==left)sheet.setProperty('--native-raster-x',left);
  if(sheet && sheet.getPropertyValue('--native-raster-y')!==top)sheet.setProperty('--native-raster-y',top);
}
