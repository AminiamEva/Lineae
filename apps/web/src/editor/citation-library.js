import {
  checkTexCitations,
  createBibEditor,
  getEntryValue,
  parseBib,
  parseBibFile,
  scanTexCitations,
  validateBib,
} from '../../bib/index.mjs';
import { rememberAsset } from './project-assets.js';
import { t } from '../ui/i18n.mjs';
import { popIn } from '../ui/motion.mjs';

function entrySummary(entry, document, file, index, blob) {
  const occurrence = document.entries
    .slice(0, index)
    .filter(candidate => candidate.key === entry.key).length;
  return {
    key: entry.key,
    type: entry.type,
    typeRaw: entry.typeRaw,
    author: getEntryValue(entry, 'author', document) || '',
    title: getEntryValue(entry, 'title', document) || '',
    year: getEntryValue(entry, 'year', document) || getEntryValue(entry, 'date', document) || '',
    file,
    blob,
    sourceIndex: index,
    occurrence,
    entry,
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

  function syncSource(source) {
    const text = source.editor.toBibTeX();
    source.document = source.editor.getDocument();
    source.validation = validateBib(source.document, { profile: 'biblatex' });
    source.sourceText = text;
    source.blob = new File([text], source.blob?.name ?? source.file.split('/').at(-1), {
      type: source.blob?.type ?? 'text/plain',
    });
    rememberAsset(source.file, source.blob);
    return source;
  }

  function sourceFor(file) {
    return sources.find(source => source.file === file);
  }

  function entryInputs(document) {
    return document.entries.map(entry => ({
      key: entry.key,
      type: entry.typeRaw || entry.type,
      fields: entry.fields
        .filter(field => !field.unparsed && field.value)
        .reduce((fields, field) => {
          fields[field.nameRaw || field.name] = {
            text: field.value.parts.map(part => part.value).join(' # '),
            delimiter: field.value.parts[0]?.kind === 'quoted'
              ? 'quoted'
              : field.value.parts[0]?.kind === 'number' ? 'number' : 'braced',
          };
          return fields;
        }, {}),
    }));
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
      sources.push({
        file: file.name,
        blob: file,
        sourceText: document.source.text,
        document,
        editor: createBibEditor(document, { profile: 'biblatex' }),
        validation,
      });
      return sources.at(-1);
    },
    getSource(file) {
      return sourceFor(file) ?? null;
    },
    addEntry(file, input) {
      const source = sourceFor(file);
      if (!source) return { ok: false, error: { code: 'BIB401', message: `Bibliography source "${file}" does not exist.` } };
      const result = source.editor.addEntry(input);
      if (result.ok) syncSource(source);
      return result;
    },
    updateEntry(file, key, patch, options = {}) {
      const source = sourceFor(file);
      if (!source) return { ok: false, error: { code: 'BIB401', message: `Bibliography source "${file}" does not exist.` } };
      const result = source.editor.updateEntry(key, patch, options);
      if (result.ok && result.changedFields?.length) syncSource(source);
      return result;
    },
    importEntries(file, inputs, options = {}) {
      const source = sourceFor(file);
      if (!source) return { ok: false, error: { code: 'BIB401', message: `Bibliography source "${file}" does not exist.` } };
      const result = source.editor.importEntries(inputs, options);
      if (result.ok && result.count) syncSource(source);
      return result;
    },
    updateEntries(file, patches) {
      const source = sourceFor(file);
      if (!source) return { ok: false, error: { code: 'BIB401', message: `Bibliography source "${file}" does not exist.` } };
      const result = source.editor.updateEntries(patches);
      if (result.ok && result.count) syncSource(source);
      return result;
    },
    previewRename(file, oldKey, newKey, options = {}) {
      const source = sourceFor(file);
      if (!source) return { ok: false, error: { code: 'BIB401', message: `Bibliography source "${file}" does not exist.` } };
      return createBibEditor(source.document).renameEntry(oldKey, newKey, options);
    },
    renameEntry(file, oldKey, newKey, options = {}) {
      const source = sourceFor(file);
      if (!source) return { ok: false, error: { code: 'BIB401', message: `Bibliography source "${file}" does not exist.` } };
      const result = source.editor.renameEntry(oldKey, newKey, options);
      if (result.ok && result.changed) syncSource(source);
      return result;
    },
    previewRemove(file, key, options = {}) {
      const source = sourceFor(file);
      if (!source) return { ok: false, error: { code: 'BIB401', message: `Bibliography source "${file}" does not exist.` } };
      return createBibEditor(source.document).removeEntry(key, options);
    },
    removeEntry(file, key, options = {}) {
      const source = sourceFor(file);
      if (!source) return { ok: false, error: { code: 'BIB401', message: `Bibliography source "${file}" does not exist.` } };
      const result = source.editor.removeEntry(key, options);
      if (result.ok) syncSource(source);
      return result;
    },
    entriesForImport(file) {
      const source = sourceFor(file);
      return source ? entryInputs(source.document) : [];
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
        // Keep every imported source in metadata so duplicate-key choices and
        // unresolved alternatives survive a close/reopen cycle. `paths` limits
        // archive dependencies in the caller; it must not discard editor state.
        const selectedSources = sources;
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
            editor: createBibEditor(document, { profile: 'biblatex' }),
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
  onRename = () => {},
  onInsertCitation = () => {},
  onInsertBibliography = () => {},
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
    const sourceSelect = document.createElement('select');
    sourceSelect.setAttribute('aria-label', t('编辑目标文献文件','Bibliography file to edit'));
    const addButton = button(t('新增条目','Add entry'));
    addButton.addEventListener('click', () => openEditor());
    const batchPicker = document.createElement('input');
    batchPicker.type = 'file';
    batchPicker.accept = '.bib,text/plain';
    batchPicker.hidden = true;
    batchPicker.setAttribute('aria-label', t('批量导入 BibTeX 条目','Import BibTeX entries'));
    const batchButton = button(t('批量导入条目','Import entries'));
    batchButton.addEventListener('click', () => batchPicker.click());
    const listButton = button(t('插入参考文献列表','Insert bibliography list'));
    listButton.addEventListener('click', () => {
      const scan = scanTexCitations(texSource);
      if (scan.mode === 'unknown') {
        updateStatus(t('未识别文献模式；请先声明文献资源。','Bibliography mode is unknown; declare a bibliography resource first.'), true);
        return;
      }
      const command = scan.mode === 'bibtex'
        ? `\\bibliography{${scan.bibliography.map(item => item.path).join(',')}}`
        : '\\printbibliography';
      onInsertBibliography({
        mode: scan.mode,
        command,
        bibliography: scan.bibliography,
        resources: scan.resources,
        bibliographyStyle: scan.bibliographyStyle,
      });
    });
    const citationCommand = document.createElement('select');
    citationCommand.setAttribute('aria-label', t('引用命令','Citation command'));
    for (const command of ['cite', 'citep', 'citet', 'parencite', 'textcite', 'autocite']) {
      citationCommand.append(new Option(`\\${command}`, command));
    }
    const citationCommandDialog = document.createElement('form');
    citationCommandDialog.className = 'citation-dialog';
    const legacyKeySelect = document.createElement('select');
    legacyKeySelect.setAttribute('aria-label', t('引用键','Citation key'));
    const legacySubmit = button(t('插入引用','Insert citation'));
    legacySubmit.type = 'submit';
    citationCommandDialog.append(legacyKeySelect, legacySubmit);
    const preNote = document.createElement('input');
    preNote.placeholder = t('前注（可选）','Pre-note (optional)');
    preNote.setAttribute('aria-label', preNote.placeholder);
    const postNote = document.createElement('input');
    postNote.placeholder = t('后注（可选）','Post-note (optional)');
    postNote.setAttribute('aria-label', postNote.placeholder);
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
    citationCommandDialog.addEventListener('submit', event => {
      event.preventDefault();
      const entry = library.entries.find(item => item.key === legacyKeySelect.value);
      if (!entry) return;
      selected = entry;
      selectedEntries.clear();
      selectedEntries.set(`${entry.file}:${entry.sourceIndex}`, entry);
      insert.disabled = false;
      insert.click();
    });
    panel.append(title, picker, importButton, sourceSelect, addButton, batchButton, listButton, batchPicker, citationCommandDialog, citationCommand, preNote, postNote, search, status, list, diagnostics, actions);
    backdrop.append(panel);

    let selected = null;
    const selectedEntries = new Map();
    const close = value => {
      backdrop.remove();
      resolve(value);
    };
    const updateStatus = (message, isError = false) => {
      status.textContent = message;
      status.dataset.state = isError ? 'error' : 'normal';
    };
    const selectedSource = () => library.getSource(sourceSelect.value);
    const fieldText = field => field?.value?.parts?.map(part => part.value).join(' # ') ?? '';
    const openEditor = (entry = null, summary = null) => {
      const source = selectedSource();
      if (!source) {
        updateStatus(t('请先导入文献文件。','Import a bibliography file first.'), true);
        return;
      }
      const form = document.createElement('form');
      form.className = 'editor-dialog citation-entry-editor';
      const heading = document.createElement('h3');
      heading.textContent = entry ? t('编辑文献条目','Edit bibliography entry') : t('新增文献条目','Add bibliography entry');
      const key = document.createElement('input');
      key.value = entry?.key ?? '';
      key.required = true;
      key.setAttribute('aria-label', t('引用键','Citation key'));
      const type = document.createElement('input');
      type.value = entry?.typeRaw ?? entry?.type ?? 'misc';
      type.setAttribute('aria-label', t('条目类型','Entry type'));
      const fields = document.createElement('div');
      fields.className = 'citation-entry-fields';
      const original = new Map();
      for (const field of entry?.fields ?? []) {
        if (field.unparsed) {
          const raw = document.createElement('pre');
          raw.textContent = field.raw;
          raw.setAttribute('aria-label', t(`未解析字段 ${field.nameRaw || field.name}`, `Unparsed field ${field.nameRaw || field.name}`));
          fields.append(raw);
          continue;
        }
        const row = document.createElement('label');
        row.textContent = field.nameRaw || field.name;
        const input = document.createElement('textarea');
        input.value = fieldText(field);
        input.dataset.field = field.name;
        input.dataset.original = input.value;
        original.set(field.name, input.value);
        row.append(input);
        fields.append(row);
      }
      const fieldName = document.createElement('input');
      fieldName.placeholder = t('新增字段名','New field name');
      fieldName.setAttribute('aria-label', fieldName.placeholder);
      const fieldValue = document.createElement('textarea');
      fieldValue.placeholder = t('新增字段值（保留 LaTeX 转义）','New field value (preserve LaTeX escapes)');
      fieldValue.setAttribute('aria-label', fieldValue.placeholder);
      const save = button(t('保存','Save'));
      save.type = 'submit';
      const cancel = button(t('取消','Cancel'));
      const editorActions = document.createElement('div');
      editorActions.className = 'editor-dialog-actions';
      editorActions.append(cancel, save);
      form.append(heading, key, type, fields, fieldName, fieldValue, editorActions);
      const backdrop = document.createElement('div');
      backdrop.className = 'editor-dialog-backdrop';
      backdrop.append(form);
      const close = () => backdrop.remove();
      cancel.addEventListener('click', close);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const patchFields = {};
        for (const input of fields.querySelectorAll('textarea[data-field]')) {
          if (input.value !== input.dataset.original) patchFields[input.dataset.field] = input.value;
        }
        if (fieldName.value.trim()) patchFields[fieldName.value.trim()] = fieldValue.value;
        let result;
        let renameResult = null;
        if (!entry) {
          result = library.addEntry(source.file, { key: key.value, type: type.value, fields: patchFields });
        } else if (key.value.trim() !== entry.key) {
          const preview = library.previewRename(source.file, entry.key, key.value, {
            texSource,
            occurrence: summary?.occurrence,
          });
          if (!preview.ok) {
            updateStatus(`[${preview.error.code}] ${preview.error.message}`, true);
            return;
          }
          const references = [
            ...(preview.externalReferences ?? []).map(item => `${item.command} @ ${item.start}`),
            ...(preview.updatedReferences ?? []).map(item => `${item.entryKey}.${item.field}`),
          ];
          const sync = window.confirm(t(
            `将修改 ${references.length} 处引用。是否同时同步正文引用？\n${references.join('\n')}`,
            `This changes ${references.length} references. Also update citations in the document?\n${references.join('\n')}`,
          ));
          result = library.renameEntry(source.file, entry.key, key.value, {
            texSource,
            occurrence: summary?.occurrence,
          });
          if (result.ok && sync) renameResult = { ...result, oldKey: entry.key, newKey: key.value };
        } else {
          result = library.updateEntry(source.file, entry.key, { type: type.value, fields: patchFields });
        }
        if (!result?.ok) {
          const error = result?.error;
          updateStatus(error ? `[${error.code}] ${error.message}` : t('保存失败','Save failed'), true);
          return;
        }
        onChange();
        if (renameResult) onRename(renameResult);
        close();
        render();
      });
      document.body.append(backdrop);
      key.focus();
    };
    const render = () => {
      list.replaceChildren();
      diagnostics.replaceChildren();
      const previousSource = sourceSelect.value;
      sourceSelect.replaceChildren(...library.sources.map(source => new Option(source.file, source.file)));
      if (library.sources.some(source => source.file === previousSource)) sourceSelect.value = previousSource;
      sourceSelect.disabled = library.sources.length === 0;
      addButton.disabled = library.sources.length === 0;
      batchButton.disabled = library.sources.length === 0;
      const previousKey = legacyKeySelect.value;
      legacyKeySelect.replaceChildren(...library.entries.map(entry => new Option(entry.key, entry.key)));
      if (library.entries.some(entry => entry.key === previousKey)) legacyKeySelect.value = previousKey;
      legacyKeySelect.disabled = library.entries.length === 0;
      legacySubmit.disabled = legacyKeySelect.disabled;
      const found = library.search(search.value);
      const currentConflicts = library.conflicts;
      const citationDiagnostics = library.diagnostics(texSource);
      const scan = scanTexCitations(texSource);
      const modeLabel = {
        bibtex: t('BibTeX 模式','BibTeX mode'),
        biblatex: t('biblatex/Biber 模式','biblatex/Biber mode'),
        mixed: t('混合模式（请核对配置）','Mixed mode (check configuration)'),
        unknown: t('未识别模式','Unknown mode'),
      }[scan.mode];
      const mode = document.createElement('div');
      mode.textContent = `${t('文献模式','Bibliography mode')}: ${modeLabel}`;
      diagnostics.append(mode);
      const support = document.createElement('small');
      support.textContent = t(
        '已识别 \\bibliography、\\bibliographystyle、\\addbibresource、\\printbibliography；其他配置保持原始源码。',
        'Recognizes \\bibliography, \\bibliographystyle, \\addbibresource, and \\printbibliography; other configuration is preserved as source.',
      );
      diagnostics.append(support);
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
          const selectionKey = `${entry.file}:${entry.sourceIndex}`;
          if (selectedEntries.has(selectionKey)) selectedEntries.delete(selectionKey);
          else selectedEntries.set(selectionKey, entry);
          insert.disabled = false;
          choose.setAttribute('aria-selected', selectedEntries.has(selectionKey) ? 'true' : 'false');
        });
        const meta = document.createElement('small');
        meta.textContent = [entry.author, entry.year, entry.file].filter(Boolean).join(' · ');
        const edit = button(t('编辑','Edit'));
        edit.setAttribute('aria-label', t(`编辑 ${entry.key}`, `Edit ${entry.key}`));
        edit.addEventListener('click', () => {
          sourceSelect.value = entry.file;
          openEditor(entry.entry, entry);
        });
        const remove = button(t('删除','Delete'));
        remove.setAttribute('aria-label', t(`删除 ${entry.key}`, `Delete ${entry.key}`));
        remove.addEventListener('click', () => {
          const preview = library.previewRemove(entry.file, entry.key, { occurrence: entry.occurrence });
          if (!preview.ok) {
            updateStatus(`[${preview.error.code}] ${preview.error.message}`, true);
            return;
          }
          const cited = library.diagnostics(texSource).citations?.cited?.includes(entry.key);
          const impact = [
            ...(preview.danglingReferences ?? []).map(item => `${item.entryKey}.${item.field}`),
            ...(cited ? [t('正文引用','document citations')] : []),
          ];
          if (!window.confirm(t(
            `删除 ${entry.key} 将影响：${impact.length ? impact.join(', ') : '无已知引用'}。确定删除？`,
            `Deleting ${entry.key} affects: ${impact.length ? impact.join(', ') : 'no known references'}. Delete it?`,
          ))) return;
          const result = library.removeEntry(entry.file, entry.key, { occurrence: entry.occurrence });
          if (!result.ok) {
            updateStatus(`[${result.error.code}] ${result.error.message}`, true);
            return;
          }
          onChange();
          render();
        });
        row.append(choose, meta, edit, remove);
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
    batchPicker.addEventListener('change', async () => {
      const file = batchPicker.files?.[0];
      if (!file || !sourceSelect.value) return;
      try {
        const document = await parseBibFile(file, { filename: file.name });
        const parsedInputs = document.entries.map(entry => ({
          key: entry.key,
          type: entry.typeRaw || entry.type,
          fields: entry.fields.filter(field => !field.unparsed && field.value).reduce((fields, field) => {
            fields[field.nameRaw || field.name] = { text: fieldText(field), delimiter: field.value.parts[0]?.kind === 'quoted' ? 'quoted' : 'braced' };
            return fields;
          }, {}),
        }));
        const result = library.importEntries(sourceSelect.value, parsedInputs, { onConflict: 'error' });
        if (!result.ok) updateStatus(`[${result.error.code}] ${result.error.message}`, true);
        else updateStatus(t(`已导入 ${result.count} 条。`,`Imported ${result.count} entries.`));
        onChange();
        render();
      } catch (error) {
        updateStatus(`${t('无法解析','Could not parse')} ${file.name}: ${error.message}`, true);
      }
      batchPicker.value = '';
    });
    sourceSelect.addEventListener('change', render);
    search.addEventListener('input', render);
    cancel.addEventListener('click', () => close(null));
    backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop) close(null); });
    insert.addEventListener('click', () => {
      if (!selected) return;
      const entries = [...selectedEntries.values()];
      const keys = entries.length ? entries.map(entry => entry.key) : [selected.key];
      if (keys.length > 1 || preNote.value || postNote.value || citationCommand.value !== 'cite') {
        const command = `\\${citationCommand.value}${preNote.value ? `[${preNote.value}]` : ''}${postNote.value ? `[${postNote.value}]` : ''}{${keys.join(',')}}`;
        onInsertCitation({ command, keys, preNote: preNote.value, postNote: postNote.value, citationCommand: citationCommand.value, entries });
      } else {
        onInsert(selected);
      }
      close(selected);
    });
    document.body.append(backdrop);
    popIn(panel, { prefersReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false });
    render();
    if (!library.sources.length) picker.click();
    search.focus();
  });
}
