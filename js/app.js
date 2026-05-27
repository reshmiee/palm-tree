// app.js — initialize app, wire up all events

// ── Navigation history stack ──────────────────────────
// Each entry: { type: 'note', id } | { type: 'folder' }
const navHistory = [];
let navCursor = -1; // points to current position in navHistory
let navLock = false; // prevent pushNav during back/forward navigation

function pushNav(entry) {
  if (navLock) return;
  // Don't push duplicate of current
  const current = navHistory[navCursor];
  if (current && current.type === entry.type && current.id === entry.id) return;
  // Discard any forward history
  navHistory.splice(navCursor + 1);
  navHistory.push(entry);
  navCursor = navHistory.length - 1;
  updateNavBtns();
}

function updateNavBtns() {
  const backBtn = document.getElementById('back-btn');
  const fwdBtn = document.getElementById('forward-btn');
  if (backBtn) backBtn.disabled = navCursor <= 0;
  if (fwdBtn) fwdBtn.disabled = navCursor >= navHistory.length - 1;
}

function navigateTo(entry) {
  navLock = true;
  if (entry.type === 'folder') {
    const sidePanel = document.getElementById('folder-side-panel');
    if (sidePanel) sidePanel.remove();
    openFolderView();
  } else if (entry.type === 'note') {
    closeFolderView();
    openNote(entry.id);
  }
  navLock = false;
  updateNavBtns();
}

function goBack() {
  if (navCursor <= 0) return;
  navCursor--;
  navigateTo(navHistory[navCursor]);
}

function goForward() {
  if (navCursor >= navHistory.length - 1) return;
  navCursor++;
  navigateTo(navHistory[navCursor]);
}

