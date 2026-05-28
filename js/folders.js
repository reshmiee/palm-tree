// folders.js — folder view renders in the editor area

let activeFolderId = null;
let folderViewOpen = false;

const folderCloseIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
const folderDotsIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>';

let activeFolderMenu = null;

function closeActiveFolderMenu() {
  if (activeFolderMenu) {
    activeFolderMenu.remove();
    activeFolderMenu = null;
  }
}

function showFolderCardMenu(btn, folderId) {
  closeActiveFolderMenu();
  const menu = document.createElement('div');
  menu.className = 'note-card-menu';
  menu.innerHTML = `
    <button class="note-card-menu-item" data-action="rename">Rename folder</button>
    <hr class="note-card-menu-divider" />
    <button class="note-card-menu-item danger" data-action="delete">Delete folder</button>
  `;
  const rect = btn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = (rect.left - 80) + 'px';
  document.body.appendChild(menu);
  activeFolderMenu = menu;

  menu.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveFolderMenu();
    showRenameFolderModal(folderId);
  });

  menu.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveFolderMenu();
    showPermissionModal('Delete this folder? Notes inside will become loose notes.', () => {
      getAllNotes()
        .filter(n => n.folderId === folderId)
        .forEach(n => { n.folderId = null; saveNote(n); });
      deleteFolder(folderId);
      if (activeFolderId === folderId) activeFolderId = null;
      const sidePanel = document.getElementById('folder-side-panel');
      if (sidePanel) sidePanel.remove();
      renderFolderView();
      renderRecentNotes();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', closeActiveFolderMenu, { once: true });
  }, 0);
}

