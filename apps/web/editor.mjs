const file = document.querySelector('#file');
const editor = document.querySelector('#editor');
const paragraph = document.querySelector('#paragraph');
const input = document.querySelector('#text');
const status = document.querySelector('#status');
const download = document.querySelector('#download');

let source = '';
let spans = [];
let filename = '';
let selection = 0;
const edits = new Map();

// P0 recognizes only standalone, single-line plain text in the document body.
function findParagraphs(text) {
  const lines = Array.from(text.matchAll(/[^\r\n]+/g));
  const bodyStart = lines.findIndex(line => line[0].trim() === '\\begin{document}');
  const bodyEnd = lines.findIndex(line => line[0].trim() === '\\end{document}');
  if (bodyStart < 0 || bodyEnd <= bodyStart) return [];

  const body = lines.slice(bodyStart + 1, bodyEnd);
  // Complex environments, groups and commands need a structural parser.
  if (body.some(line => /^[ \t]*(?!%)[^%]*[\\{}]/.test(line[0]))) return [];

  return body.flatMap((line, index) => {
    const value = line[0].trim();
    if (!value || /[\\{}%$&#_^~]/.test(value)) return [];
    const before = index ? body[index - 1].index + body[index - 1][0].length : lines[bodyStart].index + lines[bodyStart][0].length;
    const after = line.index + line[0].length;
    const next = body[index + 1]?.index ?? lines[bodyEnd].index;
    const blankLine = /(?:\r\n|\n)[ \t]*(?:\r\n|\n)/;
    if (!blankLine.test(text.slice(before, line.index)) || !blankLine.test(text.slice(after, next))) return [];
    const start = line.index + line[0].indexOf(value);
    return [{ start, end: start + value.length, value }];
  });
}

function showParagraph() {
  input.value = edits.get(selection) ?? spans[selection].value;
  validate();
}

function validate() {
  const valid = input.value.trim() !== '' && !/[\r\n\\{}%$&#_^~]/.test(input.value);
  download.disabled = !valid;
  status.textContent = valid
    ? '可编辑独立纯文本段落。下载会保留其余源码。'
    : '请输入单行正文，避免 LaTeX 特殊字符。';
  return valid;
}

file.addEventListener('change', async () => {
  const selectedFile = file.files[0];
  editor.disabled = true;
  if (!selectedFile) return;
  try {
    const bytes = await selectedFile.arrayBuffer();
    if (selectedFile !== file.files[0]) return;
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    filename = selectedFile.name;
    spans = findParagraphs(source);
    edits.clear();
    paragraph.replaceChildren(...spans.map((span, index) => new Option(span.value, index)));
    if (!spans.length) {
      status.textContent = '未找到支持的段落。请使用正文仅含纯文本和注释、且段落前后留空行的文档。';
      return;
    }
    selection = 0;
    paragraph.disabled = false;
    editor.disabled = false;
    showParagraph();
  } catch {
    if (selectedFile === file.files[0]) status.textContent = '无法读取文件。请检查文件是否为 UTF-8 编码。';
  }
});

input.addEventListener('input', () => {
  paragraph.disabled = !validate();
  if (!paragraph.disabled) edits.set(selection, input.value);
});

paragraph.addEventListener('change', () => {
  selection = Number(paragraph.value);
  showParagraph();
});

download.addEventListener('click', () => {
  if (!validate()) return;
  let result = source;
  for (let index = spans.length - 1; index >= 0; index--) {
    if (!edits.has(index)) continue;
    const { start, end } = spans[index];
    result = result.slice(0, start) + edits.get(index) + result.slice(end);
  }
  const url = URL.createObjectURL(new Blob([result], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});


