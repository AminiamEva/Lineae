import { DOMSerializer } from '@tiptap/pm/model';

let internalClipboard = null;

function selectedMath(field) {
  return field.selection.ranges.map(range => field.getValue(range)).join('');
}

function richSelection(editor) {
  const { from, to } = editor.state.selection;
  if (from === to) return null;
  const text = editor.state.doc.textBetween(from,to,'\n',node => node.attrs?.latex ?? '');
  const container = document.createElement('div');
  container.append(DOMSerializer.fromSchema(editor.state.schema)
    .serializeFragment(editor.state.selection.content().content));
  return {
    from,
    to,
    text,
    html: container.innerHTML,
    json: editor.state.selection.content().content.toJSON(),
  };
}

async function writeText(text) {
  if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持剪贴板写入');
  await navigator.clipboard.writeText(text);
}

async function writeRich(info) {
  if (navigator.clipboard?.write && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([info.text], { type: 'text/plain' }),
        'text/html': new Blob([info.html], { type: 'text/html' }),
      })]);
      return;
    } catch {
      // Some browsers expose ClipboardItem but reject non-text types.
    }
  }
  await writeText(info.text);
}

export function createClipboard(editor,{getField = () => null, getSource = () => null,getNative = () => null} = {}) {
  async function copy({cut = false} = {}) {
    const source=getSource();
    if(source?.hasFocus) {
      const state=source.state;
      const text=state.selection.ranges.map(range=>state.sliceDoc(range.from,range.to)).join('\n');
      if(!text)return false;
      await writeText(text);
      if(cut&&source.state===state)source.dispatch({...state.replaceSelection(''),userEvent:'delete.cut'});
      return true;
    }
    const native=getNative();
    if(native){
      if(native.text===null)return false;
      await writeText(native.text);
      return cut?native.cut():true;
    }
    const field = getField();
    if (field) {
      const selected = selectedMath(field);
      if (!selected) return false;
      const value = field.value;
      const selection = structuredClone(field.selection);
      await writeText(selected);
      if (cut && field.isConnected && field.value === value) {
        field.selection = selection;
        field.executeCommand(['insert','']);
        field.dispatchEvent(new Event('input',{bubbles:true}));
      }
      return true;
    }
    const info = richSelection(editor);
    if (!info) return false;
    const docBefore = editor.state.doc;
    await writeRich(info);
    internalClipboard = {...info,time:Date.now()};
    if (cut && editor.state.doc === docBefore) {
      editor.chain().focus().deleteRange({from:info.from,to:info.to}).run();
    }
    return true;
  }

  async function read() {
    let html = '', text = '';
    if (navigator.clipboard?.read && window.ClipboardItem) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (!html && item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
          if (!text && item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
        }
      } catch {
        // Fall back to readText below; permissions and formats vary by browser.
      }
    }
    if (!text) {
      if (!navigator.clipboard?.readText) throw new Error('当前浏览器不支持读取剪贴板');
      text = await navigator.clipboard.readText();
    }
    return {html,text};
  }

  function insertPlain(text) {
    const lines = text.replace(/\r\n?/g,'\n').split('\n');
    const content = [];
    lines.forEach((line,index) => {
      if (index) content.push({type:'hardBreak'});
      if (line) content.push({type:'text',text:line});
    });
    if (content.length) editor.chain().focus().insertContent(content).run();
  }

  function mergeHtml(html) {
    const document = new DOMParser().parseFromString(html,'text/html');
    for (const element of document.body.querySelectorAll('[style]')) element.removeAttribute('style');
    for (const element of [...document.body.querySelectorAll('font')]) element.replaceWith(...element.childNodes);
    return document.body.innerHTML;
  }

  function mergeJson(nodes) {
    const keep = new Set(['bold','italic','underline','strike']);
    const visit = node => {
      if (Array.isArray(node.marks)) node.marks = node.marks.filter(mark => keep.has(mark.type));
      node.content?.forEach(visit);
      return node;
    };
    return nodes.map(visit);
  }

  async function paste(mode = 'keep') {
    const source=getSource();
    if(source?.hasFocus) {
      const state=source.state;
      const {text}=await read();
      if(!text||source.state!==state||!source.hasFocus)return false;
      source.dispatch({...state.replaceSelection(text),userEvent:'input.paste'});
      return true;
    }
    const native=getNative();
    if(native){
      const {text}=await read();
      return native.paste(text);
    }
    const field = getField();
    if (field) {
      const {text} = await read();
      if (!text) return false;
      field.focus();
      field.executeCommand(['insert',text]);
      field.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    }
    const {html,text} = await read();
    if (mode === 'text') {
      if (!text) return false;
      insertPlain(text);
      return true;
    }
    const internal = internalClipboard && (
      (text && internalClipboard.text === text) ||
      (!text && html && internalClipboard.html === html)
    ) ? internalClipboard : null;
    if (internal) {
      const json = mode === 'merge' ? mergeJson(structuredClone(internal.json)) : internal.json;
      editor.chain().focus().insertContent(json).run();
      return true;
    }
    if (mode === 'merge' && html) {
      editor.chain().focus().insertContent(mergeHtml(html)).run();
      return true;
    }
    if (html) {
      editor.chain().focus().insertContent(html).run();
      return true;
    }
    if (!text) return false;
    insertPlain(text);
    return true;
  }

  return {copy, cut: () => copy({cut:true}), paste};
}
