// Evaluates ctex/xeCJK CJK glue to numbers in the layout's (unzoomed) px unit.
//
// ctex algorithm transcribed from ctexart.cls 2025/02/03:
//   \ctex_update_stretch           (line 433)
//   \__ctex_update_stretch_auxi    (maxdimen fallback, line 437)
//   \__ctex_update_stretch_auxii   (linestretch branch, line 448)
//   \ctex_update_ziju              (line 481)
// All dimensions are evaluated in scaled-point arithmetic in TeX; here we use
// floating point px with truncating (floor for positive) integer division.

const UNIT_PX = { px: 1, pt: 96 / 72.27, pc: 12 * 96 / 72.27, in: 96, bp: 96 / 72, cm: 96 / 2.54, mm: 96 / 25.4 };

// Evaluates a dimension expression that may reference \ccwd, \baselineskip or
// \ziju. Returns px, Infinity for \maxdimen, or NaN when unsupported.
export function evaluateLength(expression, context = {}) {
  const text = String(expression ?? '').trim();
  if (!text) return 0;
  if (text === '\\maxdimen' || text === 'maxdimen') return Infinity;
  const match = /^(-?(?:\d+(?:\.\d*)?|\.\d+)?)\s*(\\ccwd|\\baselineskip|\\ziju|px|pt|pc|in|bp|cm|mm|em|ex)$/.exec(text);
  if (!match) return NaN;
  const coefficient = match[1] === undefined || match[1] === '' ? 1 : Number(match[1]);
  const unit = match[2];
  const em = context.em ?? context.ccwd ?? 16;
  if (unit === '\\ccwd') return coefficient * (context.ccwd ?? em);
  if (unit === '\\baselineskip') return coefficient * (context.baselineskip ?? em * 1.2);
  if (unit === '\\ziju') return coefficient * (context.zijuPx ?? 0);
  if (unit === 'em') return coefficient * em;
  if (unit === 'ex') return coefficient * em * 0.430556;
  return coefficient * (UNIT_PX[unit] ?? NaN);
}

// Number of scaled points is irrelevant to the ratios; truncating in px gives
// the same integer division as \int_set:Nn {<dim>} followed by \divide.
function truncate(value) { return value < 0 ? Math.ceil(value) : Math.floor(value); }

export function ctexCjkGlue({ linewidth, ccwd, linestretch = '1\\ccwd', ziju = 0, parindent = 0, baselineskip = 0, linespread = 1, glueTouched = false } = {}) {
  const widthPx = linewidth;
  const em = ccwd;
  if (!(em > 0) || !(widthPx > 0)) return { width: 0, stretch: 0, shrink: 0 };
  const zijuDim = (Number(ziju) || 0) * em;
  if (zijuDim !== 0) {
    const ccwdZiju = em + zijuDim;
    if (!(ccwdZiju > 0)) return { width: zijuDim, stretch: 0, shrink: 0 };
    let remainder = widthPx - ccwdZiju + zijuDim;
    let count = truncate(remainder / ccwdZiju);
    remainder -= count * ccwdZiju;
    if (parindent !== 0 && count >= 3) count -= 2;
    if (count <= 0) return { width: zijuDim, stretch: 0, shrink: 0 };
    return {
      width: zijuDim,
      stretch: remainder / count,
      shrink: Math.min(Math.abs(zijuDim), (ccwdZiju - remainder) / (count + 1)),
    };
  }
  const stretchDim = evaluateLength(linestretch, { ccwd: em, em, baselineskip, zijuPx: 0 });
  if (stretchDim === Infinity) {
    if (glueTouched) return null;
    return { width: 0, stretch: 0.08 * baselineskip * linespread, shrink: 0 };
  }
  if (!Number.isFinite(stretchDim)) return { width: 0, stretch: 0, shrink: 0 };
  let remainder = widthPx - em - stretchDim;
  const count = truncate(remainder / em);
  if (count <= 0) return { width: 0, stretch: 0, shrink: 0 };
  remainder = widthPx - em - count * em;
  return { width: 0, stretch: remainder / count, shrink: 0 };
}

// Evaluates a resolved xeCJK glue ({width, stretch, shrink, tie}). The `~`
// default is TeX's nobreak interword space: natural width is the font's space
// advance, stretch/shrink are the font's interword glue ratios.
export function evaluateCjkGlue(glue, { space = 0, em = 16, ccwd = em, baselineskip = em * 1.2, zijuPx = 0 } = {}) {
  if (!glue) return { width: 0, stretch: 0, shrink: 0, nobreak: true };
  if (glue.width === '~') {
    const width = Number(space) || 0;
    return { width, stretch: width * 0.5, shrink: width / 3, nobreak: true, tie: true };
  }
  const context = { em, ccwd, baselineskip, zijuPx };
  const width = evaluateLength(glue.width, context);
  const stretch = evaluateLength(glue.stretch, context);
  const shrink = evaluateLength(glue.shrink, context);
  if ([width, stretch, shrink].some(value => Number.isNaN(value))) {
    return { width: Number(space) || 0, stretch: 0, shrink: 0, nobreak: true, invalid: true };
  }
  return { width, stretch, shrink, nobreak: true, tie: Boolean(glue.tie) };
}

export function zijuFraction(expression, context = {}) {
  const px = evaluateLength(expression, context);
  if (!Number.isFinite(px)) return 0;
  const em = context.em ?? context.ccwd ?? 16;
  return em > 0 ? px / em : 0;
}