function showRenameFolderModal(folderId) {
  const folder = getAllFolders().find(f => f.id === folderId);
  if (!folder) return;
  const overlay = document.createElement('div');
  overlay.className = 'name-modal-overlay';
  overlay.innerHTML = `
    <div class="name-modal">
      <div class="name-modal-label">Rename folder</div>
      <input class="name-modal-input" type="text" placeholder="Folder name…" maxlength="40" value="${escapeHtml(folder.name || '')}" />
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
    const newName = input.value.trim();
    if (newName) {
      folder.name = newName;
      saveFolder(folder);
      renderFolderView();
    }
    close();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('.name-modal-confirm').click();
    if (e.key === 'Escape') close();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

// ── Show / hide folder view ───────────────────────────

function openFolderView() {
  folderViewOpen = true;
  document.getElementById('folder-view').classList.remove('hidden');
  document.getElementById('editor-title').style.display = 'none';
  document.getElementById('editor-body').style.display = 'none';
  const editorMeta = document.querySelector('.editor-meta');
  if (editorMeta) editorMeta.style.display = 'none';
  document.getElementById('folder-nav-btn').classList.add('active');
  renderFolderView();
}

function closeFolderView() {
  folderViewOpen = false;
  document.getElementById('folder-view').classList.add('hidden');
  document.getElementById('editor-title').style.display = '';
  document.getElementById('editor-body').style.display = '';
  const _em = document.querySelector('.editor-meta'); if (_em) _em.style.display = '';
  document.getElementById('folder-nav-btn').classList.remove('active');
  const sidePanel = document.getElementById('folder-side-panel');
  if (sidePanel) sidePanel.remove();
  activeFolderId = null;
}

function toggleFolderView() {
  if (folderViewOpen) {
    closeFolderView();
  } else {
    openFolderView();
  }
}

// ── Render folder view into editor area ──────────────

function renderFolderView() {
  if (!folderViewOpen) return;
  const container = document.getElementById('folder-view-inner');
  const folders = getAllFolders();

  let html = `
    <div class="folder-view-header-row">
      <div class="folder-view-heading">Folders</div>
      <button class="new-folder-btn" id="new-folder-btn">+ Create</button>
    </div>
  `;

  if (folders.length === 0) {
    html += '<div class="empty-state" style="text-align:left;padding-left:0;">No folders yet. Hit Create to add one.</div>';
  } else {
    html += `<div class="folder-grid">`;
    html += folders.map(folder => {
      const notes = getAllNotes().filter(n => n.folderId === folder.id);
      const isOpen = activeFolderId === folder.id;
      return `
        <div class="folder-card-wrap" data-folder-id="${folder.id}">
          <div class="folder-card ${isOpen ? 'open' : ''}" data-folder-id="${folder.id}">
            <button class="folder-card-dots" data-folder-id="${folder.id}" title="Folder options" aria-label="Folder options">${folderDotsIcon}</button>
          </div>
          <div class="folder-card-name">${escapeHtml(folder.name || 'Untitled')}</div>
          <div class="folder-card-count">${notes.length} note${notes.length !== 1 ? 's' : ''}</div>
        </div>
      `;
    }).join('');
    html += `</div>`;
  }

  container.innerHTML = html;

  // Render the right side panel if a folder is open
  renderFolderSidePanel();

  bindFolderViewEvents(container);
}

function renderFolderSidePanel() {
  // Remove any existing side panel
  const existing = document.getElementById('folder-side-panel');
  if (existing) existing.remove();

  if (!activeFolderId) return;

  const openFolder = getAllFolders().find(f => f.id === activeFolderId);
  if (!openFolder) return;

  const notes = getAllNotes().filter(n => n.folderId === openFolder.id);

  const emptyHtml = `
    <div class="folder-empty">No notes in here yet.</div>
  `;

  const notesHtml = notes.length === 0
    ? emptyHtml
    : notes.map(note => `
        <div class="note-card ${note.id === activeNoteId ? 'active' : ''}" data-id="${note.id}">
          <button class="note-card-dots folder-note-dots" data-id="${note.id}" title="Options" aria-label="Note options">${folderDotsIcon}</button>
          <div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div>
          <div class="note-card-date">${formatDate(note.updatedAt)}</div>
        </div>
      `).join('');

  const panel = document.createElement('div');
  panel.id = 'folder-side-panel';
  panel.className = 'folder-side-panel';
  panel.innerHTML = `
    <div class="folder-side-panel-header">
      <div class="folder-side-panel-title-row">
        <div class="folder-side-panel-title">${escapeHtml(openFolder.name || 'Untitled')}</div>
        <button class="new-folder-btn folder-side-panel-add-btn" data-folder-id="${openFolder.id}">+ Add Note</button>
        <button class="folder-side-panel-new-btn" data-folder-id="${openFolder.id}" title="New note in this folder" aria-label="New note in this folder">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        </button>
      </div>
      <button class="folder-side-panel-close" id="folder-side-panel-close" aria-label="Close panel">${folderCloseIcon}</button>
    </div>
    <div class="folder-side-panel-notes">
      ${notesHtml}
    </div>
  `;

  // Append inside the editor area
  document.querySelector('.editor').appendChild(panel);

  // Close button
  panel.querySelector('#folder-side-panel-close').addEventListener('click', () => {
    activeFolderId = null;
    panel.remove();
    renderFolderView();
  });

  // Note clicks — close folder overlay so editor is visible, keep side panel open
  panel.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.folder-note-dots')) return;
      // Hide only the folder view overlay, not the side panel
      folderViewOpen = false;
      document.getElementById('folder-view').classList.add('hidden');
      document.getElementById('editor-title').style.display = '';
      document.getElementById('editor-body').style.display = '';
      const _em = document.querySelector('.editor-meta'); if (_em) _em.style.display = '';
      document.getElementById('folder-nav-btn').classList.remove('active');
      openNote(card.dataset.id);
    });
  });

  // 3-dot menus on folder note cards
  panel.querySelectorAll('.folder-note-dots').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showFolderNoteMenu(btn, btn.dataset.id, openFolder.id);
    });
  });

  // Add note button in header
  panel.querySelector('.folder-side-panel-add-btn').addEventListener('click', () => {
    showAddNoteModal(openFolder.id);
  });

  // + icon button — directly create a new note in this folder
  panel.querySelector('.folder-side-panel-new-btn').addEventListener('click', () => {
    persistCurrentNote();
    const note = createNewNote();
    note.folderId = openFolder.id;
    pendingNote = note;
    activeNoteId = note.id;
    // Hide only the folder overlay, keep the side panel open
    folderViewOpen = false;
    document.getElementById('folder-view').classList.add('hidden');
    document.getElementById('editor-title').style.display = '';
    document.getElementById('editor-body').style.display = '';
    const _em = document.querySelector('.editor-meta'); if (_em) _em.style.display = '';
    document.getElementById('folder-nav-btn').classList.remove('active');
    clearEditor();
    highlightActiveCard(note.id);
    document.getElementById('editor-body').focus();
  });
}

// ── Folder note 3-dot menu ────────────────────────────

let activeFolderNoteMenu = null;

function closeActiveFolderNoteMenu() {
  if (activeFolderNoteMenu) {
    activeFolderNoteMenu.remove();
    activeFolderNoteMenu = null;
  }
}

function showFolderNoteMenu(btn, noteId, currentFolderId) {
  closeActiveFolderNoteMenu();
  const otherFolders = getAllFolders().filter(f => f.id !== currentFolderId);

  const menu = document.createElement('div');
  menu.className = 'note-card-menu';
  menu.innerHTML = `
    <button class="note-card-menu-item" data-action="rename">Rename note</button>
    <button class="note-card-menu-item" data-action="move">Move to another folder</button>
    <button class="note-card-menu-item" data-action="remove">Remove from folder</button>
    <hr class="note-card-menu-divider" />
    <button class="note-card-menu-item danger" data-action="delete">Delete note</button>
  `;
  const rect = btn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = (rect.left - 160) + 'px';
  document.body.appendChild(menu);
  activeFolderNoteMenu = menu;

  menu.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveFolderNoteMenu();
    showRenameNoteFolderPanel(noteId);
  });

  menu.querySelector('[data-action="move"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveFolderNoteMenu();
    showMoveFolderNoteModal(noteId, currentFolderId);
  });

  menu.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveFolderNoteMenu();
    showPermissionModal('Remove this note from the folder?', () => {
      const note = getNoteById(noteId);
      if (!note) return;
      note.folderId = null;
      saveNote(note);
      renderFolderSidePanel();
      renderRecentNotes();
    });
  });

  menu.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveFolderNoteMenu();
    showPermissionModal('Delete this note? This cannot be undone.', () => {
      deleteNote(noteId);
      if (activeNoteId === noteId) {
        activeNoteId = null;
        clearEditor();
        loadOrCreateBlankNote();
      }
      renderFolderSidePanel();
      renderRecentNotes();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', closeActiveFolderNoteMenu, { once: true });
  }, 0);
}

function showRenameNoteFolderPanel(noteId) {
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
  input.focus(); input.select();
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
      renderFolderSidePanel();
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

function showMoveFolderNoteModal(noteId, currentFolderId) {
  const note = getNoteById(noteId);
  if (!note) return;
  const folders = getAllFolders().filter(f => f.id !== currentFolderId);
  const overlay = document.createElement('div');
  overlay.className = 'folder-modal-overlay';
  const folderItems = folders.length === 0
    ? `<div class="folder-modal-empty">No other folders available.</div>`
    : folders.map(f => `
        <div class="note-card folder-pick-item" data-folder-id="${f.id}" style="cursor:pointer;">
          <div class="note-card-title">${escapeHtml(f.name || 'Untitled')}</div>
        </div>
      `).join('');
  overlay.innerHTML = `
    <div class="folder-modal">
      <div class="folder-modal-header">
        <span class="folder-modal-title">Move to folder</span>
        <button class="folder-modal-close">${folderCloseIcon}</button>
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
      showPermissionModal(`Move note to this folder?`, () => {
        note.folderId = item.dataset.folderId;
        saveNote(note);
        renderFolderSidePanel();
        renderRecentNotes();
        close();
      });
    });
  });
}