document.addEventListener('DOMContentLoaded', () => {

  // ── Editor events ──────────────────────────────────

  const titleEl = document.getElementById('editor-title');
  const bodyEl = document.getElementById('editor-body');

  titleEl.addEventListener('input', () => {
    autoResizeTitle();
    scheduleAutoSave();
  });

  bodyEl.addEventListener('input', () => {
    scheduleAutoSave();
  });

    // ── Formatting toolbar (two-layer) ──────────────────────

  let trayOpen = false;

  function initFormatToolbar() {
    const toolbar = document.getElementById('format-toolbar');
    const tray = document.getElementById('fmt-tray');
    const aBtn = document.getElementById('fmt-a-btn');
    if (!toolbar || !tray || !aBtn) return;

    // A button toggles the tray
    aBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      trayOpen = !trayOpen;
      tray.classList.toggle('open', trayOpen);
      aBtn.setAttribute('aria-expanded', trayOpen ? 'true' : 'false');
    });

    // Bottom bar buttons (bullet / numbered list)
    toolbar.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.fmt-btn');
      if (!btn || btn === aBtn) return;
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      if (cmd) {
        document.execCommand(cmd, false, null);
        bodyEl.focus();
        updateToolbarState();
      }
    });

    // Tray buttons (B/I/U/S + headings)
    tray.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.fmt-btn');
      if (!btn) return;
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      const heading = btn.dataset.heading;
      if (cmd) {
        document.execCommand(cmd, false, null);
        bodyEl.focus();
        updateToolbarState();
      } else if (heading) {
        if (heading === 'p') {
          document.execCommand('formatBlock', false, 'p');
        } else {
          const tag = document.queryCommandValue('formatBlock').toLowerCase();
          if (tag === heading) {
            document.execCommand('formatBlock', false, 'p');
          } else {
            document.execCommand('formatBlock', false, heading);
          }
        }
        bodyEl.focus();
        updateToolbarState();
      }
    });
    document.addEventListener('selectionchange', updateToolbarState);
  }

  function updateToolbarState() {
    // Inline format buttons in tray
    document.querySelectorAll('.fmt-btn[data-cmd]').forEach(btn => {
      const cmd = btn.dataset.cmd;
      if (cmd === 'insertUnorderedList' || cmd === 'insertOrderedList') return;
      try {
        btn.classList.toggle('active', document.queryCommandState(cmd));
      } catch (e) {}
    });

    // Heading buttons in tray
    const currentBlock = document.queryCommandValue('formatBlock').toLowerCase();
    document.querySelectorAll('.fmt-btn[data-heading]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.heading === currentBlock);
    });
  }

  initFormatToolbar();

  // ── Keyboard shortcuts for formatting ──────────────
  bodyEl.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); document.execCommand('bold', false, null); updateToolbarState(); }
      if (e.key === 'i') { e.preventDefault(); document.execCommand('italic', false, null); updateToolbarState(); }
      if (e.key === 'u') { e.preventDefault(); document.execCommand('underline', false, null); updateToolbarState(); }
    }
  });

  // ── New note button ────────────────────────────────

  document.getElementById('new-note-btn').addEventListener('click', () => {
    // Close folder side panel if open
    const sidePanel = document.getElementById('folder-side-panel');
    if (sidePanel) sidePanel.remove();

    // Close folder view overlay if open
    if (folderViewOpen) closeFolderView();

    const hasTitle = titleEl.value.trim().length > 0;
    const hasBody = bodyEl.value.trim().length > 0;

    if (!hasTitle && !hasBody) {
      showToast('Oops, write something first.', true);
      titleEl.focus();
      return;
    }

    persistCurrentNote();
    const note = createNewNote();
    activeNoteId = note.id;
    clearEditor();
    highlightActiveCard(note.id);
    renderRecentNotes();
    bodyEl.focus();
  });

  // ── Tabs ───────────────────────────────────────────

  const tabs = [
    { btn: 'tab-recent',  panel: 'panel-recent'  },
    { btn: 'tab-months',  panel: 'panel-months'  },
  ];

  tabs.forEach(({ btn, panel }) => {
    document.getElementById(btn).addEventListener('click', () => {
      tabs.forEach(t => {
        document.getElementById(t.btn).classList.remove('active');
        document.getElementById(t.panel).classList.add('hidden');
        document.getElementById(t.panel).classList.remove('active');
      });
      document.getElementById(btn).classList.add('active');
      document.getElementById(panel).classList.remove('hidden');
      document.getElementById(panel).classList.add('active');

      if (panel === 'panel-recent') renderRecentNotes();
      if (panel === 'panel-months') renderMonths();
    });
  });

  // ── Folder nav button ──────────────────────────────

  document.getElementById('folder-nav-btn').addEventListener('click', () => {
    const wasOpen = folderViewOpen;
    toggleFolderView();
    if (!wasOpen) pushNav({ type: 'folder' });
  });

  // ── Back / Forward buttons ──────────────────────────
  document.getElementById('back-btn').addEventListener('click', () => goBack());
  document.getElementById('forward-btn').addEventListener('click', () => goForward());

  // ── Menu dropdown ──────────────────────────────────

  const menuBtn = document.getElementById('menu-btn');
  const menuDropdown = document.getElementById('menu-dropdown');

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    menuDropdown.classList.add('hidden');
  });

  // ── Export ─────────────────────────────────────────

  document.getElementById('export-btn').addEventListener('click', () => {
    menuDropdown.classList.add('hidden');
    showPermissionModal('Export all notes and folders as JSON?', () => {
      exportJSON();
    });
  });

  // ── Import ─────────────────────────────────────────

  document.getElementById('import-btn').addEventListener('click', () => {
    menuDropdown.classList.add('hidden');
    showPermissionModal('Import JSON? This will merge with your existing notes.', () => {
      document.getElementById('import-file').click();
    });
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importJSON(file, () => {
      renderRecentNotes();
      loadOrCreateBlankNote();
    });
    e.target.value = '';
  });

  // ── Clear all ──────────────────────────────────────

  document.getElementById('clear-btn').addEventListener('click', () => {
    menuDropdown.classList.add('hidden');
    showPermissionModal('Delete all notes and folders? This cannot be undone.', () => {
      clearAllData();
      clearEditor();
      activeNoteId = null;
      renderRecentNotes();
      loadOrCreateBlankNote();
    });
  });

  // ── Init ───────────────────────────────────────────

  initSearch();
  initMultiSelect();
  renderRecentNotes();
  loadOrCreateBlankNote();
  bodyEl.focus();

  // Seed nav with initial note
  setTimeout(() => {
    if (activeNoteId) pushNav({ type: 'note', id: activeNoteId });
    updateNavBtns();
  }, 0);

});