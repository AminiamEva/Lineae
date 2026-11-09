const file = document.querySelector('#file');
const editor = document.querySelector('#editor');


const status = document.querySelector('#status');
const download = document.querySelector('#download');

const copy = {
  'zh-CN': {
    open: '打开 .tex', editor: '编辑正文', paragraph: '段落', text: '正文', download: '下载 .tex',
    intro: '打开 UTF-8 .tex 文件，或在下面开始写作。',
    loading: '正在读取文件…',
    ready: '可编辑独立纯文本段落。下载会保留其余源码。',
    invalid: '请输入单行正文，避免 LaTeX 特殊字符。',
    unsupported: '未找到支持的段落。正文须仅含纯文本和注释，且段落前后留空行。',
    unreadable: '无法读取文件。请检查文件是否为 UTF-8 编码。',
  },
  en: {
    open: 'Open .tex', editor: 'Edit document', paragraph: 'Paragraph', text: 'Text', download: 'Download .tex',
    intro: 'Open a UTF-8 .tex file or start writing below.',
    loading: 'Reading the file…',
    ready: 'Edit a standalone plain-text paragraph. The download preserves the rest of the source.',
    invalid: 'Enter one line of text without LaTeX special characters.',
    unsupported: 'No supported paragraphs found. Use plain text and comments with blank lines around each paragraph.',
    unreadable: 'Could not read the file. Check that it uses UTF-8 encoding.',
  },
};

const language = document.querySelector('#language');
const preferredLanguage = navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';

function setStatus(key) {
  status.dataset.copy = key;
  status.textContent = copy[language.value][key];
}

function translate() {
  document.documentElement.lang = language.value;
  for (const element of document.querySelectorAll('[data-copy]')) {
    const label = copy[language.value][element.dataset.copy];
    element.textContent = label;
    if (element.matches('button, .open span')) {
      element.title = label;
      element.setAttribute('aria-label', label);
    }
  }
}

language.value = preferredLanguage;

// The configuration uses YAML's JSON-compatible syntax.
async function applyConfiguration() {
  const response = await fetch(new URL('./config.yaml', import.meta.url));
  if (!response.ok) throw new Error('Configuration request failed');
  const configuration = await response.json();
  mathBindings = configuration.keybindings?.math ?? mathBindings;
  editor.querySelectorAll('math-field').forEach(configureMath);
  const settings = configuration.interface;
  if (configuration.version !== 1 || !settings) return;

  if (!languageTouched && Object.hasOwn(copy, settings.language)) {
    language.value = settings.language;
    translate();
  }

  const toolbar = document.querySelector('[data-file-tools]');
  const tools = new Map(Array.from(toolbar.children, tool => [tool.dataset.tool, tool]));
  if (Array.isArray(settings.toolbar) && settings.toolbar.length === tools.size &&
      new Set(settings.toolbar).size === tools.size && settings.toolbar.every(tool => tools.has(tool))) {
    toolbar.append(...settings.toolbar.map(tool => tools.get(tool)));
  }
}

let mathBindings = { 'ctrl+6': 'moveToSuperscript', 'ctrl+-': 'moveToSubscript' };
const mathHint = document.createElement('aside');
mathHint.className = 'math-hint';
mathHint.hidden = true;
mathHint.setAttribute('role', 'status');
document.body.append(mathHint);

function configureMath(field) {
  field.popoverPolicy = 'off';
  if (!field.dataset.hintReady) {
    field.dataset.hintReady = 'true';
    field.addEventListener('keydown', event => {
      if (event.key === '\\') {
        mathHint.textContent = language.value === 'zh-CN'
          ? 'LaTeX 命令 · 例如 \\frac、\\sqrt、\\alpha'
          : 'LaTeX commands · e.g. \\frac, \\sqrt, \\alpha';
        mathHint.hidden = false;
      } else if (event.key === 'Escape' || event.key === 'Enter') mathHint.hidden = true;
    }, true);
    field.addEventListener('blur', () => { mathHint.hidden = true; });
  }
  const commands = new Set(['moveToSuperscript', 'moveToSubscript', 'moveAfterParent']);
  field.keybindings = Object.entries(mathBindings)
    .filter(([key, command]) => /^ctrl\+[^+]+$/i.test(key) && commands.has(command))
    .map(([key, command]) => ({ key, command }));
}

