// export.js — JSON export, import, months view

// ── Export ───────────────────────────────────────────

function exportJSON() {
  const data = exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `palmtree-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Exported ${data.notes.length} note${data.notes.length !== 1 ? 's' : ''}`);
}

// ── Import ───────────────────────────────────────────

function importJSON(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (!data.notes && !data.folders) {
        showToast('Invalid Palm Tree backup file.', true);
        return;
      }

      const noteCount = (data.notes || []).length;
      importAllData(data);
      if (callback) callback();
      showToast(`Imported ${noteCount} note${noteCount !== 1 ? 's' : ''}`);
    } catch {
      showToast('Could not read file. Is it valid JSON?', true);
    }
  };
  reader.readAsText(file);
}

// ── Months view ──────────────────────────────────────

function renderMonths() {
  const panel = document.getElementById('panel-months');
  const notes = getAllNotes();

  if (notes.length === 0) {
    panel.innerHTML = '<div class="empty-state">No notes yet.</div>';
    return;
  }

  // group by month of original creation, newest first
  const grouped = {};
  notes
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach(note => {
      const date = new Date(note.createdAt);
      const key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(note);
    });

  panel.innerHTML = Object.entries(grouped).map(([month, notes]) => `
    <div class="month-group">
      <div class="month-label">${month} <span class="month-count">${notes.length}</span></div>
      ${notes.map(note => `
        <div class="note-card ${note.id === activeNoteId ? 'active' : ''}" data-id="${note.id}">
          <div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div>
          <div class="note-card-date">${formatDate(note.createdAt)}</div>
        </div>
      `).join('')}
    </div>
  `).join('');

  panel.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => openNote(card.dataset.id));
  });
}

// ── Toast notifications ──────────────────────────────

function showToast(message, isError = false) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast' + (isError ? ' toast-error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);

  // trigger animation
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}