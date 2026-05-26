// folders.js — create folders, add notes, render folder view

let activeFolderId = null;

function createFolder(name) {
  const folder = {
    id: generateId(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  saveFolder(folder);
  return folder;
}

function createNoteInFolder(folderId) {
  const note = {
    id: generateId(),
    title: '',
    body: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    folderId: folderId,
  };
  saveNote(note);
  return note;
}

function renderFolders() {
  const panel = document.getElementById('panel-folders');
  const folders = getAllFolders();

  let html = `
    <div class="folder-actions">
      <button class="new-folder-btn" id="new-folder-btn">+ New Folder</button>
    </div>
  `;

  if (folders.length === 0) {
    html += '<div class="empty-state">No folders yet.<br>Create one above.</div>';
  } else {
    html += folders.map(folder => {
      const notes = getAllNotes().filter(n => n.folderId === folder.id);
      const isOpen = activeFolderId === folder.id;
      return `
        <div class="folder-item" data-folder-id="${folder.id}">
          <div class="folder-header ${isOpen ? 'open' : ''}" data-folder-id="${folder.id}">
            <span class="folder-arrow">${isOpen ? '&#9662;' : '&#9656;'}</span>
            <span class="folder-name">${escapeHtml(folder.name)}</span>
            <span class="folder-count">${notes.length}</span>
            <button class="folder-delete-btn" data-folder-id="${folder.id}" title="Delete folder">&#x2715;</button>
          </div>
          ${isOpen ? `
            <div class="folder-notes">
              ${notes.length === 0
                ? '<div class="folder-empty">No notes in here yet.</div>'
                : notes.map(note => `
                    <div class="note-card ${note.id === activeNoteId ? 'active' : ''}" data-id="${note.id}">
                      <div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div>
                      <div class="note-card-date">${formatDate(note.updatedAt)}</div>
                    </div>
                  `).join('')
              }
              <button class="add-note-to-folder-btn" data-folder-id="${folder.id}">+ Add Note</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  panel.innerHTML = html;
  bindFolderEvents(panel);
}

function bindFolderEvents(panel) {
  const newFolderBtn = panel.querySelector('#new-folder-btn');
  if (newFolderBtn) {
    newFolderBtn.addEventListener('click', () => {
      const name = prompt('Folder name:');
      if (name && name.trim()) {
        createFolder(name);
        renderFolders();
      }
    });
  }

  panel.querySelectorAll('.folder-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.classList.contains('folder-delete-btn')) return;
      const folderId = header.dataset.folderId;
      activeFolderId = activeFolderId === folderId ? null : folderId;
      renderFolders();
    });
  });

  panel.querySelectorAll('.folder-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderId = btn.dataset.folderId;
      if (confirm('Delete this folder? Notes inside will become loose notes.')) {
        getAllNotes()
          .filter(n => n.folderId === folderId)
          .forEach(n => { n.folderId = null; saveNote(n); });
        deleteFolder(folderId);
        if (activeFolderId === folderId) activeFolderId = null;
        renderFolders();
        renderRecentNotes();
      }
    });
  });

  panel.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => openNote(card.dataset.id));
  });

  panel.querySelectorAll('.add-note-to-folder-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const folderId = btn.dataset.folderId;
      persistCurrentNote();
      const note = createNoteInFolder(folderId);
      openNote(note.id);
      renderFolders();
      renderRecentNotes();
      document.getElementById('editor-body').focus();
    });
  });
}