let languageTouched = false;
language.addEventListener('change', () => { languageTouched = true; });
applyConfiguration().catch(error => console.warn('Lineae configuration / 配置加载失败', error));
language.addEventListener('change', translate);
translate();

const labels = {
  files: ['文件', 'File'], home: ['主页', 'Home'], insert: ['插入', 'Insert'],
  view: ['视图', 'View'], zoom: ['页面缩放', 'Page zoom'],
  color: ['文字颜色', 'Text color'], family: ['字体', 'Font family'], size: ['字号', 'Font size'],
  heading: ['标题', 'Heading'], paragraph: ['段落', 'Paragraph'],
  bold: ['粗体', 'Bold'], inline: ['行内公式', 'Inline math'],
  display: ['独立公式', 'Display math'], bullets: ['项目列表', 'Bulleted list'],
  ordered: ['编号列表', 'Numbered list'], table: ['表格', 'Table'],
  row: ['添加一行', 'Add row'], column: ['添加一列', 'Add column'],
  item: ['添加项目', 'Add item'], remove: ['删除此块', 'Remove block'],
  source: ['保留的源码', 'Preserved source'],
};

for (const [key, [zh, en]] of Object.entries(labels)) {
  copy['zh-CN'][key] = zh;
  copy.en[key] = en;
}

const sample = String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}

\section{Introduction}

A mathematical paper.

