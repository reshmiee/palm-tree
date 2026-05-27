// app.js — initialize app, wire up all events

// ── Navigation history stack ──────────────────────────
// Each entry: { type: 'note', id } | { type: 'folder' }
const navHistory = [];
let navCursor = -1; // points to current position in navHistory
let navLock = false; // prevent pushNav during back/forward navigation

function pushNav(entry) {
  if (navLock) return;
  // Don't push duplicate of current
  const current = navHistory[navCursor];
  if (current && current.type === entry.type && current.id === entry.id) return;
  // Discard any forward history
  navHistory.splice(navCursor + 1);
  navHistory.push(entry);
  navCursor = navHistory.length - 1;
  updateNavBtns();
}

function updateNavBtns() {
  const backBtn = document.getElementById('back-btn');
  const fwdBtn = document.getElementById('forward-btn');
  if (backBtn) backBtn.disabled = navCursor <= 0;
  if (fwdBtn) fwdBtn.disabled = navCursor >= navHistory.length - 1;
}

function navigateTo(entry) {
  navLock = true;
  if (entry.type === 'folder') {
    const sidePanel = document.getElementById('folder-side-panel');
    if (sidePanel) sidePanel.remove();
    openFolderView();
  } else if (entry.type === 'note') {
    closeFolderView();
    openNote(entry.id);
  }
  navLock = false;
  updateNavBtns();
}

function goBack() {
  if (navCursor <= 0) return;
  navCursor--;
  navigateTo(navHistory[navCursor]);
}

function goForward() {
  if (navCursor >= navHistory.length - 1) return;
  navCursor++;
  navigateTo(navHistory[navCursor]);
}

