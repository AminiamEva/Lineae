import { counterDeclarationAt, applyCounterDeclaration } from './counter-declarations.mjs';
import { counterProfile, formatCounter } from './counter-profile.mjs';
import { resolveChineseProfile } from './chinese-profile.mjs';
import { chineseNumber } from './chinese-numbering.mjs';

const DEPTH = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };
// Standard \part does not reset the chapter counter (book.cls/report.cls), so
// part deliberately has no child resets here.
const RESETS = {
  part: [],
  chapter: ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'],
  section: ['subsection', 'subsubsection', 'paragraph', 'subparagraph'],
  subsection: ['subsubsection', 'paragraph', 'subparagraph'],
  subsubsection: ['paragraph', 'subparagraph'],
  paragraph: ['subparagraph'],
  subparagraph: [],
};
const ALL_COUNTERS = ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];

function isCtexClass(name) {
  return /^ctex(?:art|rep|book|beamer)$/i.test(String(name || ''));
}

export function headingOutline(doc) {
  const preamble = doc.attrs?.layoutPreamble ?? '';
  const profile = counterProfile(preamble);
  const chinese = resolveChineseProfile({ preamble });
  const ctexClass = isCtexClass(chinese.rawClassName);
  const hierarchy = profile.chapters
    ? ['part', 'chapter', 'section', 'subsection', 'subsubsection']
    : ['part', 'section', 'subsection', 'subsubsection'];
  const counters = Object.fromEntries(ALL_COUNTERS.map(name => [name, 0]));
  let appendix = false, matter = 'main';
  const items = [];

  const displayLabel = (command, number) => {
    if (!number) return '';
    if (command === 'part') {
      return ctexClass
        ? chinese.part.first + chineseNumber(counters.part) + chinese.part.last
        : (profile.names.part || 'Part') + ' ' + number;
    }
    if (command === 'chapter') {
      if (appendix) return ctexClass
        ? chinese.names.appendixname + number
        : (profile.names.appendix || 'Appendix') + ' ' + number;
      return ctexClass
        ? chinese.chapter.first + chineseNumber(counters.chapter) + chinese.chapter.last
        : (profile.names.chapter || 'Chapter') + ' ' + number;
    }
    return number;
  };

  doc.descendants((node, position) => {
    if (node.type.name === 'matterStart') { matter = node.attrs.matter || 'main'; return false; }
    if (node.type.name === 'counterDirective') {
      const latex = String(node.attrs.latex || '');
      const toc = /^\\setcounter\s*\{tocdepth\}\s*\{(-?\d+)\}/.exec(latex.trim());
      if (toc) profile.tocdepth = Number(toc[1]);
      const declaration = counterDeclarationAt(latex, 0);
      if (declaration) applyCounterDeclaration(profile, counters, declaration);
      return false;
    }
    if (node.type.name === 'appendixStart') {
      appendix = true;
      delete profile.formats[profile.chapters ? 'chapter' : 'section'];
      const primary = profile.chapters ? 'chapter' : 'section';
      counters[primary] = 0;
      for (const name of ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph']) counters[name] = 0;
      return false;
    }
    if (node.type.name !== 'heading') return;
    const command = node.attrs.command ?? ['section', 'subsection', 'subsubsection'][node.attrs.level - 1];
    const index = hierarchy.indexOf(command);
    if (index < 0) return;
    const depth = DEPTH[command] ?? index;
    const numbered = node.attrs.numbered !== false;
    const inMainMatter = command !== 'chapter' || matter === 'main';
    let number = '';
    if (numbered && inMainMatter && depth <= profile.secnumdepth) {
      counters[command] = (counters[command] ?? 0) + 1;
      for (const name of RESETS[command] ?? []) counters[name] = 0;
      number = formatCounter(command, counters, profile, appendix);
    }
    const label = displayLabel(command, number);
    items.push({
      level: index + 1,
      depth,
      command,
      number,
      displayLabel: label,
      numberParts: { ...counters },
      text: node.textContent,
      shortTitle: node.attrs.shortTitle ?? null,
      label: node.attrs.label || null,
      position,
      numbered,
      appendix,
      matter,
      toc: numbered && inMainMatter && depth <= profile.tocdepth,
      afterIndent: node.attrs.afterIndent ?? null,
      afterName: ctexClass && ['part', 'chapter'].includes(command)
        ? (chinese.ctexset[command + '/aftername'] ?? '\\quad') : null,
      chapterLabel: command === 'chapter' && label ? label : null,
      counters: Object.fromEntries(ALL_COUNTERS.map(name => [name, counters[name] ?? 0])),
    });
  });
  return items;
}
