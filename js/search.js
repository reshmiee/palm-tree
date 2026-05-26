// search.js — live search across all notes

let searchQuery = '';

// ── Init ─────────────────────────────────────────────

function initSearch() {
  const input = document.getElementById('search-input');

  input.addEventListener('input', () => {
    searchQuery = input.value.trim().toLowerCase();
    if (searchQuery === '') {
      clearSearch();
    } else {
      runSearch(searchQuery);
    }
  });

  // clear search on escape
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      searchQuery = '';
      clearSearch();
      input.blur();
    }
  });
}

// ── Run search ───────────────────────────────────────

function runSearch(query) {
  const allNotes = getAllNotes();

  const results = allNotes.filter(note => {
    const inTitle = (note.title || '').toLowerCase().includes(query);
    const inBody  = (note.body  || '').toLowerCase().includes(query);
    return inTitle || inBody;
  });

  renderSearchResults(results, query);
  showSearchState();
}

// ── Render results ───────────────────────────────────

function renderSearchResults(notes, query) {
  const panel = document.getElementById('panel-search');

  if (notes.length === 0) {
    panel.innerHTML = `
      <div class="empty-state">
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
      highlightActiveCard(card.dataset.id);
    });
  });
}

// ── Show/hide search state ────────────────────────────

function showSearchState() {
  // hide all tab panels, show search panel
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('panel-search').classList.remove('hidden');
  // dim tab buttons
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
}

function clearSearch() {
  // restore active tab panel
  document.getElementById('panel-search').classList.add('hidden');
  const activeTab = document.querySelector('.tab-btn.active');
  if (activeTab) {
    const panelId = 'panel-' + activeTab.id.replace('tab-', '');
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.remove('hidden');
  } else {
    // fallback to recent
    document.getElementById('tab-recent').classList.add('active');
    document.getElementById('panel-recent').classList.remove('hidden');
  }
  renderRecentNotes();
}

// ── Helpers ──────────────────────────────────────────

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