// ── Modals ───────────────────────────────────────────

function showNameModal(onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'name-modal-overlay';
  overlay.innerHTML = `
    <div class="name-modal">
      <div class="name-modal-label">Folder name</div>
      <input class="name-modal-input" type="text" placeholder="e.g. Work, Ideas…" maxlength="40" />
      <div class="name-modal-actions">
        <button class="name-modal-cancel">Cancel</button>
        <button class="name-modal-confirm">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('.name-modal-input');
  input.focus();
  function close() { overlay.remove(); }
  overlay.querySelector('.name-modal-cancel').addEventListener('click', close);
  overlay.querySelector('.name-modal-confirm').addEventListener('click', () => { onConfirm(input.value.trim() || 'Untitled'); close(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { onConfirm(input.value.trim() || 'Untitled'); close(); }
    if (e.key === 'Escape') close();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}


function showAddNoteModal(folderId) {
  const allNotes = getAllNotes().filter(n => !n.folderId);
  const overlay = document.createElement('div');
  overlay.className = 'folder-modal-overlay';
  const noteItems = allNotes.length === 0
    ? `<div class="folder-modal-empty">No loose notes to add.</div>`
    : allNotes.map(note => `
        <div class="note-card" data-id="${note.id}" style="cursor:pointer;">
          <div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div>
          <div class="note-card-date">${formatDate(note.updatedAt)}</div>
        </div>
      `).join('');
  overlay.innerHTML = `
    <div class="folder-modal">
      <div class="folder-modal-header">
        <span class="folder-modal-title">Add a note</span>
        <button class="folder-modal-close">${folderCloseIcon}</button>
      </div>
      <button class="folder-modal-create-btn">+ Create new note</button>
      <div class="folder-modal-list">${noteItems}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  overlay.querySelector('.folder-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      const note = getNoteById(card.dataset.id);
      if (!note) return;
      note.folderId = folderId;
      saveNote(note);
      activeFolderId = folderId;
      close();
      renderFolderView();
      renderRecentNotes();
    });
  });
  overlay.querySelector('.folder-modal-create-btn').addEventListener('click', () => {
    const note = createNewNote();
    note.folderId = folderId;
    // Don't save yet — will only save when user types (via persistCurrentNote)
    pendingNote = note;
    activeFolderId = folderId;
    close();
    folderViewOpen = false;
    document.getElementById('folder-view').classList.add('hidden');
    document.getElementById('editor-title').style.display = '';
    document.getElementById('editor-body').style.display = '';
    const _em = document.querySelector('.editor-meta'); if (_em) _em.style.display = '';
    document.getElementById('folder-nav-btn').classList.remove('active');
    activeNoteId = note.id;
    clearEditor();
    document.getElementById('editor-title').focus();
    // Don't call renderFolderSidePanel yet — note isn't saved until user types
  });
}

// ── CRUD ─────────────────────────────────────────────

function createFolder(name) {
  const folder = {
    id: generateId(),
    name: name.trim() || 'Untitled',
    createdAt: new Date().toISOString(),
  };
  saveFolder(folder);
  return folder;
}

// ── Events ───────────────────────────────────────────

function bindFolderViewEvents(container) {
  container.querySelector('#new-folder-btn')?.addEventListener('click', () => {
    showNameModal((name) => {
      createFolder(name);
      renderFolderView();
    });
  });

  container.querySelectorAll('.folder-card-wrap').forEach(wrap => {
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('.folder-card-dots')) return;
      const folderId = wrap.dataset.folderId;
      activeFolderId = activeFolderId === folderId ? null : folderId;
      renderFolderView();
    });
  });

  container.querySelectorAll('.folder-card-dots').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showFolderCardMenu(btn, btn.dataset.folderId);
    });
  });
}

// kept for any legacy callers
function renderFolders() { renderFolderView(); }