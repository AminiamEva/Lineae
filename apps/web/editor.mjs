const file = document.querySelector('#file');
const editor = document.querySelector('#editor');


const status = document.querySelector('#status');
const download = document.querySelector('#download');

const copy = {
  'zh-CN': {
    open: '打开 .tex', editor: '编辑正文', paragraph: '段落', text: '正文', download: '下载 .tex',
    intro: '',
    loading: '正在读取文件…',
    ready: '可编辑独立纯文本段落。下载会保留其余源码。',
    invalid: '请输入单行正文，避免 LaTeX 特殊字符。',
    unsupported: '未找到支持的段落。正文须仅含纯文本和注释，且段落前后留空行。',
    unreadable: '无法读取文件。请检查文件是否为 UTF-8 编码。',
  },
  en: {
    open: 'Open .tex', editor: 'Edit document', paragraph: 'Paragraph', text: 'Text', download: 'Download .tex',
    intro: '',
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
  status.hidden = !status.textContent;
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
  const configUrl = new URL('./config.yaml', import.meta.url);
  configUrl.search = new URL(import.meta.url).search;
  const response = await fetch(configUrl);
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
    field.addEventListener('move-out', event => {
      const inline = field.closest('[data-inline-math]');
      if (inline) {
        editor.focus({ preventScroll: true });
        const index = Array.prototype.indexOf.call(inline.parentNode.childNodes, inline);
        window.getSelection().collapse(inline.parentNode, index + (event.detail?.direction === 'backward' ? 0 : 1));
      } else {
        paragraphAfter(field.closest('section'));
      }
    });
    field.addEventListener('keydown', event => {
      if (event.key !== 'Backspace' || field.value || event.isComposing) return;
      event.preventDefault();
      const inline = field.closest('[data-inline-math]');
      if (inline) {
        const line = inline.closest('.document-line');
        const parent = inline.parentNode;
        const index = Array.prototype.indexOf.call(parent.childNodes, inline);
        inline.remove();
        editor.focus();
        window.getSelection().collapse(parent, index);
        line.syncSource();
      } else {
        const section = field.closest('section');
        paragraphAfter(section);
        section.remove();
      }
      download.disabled = Boolean(editor.querySelector('[aria-invalid="true"]'));
    }, true);
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
  italic: ['斜体', 'Italic'], underline: ['下划线', 'Underline'],
  color: ['文字颜色', 'Text color'], family: ['字体', 'Font family'], size: ['字号', 'Font size'],
  heading: ['标题', 'Heading'], paragraph: ['段落', 'Paragraph'],
  bold: ['粗体', 'Bold'], inline: ['行内公式', 'Inline math'],
  display: ['独立公式', 'Display math'], bullets: ['项目列表 (itemize)', 'itemize'],
  ordered: ['编号列表 (enumerate)', 'enumerate'], table: ['表格', 'Table'],
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
  bullets: '\\begin{itemize}\n\\item \n\\end{itemize}',
  ordered: '\\begin{enumerate}\n\\item \n\\end{enumerate}',
  table: ['\\begin{tabular}{ll}', ' & ' + '\\\\', ' & ' + '\\\\', '\\end{tabular}'].join('\n'),
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
  if (input.localName === 'math-field') {
    input.textContent = value;
    queueMicrotask(() => { if (input.isConnected) configureMath(input); });
  } else input.value = value;
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
const fontSizes = { 1: '\\scriptsize', 2: '\\small', 3: '\\normalsize', 4: '\\large', 5: '\\Large', 6: '\\LARGE', 7: '\\Huge' };

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
    const emphasis = rest.match(/^\\(textbf|textit|underline)\{/);
    const color = rest.match(/^\\textcolor\[HTML\]\{([0-9a-f]{6})\}\{/i);
    const points = rest.match(/^\{\\fontsize\{(\d{1,2})\}\{\d{1,2}\}\\selectfont /);
    const group = rest.match(/^\{(\\[A-Za-z]+) /);
    const family = group && Object.keys(fontFamilies).find(key => fontFamilies[key] === group[1]);
    const size = group && Object.keys(fontSizes).find(key => fontSizes[key] === group[1]);
    if (!emphasis && !color && !family && !size && !points) return null;
    const start = (emphasis ?? color ?? points ?? group)[0].length;
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
      tag: { textbf: 'strong', textit: 'em', underline: 'u' }[emphasis?.[1]],
      points: points?.[1],
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
  control.tabIndex = 0;
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
    node.className = 'display-equation';
    node.append(field(formula[1], value => { output = '\\[' + value + '\\]'; }, 'display', true));
  } else if (list && list[2].split(/\r?\n/).every(line => /^\\item(?: |$)/.test(line) && plain.test(line.slice(6)))) {
    const items = list[2].split(/\r?\n/).map(line => line.slice(6));
    const view = document.createElement(list[1] === 'itemize' ? 'ul' : 'ol');
    const save = () => {
      output = ['\\begin{' + list[1] + '}', ...items.map(value => '\\item ' + value), '\\end{' + list[1] + '}'].join(lineBreak);
    };
    const add = index => {
      const li = document.createElement('li');
      const control = paperText(items[index], value => {
        items[Array.prototype.indexOf.call(view.children, li)] = value;
        save();
      }, 'item');
      control.addEventListener('keydown', event => {
        if (event.isComposing || event.key !== 'Enter') return;
        event.preventDefault();
        const position = Array.prototype.indexOf.call(view.children, li);
        if (!control.textContent.trim() && position === items.length - 1) {
          items.pop();
          li.remove();
          paragraphAfter(node);
          if (items.length) save();
          else node.remove();
          return;
        }
        items.splice(position + 1, 0, '');
        add(position + 1).focus();
        save();
      });
      li.append(control);
      view.insertBefore(li, view.children[index] ?? null);
      return control;
    };
    items.forEach((_, index) => add(index));
    node.append(view);
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
        if (!next && !event.shiftKey) {
          event.preventDefault();
          node.addTableRow();
          return;
        }
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
    node.append(view);
    node.addTableRow = () => {
      const row = Array(columns.length).fill('');
      rows.push(row);
      addRow(row);
      save();
      view.rows[view.rows.length - 1].querySelector('.paper-text')?.focus();
    };
    node.addTableColumn = () => {
      columns += 'l';
      rows.forEach((row, index) => {
        row.push('');
        addCell(view.rows[index], row, row.length - 1);
      });
      save();
    };
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
          if (element.matches?.('i, em') && result) result = '\\textit{' + result + '}';
          if (element.matches?.('u') && result) result = '\\underline{' + result + '}';
          const points = Number(element.dataset?.points);
          if (Number.isInteger(points) && points >= 6 && points <= 72) {
            result = '{\\fontsize{' + points + '}{' + Math.ceil(points * 1.2) + '}\\selectfont ' + result + '}';
          }
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
        const element = document.createElement(part.tag ?? (part.points ? 'span' : 'font'));
        if (part.points) {
          element.dataset.points = part.points;
          element.style.fontSize = part.points + 'pt';
        }
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
          if (!line.textContent.trim() && !line.querySelector('[data-inline-math]')) {
            let previous = node.previousElementSibling;
            while (previous?.hidden) previous = previous.previousElementSibling;
            const fields = previous?.querySelectorAll('li .paper-text');
            if (fields?.length) {
              event.preventDefault();
              const last = fields[fields.length - 1];
              last.focus();
              window.getSelection().collapse(last, last.childNodes.length);
              return;
            }
          }
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
        requestAnimationFrame(() => math.firstChild?.focus());
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
  const heading = backward && neighbor?.querySelector('h2 .paper-text');
  if (heading && plain.test(line.textContent) && !line.querySelector('strong, em, u, font, [data-inline-math], [data-points]')) {
    const offset = heading.textContent.length;
    heading.textContent += line.textContent;
    heading.dispatchEvent(new Event('input'));
    section.remove();
    spacers.forEach(spacer => spacer.remove());
    heading.focus();
    selection.collapse(heading.firstChild, offset);
    return;
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

function deleteSelectedObjects(selection) {
  if (selection.isCollapsed || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  const sections = Array.from(editor.querySelectorAll(':scope > section'));
  const covered = sections.filter(section => {
    if (!range.intersectsNode(section) || section.querySelector('details')) return false;
    const contents = document.createRange();
    contents.selectNodeContents(section);
    const start = range.cloneRange();
    start.collapse(true);
    const end = range.cloneRange();
    end.collapse(false);
    const prefix = contents.cloneRange();
    const suffix = contents.cloneRange();
    if (section.contains(start.startContainer)) prefix.setEnd(start.startContainer, start.startOffset);
    else prefix.collapse(true);
    if (section.contains(end.startContainer)) suffix.setStart(end.startContainer, end.startOffset);
    else suffix.collapse(false);
    return !prefix.toString().trim() && !suffix.toString().trim() &&
      !prefix.cloneContents().querySelector('math-field, input') &&
      !suffix.cloneContents().querySelector('math-field, input');
  });
  const intersected = sections.filter(section => range.intersectsNode(section));
  if (covered.length < 2 || covered.length !== intersected.length) return false;
  const previous = covered[0].previousElementSibling;
  covered.forEach(section => section.remove());
  paragraphAfter(previous);
  return true;
}

editor.addEventListener('keydown', event => {
  if (event.isComposing || !['Backspace', 'Delete'].includes(event.key)) return;
  if (deleteSelectedObjects(window.getSelection())) event.preventDefault();
}, true);

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

function paragraphAfter(section) {
  let next = section?.nextElementSibling;
  while (next?.hidden) next = next.nextElementSibling;
  let line = next?.querySelector(':scope > .document-line');
  if (!line) {
    const block = editorBlock('');
    const spacer = document.createElement('span');
    spacer.hidden = true;
    spacer.contentEditable = 'false';
    spacer.serialize = () => documentParts.eol.repeat(2);
    if (section) section.after(spacer, block);
    else editor.append(spacer, block);
    line = block.querySelector('.document-line');
  }
  editor.focus({ preventScroll: true });
  window.getSelection().collapse(line, 0);
  return line;
}

editor.addEventListener('dblclick', event => {
  if (event.target === editor) paragraphAfter(editor.lastElementChild);
});
editor.addEventListener('keydown', event => {
  if (event.target !== editor || event.shiftKey || event.ctrlKey || event.altKey || event.isComposing) return;
  const selection = window.getSelection();
  const line = selectedLine();
  if (!line || !selection.isCollapsed || !selection.rangeCount) return;
  const forward = ['ArrowRight', 'Delete'].includes(event.key);
  if (!forward && !['ArrowLeft', 'Backspace'].includes(event.key)) return;
  const { startContainer, startOffset } = selection.getRangeAt(0);
  const adjacent = startContainer.nodeType === Node.TEXT_NODE
    ? (forward && startOffset === startContainer.length ? startContainer.nextSibling
      : !forward && startOffset === 0 ? startContainer.previousSibling : null)
    : startContainer.childNodes[startOffset - (forward ? 0 : 1)];
  if (adjacent?.dataset?.inlineMath === undefined) return;
  event.preventDefault();
  if (event.key === 'Backspace' || event.key === 'Delete') {
    adjacent.remove();
    line.syncSource();
  } else {
    adjacent.firstChild.focus();
    adjacent.firstChild.executeCommand?.(forward ? 'moveToMathfieldStart' : 'moveToMathfieldEnd');
  }
});

editor.addEventListener('keydown', event => {
  if (event.key !== 'ArrowDown' || event.shiftKey || event.isComposing) return;
  const section = event.target.closest('section');
  const fields = section?.querySelectorAll('.paper-text');
  if (fields?.length && event.target === fields[fields.length - 1] && section.querySelector('ul, ol, table')) {
    event.preventDefault();
    paragraphAfter(section);
  }
});

const insert = document.querySelector('#insert');
let activeTable;
editor.addEventListener('focusin', event => {
  activeTable = event.target.closest('section:has(table)');
});
function sourceSeparator() {
  const spacer = document.createElement('span');
  spacer.hidden = true;
  spacer.contentEditable = 'false';
  spacer.serialize = () => documentParts.eol.repeat(2);
  return spacer;
}

for (const [key, template] of Object.entries(templates)) {
  const control = button(key, () => {
    const block = editorBlock(template);
    const current = selectedLine()?.parentElement;
    if (current) {
      current.after(sourceSeparator(), block);
      if (block.nextElementSibling && !block.nextElementSibling.hidden) block.after(sourceSeparator());
    } else editor.append(sourceSeparator(), block);
    const target = block.querySelector('math-field, input, .paper-text');
    if (target?.localName === 'math-field') requestAnimationFrame(() => target.focus());
    else target?.focus();
    block.scrollIntoView({ block: 'nearest' });
  });
  control.addEventListener('mousedown', event => event.preventDefault());
  insert.append(control);
}
for (const [key, method] of [['row', 'addTableRow'], ['column', 'addTableColumn']]) {
  const control = button(key, () => {
    if (activeTable?.isConnected) activeTable[method]();
  });
  control.addEventListener('mousedown', event => event.preventDefault());
  insert.append(control);
}
for (const key of ['bold', 'italic', 'underline', 'inline']) {
  const control = button(key, () => {
    const selection = window.getSelection();
    const anchor = selection.anchorNode;
    const line = (anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement)?.closest('[data-document-line]');
    if (key !== 'inline') {
      if (line && selection.rangeCount && line.contains(selection.focusNode)) document.execCommand(key);
      return;
    }
    if (!line || !selection.rangeCount || !line.contains(selection.focusNode)) paragraphAfter(editor.lastElementChild);
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(false);
    selectedLine(range.startContainer)?.insertInlineMath(range);
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
  color: ['foreColor', ['#000000','#ffffff','#595959','#a6a6a6','#c00000','#ff0000','#ed7d31','#ffc000','#ffff00','#92d050','#00b050','#008080','#00b0f0','#0070c0','#002060','#7030a0','#f4b183','#ffd966','#a9d18e','#9dc3e6','#b4a7d6'].map(value => [value, value.toUpperCase()])],
  family: ['fontName', [['Georgia', 'Serif'], ['Arial', 'Sans'], ['monospace', 'Mono']]],
  size: [null, [6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72].map(value => [String(value), value + ' pt'])],
};
for (const [key, [command, options]] of Object.entries(formatOptions)) {
  const menu = document.createElement('select');
  menu.dataset.format = key;
  menu.append(new Option({ color: '◉', family: 'Aa', size: '↕' }[key], ''));
  for (const [value, label] of options) {
    const option = new Option(label, value);
    if (key === 'color') option.style.backgroundColor = value;
    menu.append(option);
  }
  menu.addEventListener('change', () => {
    if (formatRange && editor.contains(formatRange.commonAncestorContainer) && menu.value) {
      const range = formatRange;
      editor.focus();
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('styleWithCSS', false, false);
      if (command) {
        document.execCommand(command, false, menu.value);
      } else {
        const span = document.createElement('span');
        span.dataset.points = menu.value;
        span.style.fontSize = menu.value + 'pt';
        span.append(range.extractContents());
        range.insertNode(span);
        range.selectNodeContents(span);
      }
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
const header = document.querySelector('header');
header.append(toolbar);
toolbar.append(tabs, filePanel, insert);
panels.set('files', filePanel);
panels.set('insert', insert);
for (const name of ['home', 'view']) {
  const panel = document.createElement('div');
  panel.className = 'tools';
  toolbar.append(panel);
  panels.set(name, panel);
}
panels.get('home').append(...insert.querySelectorAll('[data-copy="bold"], [data-copy="italic"], [data-copy="underline"]'), ...insert.querySelectorAll('[data-format]'));

const footer = document.createElement('footer');
footer.className = 'document-status';
const counts = document.createElement('output');
const zoom = document.createElement('input');
zoom.type = 'range';
zoom.min = '50';
zoom.max = '300';
zoom.step = '5';
zoom.value = '100';
const percent = document.createElement('output');
const zoomLabel = document.createElement('label');
const zoomText = document.createElement('span');
zoomText.dataset.copy = 'zoom';
zoomLabel.append(zoomText, zoom, percent);
footer.append(counts, zoomLabel);
document.body.append(footer);

function updateStatusBar() {
  const text = Array.from(editor.querySelectorAll('.document-line, .paper-text'))
    .map(line => line.textContent.trim()).join(' ').trim();
  const words = Array.from(new Intl.Segmenter(language.value, { granularity: 'word' }).segment(text))
    .filter(segment => segment.isWordLike).length;
  const characters = Array.from(text).length;
  counts.textContent = language.value === 'zh-CN'
    ? words + ' 词 · ' + characters + ' 字符'
    : words + ' words · ' + characters + ' characters';
}
new MutationObserver(updateStatusBar).observe(editor, { childList: true, characterData: true, subtree: true });
language.addEventListener('change', updateStatusBar);

const wordmark = header.querySelector('h1');
function updateWordmark() {
  const paper = editor.getBoundingClientRect();
  const brand = wordmark.getBoundingClientRect();
  const clearance = Math.min(paper.left, toolbar.getBoundingClientRect().left) - brand.right;
  wordmark.style.opacity = String(Math.min(1, Math.max(0, clearance / 28)));
}
const paperObserver = new ResizeObserver(updateWordmark);
paperObserver.observe(editor);
paperObserver.observe(header);
document.querySelector('main').addEventListener('scroll', updateWordmark, { passive: true });

function applyZoom() {
  editor.style.zoom = String(Number(zoom.value) / 100);
  percent.textContent = zoom.value + '%';
  updateWordmark();
}
function wheelZoom(event) {
  event.preventDefault();
  zoom.value = String(Number(zoom.value) + (event.deltaY < 0 ? 5 : -5));
  applyZoom();
}
zoom.addEventListener('input', applyZoom);
zoomLabel.addEventListener('wheel', wheelZoom, { passive: false });
document.querySelector('main').addEventListener('wheel', event => {
  if (event.ctrlKey) wheelZoom(event);
}, { passive: false });
panels.get('view').append(button('zoom', () => {
  zoom.value = '100';
  applyZoom();
}));
applyZoom();

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
    replacement.textContent = field.value;
    replacement.dataset.field = field.dataset.field;
    replacement.setAttribute('aria-label', field.getAttribute('aria-label'));
    replacement.addEventListener('input', () => {
      field.value = replacement.value;
      field.dispatchEvent(new Event('input'));
      replacement.setAttribute('aria-invalid', field.getAttribute('aria-invalid'));
      download.disabled = Boolean(editor.querySelector('[aria-invalid="true"]'));
    });
    field.replaceWith(replacement);
    configureMath(replacement);
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
  let preamble = body.includes('\\textcolor[HTML]') && !/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^}]*\bxcolor\b[^}]*\}/.test(start)
    ? start.replace(/^\\begin\{document\}/m, '\\usepackage{xcolor}' + eol + '\\begin{document}')
    : start;
  if (/\\fontsize\{\d+\}\{\d+\}\\selectfont/.test(body) &&
      !/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^}]*\b(?:fix-cm|fontspec|lmodern)\b[^}]*\}/.test(preamble)) {
    preamble = preamble.replace(/^([ \t]*\\documentclass)/m, '\\RequirePackage{fix-cm}' + eol + '$1');
  }
  const url = URL.createObjectURL(new Blob([preamble, body, separator, end], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