document.addEventListener('DOMContentLoaded', () => {

  // ── Editor events ──────────────────────────────────

  const titleEl = document.getElementById('editor-title');
  const bodyEl = document.getElementById('editor-body');

  titleEl.addEventListener('input', () => {
    autoResizeTitle();
    scheduleAutoSave();
  });

  bodyEl.addEventListener('input', () => {
    scheduleAutoSave();
  });

    // ── Formatting toolbar (two-layer) ──────────────────────

  let trayOpen = false;

  function initFormatToolbar() {
    const toolbar = document.getElementById('format-toolbar');
    const tray = document.getElementById('fmt-tray');
    const aBtn = document.getElementById('fmt-a-btn');
    if (!toolbar || !tray || !aBtn) return;

    // A button toggles the tray
    aBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      trayOpen = !trayOpen;
      tray.classList.toggle('open', trayOpen);
      aBtn.setAttribute('aria-expanded', trayOpen ? 'true' : 'false');
    });

    // Bottom bar buttons (bullet / numbered list)
    toolbar.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.fmt-btn');
      if (!btn || btn === aBtn) return;
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      if (cmd) {
        document.execCommand(cmd, false, null);
        bodyEl.focus();
        updateToolbarState();
      }
    });

    // Tray buttons (B/I/U/S + headings)
    tray.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.fmt-btn');
      if (!btn) return;
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      const heading = btn.dataset.heading;
      if (cmd) {
        document.execCommand(cmd, false, null);
        bodyEl.focus();
        updateToolbarState();
      } else if (heading) {
        if (heading === 'p') {
          document.execCommand('formatBlock', false, 'p');
        } else {
          const tag = document.queryCommandValue('formatBlock').toLowerCase();
          if (tag === heading) {
            document.execCommand('formatBlock', false, 'p');
          } else {
            document.execCommand('formatBlock', false, heading);
          }
        }
        bodyEl.focus();
        updateToolbarState();
      }
    });
    document.addEventListener('selectionchange', updateToolbarState);
  }

  function updateToolbarState() {
    // Inline format buttons in tray
    document.querySelectorAll('.fmt-btn[data-cmd]').forEach(btn => {
      const cmd = btn.dataset.cmd;
      try {
        btn.classList.toggle('active', document.queryCommandState(cmd));
      } catch (e) {}
    });

    // Heading buttons in tray
    const currentBlock = document.queryCommandValue('formatBlock').toLowerCase();
    document.querySelectorAll('.fmt-btn[data-heading]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.heading === currentBlock);
    });

    // Link button — light up when cursor is inside a link
    const linkBtn = document.getElementById('fmt-link-btn');
    if (linkBtn) {
      const sel = window.getSelection();
      const insideLink = sel && sel.anchorNode && sel.anchorNode.parentElement.closest('a');
      linkBtn.classList.toggle('active', !!insideLink);
    }
  }

  initFormatToolbar();

  // ── Image insertion ──────────────────────────────────

  function initImageInsertion() {
    const imgBtn = document.getElementById('fmt-img-btn');
    const imgInput = document.getElementById('fmt-img-input');
    if (!imgBtn || !imgInput) return;

    imgBtn.addEventListener('click', () => {
      imgInput.value = '';
      imgInput.click();
    });

    imgInput.addEventListener('change', () => {
      const file = imgInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        insertImageAtCursor(e.target.result, file.type);
      };
      reader.readAsDataURL(file);
    });
  }

  function insertImageAtCursor(src, type) {
    bodyEl.focus();

    // Insert a newline block so image sits on its own line centered
    const wrapperId = 'imgw-' + Date.now();
    const html = `<div class="img-block"><span class="img-resize-wrapper" id="${wrapperId}" contenteditable="false">` +
      `<img src="${src}" style="width:320px;height:240px;" draggable="false" />` +
      `<span class="img-resize-handle" aria-hidden="true"></span>` +
      `<button class="img-delete-btn" aria-label="Delete image" title="Delete image" contenteditable="false">` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>` +
      `</button>` +
      `</span></div>`;

    document.execCommand('insertHTML', false, html);

    const wrapper = document.getElementById(wrapperId);
    if (wrapper) {
      wrapper.removeAttribute('id');
      initImageResize(wrapper);
    }

    scheduleAutoSave();
  }

  function initImageResize(wrapper) {
    const img = wrapper.querySelector('img');
    const handle = wrapper.querySelector('.img-resize-handle');
    const deleteBtn = wrapper.querySelector('.img-delete-btn');
    if (!img || !handle) return;

    // Delete button
    if (deleteBtn) {
      deleteBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Remove the whole .img-block if present, else just the wrapper
        const block = wrapper.closest('.img-block');
        (block || wrapper).remove();
        scheduleAutoSave();
      });
      deleteBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const block = wrapper.closest('.img-block');
        (block || wrapper).remove();
        scheduleAutoSave();
      });
    }

    let startX, startY, startW, startH;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startY = e.clientY;
      startW = img.offsetWidth;
      startH = img.offsetHeight;
      wrapper.classList.add('resizing');

      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newW = Math.max(40, startW + dx);
        const newH = Math.max(40, startH + dy);
        img.style.width = newW + 'px';
        img.style.height = newH + 'px';
        img.style.maxWidth = 'none';
      }

      function onUp() {
        wrapper.classList.remove('resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        scheduleAutoSave();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Touch support
    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startW = img.offsetWidth;
      startH = img.offsetHeight;
      wrapper.classList.add('resizing');

      function onMove(e) {
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        img.style.width = Math.max(40, startW + dx) + 'px';
        img.style.height = Math.max(40, startH + dy) + 'px';
        img.style.maxWidth = 'none';
      }

      function onEnd() {
        wrapper.classList.remove('resizing');
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        scheduleAutoSave();
      }

      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    }, { passive: false });
  }

  // Re-init resize handles on existing images when a note loads
  function initExistingImages() {
    bodyEl.querySelectorAll('.img-resize-wrapper').forEach(wrapper => {
      initImageResize(wrapper);
    });
  }

  initImageInsertion();

  // ── Link insertion ───────────────────────────────────

  function initLinkInsertion() {
    const linkBtn = document.getElementById('fmt-link-btn');
    const overlay = document.getElementById('link-modal-overlay');
    const urlInput = document.getElementById('link-modal-url');
    const cancelBtn = document.getElementById('link-modal-cancel');
    const confirmBtn = document.getElementById('link-modal-confirm');
    if (!linkBtn || !overlay) return;

    let savedRange = null;

    linkBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // Save current selection before modal opens
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
      urlInput.value = '';
      overlay.classList.remove('hidden');
      setTimeout(() => urlInput.focus(), 50);
    });

    function closeModal() {
      overlay.classList.add('hidden');
      savedRange = null;
    }

    function insertLink() {
      let url = urlInput.value.trim();
      if (!url) { closeModal(); return; }
      // Auto-prefix https if missing
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

      // Restore the saved selection
      if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }

      bodyEl.focus();

      const selectedText = savedRange ? savedRange.toString() : '';
      if (selectedText) {
        // Wrap selected text in a link
        document.execCommand('createLink', false, url);
        // Make it open in new tab
        const links = bodyEl.querySelectorAll('a[href="' + url + '"]');
        links.forEach(a => a.setAttribute('target', '_blank'));
      } else {
        // No selection — insert the URL as link text
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.textContent = url;
        document.execCommand('insertHTML', false, a.outerHTML);
      }

      closeModal();
      scheduleAutoSave();
    }

    confirmBtn.addEventListener('click', insertLink);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') insertLink();
      if (e.key === 'Escape') closeModal();
    });
  }

  initLinkInsertion();

  // ── Auto-linkify on paste and on spacebar/enter ──────

  function linkifyText(node) {
    // Walk text nodes inside editor and wrap bare URLs
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        // Skip if already inside an anchor
        if (n.parentElement.closest('a')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const toReplace = [];
    let n;
    while ((n = walker.nextNode())) {
      if (urlRegex.test(n.textContent)) toReplace.push(n);
      urlRegex.lastIndex = 0;
    }

    toReplace.forEach(textNode => {
      const frag = document.createDocumentFragment();
      let last = 0;
      let m;
      urlRegex.lastIndex = 0;
      const text = textNode.textContent;
      while ((m = urlRegex.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const a = document.createElement('a');
        a.href = m[0];
        a.target = '_blank';
        a.textContent = m[0];
        frag.appendChild(a);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  // Run on paste (after paste settles)
  bodyEl.addEventListener('paste', () => {
    setTimeout(() => {
      linkifyText(bodyEl);
      scheduleAutoSave();
    }, 0);
  });

  // Run on Space / Enter — catches URLs typed manually
  bodyEl.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      linkifyText(bodyEl);
    }
  });






  // ── Keyboard shortcuts for formatting ──────────────
  bodyEl.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); document.execCommand('bold', false, null); updateToolbarState(); }
      if (e.key === 'i') { e.preventDefault(); document.execCommand('italic', false, null); updateToolbarState(); }
      if (e.key === 'u') { e.preventDefault(); document.execCommand('underline', false, null); updateToolbarState(); }
      if (e.key === 's') { e.preventDefault(); document.execCommand('strikeThrough', false, null); updateToolbarState(); }
      if (e.key === 'k') {
        e.preventDefault();
        const linkBtn = document.getElementById('fmt-link-btn');
        if (linkBtn) linkBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
    }
  });

  // ── Show/hide toolbar based on editor focus ──────────
  function showToolbars(show) {
    const toolbar = document.getElementById('format-toolbar');
    const tray = document.getElementById('fmt-tray');
    if (!toolbar) return;
    toolbar.style.opacity = show ? '1' : '0';
    toolbar.style.pointerEvents = show ? 'auto' : 'none';
    if (!show && tray) {
      tray.classList.remove('open');
      trayOpen = false;
      const aBtn = document.getElementById('fmt-a-btn');
      if (aBtn) aBtn.setAttribute('aria-expanded', 'false');
    }
  }

  bodyEl.addEventListener('focus', () => showToolbars(true));
  bodyEl.addEventListener('blur', (e) => {
    // Don't hide if focus moved to the toolbar or tray itself
    setTimeout(() => {
      const active = document.activeElement;
      const toolbar = document.getElementById('format-toolbar');
      const tray = document.getElementById('fmt-tray');
      const modal = document.getElementById('link-modal-overlay');
      const imgInput = document.getElementById('fmt-img-input');
      if (
        (toolbar && toolbar.contains(active)) ||
        (tray && tray.contains(active)) ||
        (modal && !modal.classList.contains('hidden')) ||
        active === imgInput
      ) return;
      showToolbars(false);
    }, 150);
  });

  // Start hidden until editor is focused
  showToolbars(false);

  // ── New note button ────────────────────────────────

  document.getElementById('new-note-btn').addEventListener('click', () => {
    // Close folder side panel if open
    const sidePanel = document.getElementById('folder-side-panel');
    if (sidePanel) sidePanel.remove();

    // Close folder view overlay if open
    if (folderViewOpen) closeFolderView();

    const hasTitle = titleEl.value.trim().length > 0;
    const hasBody = bodyEl.value.trim().length > 0;

    if (!hasTitle && !hasBody) {
      showToast('Oops, write something first.', true);
      titleEl.focus();
      return;
    }

    persistCurrentNote();
    const note = createNewNote();
    activeNoteId = note.id;
    clearEditor();
    highlightActiveCard(note.id);
    renderRecentNotes();
    bodyEl.focus();
  });

  // ── Tabs ───────────────────────────────────────────

  const tabs = [
    { btn: 'tab-recent',  panel: 'panel-recent'  },
    { btn: 'tab-months',  panel: 'panel-months'  },
  ];

  tabs.forEach(({ btn, panel }) => {
    document.getElementById(btn).addEventListener('click', () => {
      tabs.forEach(t => {
        document.getElementById(t.btn).classList.remove('active');
        document.getElementById(t.panel).classList.add('hidden');
        document.getElementById(t.panel).classList.remove('active');
      });
      document.getElementById(btn).classList.add('active');
      document.getElementById(panel).classList.remove('hidden');
      document.getElementById(panel).classList.add('active');

      if (panel === 'panel-recent') renderRecentNotes();
      if (panel === 'panel-months') renderMonths();
    });
  });

  // ── Folder nav button ──────────────────────────────

  document.getElementById('folder-nav-btn').addEventListener('click', () => {
    const wasOpen = folderViewOpen;
    toggleFolderView();
    if (!wasOpen) pushNav({ type: 'folder' });
  });

  // ── Back / Forward buttons ──────────────────────────
  document.getElementById('back-btn').addEventListener('click', () => goBack());
  document.getElementById('forward-btn').addEventListener('click', () => goForward());

  // ── Menu dropdown ──────────────────────────────────

  const menuBtn = document.getElementById('menu-btn');
  const menuDropdown = document.getElementById('menu-dropdown');

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    menuDropdown.classList.add('hidden');
  });

  // ── Export ─────────────────────────────────────────

  document.getElementById('export-btn').addEventListener('click', () => {
    menuDropdown.classList.add('hidden');
    showPermissionModal('Export all notes and folders as JSON?', () => {
      exportJSON();
    });
  });

  // ── Import ─────────────────────────────────────────

  document.getElementById('import-btn').addEventListener('click', () => {
    menuDropdown.classList.add('hidden');
    showPermissionModal('Import JSON? This will merge with your existing notes.', () => {
      document.getElementById('import-file').click();
    });
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importJSON(file, () => {
      renderRecentNotes();
      loadOrCreateBlankNote();
    });
    e.target.value = '';
  });

  // ── Clear all ──────────────────────────────────────

  document.getElementById('clear-btn').addEventListener('click', () => {
    menuDropdown.classList.add('hidden');
    showPermissionModal('Delete all notes and folders? This cannot be undone.', () => {
      clearAllData();
      clearEditor();
      activeNoteId = null;
      renderRecentNotes();
      loadOrCreateBlankNote();
    });
  });

  // ── Init ───────────────────────────────────────────

  initSearch();
  initMultiSelect();
  renderRecentNotes();
  loadOrCreateBlankNote();
  bodyEl.focus();

  // Seed nav with initial note
  setTimeout(() => {
    if (activeNoteId) pushNav({ type: 'note', id: activeNoteId });
    updateNavBtns();
  }, 0);

});