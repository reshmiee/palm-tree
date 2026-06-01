// notes.js — create, save, auto-title, delete notes

let activeNoteId = null;
let saveTimer = null;
let pendingNote = null; // note created but not yet saved (empty)
const closeIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
const threeDotIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>';

// ── Note card 3-dot context menu ─────────────────────

let activeCardMenu = null;

function closeActiveCardMenu() {
  if (activeCardMenu) {
    activeCardMenu.remove();
    activeCardMenu = null;
  }
}

function showNoteCardMenu(btn, noteId) {
  closeActiveCardMenu();

  const menu = document.createElement('div');
  menu.className = 'note-card-menu';
  menu.innerHTML = `
    <button class="note-card-menu-item" data-action="rename">Rename note</button>
    <button class="note-card-menu-item" data-action="folder">Add to folder</button>
    <hr class="note-card-menu-divider" />
    <button class="note-card-menu-item danger" data-action="delete">Delete note</button>
  `;

  // Position relative to the button
  const rect = btn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = (rect.left - 120) + 'px';
  document.body.appendChild(menu);
  activeCardMenu = menu;

  menu.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveCardMenu();
    showRenameNoteModal(noteId);
  });

  menu.querySelector('[data-action="folder"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveCardMenu();
    showMoveToFolderModal(noteId);
  });

  menu.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveCardMenu();
    showDeleteConfirmModal('Delete this note? This cannot be undone.', () => {
      deleteNote(noteId);
      if (activeNoteId === noteId) {
        activeNoteId = null;
        clearEditor();
        loadOrCreateBlankNote();
      }
      renderRecentNotes();
    });
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', closeActiveCardMenu, { once: true });
  }, 0);
}

function showRenameNoteModal(noteId) {
  const note = getNoteById(noteId);
  if (!note) return;
  const overlay = document.createElement('div');
  overlay.className = 'name-modal-overlay';
  overlay.innerHTML = `
    <div class="name-modal">
      <div class="name-modal-label">Rename note</div>
      <input class="name-modal-input" type="text" placeholder="Note title…" maxlength="80" value="${escapeHtml(note.title || '')}" />
      <div class="name-modal-actions">
        <button class="name-modal-cancel">Cancel</button>
        <button class="name-modal-confirm">Rename</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('.name-modal-input');
  input.focus();
  input.select();
  function close() { overlay.remove(); }
  overlay.querySelector('.name-modal-cancel').addEventListener('click', close);
  overlay.querySelector('.name-modal-confirm').addEventListener('click', () => {
    const newTitle = input.value.trim();
    if (newTitle) {
      note.title = newTitle;
      note.updatedAt = new Date().toISOString();
      saveNote(note);
      if (activeNoteId === noteId) {
        document.getElementById('editor-title').value = newTitle;
        autoResizeTitle();
      }
      renderRecentNotes();
    }
    close();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('.name-modal-confirm').click();
    if (e.key === 'Escape') close();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

function showMoveToFolderModal(noteId) {
  const note = getNoteById(noteId);
  if (!note) return;
  const folders = getAllFolders();
  const overlay = document.createElement('div');
  overlay.className = 'folder-modal-overlay';
  const folderItems = folders.length === 0
    ? `<div class="folder-modal-empty">No folders yet. Create one first.</div>`
    : folders.map(f => `
        <div class="note-card folder-pick-item" data-folder-id="${f.id}" style="cursor:pointer;">
          <div class="note-card-title">${escapeHtml(f.name || 'Untitled')}</div>
        </div>
      `).join('');
  overlay.innerHTML = `
    <div class="folder-modal">
      <div class="folder-modal-header">
        <span class="folder-modal-title">Add to folder</span>
        <button class="folder-modal-close">${closeIcon}</button>
      </div>
      <div class="folder-modal-list">${folderItems}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  overlay.querySelector('.folder-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('.folder-pick-item').forEach(item => {
    item.addEventListener('click', () => {
      showPermissionModal(`Add "${note.title || 'Untitled'}" to this folder?`, () => {
        note.folderId = item.dataset.folderId;
        saveNote(note);
        renderRecentNotes();
        close();
      }, close);
    });
  });
}

