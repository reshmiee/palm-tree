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