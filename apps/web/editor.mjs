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
    element.textContent = copy[language.value][element.dataset.copy];
  }
}

language.value = preferredLanguage;

// The configuration uses YAML's JSON-compatible syntax.
async function applyConfiguration() {
  const response = await fetch(new URL('./config.yaml', import.meta.url));
  if (!response.ok) throw new Error('Configuration request failed');
  const configuration = await response.json();
  const settings = configuration.interface;
  if (configuration.version !== 1 || !settings) return;

  if (!languageTouched && Object.hasOwn(copy, settings.language)) {
    language.value = settings.language;
    translate();
  }

  const toolbar = document.querySelector('.tools');
  const tools = new Map(Array.from(toolbar.children, tool => [tool.dataset.tool, tool]));
  if (Array.isArray(settings.toolbar) && settings.toolbar.length === tools.size &&
      new Set(settings.toolbar).size === tools.size && settings.toolbar.every(tool => tools.has(tool))) {
    toolbar.append(...settings.toolbar.map(tool => tools.get(tool)));
  }
}

let languageTouched = false;
language.addEventListener('change', () => { languageTouched = true; });
applyConfiguration().catch(error => console.warn('Lineae configuration / 配置加载失败', error));
language.addEventListener('change', translate);
translate();

const labels = {
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
  paragraph: 'New paragraph',
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

function editorBlock(raw) {
  const node = document.createElement('section');
  let output = raw;
  node.serialize = () => output === raw ? raw : raw.match(/^\s*/)[0] + output + raw.match(/\s*$/)[0];
  const body = raw.trim();
  const heading = body.match(/^\\section\{([^{}]*)\}$/);
  const formula = body.match(/^\\\[([\s\S]*?)\\\]$/);
  const list = body.match(/^\\begin\{(itemize|enumerate)\}\r?\n([\s\S]*?)\r?\n\\end\{\1\}$/);
  const table = body.match(/^\\begin\{tabular\}\{([lcr]+)\}\r?\n([\s\S]*?)\r?\n\\end\{tabular\}$/);
  const lineBreak = raw.includes('\r\n') ? '\r\n' : documentParts.eol;

  if (heading && plain.test(heading[1])) {
    node.className = 'heading';
    node.append(field(heading[1], value => { output = '\\section{' + value + '}'; }, 'heading'));
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
      li.append(field(items[index], value => { items[index] = value; save(); }, 'item'));
      view.append(li);
    };
    items.forEach((_, index) => add(index));
    node.append(view, button('item', () => { items.push(''); add(items.length - 1); save(); }));
  } else if (table && tableRows(table).every(row => row.length === table[1].length && row.every(value => plain.test(value.trim())))) {
    const rows = tableRows(table);
    let columns = table[1];
    const view = document.createElement('table');
    const save = () => {
      output = ['\\begin{tabular}{' + columns + '}', ...rows.map(row => row.join(' & ') + ' \\\\'), '\\end{tabular}'].join(lineBreak);
    };
    const addCell = (tr, row, index) => {
      tr.insertCell().append(field(row[index].trim(), value => { row[index] = value; save(); }, 'table'));
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
    const parts = body.split(/(\\textbf\{[^{}]*\}|\$[^$\r\n]+\$)/);
    if (parts.every((value, index) => index % 2 ? value.startsWith('$') || plain.test(value.slice(8, -1)) : plain.test(value))) {
      const save = () => { output = parts.join(''); };
      parts.forEach((value, index) => {
        if (index % 2 && value.startsWith('$')) {
          node.append(field(value.slice(1, -1), next => { parts[index] = '$' + next + '$'; save(); }, 'inline', true));
        } else if (index % 2) {
          const control = field(value.slice(8, -1), next => { parts[index] = '\\textbf{' + next + '}'; save(); }, 'bold');
          control.className = 'bold';
          node.append(control);
        } else if (value || parts.length === 1) {
          node.append(field(value, next => { parts[index] = next; save(); }));
        }
      });
      for (const key of ['bold', 'inline']) {
        node.append(button(key, () => {
          if (node.querySelector('[aria-invalid="true"]')) return;
          output += key === 'bold' ? ' \\textbf{Text}' : ' $x^2$';
          node.replaceWith(editorBlock(output));
        }));
      }
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
    spacer.serialize = () => block;
    return spacer;
  }));
  download.disabled = false;
  return true;
}

const insert = document.querySelector('#insert');
for (const [key, template] of Object.entries(templates)) {
  insert.append(button(key, () => {
    const spacer = document.createElement('span');
    spacer.hidden = true;
    spacer.serialize = () => documentParts.eol.repeat(2);
    editor.append(spacer, editorBlock(template));
  }));
}
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
  const url = URL.createObjectURL(new Blob([start, body, separator, end], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
