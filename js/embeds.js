// embeds.js — draggable iframe/link-card overlay per note

(function () {

  // ── URL helpers ───────────────────────────────────────

  function getEmbedUrl(url) {
    // Google Docs / Sheets / Slides
    const gdoc = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/?#]+)/);
    if (gdoc) {
      const [, type, id] = gdoc;
      if (type === 'document')     return `https://docs.google.com/document/d/${id}/pub?embedded=true`;
      if (type === 'spreadsheets') return `https://docs.google.com/spreadsheets/d/${id}/pub?output=html&embedded=true`;
      if (type === 'presentation') return `https://docs.google.com/presentation/d/${id}/pub?start=false&loop=false&embedded=true`;
    }
    // YouTube — youtu.be/ID or youtube.com/watch?v=ID or youtube.com/shorts/ID
    const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    // Vimeo
    const vi = url.match(/vimeo\.com\/(\d+)/);
    if (vi) return `https://player.vimeo.com/video/${vi[1]}`;
    // Google Maps — embed URL requires ?pb= param from the share link;
    // only convert if it already has one, otherwise let the iframe try as-is
    if (/google\.[a-z.]+\/maps/.test(url) && url.includes('?pb=')) {
      return 'https://www.google.com/maps/embed?pb=' + url.split('?pb=')[1].split('&')[0];
    }
    return url;
  }

  function getHostname(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }

  // ── Card creation ─────────────────────────────────────

  function createEmbedCard(embed) {
    const { id, url, x, y } = embed;
    const embedUrl  = getEmbedUrl(url);
    const hostname  = getHostname(url);
    const faviconSrc = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=16`;
    const shortUrl  = url.length > 38 ? url.slice(0, 38) + '…' : url;

    const card = document.createElement('div');
    card.className      = 'embed-card';
    card.dataset.embedId  = id;
    card.dataset.embedUrl = url;
    card.style.left = x + 'px';
    card.style.top  = y + 'px';

    card.innerHTML = `
      <div class="embed-card-header">
        <span class="embed-card-grip">⠿</span>
        <img class="embed-card-favicon" src="${faviconSrc}" width="14" height="14" alt="" />
        <span class="embed-card-domain">${hostname}</span>
        <a class="embed-card-open" href="${url}" target="_blank" rel="noopener noreferrer" title="Open in new tab">↗</a>
        <button class="embed-card-remove" title="Remove">×</button>
      </div>
      <div class="embed-card-body">
        <iframe class="embed-card-iframe"
          src="${embedUrl}"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          loading="lazy"
          title="${hostname}"></iframe>
        <div class="embed-card-fallback hidden">
          <img class="embed-card-fallback-icon" src="${faviconSrc}" width="28" height="28" alt="" />
          <span class="embed-card-fallback-domain">${hostname}</span>
          <a class="embed-card-fallback-link" href="${url}" target="_blank" rel="noopener noreferrer">${shortUrl}</a>
        </div>
      </div>
    `;

    const iframe   = card.querySelector('.embed-card-iframe');
    const fallback = card.querySelector('.embed-card-fallback');

    function showFallback() {
      if (!fallback.classList.contains('hidden')) return;
      iframe.classList.add('hidden');
      fallback.classList.remove('hidden');
    }

    let iframeLoaded = false;

    // Detect X-Frame-Options block: browser loads about:blank when blocked
    iframe.addEventListener('load', () => {
      iframeLoaded = true;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc && doc.URL === 'about:blank') showFallback();
      } catch (e) {
        // SecurityError = cross-origin load succeeded — iframe is fine
      }
    });

    // Fallback if no load event fires within 5s (network block / CSP)
    setTimeout(() => { if (!iframeLoaded) showFallback(); }, 5000);

    card.querySelector('.embed-card-remove').addEventListener('click', () => {
      card.remove();
      saveEmbeds();
    });

    initCardDrag(card);
    return card;
  }

  // ── Drag ──────────────────────────────────────────────

  function initCardDrag(card) {
    const header = card.querySelector('.embed-card-header');

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.embed-card-open, .embed-card-remove')) return;
      e.preventDefault();
      e.stopPropagation();

      const startX  = e.clientX;
      const startY  = e.clientY;
      const origLeft = parseInt(card.style.left) || 0;
      const origTop  = parseInt(card.style.top)  || 0;
      card.classList.add('dragging');

      function onMove(e) {
        card.style.left = Math.max(0, origLeft + e.clientX - startX) + 'px';
        card.style.top  = Math.max(0, origTop  + e.clientY - startY) + 'px';
      }
      function onUp() {
        card.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        saveEmbeds();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Layer ─────────────────────────────────────────────

  let embedsLayer = null;

  function ensureLayer() {
    if (embedsLayer && document.getElementById('embeds-layer')) return embedsLayer;
    const editor = document.querySelector('.editor');
    if (!editor) return null;
    embedsLayer = document.createElement('div');
    embedsLayer.id = 'embeds-layer';
    editor.appendChild(embedsLayer);
    return embedsLayer;
  }

  // ── Public API ────────────────────────────────────────

  function loadNoteEmbeds(note) {
    const layer = ensureLayer();
    if (!layer) return;
    layer.innerHTML = '';
    if (!note || !Array.isArray(note.embeds)) return;
    note.embeds.forEach(embed => layer.appendChild(createEmbedCard(embed)));
  }

  function saveEmbeds() {
    if (typeof activeNoteId === 'undefined' || !activeNoteId) return;
    const note = getNoteById(activeNoteId);
    if (!note) return;
    const layer = document.getElementById('embeds-layer');
    note.embeds = layer
      ? Array.from(layer.querySelectorAll('.embed-card')).map(card => ({
          id:  card.dataset.embedId,
          url: card.dataset.embedUrl,
          x:   parseInt(card.style.left) || 0,
          y:   parseInt(card.style.top)  || 0,
        }))
      : [];
    note.updatedAt = new Date().toISOString();
    saveNote(note);
  }

  function insertEmbed(url) {
    const layer = ensureLayer();
    if (!layer) return;
    const editor = document.querySelector('.editor');
    const cx = editor ? Math.max(0, Math.floor((editor.clientWidth - 224) / 2)) : 80;
    const cy = editor ? editor.scrollTop + 120 : 120;
    const embed = { id: generateId(), url, x: cx, y: cy };
    layer.appendChild(createEmbedCard(embed));
    saveEmbeds();
  }

  window.loadNoteEmbeds = loadNoteEmbeds;
  window.saveEmbeds     = saveEmbeds;
  window.insertEmbed    = insertEmbed;

  document.addEventListener('DOMContentLoaded', ensureLayer);

})();
