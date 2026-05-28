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

  // ── Font size state ──────────────────────────────────
  let currentFontSize = 16;
  const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64];

  function applyFontSize(px) {
    currentFontSize = px;
    const label = document.getElementById('fmt-fontsize-label');
    if (label) label.textContent = px;
    // Use a span with inline style — execCommand fontSize only supports 1-7
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      // No selection — set a data attr so next typed chars get the size
      bodyEl.dataset.nextFontSize = px;
      return;
    }
    const span = document.createElement('span');
    span.style.fontSize = px + 'px';
    try {
      range.surroundContents(span);
    } catch (e) {
      // surroundContents fails on partial selections — use execCommand fallback
      document.execCommand('fontSize', false, '7');
      bodyEl.querySelectorAll('font[size="7"]').forEach(el => {
        el.style.fontSize = px + 'px';
        el.removeAttribute('size');
        el.outerHTML = el.outerHTML.replace(/^<font/, '<span').replace(/font>$/, 'span>');
      });
    }
    scheduleAutoSave();
  }

  function detectFontSize() {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;
    const node = sel.anchorNode.nodeType === Node.TEXT_NODE
      ? sel.anchorNode.parentElement
      : sel.anchorNode;
    if (!node) return;
    const computed = window.getComputedStyle(node).fontSize;
    if (computed) {
      const px = Math.round(parseFloat(computed));
      currentFontSize = px;
      const label = document.getElementById('fmt-fontsize-label');
      if (label) label.textContent = px;
    }
  }

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

    // Bottom bar buttons (bullet / numbered list / indent / outdent)
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

    // Tray buttons (B/I/U + headings + alignment)
    tray.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.fmt-btn');
      if (!btn) return;
      // Don't intercept font size buttons here — handled below
      if (btn.id === 'fmt-fontsize-dec' || btn.id === 'fmt-fontsize-inc') return;
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

    // Font size buttons
    const decBtn = document.getElementById('fmt-fontsize-dec');
    const incBtn = document.getElementById('fmt-fontsize-inc');
    if (decBtn) {
      decBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idx = FONT_SIZES.indexOf(currentFontSize);
        const next = idx > 0 ? FONT_SIZES[idx - 1] : FONT_SIZES[0];
        applyFontSize(next);
        bodyEl.focus();
      });
    }
    if (incBtn) {
      incBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idx = FONT_SIZES.indexOf(currentFontSize);
        const next = idx < FONT_SIZES.length - 1 ? FONT_SIZES[idx + 1] : FONT_SIZES[FONT_SIZES.length - 1];
        applyFontSize(next);
        bodyEl.focus();
      });
    }

    document.addEventListener('selectionchange', () => {
      updateToolbarState();
      detectFontSize();
    });
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
  initFontFamilyPicker();
  initTableInsertion();

  // ── Font Family Picker ─────────────────────────────────

  function initFontFamilyPicker() {
    const select = document.getElementById('fmt-fontfamily-select');
    if (!select) return;

    select.addEventListener('change', () => {
      const val = select.value;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) {
        bodyEl.dataset.nextFontFamily = val;
        bodyEl.focus();
        return;
      }
      const span = document.createElement('span');
      span.style.fontFamily = val || 'inherit';
      try {
        range.surroundContents(span);
      } catch(e) {
        document.execCommand('insertHTML', false,
          `<span style="font-family:${val || 'inherit'}">${range.toString()}</span>`);
      }
      bodyEl.focus();
      scheduleAutoSave();
    });

    // Detect font family at cursor
    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode) return;
      const node = sel.anchorNode.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement
        : sel.anchorNode;
      if (!node) return;
      const ff = window.getComputedStyle(node).fontFamily;
      // Try to find a matching option
      const opts = Array.from(select.options);
      const match = opts.find(o => o.value && ff.toLowerCase().includes(
        o.value.toLowerCase().replace(/'/g,'').split(',')[0].trim()
      ));
      select.value = match ? match.value : '';
    });
  }

  // ── Table Insertion ──────────────────────────────────

  function initTableInsertion() {
    const tableBtn = document.getElementById('fmt-table-btn');
    const overlay = document.getElementById('table-picker-overlay');
    const picker = document.getElementById('table-picker');
    const grid = document.getElementById('table-picker-grid');
    const label = document.getElementById('table-picker-label');
    if (!tableBtn || !overlay || !picker || !grid) return;

    const COLS = 8, ROWS = 8;
    let cells = [];
    let hoverCol = 0, hoverRow = 0;
    let savedRange = null;

    // Build grid cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'table-picker-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        grid.appendChild(cell);
        cells.push(cell);
      }
    }

    function updateHighlight(row, col) {
      hoverRow = row;
      hoverCol = col;
      cells.forEach(cell => {
        const r = +cell.dataset.row;
        const c = +cell.dataset.col;
        cell.classList.toggle('hovered', r <= row && c <= col);
      });
      label.textContent = `${col + 1} × ${row + 1} table`;
    }

    function clearHighlight() {
      cells.forEach(c => c.classList.remove('hovered', 'selected'));
      label.textContent = 'Insert table';
    }

    grid.addEventListener('mousemove', (e) => {
      const cell = e.target.closest('.table-picker-cell');
      if (!cell) return;
      updateHighlight(+cell.dataset.row, +cell.dataset.col);
    });

    grid.addEventListener('mouseleave', () => {
      clearHighlight();
    });

    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.table-picker-cell');
      if (!cell) return;
      insertTable(+cell.dataset.row + 1, +cell.dataset.col + 1);
      closePicker();
    });

    function openPicker() {
      // Save selection
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();

      const rect = tableBtn.getBoundingClientRect();
      overlay.classList.remove('hidden');
      // Position picker above toolbar
      const pickerH = ROWS * 24 + 40;
      const pickerW = COLS * 24 + 20;
      let top = rect.top - pickerH - 8;
      let left = rect.left;
      if (top < 8) top = rect.bottom + 8;
      if (left + pickerW > window.innerWidth - 8) left = window.innerWidth - pickerW - 8;
      picker.style.top = top + 'px';
      picker.style.left = left + 'px';
    }

    function closePicker() {
      overlay.classList.add('hidden');
      clearHighlight();
      savedRange = null;
    }

    tableBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (overlay.classList.contains('hidden')) {
        openPicker();
      } else {
        closePicker();
      }
    });

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) closePicker();
    });

    function insertTable(rows, cols) {
      // Restore selection
      if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      const activeEl = getActiveEditableEl();
      if (activeEl) activeEl.focus();

      let html = '<table><thead><tr>';
      for (let c = 0; c < cols; c++) {
        html += '<th><p><br></p></th>';
      }
      html += '</tr></thead><tbody>';
      for (let r = 1; r < rows; r++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
          html += '<td><p><br></p></td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table><p><br></p>';
      document.execCommand('insertHTML', false, html);
      scheduleAutoSave();
    }
  }

  // Helper: return the active contenteditable element (scroll editor or page content)
  function getActiveEditableEl() {
    const active = document.activeElement;
    if (active && active.isContentEditable) return active;
    const editor = document.querySelector('.editor');
    if (editor && editor.classList.contains('page-view')) {
      const pages = document.querySelectorAll('.page-content');
      return pages[pages.length - 1] || null;
    }
    return document.getElementById('editor-body');
  }

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

  // ── Code block insertion ──────────────────────────────
  function initCodeBlock() {
    const codeBtn = document.getElementById('fmt-code-btn');
    if (!codeBtn) return;

    codeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      bodyEl.focus();

      const sel = window.getSelection();
      const selectedText = sel ? sel.toString() : '';
      const anchor = sel && sel.anchorNode;
      const existingBlock = anchor && anchor.parentElement && anchor.parentElement.closest('.code-block-wrapper');

      if (existingBlock) {
        const p = document.createElement('p');
        const cmEl = existingBlock.querySelector('.CodeMirror');
        p.textContent = cmEl && cmEl.CodeMirror ? cmEl.CodeMirror.getValue() : '';
        existingBlock.replaceWith(p);
        codeBtn.classList.remove('active');
      } else {
        insertCodeBlock(selectedText);
        codeBtn.classList.add('active');
      }
      scheduleAutoSave();
    });

    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      const anchor = sel && sel.anchorNode;
      const inside = anchor && anchor.parentElement && anchor.parentElement.closest('.code-block-wrapper');
      codeBtn.classList.toggle('active', !!inside);
    });
  }

  function insertCodeBlock(initialCode = '') {
    const LANGUAGES = [
      { value: 'plaintext',   label: 'Plain Text',  mode: null },
      { value: 'javascript',  label: 'JavaScript',  mode: 'javascript' },
      { value: 'typescript',  label: 'TypeScript',  mode: { name: 'javascript', typescript: true } },
      { value: 'python',      label: 'Python',      mode: 'python' },
      { value: 'html',        label: 'HTML',        mode: 'htmlmixed' },
      { value: 'css',         label: 'CSS',         mode: 'css' },
      { value: 'java',        label: 'Java',        mode: 'text/x-java' },
      { value: 'cpp',         label: 'C++',         mode: 'text/x-c++src' },
      { value: 'c',           label: 'C',           mode: 'text/x-csrc' },
      { value: 'csharp',      label: 'C#',          mode: 'text/x-csharp' },
      { value: 'php',         label: 'PHP',         mode: 'php' },
      { value: 'ruby',        label: 'Ruby',        mode: 'ruby' },
      { value: 'go',          label: 'Go',          mode: 'go' },
      { value: 'rust',        label: 'Rust',        mode: 'rust' },
      { value: 'swift',       label: 'Swift',       mode: 'swift' },
      { value: 'kotlin',      label: 'Kotlin',      mode: 'text/x-kotlin' },
      { value: 'sql',         label: 'SQL',         mode: 'sql' },
      { value: 'bash',        label: 'Bash',        mode: 'shell' },
      { value: 'yaml',        label: 'YAML',        mode: 'yaml' },
      { value: 'xml',         label: 'XML',         mode: 'xml' },
      { value: 'markdown',    label: 'Markdown',    mode: 'markdown' },
    ];

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    wrapper.contentEditable = 'false';

    // Header
    const header = document.createElement('div');
    header.className = 'code-block-header';

    const dots = document.createElement('div');
    dots.className = 'code-block-dots';
    dots.innerHTML = `<span></span><span></span><span></span>`;

    const select = document.createElement('select');
    select.className = 'code-block-lang-select';
    LANGUAGES.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    });

    header.appendChild(dots);
    header.appendChild(select);
    wrapper.appendChild(header);

    // CodeMirror container
    const cmContainer = document.createElement('div');
    cmContainer.className = 'code-block-cm';
    wrapper.appendChild(cmContainer);

    // Insert into editor
    const range = window.getSelection().getRangeAt(0);
    range.deleteContents();
    range.insertNode(wrapper);
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    wrapper.after(p);

    // Init CodeMirror
    const cm = CodeMirror(cmContainer, {
      value: initialCode,
      mode: null,
      theme: 'default',
      lineNumbers: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      lineWrapping: false,
      extraKeys: { Tab: (cm) => cm.execCommand('indentMore') },
      lint: false,
    });

    cm.on('change', () => {
      scheduleAutoSave();
      runLint();
    });

    function universalLint(code) {
      const errors = [];
      const stack = [];
      const pairs = { ')': '(', '}': '{', ']': '[' };
      const openers = new Set(['(', '{', '[']);
      const closers = new Set([')', '}', ']']);
      let inString = null;
      let escaped = false;
      let line = 0, col = 0;

      for (let i = 0; i < code.length; i++) {
        const ch = code[i];

        if (ch === '\n') { line++; col = 0; continue; }
        col++;

        if (escaped) { escaped = false; continue; }
        if (ch === '\\' && inString) { escaped = true; continue; }

        if (inString) {
          if (ch === inString) inString = null;
          continue;
        }

        if (ch === '"' || ch === "'" || ch === '`') {
          inString = ch;
          continue;
        }

        if (openers.has(ch)) {
          stack.push({ ch, line, col });
        } else if (closers.has(ch)) {
          if (stack.length === 0) {
            errors.push({ message: `Unexpected '${ch}' — no matching opening bracket`, severity: 'error', from: { line, ch: col - 1 }, to: { line, ch: col } });
          } else {
            const top = stack[stack.length - 1];
            if (top.ch !== pairs[ch]) {
              errors.push({ message: `Mismatched bracket: expected closing for '${top.ch}' but got '${ch}'`, severity: 'error', from: { line, ch: col - 1 }, to: { line, ch: col } });
              stack.pop();
            } else {
              stack.pop();
            }
          }
        }
      }

      // Unclosed strings
      if (inString) {
        errors.push({ message: `Unclosed string — missing closing ${inString}`, severity: 'error', from: { line, ch: col }, to: { line, ch: col + 1 } });
      }

      // Unclosed brackets
      stack.forEach(({ ch, line, col }) => {
        errors.push({ message: `Unclosed '${ch}' — missing closing bracket`, severity: 'error', from: { line, ch: col - 1 }, to: { line, ch: col } });
      });

      return errors;
    }

    function runLint() {
      // Clear existing marks
      cm.getAllMarks().forEach(m => m.clear());
      const langVal = select.value;
      const code = cm.getValue();

      if (langVal === 'javascript') {
        // Real JSHint linting
        if (typeof JSHINT !== 'undefined') {
          JSHINT(code, { esversion: 11, undef: false, unused: false });
          (JSHINT.errors || []).forEach(err => {
            if (!err) return;
            const line = (err.line || 1) - 1;
            const col = (err.character || 1) - 1;
            cm.markText({ line, ch: col }, { line, ch: col + 10 }, {
              className: 'cm-lint-error',
              title: err.reason
            });
          });
        }
      }

      // Universal bracket/string checks for all languages
      universalLint(code).forEach(err => {
        cm.markText(err.from, err.to, {
          className: 'cm-lint-error',
          title: err.message
        });
      });
    }

    function applyLanguage(langVal) {
      const lang = LANGUAGES.find(l => l.value === langVal);
      if (!lang) return;
      cm.setOption('mode', lang.mode);
      cm.setOption('gutters', []);
      cm.setOption('lint', false);
      cm.refresh();
      runLint();
    }

    select.addEventListener('change', () => applyLanguage(select.value));
    select.addEventListener('mousedown', (e) => e.stopPropagation());
    select.addEventListener('click', (e) => e.stopPropagation());
    select.addEventListener('pointerdown', (e) => e.stopPropagation());

    setTimeout(() => { cm.refresh(); cm.focus(); }, 50);
  }

  initCodeBlock();

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

  // ── Toolbar always visible ──────────────────────────
  const _toolbar = document.getElementById('format-toolbar');
  if (_toolbar) {
    _toolbar.style.opacity = '1';
    _toolbar.style.pointerEvents = 'auto';
  }

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

