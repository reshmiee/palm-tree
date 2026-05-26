// app.js — initialize app, wire up all events

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

  // ── New note button ────────────────────────────────

  document.getElementById('new-note-btn').addEventListener('click', () => {
    persistCurrentNote();
    const note = createNewNote();
    openNote(note.id);
    renderRecentNotes();
    bodyEl.focus();
  });

  // ── Tabs ───────────────────────────────────────────

  const tabs = [
    { btn: 'tab-recent',  panel: 'panel-recent'  },
    { btn: 'tab-folders', panel: 'panel-folders' },
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
      if (panel === 'panel-folders') renderFolders();
      if (panel === 'panel-months') renderMonths();
    });
  });

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
    exportJSON();
    menuDropdown.classList.add('hidden');
  });

  // ── Import ─────────────────────────────────────────

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
    menuDropdown.classList.add('hidden');
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
    if (confirm('Delete all notes and folders? This cannot be undone.')) {
      clearAllData();
      clearEditor();
      activeNoteId = null;
      renderRecentNotes();
      loadOrCreateBlankNote();
    }
    menuDropdown.classList.add('hidden');
  });

  // ── Init ───────────────────────────────────────────

  initSearch();
  renderRecentNotes();
  loadOrCreateBlankNote();
  bodyEl.focus();

});