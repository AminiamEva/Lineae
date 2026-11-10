// Font commands change the selection/insertion style rather than inserting fake text.
export const mathFontStyles = {
  mathbf: { variant: 'normal', variantStyle: 'bold' },
  mathrm: { variant: 'normal', variantStyle: 'up' },
  mathit: { variant: 'normal', variantStyle: 'italic' },
  mathcal: { variant: 'calligraphic', variantStyle: 'up' },
  mathscr: { variant: 'script', variantStyle: 'up' },
  mathbb: { variant: 'double-struck', variantStyle: 'up' },
  mathsf: { variant: 'sans-serif', variantStyle: 'up' },
  mathtt: { variant: 'monospace', variantStyle: 'up' },
  mathfrak: { variant: 'fraktur', variantStyle: 'up' },
};

export function applyMathFont(field, command) {
  const apply=()=>{
    field.focus();
    const before=field.value;
    const selection=structuredClone(field.selection);
    field.applyStyle(mathFontStyles[command]);
    const after=field.value;
    if(after!==before) {
      field.value=before;
      field.insert(after,{format:'latex',insertionMode:'replaceAll',selectionMode:'after'});
      field.selection=selection;
      field.dispatchEvent(new Event('input',{bubbles:true}));
    }
    if(field.selection.ranges.every(([from,to])=>from===to)) {
      const start=event=>{
        if(event.ctrlKey||event.altKey||event.metaKey||event.key.length!==1)return;
        field.removeEventListener('keydown',start,true);
        if(!/^[A-Za-z0-9]$/.test(event.key))return;
        event.preventDefault();event.stopImmediatePropagation();
        field.insert('\\'+command+'{'+event.key+'}',{format:'latex',selectionMode:'after'});
        field.dispatchEvent(new Event('input',{bubbles:true}));
      };
      field.addEventListener('keydown',start,true);
      field.addEventListener('pointerdown',()=>field.removeEventListener('keydown',start,true),{once:true});
    }
  };
  field.focus();
  if(field.hasFocus()) apply();
  else field.addEventListener('mount',apply,{once:true});
}