// ── View Toggle (scroll vs pages) ──────────────────────────────────────────

(function () {
  const scrollBtn      = document.getElementById('view-scroll-btn');
  const pagesBtn       = document.getElementById('view-pages-btn');
  const editor         = document.querySelector('.editor');
  const pagesContainer = document.getElementById('pages-container');
  const sideBtns       = document.getElementById('page-side-btns');
  const addPageBtn     = document.getElementById('add-page-btn');
  const delPageBtn     = document.getElementById('del-page-btn');
  const formatToolbar  = document.getElementById('format-toolbar');
  const fmtTray        = document.getElementById('fmt-tray');

  let pages      = [];
  let activePage = null;
  let pagesSaveTimer = null;

  // ── Page dimensions (stored on container dataset) ──
  function getPageDims() {
    return {
      w: parseFloat(pagesContainer.dataset.pageW) || 210,
      h: parseFloat(pagesContainer.dataset.pageH) || 297,
      m: parseFloat(pagesContainer.dataset.pageM) || 20,
    };
  }

  // ── Serialise all pages into the note's body field ──
  // We store pages as a JSON blob wrapped in a sentinel comment so the
  // scroll view doesn't try to render it as rich text.
  function serialisePages() {
    return pages.map(p => {
      const content = p.querySelector('.page-content');
      const header = p.querySelector('.page-header-editable');
      const footer = p.querySelector('.page-footer-editable');
      return {
        body: content ? content.innerHTML : '',
        header: header ? header.innerHTML : '',
        footer: footer ? footer.innerHTML : '',
      };
    });
  }

  function savePageContent() {
    if (!activeNoteId) return;
    const note = getNoteById(activeNoteId);
    if (!note) return;
    const pageData = serialisePages();
    const data = { __palmtree_pages__: true, pages: pageData.map(p => typeof p === 'string' ? p : p.body), headers: pageData.map(p => typeof p === 'string' ? '' : p.header), footers: pageData.map(p => typeof p === 'string' ? '' : p.footer), dims: getPageDims() };
    note.body = '<!--PAGES:' + JSON.stringify(data) + '-->';
    note.updatedAt = new Date().toISOString();
    saveNote(note);
    renderRecentNotes();
    showUnsavedDot(false);
  }

  function schedulePageSave() {
    showUnsavedDot(true);
    clearTimeout(pagesSaveTimer);
    pagesSaveTimer = setTimeout(savePageContent, 600);
  }

  // ── Try to parse a page-view body string ──
  function parsePageBody(body) {
    if (!body) return null;
    const match = body.match(/^<!--PAGES:([\s\S]+)-->$/);
    if (!match) return null;
    try { return JSON.parse(match[1]); } catch (e) { return null; }
  }

  // ── Overflow detection: split overflowing content into next page ──
  function checkOverflow() {
    for (let i = 0; i < pages.length; i++) {
      const sheet = pages[i];
      const content = sheet.querySelector('.page-content');
      if (!content) continue;

      const dims = getPageDims();
      // usable height in px: page height minus top+bottom margins
      const pxPerMm = 96 / 25.4;
      const pageHeightPx = dims.h * pxPerMm;
      const marginPx = dims.m * pxPerMm;
      const usableH = pageHeightPx - marginPx * 2;

      if (content.scrollHeight <= usableH + 4) continue;

      // Find the last child node that still fits
      const children = Array.from(content.childNodes);
      let splitIdx = children.length;
      let cumH = 0;

      for (let j = 0; j < children.length; j++) {
        const child = children[j];
        const childH = child.nodeType === Node.ELEMENT_NODE
          ? child.offsetHeight
          : (child.textContent.trim() ? 20 : 0);
        if (cumH + childH > usableH) { splitIdx = j; break; }
        cumH += childH;
      }

      if (splitIdx >= children.length) continue; // nothing to move

      // Collect nodes to move
      const overflow = document.createDocumentFragment();
      for (let j = splitIdx; j < children.length; j++) {
        overflow.appendChild(children[j].cloneNode(true));
      }
      for (let j = children.length - 1; j >= splitIdx; j--) {
        content.removeChild(children[j]);
      }

      // Insert a new page after this one, or reuse existing next page
      let nextPage = pages[i + 1];
      if (!nextPage) {
        nextPage = createPage('', i + 1);
      }
      const nextContent = nextPage.querySelector('.page-content');
      if (nextContent) {
        nextContent.insertBefore(overflow, nextContent.firstChild);
      }
    }
    updatePageNumbers();
    schedulePageSave();
  }

  // ── Create a single page sheet ──
  function createPage(content = '', insertAfterIdx = null, headerHtml = '', footerHtml = '') {
    const dims = getPageDims();
    const sheet = document.createElement('div');
    sheet.className = 'page-sheet';

    // ── Header zone ──
    const headerZone = document.createElement('div');
    headerZone.className = 'page-header-zone';
    headerZone.style.paddingLeft = dims.m + 'mm';
    headerZone.style.paddingRight = dims.m + 'mm';
    const headerEditable = document.createElement('div');
    headerEditable.className = 'page-header-editable';
    headerEditable.setAttribute('contenteditable', 'true');
    headerEditable.spellcheck = false;
    headerEditable.dataset.placeholder = 'Header';
    headerEditable.innerHTML = headerHtml;
    headerEditable.addEventListener('input', () => schedulePageSave());
    headerZone.appendChild(headerEditable);

    // ── Body ──
    const body = document.createElement('div');
    body.className = 'page-content';
    body.setAttribute('contenteditable', 'true');
    body.spellcheck = true;
    body.style.padding = dims.m + 'mm';
    body.style.paddingTop = '12px';
    body.style.paddingBottom = '12px';
    body.innerHTML = content;

    // ── Footer zone ──
    const footerZone = document.createElement('div');
    footerZone.className = 'page-footer-zone';
    footerZone.style.paddingLeft = dims.m + 'mm';
    footerZone.style.paddingRight = dims.m + 'mm';
    const footerLeft = document.createElement('div');
    footerLeft.className = 'page-footer-left';
    const footerEditable = document.createElement('div');
    footerEditable.className = 'page-footer-editable';
    footerEditable.setAttribute('contenteditable', 'true');
    footerEditable.spellcheck = false;
    footerEditable.dataset.placeholder = 'Footer';
    footerEditable.innerHTML = footerHtml;
    footerEditable.addEventListener('input', () => schedulePageSave());
    footerLeft.appendChild(footerEditable);
    const footerRight = document.createElement('div');
    footerRight.className = 'page-footer-right page-number';
    footerZone.appendChild(footerLeft);
    footerZone.appendChild(footerRight);

    sheet.appendChild(headerZone);
    sheet.appendChild(body);
    sheet.appendChild(footerZone);

    // Click on sheet margins focuses the body
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) body.focus();
      activePage = sheet;
    });
    body.addEventListener('focus', () => { activePage = sheet; });

    // Save + overflow check on input
    body.addEventListener('input', () => {
      schedulePageSave();
      clearTimeout(body._overflowTimer);
      body._overflowTimer = setTimeout(checkOverflow, 400);
    });

    // Keyboard: pressing Enter at end of last page creates a new page
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const idx = pages.indexOf(sheet);
        if (idx === pages.length - 1) {
          const sel = window.getSelection();
          if (sel && sel.anchorNode) {
            const range = sel.getRangeAt(0);
            const tempRange = document.createRange();
            tempRange.selectNodeContents(body);
            tempRange.setStart(range.endContainer, range.endOffset);
            if (tempRange.toString().trim() === '') {
              // cursor is at/near end — let overflow handling create the page naturally
            }
          }
        }
      }
    });

    if (insertAfterIdx !== null && insertAfterIdx < pages.length) {
      const refPage = pages[insertAfterIdx];
      pagesContainer.insertBefore(sheet, refPage);
      pages.splice(insertAfterIdx, 0, sheet);
    } else {
      pagesContainer.appendChild(sheet);
      pages.push(sheet);
    }

    activePage = sheet;
    updatePageNumbers();
    return sheet;
  }

  function updatePageNumbers() {
    pages.forEach((p, i) => {
      const num = p.querySelector('.page-footer-right');
      if (num) num.textContent = i + 1;
    });
  }

  function getActivePage() {
    return activePage || pages[pages.length - 1];
  }

  function deletePage() {
    if (pages.length <= 1) return;
    const target = getActivePage();
    const idx = pages.indexOf(target);
    pages.splice(idx, 1);
    target.remove();
    updatePageNumbers();
    const focusIdx = Math.max(0, idx - 1);
    const prevBody = pages[focusIdx] && pages[focusIdx].querySelector('.page-content');
    if (prevBody) { prevBody.focus(); activePage = pages[focusIdx]; }
    schedulePageSave();
  }

  // ── Build pages from a note ──
  function initPages() {
    pagesContainer.innerHTML = '';
    pages = [];
    activePage = null;

    const note = activeNoteId ? getNoteById(activeNoteId) : null;
    const parsed = note ? parsePageBody(note.body) : null;

    if (parsed && parsed.pages && parsed.pages.length > 0) {
      // Restore saved dims
      if (parsed.dims) {
        pagesContainer.dataset.pageW = parsed.dims.w;
        pagesContainer.dataset.pageH = parsed.dims.h;
        pagesContainer.dataset.pageM = parsed.dims.m;
        syncDimsUI(parsed.dims);
      }
      parsed.pages.forEach((html, i) => createPage(html, null, parsed.headers ? (parsed.headers[i] || '') : '', parsed.footers ? (parsed.footers[i] || '') : ''));
    } else {
      // Convert scroll-view content into the first page
      const titleEl = document.getElementById('editor-title');
      const bodyEl  = document.getElementById('editor-body');
      let html = '';
      if (titleEl && titleEl.value.trim()) {
        html += `<h1 class="page-doc-title">${titleEl.value.trim()}</h1>`;
      }
      if (bodyEl) html += bodyEl.innerHTML;
      createPage(html);
    }

    // Focus first page
    const firstBody = pages[0] && pages[0].querySelector('.page-content');
    if (firstBody) setTimeout(() => { firstBody.focus(); activePage = pages[0]; }, 50);
  }

  // ── Fix toolbar position for page view ──
  function updateToolbarPosition(isPageView) {
    if (!formatToolbar || !fmtTray) return;
    if (isPageView) {
      // Center toolbar in the full viewport (no sidebar offset needed — page view is full-width scroll)
      formatToolbar.style.left = '50%';
      fmtTray.style.left = '50%';
    } else {
      // Restore scroll-view formula
      formatToolbar.style.left = '';
      fmtTray.style.left = '';
    }
  }

  // ── Switch views ──
  function setView(mode) {
    if (mode === 'pages') {
      editor.classList.add('page-view');
      pagesBtn.classList.add('active');
      scrollBtn.classList.remove('active');
      pagesContainer.classList.remove('hidden');
      sideBtns.classList.remove('hidden');
      updateToolbarPosition(true);
      if (pages.length === 0) initPages();
    } else {
      // Flush any pending page save before switching back
      clearTimeout(pagesSaveTimer);
      if (pages.length > 0) savePageContent();

      editor.classList.remove('page-view');
      scrollBtn.classList.add('active');
      pagesBtn.classList.remove('active');
      pagesContainer.classList.add('hidden');
      sideBtns.classList.add('hidden');
      updateToolbarPosition(false);
    }
    localStorage.setItem('pt-view-mode', mode);
  }

  // ── Expose refresh hook for openNote() ──
  window.refreshPageView = function () {
    if (editor && editor.classList.contains('page-view')) {
      initPages();
    }
  };

  // ── Sync dims UI helper ──
  function syncDimsUI(dims) {
    const wp = document.getElementById('ps-width');
    const hp = document.getElementById('ps-height');
    const mp = document.getElementById('ps-margin');
    if (wp) wp.value = dims.w;
    if (hp) hp.value = dims.h;
    if (mp) mp.value = dims.m;
  }

  // ── Wire buttons ──
  addPageBtn.addEventListener('click', () => {
    const active = getActivePage();
    const idx = pages.indexOf(active);
    const newPage = createPage('', idx + 1 < pages.length ? idx + 1 : null);
    const nb = newPage.querySelector('.page-content');
    if (nb) setTimeout(() => { nb.focus(); activePage = newPage; }, 50);
    schedulePageSave();
  });

  delPageBtn.addEventListener('click', () => deletePage());
  scrollBtn.addEventListener('click', () => setView('scroll'));
  pagesBtn.addEventListener('click',  () => setView('pages'));

  const saved = localStorage.getItem('pt-view-mode');
  if (saved === 'pages') setView('pages');

  // ── Print / PDF export ──
  const printBtn = document.getElementById('print-page-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      // Save first
      clearTimeout(pagesSaveTimer);
      savePageContent();
      // Temporarily make pages-container full-size for print
      document.body.classList.add('printing');
      window.print();
      document.body.classList.remove('printing');
    });
  }
})();

