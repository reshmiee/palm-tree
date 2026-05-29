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
    renderSearchResults([], '');   // show the "start typing" prompt, never blank
    input.focus();
  }

  function closeOverlay() {
    overlay.classList.add('hidden');
    input.value = '';
    searchQuery = '';
    renderSearchResults([], '');
  }

  // Show the platform-correct shortcut hint (⌘K on Mac, Ctrl K elsewhere)
  const kbdHint = document.getElementById('search-trigger-kbd');
  if (kbdHint && /Mac|iPhone|iPad/.test(navigator.platform)) kbdHint.textContent = '⌘ K';

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

  // Ctrl+K / ⌘K — open (or close, if already open) the search palette.
  // Shift is excluded so Ctrl+Shift+K stays free for "insert link".
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (overlay.classList.contains('hidden')) {
        openOverlay();
      } else {
        closeOverlay();
      }
    }
  });
}

// ── Run search ───────────────────────────────────────

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function runSearch(query) {
  const results = getAllNotes().filter(note => {
    const inTitle = (note.title || '').toLowerCase().includes(query);
    const inBody  = stripHtml(note.body || '').toLowerCase().includes(query);
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
  const plain = stripHtml(body);
  const lower = plain.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return '';
  const start = Math.max(0, idx - 30);
  const end = Math.min(plain.length, idx + query.length + 60);
  let snippet = plain.slice(start, end).replace(/\n/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < plain.length) snippet = snippet + '...';
  return snippet;
}

function highlight(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}