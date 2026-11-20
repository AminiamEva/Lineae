const markNames = ['bold','italic','underline','strike','code','subscript','superscript','smallcaps','boxed'];
const paragraphAttributes = ['align','indent','indentLevel','explicitIndent'];

export function installFormatPainter(editor,{button,getField = () => null} = {}) {
  let captured = null;
  let armed = false;
  let sticky = false;
  let applying = false;

  function setArmed(value) {
    armed = value;
    if (!value) captured = null;
    button?.setAttribute('aria-pressed',String(value));
    document.body.classList.toggle('format-painter-active',value);
  }

  function capture() {
    const marks = [];
    for (const name of markNames) {
      if (!editor.isActive(name)) continue;
      marks.push({name,attrs:{...editor.getAttributes(name)}});
    }
    const textStyle = {...editor.getAttributes('textStyle')};
    const paragraph = {};
    const current = editor.getAttributes('paragraph');
    for (const key of paragraphAttributes) {
      if (Object.hasOwn(current,key)) paragraph[key] = current[key];
    }
    captured = {marks,textStyle,paragraph};
    return captured;
  }

  function apply() {
    if (!captured || applying) return false;
    const field = getField();
    if (field) return false;
    applying = true;
    try {
      const chain = editor.chain().focus();
      chain.unsetAllMarks();
      for (const mark of captured.marks) chain.setMark(mark.name,mark.attrs);
      if (Object.keys(captured.textStyle).length) chain.setMark('textStyle',captured.textStyle);
      if (Object.keys(captured.paragraph).length) chain.updateAttributes('paragraph',captured.paragraph);
      const changed = chain.run();
      if (changed && !sticky) setArmed(false);
      return changed;
    } finally {
      applying = false;
    }
  }

  function activate(event) {
    if (armed) {
      if (event?.detail >= 2) { sticky = true; return; }
      setArmed(false);
      return;
    }
    capture();
    sticky = event?.detail >= 2;
    setArmed(true);
  }

  const onSelection = () => {
    if (armed && !applying && !editor.state.selection.empty) apply();
  };
  const onKey = event => {
    if (event.key !== 'Escape' || !armed) return;
    event.preventDefault();
    setArmed(false);
  };
  editor.on('selectionUpdate',onSelection);
  document.addEventListener('keydown',onKey,true);

  return {
    activate,
    cancel: () => setArmed(false),
    apply,
    get active() { return armed; },
    destroy() {
      editor.off('selectionUpdate',onSelection);
      document.removeEventListener('keydown',onKey,true);
      setArmed(false);
    },
  };
}
