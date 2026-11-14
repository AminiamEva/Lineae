// Injected by the Tauri shell before the editor loads. It maps the small file
// system surface the web app already uses onto native dialogs and commands.
(function () {
  'use strict';

  function invoke(command, args) {
    const core = window.__TAURI__ && window.__TAURI__.core;
    if (core && typeof core.invoke === 'function') return core.invoke(command, args);
    const internals = window.__TAURI_INTERNALS__;
    if (internals && typeof internals.invoke === 'function') {
      return internals.invoke(command, args);
    }
    return Promise.reject(new Error('Tauri IPC is unavailable'));
  }

  function abortError() {
    return new DOMException('The user aborted a request.', 'AbortError');
  }

  function reportError(error) {
    console.error(error);
    const status = document.querySelector('#status');
    if (status) {
      status.hidden = false;
      status.textContent = String((error && error.message) || error);
    }
  }

  function writable(path) {
    let buffer = '';
    return {
      async write(value) {
        buffer += typeof value === 'string' ? value : await new Response(value).text();
      },
      async close() {
        await invoke('write_tex', { path, contents: buffer });
      },
      async abort() {},
    };
  }

  function fileName(path) {
    return path.split(/[\\/]/).pop() || 'lineae.tex';
  }

  function handle(path) {
    return {
      name: fileName(path),
      async requestPermission() {
        return 'granted';
      },
      async createWritable() {
        return writable(path);
      },
    };
  }

  window.showOpenFilePicker = async function () {
    const opened = await invoke('open_tex');
    if (!opened) throw abortError();
    return [
      {
        name: opened.name,
        async getFile() {
          return new File([opened.contents], opened.name, { type: 'text/plain' });
        },
        ...handle(opened.path),
      },
    ];
  };

  window.showSaveFilePicker = async function (options) {
    const suggestedName = (options && options.suggestedName) || 'lineae.tex';
    const path = await invoke('pick_save_tex', { suggestedName });
    if (!path) throw abortError();
    return handle(path);
  };

  window.lineaeProject = {async open() {
    const projectInvoke = (command,args) => invoke(command,args).catch(error => {throw error instanceof Error ? error : new Error(String(error));});
    const root = await projectInvoke('open_project');
    if (!root) throw abortError();
    const session=crypto.randomUUID();
    const operation = (operation, path, target, bytes, expected) => projectInvoke('project_operation', {root, operation, path, target, bytes, expected});
    return {root, session, name:fileName(root),
      loadState:async()=>{const bytes=(await operation('load_state')).bytes;return bytes.length?JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))):null;},
      checkpoint:state=>operation('checkpoint',null,session,Array.from(new TextEncoder().encode(JSON.stringify(state)))),
      acknowledge:version=>operation('ack_checkpoint',null,version.id,null,version.expected),
      list:async () => (await operation('list')).entries,
      read:async path => new Uint8Array((await operation('read',path)).bytes),
      write:(path,bytes,expected) => operation('write',path,null,Array.from(bytes),expected && Array.from(expected)),
      create:(path,bytes) => operation('create',path,null,Array.from(bytes)),
      mkdir:path => operation('mkdir',path), remove:path => operation('remove',path),
      move:(path,target) => operation('move',path,target),
    };
  }};

  async function saveBlob(url, suggestedName) {
    const response = await fetch(url);
    const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
    await invoke('save_bytes', { suggestedName, bytes });
  }

  // The web app exports ZIP and YAML through detached download anchors, whose
  // click events never reach the document. Override the method instead.
  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const href = this.href || '';
    if (this.hasAttribute('download') && href.startsWith('blob:')) {
      saveBlob(href, this.getAttribute('download') || 'lineae.bin').catch(reportError);
      return;
    }
    return nativeClick.call(this);
  };
})();
