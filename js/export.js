// export.js — JSON export, import, months view

// ── Per-note download (PDF / DOCX / TXT) ─────────────

function initDownloadButton() {
  const wrap = document.getElementById('download-wrap');
  const btn  = document.getElementById('download-btn');
  const drop = document.getElementById('download-dropdown');
  if (!btn || !drop) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !drop.classList.contains('hidden');
    drop.classList.toggle('hidden', open);
    btn.setAttribute('aria-expanded', String(!open));
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) {
      drop.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  document.getElementById('dl-pdf').addEventListener('click', () => {
    drop.classList.add('hidden');
    downloadNoteAs('pdf');
  });
  document.getElementById('dl-docx').addEventListener('click', () => {
    drop.classList.add('hidden');
    downloadNoteAs('docx');
  });
  document.getElementById('dl-txt').addEventListener('click', () => {
    drop.classList.add('hidden');
    downloadNoteAs('txt');
  });
}

function getNoteDownloadName() {
  const title = (document.getElementById('editor-title').value || 'note').trim();
  return title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'note';
}

function downloadNoteAs(format) {
  const title  = (document.getElementById('editor-title').value || 'Untitled').trim();
  const bodyEl = document.getElementById('editor-body');
  const html   = bodyEl ? bodyEl.innerHTML : '';
  const text   = bodyEl ? bodyEl.innerText : '';
  const name   = getNoteDownloadName();

  if (format === 'txt') {
    const content = title + '\n\n' + text;
    const blob = new Blob([content], { type: 'text/plain' });
    triggerDownload(blob, name + '.txt');

  } else if (format === 'pdf') {
    const win = window.open('', '_blank');
    if (!win) { showToast('Allow popups to download PDF', true); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: Georgia, serif; max-width: 680px; margin: 40px auto; padding: 0 24px; color: #111; font-size: 15px; line-height: 1.7; }
        h1.note-title { font-size: 26px; font-weight: 700; margin: 0 0 24px; }
      </style>
    </head><body>
      <h1 class="note-title">${escapeHtml(title)}</h1>
      ${html}
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);

  } else if (format === 'docx') {
    // Build a minimal .docx (Word XML) without external libs
    const bodyLines = text.split('\n');
    const paras = bodyLines.map(line => {
      const safe = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<w:p><w:r><w:t xml:space="preserve">${safe}</w:t></w:r></w:p>`;
    }).join('\n');

    const titleSafe = title
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>${titleSafe}</w:t></w:r>
    </w:p>
    ${paras}
    <w:sectPr/>
  </w:body>
</w:document>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:rPr><w:b/><w:sz w:val="52"/></w:rPr>
  </w:style>
</w:styles>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    // Use JSZip if available, else fall back to a simple XML-only .docx
    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();
      zip.file('[Content_Types].xml', contentTypesXml);
      zip.file('_rels/.rels', rootRelsXml);
      zip.file('word/document.xml', documentXml);
      zip.file('word/styles.xml', stylesXml);
      zip.file('word/_rels/document.xml.rels', relsXml);
      zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
        .then(blob => triggerDownload(blob, name + '.docx'));
    } else {
      // Load JSZip dynamically then retry
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => downloadNoteAs('docx');
      script.onerror = () => showToast('Could not load DOCX library', true);
      document.head.appendChild(script);
    }
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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