// notes.js — create, save, auto-title, delete notes

let activeNoteId = null;
let saveTimer = null;

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
  saveNote(note);
  return note;
}

// ── Load into editor ─────────────────────────────────

function openNote(id) {
  const note = getNoteById(id);
  if (!note) return;

  activeNoteId = id;

  const titleEl = document.getElementById('editor-title');
  const bodyEl = document.getElementById('editor-body');

  titleEl.value = note.title;
  bodyEl.value = note.body;

  autoResizeTitle();
  highlightActiveCard(id);
}

// ── Auto save ────────────────────────────────────────

function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistCurrentNote();
  }, 600);
}

function persistCurrentNote() {
  if (!activeNoteId) return;

  const note = getNoteById(activeNoteId);
  if (!note) return;

  const titleEl = document.getElementById('editor-title');
  const bodyEl = document.getElementById('editor-body');

  note.title = titleEl.value.trim();
  note.body = bodyEl.value;

  // auto title from first line of body if title is empty
  if (!note.title && note.body.trim()) {
    const firstLine = note.body.trim().split('\n')[0];
    note.title = firstLine.slice(0, 60);
  }

  note.updatedAt = new Date().toISOString();
  saveNote(note);
  renderRecentNotes();
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
  document.getElementById('editor-body').value = '';
}

function autoResizeTitle() {
  const el = document.getElementById('editor-title');
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
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

  panel.innerHTML = notes.map(note => `
    <div class="note-card ${note.id === activeNoteId ? 'active' : ''}" data-id="${note.id}">
      <div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div>
      <div class="note-card-date">${formatDate(note.updatedAt)}</div>
    </div>
  `).join('');

  panel.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => openNote(card.dataset.id));
  });
}

// ── Load or create blank on app open ─────────────────

function loadOrCreateBlankNote() {
  const notes = getAllNotes();
  if (notes.length === 0) {
    const note = createNewNote();
    openNote(note.id);
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