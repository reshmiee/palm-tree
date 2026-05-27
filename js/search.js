// search.js — full-screen search overlay

let searchQuery = '';

// ── Init ─────────────────────────────────────────────

function initSearch() {
  const trigger   = document.getElementById('search-trigger');
  const overlay   = document.getElementById('search-overlay');
  const input     = document.getElementById('search-input');
  const closeBtn  = document.getElementById('search-close-btn');

  function openOverlay() {
    overlay.classList.remove('hidden');
    input.focus();
  }

  function closeOverlay() {
    overlay.classList.add('hidden');
    input.value = '';
    searchQuery = '';
    renderSearchResults([], '');
  }

  trigger.addEventListener('click', openOverlay);
  closeBtn.addEventListener('click', closeOverlay);

  input.addEventListener('input', () => {
    searchQuery = input.value.trim().toLowerCase();
    if (searchQuery === '') {
      renderSearchResults([], '');
    } else {
      runSearch(searchQuery);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlay();
  });

  // click outside the bar to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });
}

// ── Run search ───────────────────────────────────────

function runSearch(query) {
  const results = getAllNotes().filter(note => {
    const inTitle = (note.title || '').toLowerCase().includes(query);
    const inBody  = (note.body  || '').toLowerCase().includes(query);
    return inTitle || inBody;
  });
  renderSearchResults(results, query);
}

// ── Render results ───────────────────────────────────

function renderSearchResults(notes, query) {
  const panel = document.getElementById('panel-search');

  if (!query) {
    panel.innerHTML = `<div class="empty-state" style="margin-top:40px;">Start typing to search your notes.</div>`;
    return;
  }

  if (notes.length === 0) {
    panel.innerHTML = `
      <div class="empty-state" style="margin-top:40px;">
        No notes found for<br>
        <span style="color: var(--black); font-weight: 600;">"${escapeHtml(query)}"</span>
      </div>`;
    return;
  }

  panel.innerHTML = notes.map(note => {
    const snippet = getSnippet(note.body, query);
    return `
      <div class="note-card ${note.id === activeNoteId ? 'active' : ''}" data-id="${note.id}">
        <div class="note-card-title">${highlight(escapeHtml(note.title || 'Untitled'), query)}</div>
        ${snippet ? `<div class="note-card-snippet">${highlight(escapeHtml(snippet), query)}</div>` : ''}
        <div class="note-card-date">${formatDate(note.updatedAt)}</div>
      </div>
    `;
  }).join('');

  panel.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      openNote(card.dataset.id);
      document.getElementById('search-overlay').classList.add('hidden');
      document.getElementById('search-input').value = '';
      searchQuery = '';
    });
  });
}

// ── Helpers ──────────────────────────────────────────

function showSearchState() {}  // no-op: overlay handles its own visibility
function clearSearch() {}      // no-op: kept for compatibility

function getSnippet(body, query) {
  if (!body) return '';
  const lower = body.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return '';
  const start = Math.max(0, idx - 30);
  const end = Math.min(body.length, idx + query.length + 60);
  let snippet = body.slice(start, end).replace(/\n/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < body.length) snippet = snippet + '...';
  return snippet;
}

function highlight(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}