// ── Create ──────────────────────────────────────────

function createNewNote() {
  const note = {
    id: generateId(),
    title: '',
    body: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    folderId: null,
  };
  // Don't save yet — will be saved only when user types something
  return note;
}

// ── Load into editor ─────────────────────────────────

function openNote(id) {
  const note = getNoteById(id);
  if (!note) return;

  activeNoteId = id;
  if (typeof pushNav === 'function') pushNav({ type: 'note', id });

  const titleEl = document.getElementById('editor-title');
  const bodyEl = document.getElementById('editor-body');

  titleEl.value = note.title === 'Untitled' ? '' : note.title;
  bodyEl.innerHTML = note.body || '';
  if (typeof window.clearEditorHistory  === 'function') window.clearEditorHistory();
  if (typeof window.reinitEditorWidgets === 'function') window.reinitEditorWidgets();
  if (typeof window.loadNoteEmbeds      === 'function') window.loadNoteEmbeds(note);

  autoResizeTitle();
  highlightActiveCard(id);

  // Refresh page view if active
  if (typeof refreshPageView === 'function') refreshPageView();
}

// ── Auto save ────────────────────────────────────────

function scheduleAutoSave() {
  clearTimeout(saveTimer);
  showUnsavedDot(true);
  saveTimer = setTimeout(() => {
    persistCurrentNote();
    showUnsavedDot(false);
  }, 600);
}

function persistCurrentNote() {
  if (!activeNoteId) return;

  const titleEl = document.getElementById('editor-title');
  const bodyEl = document.getElementById('editor-body');

  const titleVal = titleEl.value.trim();
  // Lean serialization: strips regenerated widget DOM (CodeMirror, table
  // toolbars/resizers) so stored notes stay small.
  const cleanBody = (typeof window.getCleanEditorHTML === 'function')
    ? window.getCleanEditorHTML()
    : bodyEl.innerHTML;
  const bodyVal = cleanBody.trim();

  // If both empty, clean up
  const bodyText = bodyEl.innerText.trim();
  if (!titleVal && !bodyText) {
    const existing = getNoteById(activeNoteId);
    if (!existing) {
      renderRecentNotes();
      return;
    }
    // If it's a placeholder (Untitled + no body), delete it
    if (existing.title === 'Untitled' && !existing.body.trim()) {
      deleteNote(activeNoteId);
      renderRecentNotes();
      return;
    }
    // Otherwise leave it alone
    return;
  }

  let note = getNoteById(activeNoteId);
  if (!note) {
    // Note was never saved yet — save it now for the first time
    const newNote = pendingNote || {
      id: activeNoteId,
      title: '',
      body: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      folderId: null,
    };
    newNote.id = activeNoteId;
    newNote.title = titleVal;
    newNote.body = cleanBody;
    newNote.updatedAt = new Date().toISOString();
    if (!newNote.title && newNote.body.trim()) {
      newNote.title = newNote.body.trim().split('\n')[0].slice(0, 60);
    }
    saveNote(newNote);
    pendingNote = null;
    renderRecentNotes();
    // If it's a folder note, refresh the side panel so it appears
    if (newNote.folderId && typeof renderFolderSidePanel === 'function') {
      renderFolderSidePanel();
    }
    return;
  }

  note.title = titleVal;
  note.body = cleanBody;

  // auto title from first line of body if title is empty or still the placeholder
  if ((!note.title || note.title === 'Untitled') && bodyEl.innerText.trim()) {
    const firstLine = bodyEl.innerText.trim().split('\n')[0];
    note.title = firstLine.slice(0, 60);
    // also update the title textarea so user sees it
    const titleEl2 = document.getElementById('editor-title');
    if (titleEl2 && !titleEl2.value.trim()) {
      titleEl2.value = note.title;
      autoResizeTitle();
    }
  }

  note.updatedAt = new Date().toISOString();
  saveNote(note);
  renderRecentNotes();
  // If this note belongs to a folder, refresh the side panel so title updates
  if (note.folderId && typeof renderFolderSidePanel === 'function') {
    renderFolderSidePanel();
  }
}