\end{document}
`;
const documentPattern = /^(.*?^\\begin\{document\}[ \t]*\r?\n)(.*)(^\\end\{document\}[ \t]*(?:\r?\n|$).*)$/ms;
const plain = /^[^\\{}%$&#_^~\r\n]*$/;
const templates = {
  heading: String.raw`\section{Introduction}`,
  bullets: '\\begin{itemize}\n\\item First item\n\\end{itemize}',
  ordered: '\\begin{enumerate}\n\\item First item\n\\end{enumerate}',
  table: '\\begin{tabular}{ll}\nA & B \\\\\n1 & 2 \\\\\n\\end{tabular}',
  display: String.raw`\[x^2+y^2=z^2\]`,
};
let documentParts;
let filename = 'lineae.tex';

function button(key, action) {
  const control = document.createElement('button');
  control.type = 'button';
  control.dataset.copy = key;
  control.textContent = copy[language.value][key];
  control.addEventListener('click', action);
  return control;
}

function field(value, save, key = 'paragraph', math = false) {
  const input = document.createElement(math && customElements.get('math-field') ? 'math-field' : 'input');
  if (input.localName === 'math-field') configureMath(input);
  input.value = value;
  input.dataset.field = key;
  input.setAttribute('aria-label', copy[language.value][key]);
  input.addEventListener('input', () => {
    const valid = math ? !/[$%\r\n]|\\[\[\]]|\\(?:begin|end)\b/.test(input.value) : plain.test(input.value);
    input.setAttribute('aria-invalid', String(!valid));
    if (valid) save(input.value);
    download.disabled = Boolean(editor.querySelector('[aria-invalid="true"]'));
  });
  return input;
}

const fontFamilies = { Georgia: '\\rmfamily', Arial: '\\sffamily', monospace: '\\ttfamily' };
const fontSizes = { 2: '\\small', 3: '\\normalsize', 4: '\\large', 5: '\\Large' };

function parseInline(source, depth = 0) {
  if (depth > 40) return null;
  const nodes = [];
  let cursor = 0;
  while (cursor < source.length) {
    const rest = source.slice(cursor);
    const text = rest.match(/^[^\\{}%$&#_^~\r\n]+/);
    const math = rest.match(/^\$([^$\r\n]+)\$/);
    if (text || math) {
      nodes.push(text ? text[0] : { math: math[1] });
      cursor += (text ?? math)[0].length;
      continue;
    }
    const bold = rest.match(/^\\textbf\{/);
    const color = rest.match(/^\\textcolor\[HTML\]\{([0-9a-f]{6})\}\{/i);
    const group = rest.match(/^\{(\\[A-Za-z]+) /);
    const family = group && Object.keys(fontFamilies).find(key => fontFamilies[key] === group[1]);
    const size = group && Object.keys(fontSizes).find(key => fontSizes[key] === group[1]);
    if (!bold && !color && !family && !size) return null;
    const start = (bold ?? color ?? group)[0].length;
    let balance = 1;
    let end = start;
    for (; end < rest.length && balance; end++) {
      if (rest[end] === '\\' && /[{}\\]/.test(rest[end + 1] ?? '')) {
        end++;
      } else if (rest[end] === '{') balance++;
      else if (rest[end] === '}') balance--;
    }
    if (balance) return null;
    const children = parseInline(rest.slice(start, end - 1), depth + 1);
    if (!children) return null;
    nodes.push({
      bold: Boolean(bold),
      attribute: color ? 'color' : family ? 'face' : size ? 'size' : null,
      value: color ? '#' + color[1] : family || size,
      children,
    });
    cursor += end;
  }
  return nodes;
}

function paperText(value, save, key) {
  const control = document.createElement('span');
  control.className = 'paper-text';
  control.contentEditable = 'plaintext-only';
  control.dataset.field = key;
  control.setAttribute('aria-label', copy[language.value][key]);
  control.setAttribute('role', 'textbox');
  control.textContent = value;
  control.addEventListener('beforeinput', event => {
    if (['insertParagraph', 'insertLineBreak', 'insertFromDrop'].includes(event.inputType)) event.preventDefault();
  });
  control.addEventListener('input', () => {
    const valid = plain.test(control.textContent);
    control.setAttribute('aria-invalid', String(!valid));
    if (valid) save(control.textContent);
    download.disabled = Boolean(editor.querySelector('[aria-invalid="true"]'));
  });
  return control;
}

function editorBlock(raw) {
  const node = document.createElement('section');
  let output = raw;
  node.contentEditable = 'false';
  node.serialize = () => output === raw ? raw : raw.match(/^\s*/)[0] + output + raw.match(/\s*$/)[0];
  const body = raw.trim();
  const heading = body.match(/^\\section\{([^{}]*)\}$/);
  const formula = body.match(/^\\\[([\s\S]*?)\\\]$/);
  const list = body.match(/^\\begin\{(itemize|enumerate)\}\r?\n([\s\S]*?)\r?\n\\end\{\1\}$/);
  const table = body.match(/^\\begin\{tabular\}\{([lcr]+)\}\r?\n([\s\S]*?)\r?\n\\end\{tabular\}$/);
  const lineBreak = raw.includes('\r\n') ? '\r\n' : documentParts.eol;

  if (heading && plain.test(heading[1])) {
    node.className = 'heading';
    const title = document.createElement('h2');
    title.append(paperText(heading[1], value => { output = '\\section{' + value + '}'; }, 'heading'));
    node.append(title);
  } else if (formula) {
    node.append(field(formula[1], value => { output = '\\[' + value + '\\]'; }, 'display', true));
  } else if (list && list[2].split(/\r?\n/).every(line => /^\\item /.test(line) && plain.test(line.slice(6)))) {
    const items = list[2].split(/\r?\n/).map(line => line.slice(6));
    const view = document.createElement(list[1] === 'itemize' ? 'ul' : 'ol');
    const save = () => {
      output = ['\\begin{' + list[1] + '}', ...items.map(value => '\\item ' + value), '\\end{' + list[1] + '}'].join(lineBreak);
    };
    const add = index => {
      const li = document.createElement('li');
      const control = paperText(items[index], value => { items[index] = value; save(); }, 'item');
      control.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          addItem();
        }
      });
      li.append(control);
      view.append(li);
      return control;
    };
    items.forEach((_, index) => add(index));
    const addItem = () => {
      items.push('');
      const control = add(items.length - 1);
      save();
      control.focus();
    };
    node.append(view, button('item', addItem));
  } else if (table && tableRows(table).every(row => row.length === table[1].length && row.every(value => plain.test(value.trim())))) {
    const rows = tableRows(table);
    let columns = table[1];
    const view = document.createElement('table');
    const save = () => {
      output = ['\\begin{tabular}{' + columns + '}', ...rows.map(row => row.join(' & ') + ' \\\\'), '\\end{tabular}'].join(lineBreak);
    };
    const addCell = (tr, row, index) => {
      const cell = tr.insertCell();
      const control = paperText(row[index].trim(), value => { row[index] = value; save(); }, 'table');
      control.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || event.isComposing) return;
        const cells = Array.from(view.querySelectorAll('.paper-text'));
        const next = cells[cells.indexOf(control) + (event.shiftKey ? -1 : 1)];
        if (!next) return;
        event.preventDefault();
        next.focus();
      });
      cell.append(control);
    };
    const addRow = row => {
      const tr = view.insertRow();
      row.forEach((_, index) => addCell(tr, row, index));
    };
    rows.forEach(addRow);
    node.append(view, button('row', () => {
      const row = Array(columns.length).fill('');
      rows.push(row);
      addRow(row);
      save();
    }), button('column', () => {
      columns += 'l';
      rows.forEach((row, index) => { row.push(''); addCell(view.rows[index], row, row.length - 1); });
      save();
    }));
  } else {
    const parts = parseInline(body);
    if (parts) {
      const line = document.createElement('p');
      line.className = 'document-line';
      node.removeAttribute('contenteditable');
      line.setAttribute('aria-label', copy[language.value].paragraph);
      line.dataset.field = 'paragraph';
      line.dataset.documentLine = '';
      const save = () => {
        const serialize = (element, bold = false) => {
          if (element.nodeType === Node.TEXT_NODE) return element.textContent;
          if (element.dataset?.inlineMath !== undefined) return '$' + element.firstChild.value + '$';
          const strong = element.matches?.('b, strong');
          const text = Array.from(element.childNodes, child => serialize(child, bold || strong)).join('');
          let result = strong && !bold && text ? '\\textbf{' + text + '}' : text;
          if (element.matches?.('font')) {
            const font = element.getAttribute('face');
            const size = element.getAttribute('size');
            const color = element.getAttribute('color');
            if (Object.hasOwn(fontFamilies, font)) result = '{' + fontFamilies[font] + ' ' + result + '}';
            if (Object.hasOwn(fontSizes, size)) result = '{' + fontSizes[size] + ' ' + result + '}';
            if (/^#[0-9a-f]{6}$/i.test(color)) result = '\\textcolor[HTML]{' + color.slice(1) + '}{' + result + '}';
          }
          return result;
        };
        output = serialize(line);
        const text = line.cloneNode(true);
        text.querySelectorAll('[data-inline-math]').forEach(math => math.remove());
        line.setAttribute('aria-invalid', String(!plain.test(text.textContent)));
        download.disabled = Boolean(editor.querySelector('[aria-invalid="true"]'));
      };
      const inlineMath = value => {
        const wrapper = document.createElement('span');
        wrapper.dataset.inlineMath = '';
        wrapper.contentEditable = 'false';
        const control = field(value, () => wrapper.closest('.document-line')?.syncSource(), 'inline', true);
        wrapper.append(control);
        return wrapper;
      };
      const render = part => {
        if (typeof part === 'string') return document.createTextNode(part);
        if (part.math !== undefined) return inlineMath(part.math);
        const element = document.createElement(part.bold ? 'strong' : 'font');
        if (part.attribute) element.setAttribute(part.attribute, part.value);
        element.append(...part.children.map(render));
        return element;
      };
      line.append(...parts.map(render));
      line.syncSource = save;
      line.addEventListener('input', event => {
        if (!event.target.closest('[data-inline-math]')) save();
      });
      line.handleParagraphInput = event => {
        if (event.inputType === 'insertParagraph' && !event.target.closest('[data-inline-math]')) {
          const selection = window.getSelection();
          if (!selection.rangeCount || !line.contains(selection.anchorNode) || !line.contains(selection.focusNode)) return;
          event.preventDefault();
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const tail = range.cloneRange();
          tail.setEnd(line, line.childNodes.length);
          const fragment = tail.extractContents();
          const next = editorBlock('');
          const nextLine = next.querySelector('.document-line');
          nextLine.replaceChildren(fragment);
          const spacer = document.createElement('span');
          spacer.hidden = true;
          spacer.contentEditable = 'false';
          spacer.serialize = () => documentParts.eol.repeat(2);
          node.after(spacer, next);
          save();
          nextLine.dispatchEvent(new Event('input'));
          selection.collapse(nextLine, 0);
          return;
        }
        if (event.target.closest('[data-inline-math]')) return;
        if (['insertParagraph', 'insertLineBreak', 'insertFromDrop'].includes(event.inputType)) event.preventDefault();
      };
      line.handlePaste = event => {
        if (event.target.closest('[data-inline-math]')) return;
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain').replace(/\r?\n/g, ' '));
      };
      line.insertInlineMath = range => {
        if (!range.collapsed) return;
        const math = inlineMath('x^2');
        range.insertNode(math);
        save();
        math.firstChild.focus();
      };
      node.append(line);
      return node;
    } else {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.dataset.copy = 'source';
      summary.textContent = copy[language.value].source;
      const pre = document.createElement('pre');
      pre.textContent = raw;
      details.append(summary, pre);
      node.append(details);
      return node;
    }
  }
  node.append(button('remove', () => {
    node.remove();
    download.disabled = Boolean(editor.querySelector('[aria-invalid="true"]'));
  }));
  return node;
}

function tableRows(match) {
  return match[2].split(/\r?\n/).map(line => line.replace(/[ \t]*\\\\[ \t]*$/, '').split('&'));
}

function openDocument(source) {
  const match = source.match(documentPattern);
  if (!match) return false;
  const [, start, body, end] = match;

  const blocks = [];
  const environments = [];
  let cursor = 0;
  const tokens = /%[^\r\n]*|\\(?:begin|end)\{[^{}\r\n]+\}|\\[\[\]]|\\[\\%]|(?:\r?\n)[ \t]*(?:\r?\n)(?:[ \t]*\r?\n)*/g;
  for (const token of body.matchAll(tokens)) {
    const value = token[0];
    if (value.startsWith('\\begin{') || value === '\\[') environments.push(value);
    else if (value.startsWith('\\end{') || value === '\\]') {
      const expected = value === '\\]' ? '\\[' : value.replace('\\end', '\\begin');
      if (environments.pop() !== expected) return false;
    } else if (/^[\r\n]/.test(value) && !environments.length) {
      blocks.push(body.slice(cursor, token.index), value);
      cursor = token.index + value.length;
    }
  }
  if (environments.length) return false;
  blocks.push(body.slice(cursor));
  documentParts = { start, end, eol: start.includes('\r\n') ? '\r\n' : '\n' };
  editor.replaceChildren(...blocks.filter(Boolean).map((block, index) => {
    if (block.trim()) return editorBlock(block);
    const spacer = document.createElement('span');
    spacer.hidden = true;
    spacer.contentEditable = 'false';
    spacer.serialize = () => block;
    return spacer;
  }));
  if (!editor.querySelector('.document-line')) editor.append(editorBlock(''));
  download.disabled = false;
  return true;
}

editor.contentEditable = 'true';
editor.setAttribute('role', 'textbox');
editor.setAttribute('aria-multiline', 'true');
editor.setAttribute('aria-label', '文档 / Document');

function selectedLine(anchor = window.getSelection()?.anchorNode) {
  return (anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement)?.closest('.document-line');
}

function mergeAtBoundary(event, line, selection) {
  if (!selection.isCollapsed || !selection.rangeCount ||
      !['deleteContentBackward', 'deleteContentForward'].includes(event.inputType)) return;
  const backward = event.inputType === 'deleteContentBackward';
  const caret = selection.getRangeAt(0);
  const remaining = caret.cloneRange();
  if (backward) remaining.setStart(line, 0);
  else remaining.setEnd(line, line.childNodes.length);
  const fragment = remaining.cloneContents();
  if (fragment.textContent || fragment.querySelector('[data-inline-math]')) return;
  event.preventDefault();

  const section = line.parentElement;
  const direction = backward ? 'previousElementSibling' : 'nextElementSibling';
  const spacers = [];
  let neighbor = section[direction];
  while (neighbor?.hidden) {
    spacers.push(neighbor);
    neighbor = neighbor[direction];
  }
  const other = neighbor?.querySelector(':scope > .document-line');
  if (!other) return;
  const first = backward ? other : line;
  const second = backward ? line : other;
  const offset = first.childNodes.length;
  first.append(...second.childNodes);
  second.parentElement.remove();
  spacers.forEach(spacer => spacer.remove());
  first.syncSource();
  selection.collapse(first, offset);
}

function collapseTextSelection(selection) {
  if (!selection.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const first = selectedLine(range.startContainer);
  const last = selectedLine(range.endContainer);
  if (!first || !last || first === last) return false;
  const sections = [];
  let section = first.parentElement.nextElementSibling;
  while (section) {
    if (!section.hidden && !section.querySelector(':scope > .document-line')) return false;
    sections.push(section);
    if (section === last.parentElement) break;
    section = section.nextElementSibling;
  }
  if (!section) return false;

  const tail = range.cloneRange();
  tail.collapse(false);
  tail.setEnd(last, last.childNodes.length);
  const suffix = tail.extractContents();
  const prefix = range.cloneRange();
  prefix.collapse(true);
  prefix.setEnd(first, first.childNodes.length);
  prefix.deleteContents();
  const offset = first.childNodes.length;
  first.append(suffix);
  sections.forEach(node => node.remove());
  selection.collapse(first, offset);
  first.syncSource();
  return true;
}

editor.addEventListener('beforeinput', event => {
  if (event.target !== editor) return;
  const line = selectedLine();
  const selection = window.getSelection();
  if (!line || !line.contains(selection.focusNode)) {
    const type = event.inputType;
    if (!event.isComposing && (type.startsWith('delete') || ['insertText', 'insertParagraph'].includes(type)) &&
        collapseTextSelection(selection)) {
      event.preventDefault();
      if (type === 'insertText' && event.data) document.execCommand('insertText', false, event.data);
      if (type === 'insertParagraph') selectedLine().handleParagraphInput(event);
      return;
    }
    event.preventDefault();
    return;
  }
  mergeAtBoundary(event, line, window.getSelection());
  if (!event.defaultPrevented) line.handleParagraphInput(event);
});
editor.addEventListener('input', event => {
  if (event.target === editor) selectedLine()?.syncSource();
});
editor.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('.document-line, [contenteditable="false"], button, math-field, input')) return;
  const lines = Array.from(editor.querySelectorAll('.document-line'));
  if (!lines.length) return;
  const line = lines.reduce((nearest, candidate) => {
    const distance = element => {
      const rect = element.getBoundingClientRect();
      return Math.max(rect.top - event.clientY, event.clientY - rect.bottom, 0);
    };
    return distance(candidate) < distance(nearest) ? candidate : nearest;
  });
  event.preventDefault();
  editor.focus({ preventScroll: true });
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(line);
  range.collapse(event.clientY < line.getBoundingClientRect().top);
  if (event.shiftKey && editor.contains(selection.anchorNode)) {
    selection.extend(range.startContainer, range.startOffset);
  } else {
    selection.removeAllRanges();
    selection.addRange(range);
  }
});

editor.addEventListener('paste', event => {
  if (event.target !== editor) return;
  const line = selectedLine();
  const selection = window.getSelection();
  if (line?.contains(selection.focusNode) || collapseTextSelection(selection)) {
    selectedLine().handlePaste(event);
  } else event.preventDefault();
});

const insert = document.querySelector('#insert');
for (const [key, template] of Object.entries(templates)) {
  insert.append(button(key, () => {
    const spacer = document.createElement('span');
    spacer.hidden = true;
    spacer.contentEditable = 'false';
    spacer.serialize = () => documentParts.eol.repeat(2);
    editor.append(spacer, editorBlock(template));
  }));
}
for (const key of ['bold', 'inline']) {
  const control = button(key, () => {
    const selection = window.getSelection();
    const anchor = selection.anchorNode;
    const line = (anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement)?.closest('[data-document-line]');
    if (!line || !selection.rangeCount || !line.contains(selection.focusNode)) return;
    if (key === 'bold') document.execCommand('bold');
    else line.insertInlineMath(selection.getRangeAt(0));
  });
  control.addEventListener('mousedown', event => event.preventDefault());
  insert.append(control);
}
let formatRange;
document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  const line = selectedLine();
  if (line && selection.rangeCount && !selection.isCollapsed && line.contains(selection.focusNode)) {
    formatRange = selection.getRangeAt(0).cloneRange();
  } else if (editor.contains(selection.anchorNode)) {
    formatRange = undefined;
  }
});

const formatOptions = {
  color: ['foreColor', [['#202124', '●'], ['#c4263a', '🔴'], ['#245eb7', '🔵'], ['#238451', '🟢']]],
  family: ['fontName', [['Georgia', 'Serif'], ['Arial', 'Sans'], ['monospace', 'Mono']]],
  size: ['fontSize', [['2', 'S'], ['3', 'M'], ['4', 'L'], ['5', 'XL']]],
};
for (const [key, [command, options]] of Object.entries(formatOptions)) {
  const menu = document.createElement('select');
  menu.dataset.format = key;
  menu.append(new Option({ color: '◉', family: 'Aa', size: '↕' }[key], ''));
  for (const [value, icon] of options) menu.append(new Option(icon, value));
  menu.addEventListener('change', () => {
    if (formatRange && editor.contains(formatRange.commonAncestorContainer) && menu.value) {
      const range = formatRange;
      editor.focus();
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(command, false, menu.value);
      selectedLine()?.syncSource();
    }
    menu.value = '';
  });
  insert.append(menu);
}

function labelFormatMenus() {
  for (const menu of document.querySelectorAll('[data-format]')) {
    const label = copy[language.value][menu.dataset.format];
    menu.title = label;
    menu.setAttribute('aria-label', label);
  }
}

const panels = new Map();
const tabs = document.createElement('nav');
tabs.className = 'ribbon-tabs';
tabs.setAttribute('aria-label', '命令分组 / Command groups');
const filePanel = document.querySelector('header .tools');
filePanel.dataset.fileTools = '';
const toolbar = document.createElement('div');
toolbar.className = 'ribbon';
document.querySelector('header').after(toolbar);
toolbar.append(tabs, filePanel, insert);
panels.set('files', filePanel);
panels.set('insert', insert);
for (const name of ['home', 'view']) {
  const panel = document.createElement('div');
  panel.className = 'tools';
  toolbar.append(panel);
  panels.set(name, panel);
}
panels.get('home').append(insert.querySelector('[data-copy="bold"]'), ...insert.querySelectorAll('[data-format]'));

const zoom = document.createElement('select');
for (const percent of [50, 75, 100, 125, 150, 200]) {
  zoom.append(new Option(percent + '%', String(percent)));
}
zoom.value = '100';
zoom.addEventListener('change', () => {
  editor.style.zoom = String(Number(zoom.value) / 100);
});
const zoomLabel = document.createElement('label');
const zoomText = document.createElement('span');
zoomText.dataset.copy = 'zoom';
zoomLabel.append(zoomText, zoom);
panels.get('view').append(zoomLabel);

const tabButtons = new Map();
function selectTab(active) {
  for (const [name, panel] of panels) {
    panel.hidden = name !== active;
    tabButtons.get(name).setAttribute('aria-pressed', String(name === active));
  }
}
for (const name of ['files', 'home', 'insert', 'view']) {
  const control = button(name, () => selectTab(name));
  tabButtons.set(name, control);
  tabs.append(control);
}
tabs.addEventListener('mousedown', event => {
  if (event.target.closest('button')) event.preventDefault();
});
selectTab('home');

labelFormatMenus();
language.addEventListener('change', labelFormatMenus);
openDocument(sample);
translate();
language.addEventListener('change', () => {
  for (const field of editor.querySelectorAll('[data-field]')) {
    field.setAttribute('aria-label', copy[language.value][field.dataset.field]);
  }
});
customElements.whenDefined('math-field').then(() => {
  for (const field of editor.querySelectorAll('input[data-field="inline"], input[data-field="display"]')) {
    const replacement = document.createElement('math-field');
    configureMath(replacement);
    replacement.value = field.value;
    replacement.dataset.field = field.dataset.field;
    replacement.setAttribute('aria-label', field.getAttribute('aria-label'));
    replacement.addEventListener('input', () => {
      field.value = replacement.value;
      field.dispatchEvent(new Event('input'));
      replacement.setAttribute('aria-invalid', field.getAttribute('aria-invalid'));
      download.disabled = Boolean(editor.querySelector('[aria-invalid="true"]'));
    });
    field.replaceWith(replacement);
  }
});

file.addEventListener('change', async () => {
  const selected = file.files[0];
  if (!selected) return;
  setStatus('loading');
  try {
    const bytes = await selected.arrayBuffer();
    if (selected !== file.files[0]) return;
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (!openDocument(source)) {
      setStatus('unsupported');
      return;
    }
    filename = selected.name;
    setStatus('intro');
  } catch {
    if (selected === file.files[0]) setStatus('unreadable');
  }
});

download.addEventListener('click', () => {
  const body = Array.from(editor.children, node => node.serialize()).join('');
  const { start, end, eol } = documentParts;
  const separator = body && !body.endsWith('\n') ? eol : '';
  const preamble = body.includes('\\textcolor[HTML]') && !/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^}]*\bxcolor\b[^}]*\}/.test(start)
    ? start.replace(/^\\begin\{document\}/m, '\\usepackage{xcolor}' + eol + '\\begin{document}')
    : start;
  const url = URL.createObjectURL(new Blob([preamble, body, separator, end], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
