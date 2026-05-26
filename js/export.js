// export.js — placeholder for level 7

function exportJSON() {
  const data = exportAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `palmtree-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      importAllData(data);
      if (callback) callback();
    } catch {
      alert('Invalid JSON file.');
    }
  };
  reader.readAsText(file);
}

function renderMonths() {
  const panel = document.getElementById('panel-months');
  const notes = getAllNotes();

  if (notes.length === 0) {
    panel.innerHTML = `<div class="empty-state">No notes yet.</div>`;
    return;
  }

  const grouped = {};
  notes.forEach(note => {
    const date = new Date(note.createdAt);
    const key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(note);
  });

  panel.innerHTML = Object.entries(grouped).map(([month, notes]) => `
    <div class="month-group">
      <div class="month-label">${month}</div>
      ${notes.map(note => `
        <div class="note-card" data-id="${note.id}">
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