// ── Delete ───────────────────────────────────────────

function deleteActiveNote() {
  if (!activeNoteId) return;
  deleteNote(activeNoteId);
  activeNoteId = null;
  clearEditor();
  renderRecentNotes();
  loadOrCreateBlankNote();
}

// ── Editor helpers ───────────────────────────────────

function clearEditor() {
  document.getElementById('editor-title').value = '';
  document.getElementById('editor-body').innerHTML = '';
  if (typeof window.clearEditorHistory  === 'function') window.clearEditorHistory();
  if (typeof window.loadNoteEmbeds      === 'function') window.loadNoteEmbeds(null);
}

function autoResizeTitle() {
  const el = document.getElementById('editor-title');
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, 45) + 'px';
}

function highlightActiveCard(id) {
  document.querySelectorAll('.note-card').forEach(card => {
    card.classList.toggle('active', card.dataset.id === id);
  });
}

// ── Render recent notes list ─────────────────────────

function renderRecentNotes() {
  const panel = document.getElementById('panel-recent');
  const notes = getAllNotes().sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  if (notes.length === 0) {
    panel.innerHTML = `<div class="empty-state">No notes yet.<br>Start writing!</div>`;
    return;
  }

  if (multiSelectMode) {
    panel.innerHTML = notes.map(note => `
      <div class="note-card selectable ${selectedNoteIds.has(note.id) ? 'selected' : ''}" data-id="${note.id}">
        <span class="note-select-check" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </span>
        <div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div>
        <div class="note-card-date">${formatDate(note.updatedAt)}</div>
      </div>
    `).join('');

    panel.querySelectorAll('.note-card').forEach(card => {
      card.addEventListener('click', () => toggleNoteSelection(card.dataset.id));
    });
    return;
  }

  panel.innerHTML = notes.map(note => `
    <div class="note-card ${note.id === activeNoteId ? 'active' : ''}" data-id="${note.id}">
      <button class="note-card-dots" data-id="${note.id}" title="Options" aria-label="Note options">${threeDotIcon}</button>
      <div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div>
      <div class="note-card-date">${formatDate(note.updatedAt)}</div>
    </div>
  `).join('');

  panel.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.note-card-dots')) return;
      openNote(card.dataset.id);
    });
  });

  panel.querySelectorAll('.note-card-dots').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showNoteCardMenu(btn, btn.dataset.id);
    });
  });
}

// ── Load or create blank on app open ─────────────────

function loadOrCreateBlankNote() {
  const notes = getAllNotes();
  if (notes.length === 0) {
    // Start a fresh unsaved note — it only gets saved when user types
    const note = createNewNote();
    activeNoteId = note.id;
    clearEditor();
    highlightActiveCard(note.id);
  } else {
    const latest = notes.sort((a, b) =>
      new Date(b.updatedAt) - new Date(a.updatedAt)
    )[0];
    openNote(latest.id);
  }
}

// ── Helpers ──────────────────────────────────────────

