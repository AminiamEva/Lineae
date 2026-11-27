// Step 11 TOC model: automatic outline entries filtered by tocdepth, plus
// explicit \addcontentsline entries in source order. TOC rendering and CSS are
// intentionally untouched.
import { headingOutline } from './heading-numbering.mjs';
import { counterProfile } from './counter-profile.mjs';

const DEPTH = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };

function readGroup(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') { index++; continue; }
    if (text[index] === '{') depth++;
    else if (text[index] === '}' && --depth === 0) return { value: text.slice(start + 1, index), end: index + 1 };
  }
  return null;
}

function stripTex(value) {
  return String(value ?? '')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function readCommandGroups(source, command) {
  const groups = [];
  let index = source.indexOf(command);
  while (index >= 0) {
    let cursor = index + command.length;
    const skip = () => { while (/\s/.test(source[cursor] ?? '')) cursor++; };
    const next = () => { skip(); const group = readGroup(source, cursor); if (!group) return null; cursor = group.end; return group.value; };
    const file = next();
    const level = next();
    const text = next();
    if (file !== null && level !== null && text !== null) groups.push({ file: file.trim(), level: level.trim(), text });
    index = source.indexOf(command, index + command.length);
  }
  return groups;
}

export function buildTocModel(doc, { outline } = {}) {
  const preamble = doc.attrs?.layoutPreamble ?? '';
  const profile = counterProfile(preamble);
  const items = outline ?? headingOutline(doc);
  const hierarchy = profile.chapters
    ? ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph']
    : ['part', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];
  const automatic = items.filter(item => item.toc).map(item => ({
    ...item,
    explicit: false,
    tocText: item.shortTitle ?? item.text,
  }));
  const explicit = [];
  const diagnostics = [];
  let matter = 'main', appendix = false, tocdepth = profile.tocdepth;

  doc.descendants((node, position) => {
    if (node.type.name === 'matterStart') { matter = node.attrs.matter || 'main'; return false; }
    if (node.type.name === 'appendixStart') { appendix = true; return false; }
    if (node.type.name === 'counterDirective') {
      const depth = /\\setcounter\s*\{tocdepth\}\s*\{(-?\d+)\}/.exec(String(node.attrs.latex ?? ''));
      if (depth) tocdepth = Number(depth[1]);
      return false;
    }
    if (node.type.name !== 'raw') return;
    const source = String(node.attrs?.source ?? '');
    if (!/\\addcontentsline|\\addtocontents/.test(source)) return;
    for (const entry of readCommandGroups(source, '\\addcontentsline')) {
      if (entry.file !== 'toc') continue;
      const depth = DEPTH[entry.level];
      if (depth === undefined) { diagnostics.push({ position, source: entry, reason: 'unknown toc level' }); continue; }
      const level = hierarchy.indexOf(entry.level) + 1;
      if (level <= 0) { diagnostics.push({ position, source: entry, reason: 'level not in document hierarchy' }); continue; }
      if (depth > tocdepth) continue;
      const numberMatch = /^\\numberline\s*\{([^}]*)\}([\s\S]*)$/.exec(entry.text.trim());
      explicit.push({
        explicit: true,
        command: entry.level,
        depth,
        level,
        number: numberMatch ? numberMatch[1].trim() : '',
        displayLabel: numberMatch ? numberMatch[1].trim() : '',
        tocText: stripTex(numberMatch ? numberMatch[2] : entry.text),
        text: stripTex(numberMatch ? numberMatch[2] : entry.text),
        position,
        matter,
        appendix,
        numbered: Boolean(numberMatch),
        numberParts: {},
        shortTitle: null,
      });
    }
    const addtocontents = /\\addtocontents\s*\{([^}]*)\}\s*\{/.exec(source);
    if (addtocontents) diagnostics.push({ position, source: { file: addtocontents[1].trim() }, reason: 'unsupported addtocontents' });
  });

  const entries = [...automatic, ...explicit].sort((a, b) => a.position - b.position);
  return { entries, diagnostics, chapters: profile.chapters, tocdepth: profile.tocdepth };
}

export function pageIndexAtSourcePosition(view, position) {
  if (!Number.isInteger(position)) return null;
  const dom = view?.nodeDOM?.(position) ?? view?.dom?.querySelector?.(`[data-heading-position="${position}"]`);
  const page = dom?.closest?.('[data-page-index]');
  if (page?.getAttribute?.('data-page-index') != null) return Number(page.getAttribute('data-page-index'));
  if (dom?.getAttribute?.('data-page-index') != null) return Number(dom.getAttribute('data-page-index'));
  return null;
}