// ── Page Settings ───────────────────────────────────────────────────────────

(function () {
  const toggle  = document.getElementById('page-settings-toggle');
  const panel   = document.getElementById('page-settings-panel');
  const preset  = document.getElementById('ps-preset');
  const wInput  = document.getElementById('ps-width');
  const hInput  = document.getElementById('ps-height');
  const mInput  = document.getElementById('ps-margin');
  const apply   = document.getElementById('ps-apply');

  if (!toggle) return;

  const presets = {
    a4:     { w: 210, h: 297 },
    letter: { w: 216, h: 279 },
    legal:  { w: 216, h: 356 },
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== toggle) {
      panel.classList.add('hidden');
    }
  });

  preset.addEventListener('change', () => {
    const p = presets[preset.value];
    if (p) { wInput.value = p.w; hInput.value = p.h; }
  });

  wInput.addEventListener('input', () => preset.value = 'custom');
  hInput.addEventListener('input', () => preset.value = 'custom');

  apply.addEventListener('click', () => {
    const w = parseInt(wInput.value) || 210;
    const h = parseInt(hInput.value) || 297;
    const m = parseInt(mInput.value) || 20;

    document.querySelectorAll('.page-sheet').forEach(p => {
      p.style.width     = w + 'mm';
      p.style.minHeight = h + 'mm';
    });
    document.querySelectorAll('.page-content').forEach(p => {
      p.style.padding = m + 'mm';
      p.style.paddingTop = '12px';
      p.style.paddingBottom = '12px';
    });
    document.querySelectorAll('.page-header-zone, .page-footer-zone').forEach(p => {
      p.style.paddingLeft = m + 'mm';
      p.style.paddingRight = m + 'mm';
    });

    const container = document.getElementById('pages-container');
    if (container) {
      container.dataset.pageW = w;
      container.dataset.pageH = h;
      container.dataset.pageM = m;
    }

    panel.classList.add('hidden');
  });
})();