function formatDate(iso) {
  const date = new Date(iso);
  const now = new Date();
  const diff = now - date;
  const oneDay = 86400000;

  if (diff < oneDay && date.getDate() === now.getDate()) return 'Today';
  if (diff < 2 * oneDay) return 'Yesterday';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Unsaved indicator ─────────────────────────────────

function showUnsavedDot(show) {
  const dot = document.getElementById('unsaved-dot');
  if (dot) dot.classList.toggle('visible', show);
}

// ── Permission modal (shared) ─────────────────────────

function showPermissionModal(message, onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.className = 'name-modal-overlay';
  overlay.innerHTML = `
    <div class="name-modal">
      <div class="name-modal-label">${message}</div>
      <div class="name-modal-actions">
        <button class="name-modal-cancel">Cancel</button>
        <button class="name-modal-confirm">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  overlay.querySelector('.name-modal-cancel').addEventListener('click', () => { close(); if (onCancel) onCancel(); });
  overlay.querySelector('.name-modal-confirm').addEventListener('click', () => { close(); onConfirm(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { close(); if (onCancel) onCancel(); } });
}

// ── Multi-select ──────────────────────────────────────

let multiSelectMode = false;
let selectedNoteIds = new Set();

function enterMultiSelect() {
  multiSelectMode = true;
  selectedNoteIds.clear();
  document.getElementById('tab-multiselect').classList.add('active');
  document.getElementById('bulk-bar').classList.remove('hidden');
  updateBulkBar();
  renderRecentNotes();
}

function exitMultiSelect() {
  multiSelectMode = false;
  selectedNoteIds.clear();
  document.getElementById('tab-multiselect').classList.remove('active');
  document.getElementById('bulk-bar').classList.add('hidden');
  renderRecentNotes();
}

function toggleNoteSelection(id) {
  if (selectedNoteIds.has(id)) {
    selectedNoteIds.delete(id);
  } else {
    selectedNoteIds.add(id);
  }
  updateBulkBar();
  // Update just the card's selected state without full re-render
  document.querySelectorAll(`.note-card[data-id="${id}"]`).forEach(card => {
    card.classList.toggle('selected', selectedNoteIds.has(id));
  });
}

function updateBulkBar() {
  const count = selectedNoteIds.size;
  document.getElementById('bulk-count').textContent =
    count === 0 ? 'Select notes' : `${count} selected`;
  const folderBtn = document.getElementById('bulk-folder-btn');
  const deleteBtn = document.getElementById('bulk-delete-btn');
  folderBtn.disabled = count === 0;
  deleteBtn.disabled = count === 0;
}

function initMultiSelect() {
  document.getElementById('tab-multiselect').addEventListener('click', () => {
    if (multiSelectMode) {
      exitMultiSelect();
    } else {
      enterMultiSelect();
    }
  });

  document.getElementById('bulk-cancel-btn').addEventListener('click', () => {
    exitMultiSelect();
  });

  document.getElementById('bulk-delete-btn').addEventListener('click', () => {
    if (selectedNoteIds.size === 0) return;
    showDeleteConfirmModal(
      `Delete ${selectedNoteIds.size} note${selectedNoteIds.size > 1 ? 's' : ''}? This cannot be undone.`,
      () => {
        selectedNoteIds.forEach(id => deleteNote(id));
        if (selectedNoteIds.has(activeNoteId)) {
          activeNoteId = null;
          clearEditor();
        }
        exitMultiSelect();
        renderRecentNotes();
        if (!activeNoteId) loadOrCreateBlankNote();
      }
    );
  });

  document.getElementById('bulk-folder-btn').addEventListener('click', () => {
    if (selectedNoteIds.size === 0) return;
    const folders = getAllFolders();
    const overlay = document.createElement('div');
    overlay.className = 'folder-modal-overlay';
    const folderItems = folders.length === 0
      ? `<div class="folder-modal-empty">No folders yet. Create one first.</div>`
      : folders.map(f => `
          <div class="note-card folder-pick-item" data-folder-id="${f.id}" style="cursor:pointer;">
            <div class="note-card-title">${escapeHtml(f.name || 'Untitled')}</div>
          </div>
        `).join('');
    overlay.innerHTML = `
      <div class="folder-modal">
        <div class="folder-modal-header">
          <span class="folder-modal-title">Add to folder</span>
          <button class="folder-modal-close">${closeIcon}</button>
        </div>
        <div class="folder-modal-list">${folderItems}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    function close() { overlay.remove(); }
    overlay.querySelector('.folder-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelectorAll('.folder-pick-item').forEach(item => {
      item.addEventListener('click', () => {
        const folderId = item.dataset.folderId;
        selectedNoteIds.forEach(id => {
          const note = getNoteById(id);
          if (note) { note.folderId = folderId; saveNote(note); }
        });
        close();
        exitMultiSelect();
        renderRecentNotes();
      });
    });
  });
}