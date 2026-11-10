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
    if(field.selection.ranges.every(([from,to])=>from===to)) {
      const start=event=>{
        if(event.ctrlKey||event.altKey||event.metaKey||event.key.length!==1)return;
        field.removeEventListener('keydown',start,true);
        if(!/^[A-Za-z0-9]$/.test(event.key))return;
        event.preventDefault();event.stopImmediatePropagation();
        field.insert('\\'+command+'{'+event.key+'}',{format:'latex',selectionMode:'after'});
      };
      field.addEventListener('keydown',start,true);
      field.addEventListener('pointerdown',()=>field.removeEventListener('keydown',start,true),{once:true});
    }
  };
  field.focus();
  if(field.hasFocus()) apply();
  else field.addEventListener('mount',apply,{once:true});
}
