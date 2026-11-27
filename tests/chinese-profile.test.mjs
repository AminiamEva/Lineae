import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChineseProfile } from '../apps/web/latex/chinese-profile.mjs';

const CTEXART = '\\documentclass[a4paper,UTF8,scheme=chinese]{ctexart}\n\\begin{document}\n中文\n\\end{document}\n';
const ARTICLE_CTEX = '\\documentclass{article}\n\\usepackage[UTF8]{ctex}\n\\begin{document}\n中文\n\\end{document}\n';

test('ctex classes provide the Chinese default profile', () => {
  const profile = resolveChineseProfile({ preamble: CTEXART });
  assert.equal(profile.enabled, true);
  assert.equal(profile.scheme, 'chinese');
  assert.equal(profile.className, 'ctexart');
  assert.equal(profile.baseClassName, 'article');
  assert.equal(profile.names.figurename, '图');
  assert.equal(profile.names.tablename, '表');
  assert.equal(profile.names.contentsname, '目录');
  assert.equal(profile.names.listfigurename, '插图');
  assert.equal(profile.names.listtablename, '表格');
  assert.equal(profile.names.abstractname, '摘要');
  assert.equal(profile.names.indexname, '索引');
  assert.equal(profile.names.bibname, '参考文献');
  assert.equal(profile.names.refname, '参考文献');
  assert.equal(profile.names.appendixname, '附录');
  assert.equal(profile.names.proofname, '证明');
  assert.deepEqual(profile.part, { first: '第', last: '部分' });
  assert.deepEqual(profile.chapter, { first: '第', last: '章' });
  assert.equal(profile.heading, true);
  assert.equal(profile.zihao, '5');
  assert.equal(profile.linespread, 1.3);
  assert.equal(profile.autoindent, true);
  assert.equal(profile.punct, 'quanjiao');
  assert.equal(profile.space, 'auto');
  assert.equal(profile.fontset, 'fandol');
});

test('standard classes plus ctex use the same profile', () => {
  const profile = resolveChineseProfile({ preamble: ARTICLE_CTEX });
  assert.equal(profile.enabled, true);
  assert.equal(profile.scheme, 'chinese');
  assert.equal(profile.names.figurename, '图');
  assert.equal(profile.names.tablename, '表');
});

test('plain scheme keeps English names unless explicitly overridden', () => {
  const plain = resolveChineseProfile({ preamble: '\\documentclass[UTF8,scheme=plain]{ctexart}\n' });
  assert.equal(plain.enabled, true);
  assert.equal(plain.scheme, 'plain');
  assert.equal(plain.names.figurename, 'Figure');
  assert.equal(plain.names.tablename, 'Table');
  assert.equal(plain.names.contentsname, 'Contents');
  assert.deepEqual(plain.part, { first: 'Part', last: '' });
  assert.deepEqual(plain.chapter, { first: 'Chapter', last: '' });

  const ctexset = resolveChineseProfile({ preamble: '\\usepackage[UTF8,scheme=chinese]{ctex}\n\\ctexset{scheme=plain}\n' });
  assert.equal(ctexset.scheme, 'plain');
  assert.equal(ctexset.names.figurename, 'Figure');

  const overridden = resolveChineseProfile({ preamble: '\\documentclass[UTF8,scheme=plain]{ctexart}\n\\renewcommand{\\figurename}{Figure X}\n' });
  assert.equal(overridden.names.figurename, 'Figure X');
});

test('non-ctex documents use the standard English profile', () => {
  const profile = resolveChineseProfile({ preamble: '\\documentclass{article}\n' });
  assert.equal(profile.enabled, false);
  assert.equal(profile.scheme, 'plain');
  assert.equal(profile.names.figurename, 'Figure');
  assert.equal(profile.names.appendixname, 'Appendix');
  assert.deepEqual(profile.chapter, { first: 'Chapter', last: '' });

  const xeCJK = resolveChineseProfile({ preamble: '\\documentclass{article}\n\\usepackage{xeCJK}\n' });
  assert.equal(xeCJK.enabled, false);
  assert.equal(xeCJK.hasOtherCjkProvider, true);
});

