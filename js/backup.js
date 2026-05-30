// backup.js — Level-2 backup: auto-save all notes/folders to a real file on disk
// using the File System Access API (Chromium). The file lives outside the browser,
// so clearing browser data won't lose your notes. No server, still private.

(function () {
  const SUPPORTED = 'showSaveFilePicker' in window;
  const FLAG = 'palmtree_backup_enabled';
  const PENDING = 'palmtree_backup_pending'; // set after "Delete all": offer a fresh file when writing resumes
  let handle = null;   // FileSystemFileHandle (the chosen file)
  let active = false;  // permitted + currently auto-saving
  let timer = null;

  const toast = (m, err) => { if (typeof showToast === 'function') showToast(m, !!err); };

  // ── tiny IndexedDB key/value (file handles can't be stored in localStorage) ──
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('palmtree-backup', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function idb(mode, fn) {
    return openDB().then(db => new Promise((res, rej) => {
      const tx = db.transaction('kv', mode);
      const out = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
      tx.onerror = () => rej(tx.error);
    }));
  }
  const idbSet = (k, v) => idb('readwrite', s => s.put(v, k));
  const idbGet = (k) => idb('readonly', s => s.get(k));
  const idbDel = (k) => idb('readwrite', s => s.delete(k));

  // ── state ──
  function state() {
    const enabled = localStorage.getItem(FLAG) === '1';
    if (active) return 'on';
    if (enabled && handle) return 'paused';
    return 'off';
  }

  function updateMenu() {
    const btn       = document.getElementById('backup-btn');
    const changeBtn = document.getElementById('backup-change-btn');
    if (!btn) return;
    if (!SUPPORTED) { btn.style.display = 'none'; if (changeBtn) changeBtn.style.display = 'none'; return; }
    const s = state();
    btn.textContent =
      s === 'on'     ? 'Auto-backup: On · ' + (handle ? handle.name : '') :
      s === 'paused' ? 'Resume auto-backup' :
                       'Back up to a file…';
    btn.classList.toggle('active', s === 'on');
    // Show "Change location" only when a backup file is active
    if (changeBtn) changeBtn.classList.toggle('hidden', s !== 'on');
  }

  async function writeBackup() {
    if (!handle) return;
    try {
      if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        active = false; updateMenu(); return;
      }
      const w = await handle.createWritable();
      await w.write(JSON.stringify(exportAllData(), null, 2));
      await w.close();
    } catch (e) {
      active = false; updateMenu();
      toast('Backup file unavailable — set it up again.', true);
    }
  }

  const promptBanner = () => document.getElementById('backup-prompt-banner');
  function showPrompt() { const b = promptBanner(); if (b) b.classList.remove('hidden'); }
  function hidePrompt() { const b = promptBanner(); if (b) b.classList.add('hidden'); }

  // Called by storage.js after every note/folder change (debounced).
  function scheduleBackup() {
    if (active) {
      clearTimeout(timer);
      timer = setTimeout(writeBackup, 1500);
      return;
    }
    // Fresh start after "Delete all": once the user writes again, offer a NEW
    // file (the old backup file is left untouched as an archive).
    if (localStorage.getItem(PENDING) === '1' && getAllNotes().length > 0) {
      showPrompt();
    }
  }
  window.scheduleBackup = scheduleBackup;

  // Called by the "Delete all notes" flow: stop auto-saving and forget the
  // current file WITHOUT touching it on disk, so it stays as an archive of the
  // deleted notes. Flag that a fresh file should be offered on the next write.
  function detachForReset() {
    const wasOn = active || localStorage.getItem(FLAG) === '1' || !!handle;
    clearTimeout(timer);
    active = false;
    handle = null;
    localStorage.removeItem(FLAG);
    if (wasOn) localStorage.setItem(PENDING, '1');
    updateMenu();
    idbDel('handle').catch(() => {});   // forget the handle (file on disk untouched)
  }
  window.backupDetachForReset = detachForReset;

  async function setup() {
    if (!SUPPORTED) { toast('This browser can’t auto-backup to a file. Use Export instead.', true); return; }
    // After a reset, suggest a different name so the old archive isn't overwritten.
    const fresh = localStorage.getItem(PENDING) === '1';
    let h;
    try {
      h = await window.showSaveFilePicker({
        suggestedName: fresh ? 'palmtree-notes-2.json' : 'palmtree-notes.json',
        types: [{ description: 'Palm Tree backup', accept: { 'application/json': ['.json'] } }],
      });
    } catch (e) { return; } // user cancelled the picker
    handle = h; active = true;
    localStorage.setItem(FLAG, '1');
    localStorage.removeItem(PENDING);
    hidePrompt();
    try { await idbSet('handle', h); } catch (e) {}
    await writeBackup();        // write current notes immediately
    updateMenu();
    toast('Auto-backup on — saving to ' + h.name + ' 🌴');
  }

  async function regrant() {
    if (!handle) return;
    let perm = 'denied';
    try { perm = await handle.requestPermission({ mode: 'readwrite' }); } catch (e) {}
    if (perm === 'granted') {
      active = true; await writeBackup(); updateMenu();
      toast('Auto-backup resumed 🌴');
    } else {
      toast('Permission needed to auto-backup.', true);
    }
  }

  async function disable() {
    active = false; handle = null;
    localStorage.removeItem(FLAG);
    try { await idbDel('handle'); } catch (e) {}
    updateMenu();
    toast('Auto-backup turned off');
  }

  function onClick() {
    const dd = document.getElementById('menu-dropdown');
    if (dd) dd.classList.add('hidden');
    const s = state();
    if (s === 'on') disable();
    else if (s === 'paused') regrant();
    else setup();
  }

  async function resumeOnLoad() {
    if (!SUPPORTED || localStorage.getItem(FLAG) !== '1') { updateMenu(); return; }
    try { handle = await idbGet('handle'); } catch (e) { handle = null; }
    if (!handle) { localStorage.removeItem(FLAG); updateMenu(); return; }
    let perm = 'prompt';
    try { perm = await handle.queryPermission({ mode: 'readwrite' }); } catch (e) {}
    if (perm === 'granted') {
      active = true;                                  // installed PWA usually persists access
    } else {
      active = false;                                 // a tab session needs one click to re-grant
      toast('Auto-backup paused — open ⋮ to resume.');
    }
    updateMenu();
  }

  function init() {
    const btn = document.getElementById('backup-btn');
    if (btn) btn.addEventListener('click', onClick);

    const changeBtn = document.getElementById('backup-change-btn');
    if (changeBtn) changeBtn.addEventListener('click', () => {
      const dd = document.getElementById('menu-dropdown');
      if (dd) dd.classList.add('hidden');
      setup();   // setup() replaces the current handle with a newly picked one
    });

    const choose = document.getElementById('backup-prompt-choose');
    if (choose) choose.addEventListener('click', setup);
    const close = document.getElementById('backup-prompt-close');
    if (close) close.addEventListener('click', () => { hidePrompt(); localStorage.removeItem(PENDING); });

    resumeOnLoad();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
