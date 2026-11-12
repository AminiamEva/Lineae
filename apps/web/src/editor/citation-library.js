import {
  checkTexCitations,
  getEntryValue,
  parseBib,
  parseBibFile,
  validateBib,
} from '../../bib/index.mjs';
import { rememberAsset } from './project-assets.js';
import { t } from '../ui/i18n.mjs';
import { popIn } from '../ui/motion.mjs';

function entrySummary(entry, document, file, index, blob) {
  return {
    key: entry.key,
    type: entry.type,
    author: getEntryValue(entry, 'author', document) || '',
    title: getEntryValue(entry, 'title', document) || '',
    year: getEntryValue(entry, 'year', document) || getEntryValue(entry, 'date', document) || '',
    file,
    blob,
    sourceIndex: index,
    sourceText: document.source.text.slice(entry.start, entry.end),
  };
}

export function createCitationLibrary() {
  const sources = [];
  const choices = new Map();

  function allEntries() {
    return sources.flatMap(source => source.document.entries.map((entry, index) =>
      entrySummary(entry, source.document, source.file, index, source.blob)));
  }

  function conflicts() {
    const groups = new Map();
    for (const entry of allEntries()) {
      const group = groups.get(entry.key) ?? [];
      group.push(entry);
      groups.set(entry.key, group);
    }
    return new Map([...groups].filter(([, entries]) => entries.length > 1));
  }

  return {
    get sources() {
      return sources.slice();
    },
    get entries() {
      return allEntries().filter(entry => {
        const conflict = conflicts().get(entry.key);
        return !conflict || choices.get(entry.key) === `${entry.file}:${entry.sourceIndex}`;
      });
    },
    get conflicts() {
      return conflicts();
    },
    choose(key, file, sourceIndex) {
      const conflict = conflicts().get(key);
      if (!conflict?.some(entry => entry.file === file && entry.sourceIndex === sourceIndex)) return false;
      choices.set(key, `${file}:${sourceIndex}`);
      return true;
    },
    async addFile(file) {
      const document = await parseBibFile(file, { filename: file.name });
      const validation = validateBib(document, { profile: 'biblatex' });
      const existing = sources.findIndex(source => source.file === file || source.file === file.name);
      if (existing >= 0) sources.splice(existing, 1);
      sources.push({ file: file.name, blob: file, sourceText: document.source.text, document, validation });
      return sources.at(-1);
    },
      setSourcePath(from, to) {
        const source = sources.find(item => item.file === from);
        if (!source || typeof to !== 'string' || !to) return false;
        source.file = to;
        for (const [key, choice] of choices) {
          if (choice.startsWith(`${from}:`)) choices.set(key, `${to}:${choice.slice(from.length + 1)}`);
        }
        return true;
      },
      exportState({ paths } = {}) {
        const allowed = paths ? new Set(paths) : null;
        const selectedSources = sources.filter(source => !allowed || allowed.has(source.file));
        const selectedPaths = new Set(selectedSources.map(source => source.file));
        return {
          sources: selectedSources.map(source => ({
            path: source.file,
            name: source.blob?.name ?? source.file.split('/').at(-1),
            type: source.blob?.type ?? 'text/plain',
            sourceText: source.sourceText ?? source.document.source.text,
          })),
          choices: [...choices].filter(([, value]) => selectedPaths.has(value.split(':')[0])),
        };
      },
      restoreState(state) {
        sources.splice(0, sources.length);
        choices.clear();
        for (const [key, value] of state?.choices ?? []) choices.set(key, value);
        for (const item of state?.sources ?? []) {
          if (!item || typeof item.path !== 'string' || typeof item.sourceText !== 'string') continue;
          const document = parseBib(item.sourceText, { filename: item.path });
          const blob = new File([item.sourceText], item.name ?? item.path.split('/').at(-1), {
            type: item.type ?? 'text/plain',
          });
          sources.push({
            file: item.path,
            blob,
            sourceText: item.sourceText,
            document,
            validation: validateBib(document, { profile: 'biblatex' }),
          });
          rememberAsset(item.path, blob);
        }
        return this.sources;
      },
    removeFile(fileName) {
      const index = sources.findIndex(source => source.file === fileName);
      if (index < 0) return false;
      sources.splice(index, 1);
      return true;
    },
    search(query = '') {
      const needle = query.trim().toLocaleLowerCase();
      return this.entries.filter(entry => !needle || [entry.key, entry.author, entry.title, entry.year]
        .some(value => value.toLocaleLowerCase().includes(needle)));
    },
    diagnostics(texSource = '') {
      const diagnostics = sources.flatMap(source => [
        ...source.document.diagnostics,
        ...source.validation.diagnostics,
      ].map(diagnostic => ({ ...diagnostic, file: source.file })));
      const available = {
        entries: this.entries.map(entry => ({ key: entry.key })),
      };
      const citations = texSource ? checkTexCitations(texSource, available) : null;
      return { diagnostics, citations };
    },
  };
}

function button(label, type = 'button') {
  const element = document.createElement('button');
  element.type = type;
  element.textContent = label;
  return element;
}

/**
 * Open the persistent citation panel. The existing dialog API remains a
 * compatibility wrapper around this function.
 */