test('\\ctexset names, tuples and settings override ctex defaults in order', () => {
  const source = [
    '\\documentclass[a4paper,UTF8,scheme=chinese]{ctexart}',
    '\\ctexset{figurename=图A, chapter/name={第,篇}, heading=false, zihao=-4, autoindent=false, linespread=1.5, punct=banjiao, space=true, fontset=windows}',
    '\\renewcommand{\\figurename}{图B}',
    '',
  ].join('\n');
  const profile = resolveChineseProfile({ preamble: source });
  assert.equal(profile.names.figurename, '图B', 'explicit renew wins over ctexset');
  assert.deepEqual(profile.chapter, { first: '第', last: '篇' });
  assert.equal(profile.heading, false);
  assert.equal(profile.zihao, '-4');
  assert.equal(profile.autoindent, false);
  assert.equal(profile.linespread, 1.5);
  assert.equal(profile.punct, 'banjiao');
  assert.equal(profile.space, 'true');
  assert.equal(profile.fontset, 'windows');
});

test('heading styles parse ctex defaults and declarative overrides', () => {
  const ctex = resolveChineseProfile({ preamble: '\\documentclass[UTF8,scheme=chinese]{ctexart}' });
  assert.equal(ctex.headingStyles.section.align, 'center');
  assert.equal(ctex.headingStyles.section.size, '1.44em');
  assert.equal(ctex.headingStyles.section.weight, 700);
  assert.equal(ctex.headingStyles.section.afterName, '1em');
  assert.equal(ctex.headingStyles.section.afterIndent, true);
  assert.equal(ctex.headingStyles.subsection.align, 'left');
  assert.equal(ctex.headingStyles.subsection.size, '1.2em');
  assert.equal(ctex.headingStyles.part.size, '1.44em');
  assert.equal(ctex.headingStyles.chapter, undefined, 'article has no chapter style');
  const book = resolveChineseProfile({ preamble: '\\documentclass[UTF8,scheme=chinese]{ctexbook}' });
  assert.equal(book.headingStyles.chapter.align, 'center');
  assert.equal(book.headingStyles.chapter.size, '2.07em');
  assert.equal(book.headingStyles.chapter.afterIndent, true);
  assert.equal(book.headingStyles.part.size, '2.07em');
  assert.equal(book.headingStyles.section.align, 'left');
  const standardBook = resolveChineseProfile({ preamble: '\\documentclass{book}\\usepackage[UTF8]{ctex}' });
  assert.equal(standardBook.headingStyles.chapter, undefined, 'standard book + ctex keeps the standard chapter block');
  assert.equal(resolveChineseProfile({ preamble: '\\documentclass[UTF8,scheme=plain]{ctexart}' }).headingStyles, null);

  const custom = resolveChineseProfile({ preamble: [
    '\\documentclass[UTF8,scheme=chinese]{ctexart}',
    '\\ctexset{section/format=\\raggedright\\large\\bfseries, section/aftername=\\hspace{.3em}, section/beforeskip=2ex plus 1ex, section/afterskip=-1em, section/afterindent=false}',
  ].join('\n') });
  assert.equal(custom.headingStyles.section.align, 'left');
  assert.equal(custom.headingStyles.section.size, '1.2em');
  assert.equal(custom.headingStyles.section.afterName, '.3em');
  assert.equal(custom.headingStyles.section.before, '2ex');
  assert.equal(custom.headingStyles.section.after, '0');
  assert.equal(custom.headingStyles.section.runin, true);
  assert.equal(custom.headingStyles.section.afterIndent, false);
});

test('comments do not declare ctex or names', () => {
  const profile = resolveChineseProfile({ preamble: '% \\documentclass{ctexart}\n% \\usepackage[UTF8]{ctex}\n% \\ctexset{figurename=图A}\n\\documentclass{article}\n' });
  assert.equal(profile.enabled, false);
  assert.equal(profile.names.figurename, 'Figure');
});
