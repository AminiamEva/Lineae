import { join } from 'node:path';

export const ACCEPTANCE_CASES = [
  {
    name: 'bibtex-crlf-中文',
    backend: 'bibtex',
    directory: join('tests', 'bib', 'acceptance', 'bibtex-crlf-中文'),
    newline: 'crlf',
    expectedText: ['中文路径与 Windows 换行测试', '张三'],
  },
  {
    name: 'biblatex-中文',
    backend: 'biber',
    directory: join('tests', 'bib', 'acceptance', 'biblatex-中文'),
    expectedText: ['中文路径与 Biber 测试', '李四'],
  },
  {
    name: 'duplicate-key',
    backend: 'bibtex',
    directory: join('tests', 'bib', 'acceptance', 'duplicate-key'),
    expectedFailure: /multiply defined|duplicate|already defined/i,
  },
  {
    name: 'missing-resource',
    backend: 'bibtex',
    directory: join('tests', 'bib', 'acceptance', 'missing-resource'),
    expectedFailure: /missing\.bib|I couldn.t open database file|No file/i,
  },
];
