// Font commands change the selection/insertion style rather than inserting fake text.
export const mathFontStyles = {
  mathbf: { variant: 'normal', variantStyle: 'bold' },
  mathrm: { variant: 'normal', variantStyle: 'up' },
  mathit: { variant: 'normal', variantStyle: 'italic' },
  mathcal: { variant: 'calligraphic', variantStyle: 'up' },
  mathbb: { variant: 'double-struck', variantStyle: 'up' },
  mathsf: { variant: 'sans-serif', variantStyle: 'up' },
  mathtt: { variant: 'monospace', variantStyle: 'up' },
  mathfrak: { variant: 'fraktur', variantStyle: 'up' },
};

export function applyMathFont(field, command) {
  const apply=()=>{
    field.focus();
    field.applyStyle(mathFontStyles[command]);
  };
  field.focus();
  if(field.hasFocus()) apply();
  else field.addEventListener('mount',apply,{once:true});
}
