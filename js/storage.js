// storage.js — single source of truth for localStorage
// All other files read/write through here, never directly

const KEYS = {
  NOTES: 'palmtree_notes',
  FOLDERS: 'palmtree_folders',
};

// ─── Notes ───────────────────────────────────────────

function getAllNotes() {
  const raw = localStorage.getItem(KEYS.NOTES);
  return raw ? JSON.parse(raw) : [];
}

function saveAllNotes(notes) {
  localStorage.setItem(KEYS.NOTES, JSON.stringify(notes));
  if (window.scheduleBackup) window.scheduleBackup();
}

function getNoteById(id) {
  return getAllNotes().find(n => n.id === id) || null;
}

function saveNote(note) {
  const notes = getAllNotes();
  const index = notes.findIndex(n => n.id === note.id);
  if (index !== -1) {
    notes[index] = note;
  } else {
    notes.unshift(note);
  }
  saveAllNotes(notes);
}

function deleteNote(id) {
  const notes = getAllNotes().filter(n => n.id !== id);
  saveAllNotes(notes);
}

// ─── Folders ─────────────────────────────────────────

function getAllFolders() {
  const raw = localStorage.getItem(KEYS.FOLDERS);
  return raw ? JSON.parse(raw) : [];
}

function saveAllFolders(folders) {
  localStorage.setItem(KEYS.FOLDERS, JSON.stringify(folders));
  if (window.scheduleBackup) window.scheduleBackup();
}

function saveFolder(folder) {
  const folders = getAllFolders();
  const index = folders.findIndex(f => f.id === folder.id);
  if (index !== -1) {
    folders[index] = folder;
  } else {
    folders.push(folder);
  }
  saveAllFolders(folders);
}

function deleteFolder(id) {
  const folders = getAllFolders().filter(f => f.id !== id);
  saveAllFolders(folders);
}

// ─── Helpers ─────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function exportAllData() {
  return {
    exportedAt: new Date().toISOString(),
    notes: getAllNotes(),
    folders: getAllFolders(),
  };
}
function importAllData(data) {
  if (data.notes) saveAllNotes(data.notes);
  if (data.folders) saveAllFolders(data.folders);
}

function clearAllData() {
  localStorage.removeItem(KEYS.NOTES);
  localStorage.removeItem(KEYS.FOLDERS);
}
// ─── Shared modal helpers ────────────────────────────
// Defined here (loaded first) so notes.js, folders.js, and app.js can all call it
// without depending on script load order.

function showDeleteConfirmModal(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'name-modal-overlay';
  overlay.innerHTML = `
    <div class="name-modal">
      <div class="name-modal-label">${message}</div>
      <div class="name-modal-actions">
        <button class="name-modal-cancel">Cancel</button>
        <button class="name-modal-confirm" style="background:#c0392b;">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  overlay.querySelector('.name-modal-cancel').addEventListener('click', close);
  overlay.querySelector('.name-modal-confirm').addEventListener('click', () => { onConfirm(); close(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}