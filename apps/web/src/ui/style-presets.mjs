const CHAPTERED_CLASSES = new Set(['book', 'report', 'ctexbook', 'ctexrep']);

export function isChapteredDocument(documentClass) {
  return CHAPTERED_CLASSES.has(String(documentClass || '').toLowerCase());
}

export function documentClassFromSource(source) {
  const match = /\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/.exec(String(source || ''));
  const name = (match?.[1] || 'article').toLowerCase();
  return name === 'ctexbook' ? 'book' : name === 'ctexrep' ? 'report' : name;
}

// Style cards shown in Home > Styles.  The article profile keeps the classic
// section hierarchy; book/report get the chapter hierarchy plus \part.
export function homeStylePresets(documentClass = 'article') {
  const normal = {
    key: 'normal', level: 0, command: null,
    zh: '正文', en: 'Normal', previewZh: '正文', previewEn: 'Normal',
    hintZh: '应用样式：正文', hintEn: 'Apply style: Normal',
  };
  if (!isChapteredDocument(documentClass)) {
    return [
      normal,
      { key: 'section', level: 1, command: 'section', zh: '标题1', en: 'Heading 1', previewZh: '标题1', previewEn: 'Head 1', hintZh: '一级标题 \\section', hintEn: 'Heading 1 \\section' },
      { key: 'subsection', level: 2, command: 'subsection', zh: '标题2', en: 'Heading 2', previewZh: '标题2', previewEn: 'Head 2', hintZh: '二级标题 \\subsection', hintEn: 'Heading 2 \\subsection' },
      { key: 'subsubsection', level: 3, command: 'subsubsection', zh: '标题3', en: 'Heading 3', previewZh: '标题3', previewEn: 'Head 3', hintZh: '三级标题 \\subsubsection', hintEn: 'Heading 3 \\subsubsection' },
    ];
  }
  return [
    normal,
    { key: 'part', level: 1, command: 'part', zh: '部', en: 'Part', previewZh: '部', previewEn: 'Part', hintZh: '部 \\part', hintEn: 'Part \\part' },
    { key: 'chapter', level: 1, command: 'chapter', zh: '章', en: 'Chapter', previewZh: '章', previewEn: 'Ch.', hintZh: '章 \\chapter', hintEn: 'Chapter \\chapter' },
    { key: 'section', level: 2, command: 'section', zh: '节', en: 'Section', previewZh: '节', previewEn: 'Sect.', hintZh: '节 \\section', hintEn: 'Section \\section' },
    { key: 'subsection', level: 3, command: 'subsection', zh: '小节', en: 'Subsection', previewZh: '小节', previewEn: 'Subs.', hintZh: '小节 \\subsection', hintEn: 'Subsection \\subsection' },
  ];
}

// Which card should look active for the heading attributes at the caret.
// Part and Chapter share level 1, so the source command disambiguates them.
export function activeStyleKey(attrs, presets) {
  const level = Number(attrs?.level ?? 0);
  if (!level) return 'normal';
  const command = attrs?.command ?? null;
  if (command) {
    const exact = presets.find(preset => preset.level === level && preset.command === command);
    if (exact) return exact.key;
  }
  const sameLevel = presets.filter(preset => preset.level === level);
  if (sameLevel.length === 1) return sameLevel[0].key;
  return (sameLevel.find(preset => preset.key === 'chapter') ?? sameLevel[0])?.key ?? 'normal';
}