export function openCitationPanel({
  library = createCitationLibrary(),
  texSource = '',
  onInsert = () => {},
  onLocateMissing = () => {},
  onChange = () => {},
} = {}) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'editor-dialog-backdrop citation-panel-backdrop';
    const panel = document.createElement('section');
    panel.className = 'editor-dialog citation-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'citation-panel-title');
    const title = document.createElement('h2');
    title.id = 'citation-panel-title';
    title.textContent = t('日常引用','Daily citations');
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.bib,text/plain';
    picker.multiple = true;
    picker.setAttribute('aria-label', t('导入 BibTeX 文件','Import BibTeX files'));
    const importButton = button(t('导入 .bib 文件','Import .bib files'));
    importButton.addEventListener('click', () => picker.click());
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = t('按键、作者、标题或年份搜索','Search key, author, title, or year');
    search.setAttribute('aria-label', search.placeholder);
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    const list = document.createElement('div');
    list.className = 'citation-panel-list';
    const diagnostics = document.createElement('div');
    diagnostics.className = 'citation-panel-diagnostics';
    const actions = document.createElement('div');
    actions.className = 'editor-dialog-actions';
    const cancel = button(t('关闭','Close'));
    const insert = button(t('插入引用','Insert citation'));
    insert.disabled = true;
    actions.append(cancel, insert);
    panel.append(title, picker, importButton, search, status, list, diagnostics, actions);
    backdrop.append(panel);

    let selected = null;
    const close = value => {
      backdrop.remove();
      resolve(value);
    };
    const updateStatus = (message, isError = false) => {
      status.textContent = message;
      status.dataset.state = isError ? 'error' : 'normal';
    };
    const render = () => {
      list.replaceChildren();
      diagnostics.replaceChildren();
      const found = library.search(search.value);
      const currentConflicts = library.conflicts;
      const citationDiagnostics = library.diagnostics(texSource);
      if (!library.sources.length) {
        updateStatus(t('尚未导入文献文件。请导入一个或多个 .bib 文件。','No bibliography files imported. Import one or more .bib files.'));
      } else if (!found.length) {
        updateStatus(t('没有匹配的文献条目。','No matching bibliography entries.'));
      } else {
        updateStatus(t(`已加载 ${found.length} 条可用文献。`,`Loaded ${found.length} available entries.`));
      }
      for (const entry of found) {
        const row = document.createElement('div');
        row.className = 'citation-entry';
        const choose = button(`${entry.key} — ${entry.title || entry.type}`);
        choose.setAttribute('aria-label', `${entry.key}, ${entry.author || t('未知作者','unknown author')}, ${entry.year || t('无年份','no year')}`);
        choose.addEventListener('click', () => {
          selected = entry;
          insert.disabled = false;
          for (const item of list.querySelectorAll('[aria-selected]')) item.setAttribute('aria-selected', 'false');
          choose.setAttribute('aria-selected', 'true');
        });
        const meta = document.createElement('small');
        meta.textContent = [entry.author, entry.year, entry.file].filter(Boolean).join(' · ');
        row.append(choose, meta);
        list.append(row);
      }
      for (const [key, entries] of currentConflicts) {
        const conflict = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = t(`键冲突：${key}（请选择保留来源）`,`Key conflict: ${key} (choose a source)`);
        conflict.append(summary);
        for (const entry of entries) {
          const keep = button(t(`保留 ${entry.file}` ,`Keep ${entry.file}`));
          keep.addEventListener('click', () => {
            library.choose(key, entry.file, entry.sourceIndex);
            onChange();
            render();
          });
          const detail = document.createElement('pre');
          detail.textContent = entry.sourceText;
          conflict.append(keep, detail);
        }
        diagnostics.append(conflict);
      }
      const messages = citationDiagnostics.diagnostics;
      if (messages.length) {
        const heading = document.createElement('strong');
        heading.textContent = t('解析与验证诊断','Parse and validation diagnostics');
        diagnostics.append(heading);
        for (const diagnostic of messages.slice(0, 20)) {
          const line = document.createElement('div');
          line.textContent = `[${diagnostic.file}] ${diagnostic.severity}: ${diagnostic.message}`;
          diagnostics.append(line);
        }
      }
      if (citationDiagnostics.citations?.missing.length) {
        const heading = document.createElement('strong');
        heading.textContent = t('正文中缺失的 citation key','Missing citation keys in the document');
        diagnostics.append(heading);
        for (const missing of citationDiagnostics.citations.missing) {
          const locate = button(`${missing.key} · ${t('定位','Locate')}`);
          locate.addEventListener('click', () => onLocateMissing(missing));
          diagnostics.append(locate);
        }
      }
    };
    picker.addEventListener('change', async () => {
      let failed = false;
      for (const file of picker.files ?? []) {
        try {
          await library.addFile(file);
        } catch (error) {
          failed = true;
          updateStatus(`${t('无法解析','Could not parse')} ${file.name}: ${error.message}`, true);
        }
      }
      if (!failed) render();
      picker.value = '';
    });
    search.addEventListener('input', render);
    cancel.addEventListener('click', () => close(null));
    backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop) close(null); });
    insert.addEventListener('click', () => {
      if (!selected) return;
      onInsert(selected);
      close(selected);
    });
    document.body.append(backdrop);
    popIn(panel, { prefersReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false });
    render();
    search.focus();
  });
}
