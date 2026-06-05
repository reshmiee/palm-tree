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

  // Hoisted to this scope so reinitTableDeleteBtns() can reach it on note
  // reload; the actual implementation is assigned inside initTableInsertion().
  let initTableFeatures;

  titleEl.addEventListener('input', () => {
    autoResizeTitle();
    scheduleAutoSave();
  });

  bodyEl.addEventListener('input', () => {
    scheduleAutoSave();
  });

  // ── Undo / redo ───────────────────────────────────────
  // Browser native undo clears whenever innerHTML is written inside
  // a contenteditable (table ops, autoNumber, image insert, etc.).
  // This custom stack snapshots at word boundaries and before every
  // deletion or structural op, giving consistent Ctrl+Z behaviour.
  (function initUndoRedo() {
    const stack  = [];
    const rstack = [];
    const MAX    = 60;
    let   timer  = null;

    function getSnap() {
      return window.getCleanEditorHTML ? window.getCleanEditorHTML() : bodyEl.innerHTML;
    }

    function push() {
      const s = getSnap();
      if (stack.length && stack[stack.length - 1] === s) return;
      stack.push(s);
      if (stack.length > MAX) stack.shift();
      rstack.length = 0;
    }

    // Called before any structural DOM mutation (table rows/cols, image, embed, etc.)
    window.pushEditorSnapshot  = function () { clearTimeout(timer); push(); };
    // Called when a different note loads so history doesn't bleed across notes
    window.clearEditorHistory  = function () { clearTimeout(timer); stack.length = 0; rstack.length = 0; };

    function restore(html) {
      bodyEl.innerHTML = html;
      if (window.reinitEditorWidgets) window.reinitEditorWidgets();
      scheduleAutoSave();
    }

    const WORD_KEYS = new Set([' ', 'Enter', '.', ',', '!', '?', ';', ':']);
    const DEL_KEYS  = new Set(['Backspace', 'Delete']);

    bodyEl.addEventListener('keydown', (e) => {
      // Let CodeMirror handle its own undo inside code blocks
      if (e.target.closest && e.target.closest('.CodeMirror')) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          if (!stack.length) return;         // nothing in our stack → native handles
          e.preventDefault();
          clearTimeout(timer);
          rstack.push(getSnap());
          restore(stack.pop());
        } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          if (!rstack.length) return;
          e.preventDefault();
          clearTimeout(timer);
          stack.push(getSnap());
          restore(rstack.pop());
        }
        return;
      }

      if (DEL_KEYS.has(e.key)) {
        // Flush snapshot immediately before any deletion
        clearTimeout(timer);
        push();
      } else if (WORD_KEYS.has(e.key)) {
        // Snapshot shortly after word-boundary keys (space, enter, punctuation)
        clearTimeout(timer);
        timer = setTimeout(push, 150);
      }
    });

    // Safety fallback: snapshot after 3 s of continuous typing
    bodyEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(push, 3000);
    });
  })();

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

    document.addEventListener('selectionchange', () => {
      updateToolbarState();
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

    // Move overlay to body so fixed positioning is viewport-relative
    document.body.appendChild(overlay);

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

    // ── Table features: col resize + row/col add/delete ──
    // Assigned to the outer-scope variable (declared above) so the reload path
    // reinitTableDeleteBtns() → initTableFeatures() can re-wire saved tables.
    initTableFeatures = function (wrapper) {
      const table = wrapper.querySelector('table');
      if (!table) return;

      table.style.width = 'auto';
      table.style.minWidth = '120px';

      function attachColResizers() {
        wrapper.querySelectorAll('.col-resizer').forEach(r => r.remove());
        const rows = table.rows;
        if (!rows.length) return;
        const firstRow = rows[0];
        Array.from(firstRow.cells).forEach((cell, i) => {
          if (i === firstRow.cells.length - 1) return;
          const resizer = document.createElement('div');
          resizer.className = 'col-resizer';
          resizer.contentEditable = 'false';
          cell.style.position = 'relative';
          cell.appendChild(resizer);
          let startX, startW, nextStartW, nextCell;
          resizer.addEventListener('mousedown', (e) => {
            e.preventDefault(); e.stopPropagation();
            startX = e.clientX;
            startW = cell.offsetWidth;
            nextCell = firstRow.cells[i + 1];
            nextStartW = nextCell ? nextCell.offsetWidth : 0;
            const onMove = (e) => {
              const dx = e.clientX - startX;
              const newW = Math.max(40, startW + dx);
              const newNext = Math.max(40, nextStartW - dx);
              Array.from(table.rows).forEach(row => {
                if (row.cells[i]) row.cells[i].style.width = newW + 'px';
                if (row.cells[i + 1]) row.cells[i + 1].style.width = newNext + 'px';
              });
              table.style.width = 'auto';
            };
            const onUp = () => {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
              scheduleAutoSave();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          });
        });
      }
      attachColResizers();

      // ── Serial-number column ──────────────────────────
      // If the first <th> contains a serial-number label (S. No., Sr. No., #, etc.)
      // auto-fill the first <td> of each body row with 1, 2, 3 … and keep it
      // updated whenever rows are added or removed.
      const SERIAL_RE = /^(s\.?\s*no\.?|sr\.?\s*no\.?|serial\s*no\.?|#)$/i;

      function autoNumber() {
        const firstTh = table.querySelector('thead tr th:first-child');
        if (!firstTh || !SERIAL_RE.test(firstTh.textContent.trim())) return;
        const tbody = table.querySelector('tbody') || table;
        Array.from(tbody.rows).forEach((row, i) => {
          const cell = row.cells[0];
          if (cell) cell.innerHTML = `<p>${i}</p>`;
        });
      }
      autoNumber();

      function buildTableToolbar() {
        let tb = wrapper.querySelector('.table-toolbar');
        if (tb) tb.remove();
        tb = document.createElement('div');
        tb.className = 'table-toolbar';
        tb.contentEditable = 'false';
        const mkBtn = (label, title, fn) => {
          const b = document.createElement('button');
          b.className = 'table-tb-btn';
          b.title = title;
          b.textContent = label;
          b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
          return b;
        };
        // Track last focused cell — button clicks blur the cell before the handler runs,
        // so reading window.getSelection() inside the handler is too late.
        let _lastFocusedCell = { rowIndex: -1, colIndex: -1 };
        function _updateFocusedCell(node) {
          while (node && node !== table) {
            if (node.nodeName === 'TD' || node.nodeName === 'TH') {
              const row = node.parentElement;
              _lastFocusedCell = {
                rowIndex: Array.from(table.rows).indexOf(row),
                colIndex: Array.from(row.cells).indexOf(node),
              };
              return;
            }
            node = node.parentElement;
          }
        }
        table.addEventListener('mousedown', (e) => _updateFocusedCell(e.target));
        table.addEventListener('keyup', () => {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) _updateFocusedCell(sel.getRangeAt(0).startContainer);
        });
        function getFocusedCell() {
          return _lastFocusedCell;
        }

        tb.appendChild(mkBtn('+ Row', 'Add row below cursor', () => {
          if (window.pushEditorSnapshot) window.pushEditorSnapshot();
          const tbody = table.querySelector('tbody') || table;
          const cols = table.rows[0] ? table.rows[0].cells.length : 1;
          const tr = document.createElement('tr');
          for (let c = 0; c < cols; c++) {
            const td = document.createElement('td');
            td.innerHTML = '<p><br></p>';
            const refCell = table.rows[0] && table.rows[0].cells[c];
            if (refCell && refCell.style.width) td.style.width = refCell.style.width;
            tr.appendChild(td);
          }
          const { rowIndex } = getFocusedCell();
          if (rowIndex >= 0 && rowIndex < table.rows.length - 1) {
            table.rows[rowIndex].insertAdjacentElement('afterend', tr);
          } else {
            tbody.appendChild(tr);
          }
          attachColResizers();
          autoNumber();
          scheduleAutoSave();
        }));
        tb.appendChild(mkBtn('− Row', 'Delete row at cursor', () => {
          if (window.pushEditorSnapshot) window.pushEditorSnapshot();
          const { rowIndex } = getFocusedCell();
          const tbody = table.querySelector('tbody') || table;
          if (rowIndex >= 0 && tbody.rows.length > 0) {
            table.rows[rowIndex].remove();
          } else if (tbody.rows.length > 0) {
            tbody.deleteRow(tbody.rows.length - 1);
          }
          autoNumber();
          scheduleAutoSave();
        }));
        tb.appendChild(mkBtn('+ Col', 'Add column after cursor', () => {
          if (window.pushEditorSnapshot) window.pushEditorSnapshot();
          const { colIndex } = getFocusedCell();
          Array.from(table.rows).forEach((row, ri) => {
            const cell = ri === 0 ? document.createElement('th') : document.createElement('td');
            cell.innerHTML = '<p><br></p>';
            if (colIndex >= 0 && colIndex < row.cells.length - 1) {
              row.cells[colIndex].insertAdjacentElement('afterend', cell);
            } else {
              row.appendChild(cell);
            }
          });
          attachColResizers();
          scheduleAutoSave();
        }));
        tb.appendChild(mkBtn('− Col', 'Delete column at cursor', () => {
          if (window.pushEditorSnapshot) window.pushEditorSnapshot();
          const { colIndex } = getFocusedCell();
          const targetCol = colIndex >= 0 ? colIndex : -1;
          Array.from(table.rows).forEach(row => {
            if (row.cells.length > 1) {
              if (targetCol >= 0 && targetCol < row.cells.length) {
                row.deleteCell(targetCol);
              } else {
                row.deleteCell(row.cells.length - 1);
              }
            }
          });
          attachColResizers();
          scheduleAutoSave();
        }));
        wrapper.appendChild(tb);
      }
      buildTableToolbar();
    }

    function insertTable(rows, cols) {
      const tableWrapper = document.createElement('div');
      tableWrapper.className = 'table-block-wrapper';
      // NOTE: do NOT set contentEditable=false on wrapper — it prevents
      // cell editing on reload since browser ignores inner contenteditable=true
      // when parent is explicitly false inside a contenteditable parent.

      const tableDeleteBtn = document.createElement('button');
      tableDeleteBtn.className = 'table-delete-btn';
      tableDeleteBtn.title = 'Delete table';
      tableDeleteBtn.setAttribute('aria-label', 'Delete table');
      tableDeleteBtn.setAttribute('contenteditable', 'false');
      tableDeleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="13" height="13"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      tableDeleteBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showDeleteConfirmModal('Delete this table?', () => {
          if (window.pushEditorSnapshot) window.pushEditorSnapshot();
          tableWrapper.remove();
          scheduleAutoSave();
        });
      });

      let tableHtml = '<table><thead><tr>';
      for (let c = 0; c < cols; c++) {
        tableHtml += '<th><p><br></p></th>';
      }
      tableHtml += '</tr></thead><tbody>';
      for (let r = 0; r < rows - 1; r++) {
        tableHtml += '<tr>';
        for (let c = 0; c < cols; c++) {
          tableHtml += '<td><p><br></p></td>';
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';
      tableWrapper.innerHTML = tableHtml;
      tableWrapper.appendChild(tableDeleteBtn);

      initTableFeatures(tableWrapper);

      // Insert wrapper into editor
      const activeEl = getActiveEditableEl();
      if (activeEl) activeEl.focus();
      if (savedRange) {
        const sel2 = window.getSelection();
        sel2.removeAllRanges();
        sel2.addRange(savedRange);
      }
      const tRange = window.getSelection().getRangeAt(0);
      tRange.deleteContents();
      tRange.insertNode(tableWrapper);
      const pAfter = document.createElement('p');
      pAfter.innerHTML = '<br>';
      tableWrapper.after(pAfter);
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
        if (window.pushEditorSnapshot) window.pushEditorSnapshot();
        const block = wrapper.closest('.img-block');
        (block || wrapper).remove();
        scheduleAutoSave();
      });
      deleteBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.pushEditorSnapshot) window.pushEditorSnapshot();
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

  function reinitTableDeleteBtns() {
    bodyEl.querySelectorAll('.table-block-wrapper').forEach(wrapper => {
      const old = wrapper.querySelector('.table-delete-btn');
      if (old) old.remove();
      const btn = document.createElement('button');
      btn.className = 'table-delete-btn';
      btn.title = 'Delete table';
      btn.setAttribute('aria-label', 'Delete table');
      btn.setAttribute('contenteditable', 'false');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="13" height="13"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showDeleteConfirmModal('Delete this table?', () => {
          if (window.pushEditorSnapshot) window.pushEditorSnapshot();
          wrapper.remove();
          scheduleAutoSave();
        });
      });
      wrapper.appendChild(btn);
      initTableFeatures(wrapper);
    });
  }

  // Rebuild live CodeMirror editors from saved (frozen) code blocks.
  function reinitCodeBlocks() {
    bodyEl.querySelectorAll('.code-block-wrapper').forEach(wrapper => {
      // Skip blocks that are already live (have an active CodeMirror instance)
      const liveCm = wrapper.querySelector('.CodeMirror');
      if (liveCm && liveCm.CodeMirror) return;

      // Recover source: prefer the data-attr, else read the frozen CM DOM
      let code = wrapper.dataset.code;
      if (code == null) {
        // Strip zero-width spaces (U+200B) / BOM (U+FEFF) that CodeMirror
        // injects into rendered empty lines.
        const ZW = new RegExp('[\\u200B\\uFEFF]', 'g');
        const lines = wrapper.querySelectorAll('.CodeMirror-line');
        code = Array.from(lines)
          .map(l => l.textContent.replace(ZW, ''))
          .join('\n');
      }
      const lang = wrapper.dataset.lang || 'plaintext';
      insertCodeBlock(code, wrapper, lang);
    });
  }

  // Single entry point for re-wiring interactive widgets after a note loads.
  // Exposed on window so openNote() (global scope) can reach it.
  function reinitEditorWidgets() {
    reinitTableDeleteBtns();
    initExistingImages();
    reinitCodeBlocks();
  }
  window.reinitEditorWidgets = reinitEditorWidgets;

  // Produce a lean version of the editor body for storage: strip the heavy
  // rendered DOM that gets regenerated on load anyway. Code blocks keep only
  // their data-code/data-lang attrs; tables drop their toolbar/resizers/delete
  // button. Images are left intact (their handle/delete button are reused).
  function getCleanEditorHTML() {
    const clone = bodyEl.cloneNode(true);
    clone.querySelectorAll('.code-block-wrapper').forEach(w => { w.innerHTML = ''; });
    clone.querySelectorAll('.table-toolbar, .col-resizer, .table-delete-btn')
      .forEach(el => el.remove());
    return clone.innerHTML;
  }
  window.getCleanEditorHTML = getCleanEditorHTML;

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

  function insertCodeBlock(initialCode = '', existingWrapper = null, initialLang = 'plaintext') {
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

    const wrapper = existingWrapper || document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    wrapper.contentEditable = 'false';
    if (existingWrapper) wrapper.innerHTML = ''; // clear the frozen/saved markup before rebuilding

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

    const deleteCodeBtn = document.createElement('button');
    deleteCodeBtn.className = 'code-block-delete-btn';
    deleteCodeBtn.title = 'Delete code block';
    deleteCodeBtn.setAttribute('aria-label', 'Delete code block');
    deleteCodeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="13" height="13"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    deleteCodeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showDeleteConfirmModal('Delete this code block?', () => {
        if (window.pushEditorSnapshot) window.pushEditorSnapshot();
        const block = wrapper.closest('.code-block-wrapper') || wrapper;
        block.remove();
        scheduleAutoSave();
      });
    });

    header.appendChild(dots);
    header.appendChild(select);
    header.appendChild(deleteCodeBtn);
    wrapper.appendChild(header);

    // CodeMirror container
    const cmContainer = document.createElement('div');
    cmContainer.className = 'code-block-cm';
    wrapper.appendChild(cmContainer);

    // Insert into editor (only for newly created blocks; rehydrated blocks
    // are already in the DOM).
    if (!existingWrapper) {
      const range = window.getSelection().getRangeAt(0);
      range.deleteContents();
      range.insertNode(wrapper);
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      wrapper.after(p);
    }

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
      wrapper.dataset.code = cm.getValue();
      scheduleAutoSave();
      runLint();
    });
    // Persist source + language as data-attrs so the block can be rebuilt
    // (rehydrated) into a live editor after the note is saved and reloaded.
    wrapper.dataset.code = cm.getValue();
    wrapper.dataset.lang = initialLang;

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

    select.value = initialLang;
    applyLanguage(initialLang);
    select.addEventListener('change', () => {
      wrapper.dataset.lang = select.value;
      applyLanguage(select.value);
    });
    select.addEventListener('mousedown', (e) => e.stopPropagation());
    select.addEventListener('click', (e) => e.stopPropagation());
    select.addEventListener('pointerdown', (e) => e.stopPropagation());

    setTimeout(() => { cm.refresh(); if (!existingWrapper) cm.focus(); }, 50);
  }

  initCodeBlock();

  // ── Link insertion ───────────────────────────────────

  function initLinkInsertion() {
    const linkBtn    = document.getElementById('fmt-link-btn');
    const overlay    = document.getElementById('link-modal-overlay');
    const urlInput   = document.getElementById('link-modal-url');
    const cancelBtn  = document.getElementById('link-modal-cancel');
    const confirmBtn = document.getElementById('link-modal-confirm');
    const btnLink    = document.getElementById('link-toggle-link');
    const btnEmbed   = document.getElementById('link-toggle-embed');
    if (!linkBtn || !overlay) return;

    let savedRange  = null;
    let embedMode   = false;

    // Toggle between Link / Embed mode
    btnLink && btnLink.addEventListener('click', () => {
      embedMode = false;
      btnLink.classList.add('active');
      btnEmbed && btnEmbed.classList.remove('active');
    });
    btnEmbed && btnEmbed.addEventListener('click', () => {
      embedMode = true;
      btnEmbed.classList.add('active');
      btnLink && btnLink.classList.remove('active');
    });

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
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

      if (embedMode) {
        if (typeof window.insertEmbed === 'function') window.insertEmbed(url);
        closeModal();
        return;
      }

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

  // ── Checklist ─────────────────────────────────────────
  (function initChecklist() {
    const btn = document.getElementById('fmt-checklist-btn');
    if (!btn) return;

    function makeBox() {
      const s = document.createElement('span');
      s.className = 'checklist-box';
      s.contentEditable = 'false';
      return s;
    }

    function makeItem(text) {
      const li = document.createElement('li');
      li.className = 'checklist-item';
      li.appendChild(makeBox());
      const content = document.createElement('span');
      content.className = 'checklist-content';
      if (text) content.textContent = text;
      else      content.innerHTML = '<br>';
      li.appendChild(content);
      return li;
    }

    // Walk up from a node to find the nearest .checklist-item ancestor
    function nearestItem(node) {
      while (node && node !== bodyEl) {
        if (node.nodeType === 1 && node.classList.contains('checklist-item')) return node;
        node = node.parentNode;
      }
      return null;
    }

    // Find the current block for the cursor (Chrome uses <div>, others use <p>)
    function currentBlock(sel) {
      if (!sel || !sel.rangeCount) return null;
      let n = sel.getRangeAt(0).commonAncestorContainer;
      if (n.nodeType === 3) n = n.parentElement;
      if (!n || n === bodyEl) return null;
      const b = n.closest('p,h1,h2,h3,h4,h5,h6,div');
      return (b && b !== bodyEl) ? b : null;
    }

    // Ensure a paragraph follows an element (so cursor can exit)
    function ensureParaAfter(el) {
      if (!el.nextElementSibling) {
        const p = document.createElement('p'); p.innerHTML = '<br>'; el.after(p);
      }
    }

    // Place cursor inside the content span of a list item
    function focusAfterBox(li, sel) {
      const content = li.querySelector('.checklist-content');
      const r = document.createRange();
      if (content) {
        r.setStart(content, 0);
      } else {
        const box = li.querySelector('.checklist-box');
        r.setStartAfter(box || li);
      }
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }

    // ── Toolbar button ────────────────────────────────────
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      bodyEl.focus();
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;

      // Toggle OFF — cursor is already inside a checklist
      const inList = sel.anchorNode?.parentElement?.closest('.checklist');
      if (inList) {
        const list = inList.closest('.checklist');
        const frag = document.createDocumentFragment();
        list.querySelectorAll('.checklist-item').forEach(li => {
          const p = document.createElement('p');
          li.querySelectorAll('.checklist-box').forEach(b => b.remove());
          p.innerHTML = li.innerHTML || '<br>';
          frag.appendChild(p);
        });
        list.replaceWith(frag);
        scheduleAutoSave(); updateBtnState(); return;
      }

      if (window.pushEditorSnapshot) window.pushEditorSnapshot();
      const range        = sel.getRangeAt(0);
      const selectedText = sel.toString().trim();

      if (selectedText) {
        // Multi-line selection → find each selected block, replace with checklist items
        // Using block-level replacement avoids inserting <ul> inside a <p>
        function directChild(node) {
          while (node && node.parentNode !== bodyEl) node = node.parentNode;
          return (node && node.parentNode === bodyEl) ? node : null;
        }
        const startBlock = directChild(range.startContainer);
        const endBlock   = directChild(range.endContainer);

        if (startBlock && endBlock) {
          // Collect all direct-child blocks in the selection range
          const blocks = [];
          let cur = startBlock;
          while (cur) {
            blocks.push(cur);
            if (cur === endBlock) break;
            cur = cur.nextElementSibling;
          }
          const ul = document.createElement('ul');
          ul.className = 'checklist';
          blocks.forEach(b => {
            const text = b.textContent.trim();
            ul.appendChild(text ? makeItem(text) : makeItem());
          });
          startBlock.replaceWith(ul);
          blocks.slice(1).forEach(b => b.remove());
          ensureParaAfter(ul);
          focusAfterBox(ul.querySelector('.checklist-item'), sel);
        } else {
          // Fallback for raw text in bodyEl — use text split
          const ul = document.createElement('ul');
          ul.className = 'checklist';
          selectedText.split('\n').filter(l => l.trim()).forEach(l => ul.appendChild(makeItem(l)));
          if (!ul.children.length) ul.appendChild(makeItem());
          range.deleteContents();
          if (range.startContainer === bodyEl || range.startContainer.parentNode === bodyEl) {
            bodyEl.insertBefore(ul, range.startContainer.nextSibling || null);
          } else {
            range.insertNode(ul);
          }
          ensureParaAfter(ul);
          focusAfterBox(ul.querySelector('.checklist-item'), sel);
        }
      } else {
        // No selection — convert the current line to a checklist item
        const ul = document.createElement('ul');
        ul.className = 'checklist';
        const li = document.createElement('li');
        li.className = 'checklist-item';
        li.appendChild(makeBox());

        const rawNode = range.startContainer;

        if (rawNode.nodeType === Node.TEXT_NODE && rawNode.parentNode === bodyEl) {
          // Raw text node sitting directly inside bodyEl (no <p> wrapper)
          const text = rawNode.textContent.trim();
          if (text) li.appendChild(document.createTextNode(text));
          else      li.appendChild(document.createElement('br'));
          ul.appendChild(li);
          bodyEl.insertBefore(ul, rawNode);
          rawNode.remove();
        } else {
          // Cursor is inside a block element (<p>, heading, div…)
          const block = currentBlock(sel);
          if (block && block.textContent.trim()) {
            Array.from(block.childNodes).forEach(c => li.appendChild(c.cloneNode(true)));
            ul.appendChild(li);
            block.replaceWith(ul);
          } else {
            li.appendChild(document.createElement('br'));
            ul.appendChild(li);
            if (block) block.replaceWith(ul);
            else       range.insertNode(ul);
          }
        }

        ensureParaAfter(ul);
        focusAfterBox(li, sel);
      }

      scheduleAutoSave(); updateBtnState();
    });

    // ── Enter / Backspace keys ────────────────────────────
    bodyEl.addEventListener('keydown', (e) => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const li    = nearestItem(range.startContainer);
      if (!li) return;

      // ── Backspace at start of item ──
      if (e.key === 'Backspace' && range.collapsed) {
        const content = li.querySelector('.checklist-content');
        const sc = range.startContainer;
        const atStart = content && (
          (sc === content && range.startOffset === 0) ||
          (sc.nodeType === 3 && sc.parentNode === content && range.startOffset === 0 && !sc.previousSibling)
        );
        if (!atStart) return;
        e.preventDefault();

        const list  = li.closest('.checklist');
        const items = Array.from(list.querySelectorAll('.checklist-item'));
        const idx   = items.indexOf(li);

        if (!li.innerText.trim()) {
          // Empty item → remove it
          if (items.length <= 1) {
            const p = document.createElement('p'); p.innerHTML = '<br>';
            list.replaceWith(p);
            const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
            sel.removeAllRanges(); sel.addRange(r);
          } else {
            const prevLi = items[idx - 1];
            li.remove();
            if (prevLi) {
              const prevContent = prevLi.querySelector('.checklist-content');
              if (prevContent) {
                const r = document.createRange();
                r.selectNodeContents(prevContent); r.collapse(false);
                sel.removeAllRanges(); sel.addRange(r);
              }
            }
          }
        } else if (idx === 0) {
          // First item with content → convert to plain paragraph before the list
          const p = document.createElement('p');
          p.innerHTML = content.innerHTML;
          list.before(p);
          li.remove();
          if (!list.querySelector('.checklist-item')) list.remove();
          const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
          sel.removeAllRanges(); sel.addRange(r);
        } else {
          // Non-first item with content → merge into end of previous item
          const prevLi      = items[idx - 1];
          const prevContent = prevLi.querySelector('.checklist-content');
          if (prevContent) {
            // Remove trailing <br> in prev if present
            const br = prevContent.querySelector('br');
            if (br && !prevContent.textContent.trim()) br.remove();
            // Append this item's content nodes
            Array.from(content.childNodes).forEach(n => prevContent.appendChild(n.cloneNode(true)));
            li.remove();
            const r = document.createRange(); r.selectNodeContents(prevContent); r.collapse(false);
            sel.removeAllRanges(); sel.addRange(r);
          }
        }
        scheduleAutoSave();
        return;
      }

      // ── Enter ──
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();

      if (!li.innerText.trim()) {
        // Empty item → exit list into a new paragraph
        const list = li.closest('.checklist');
        const p    = document.createElement('p');
        p.innerHTML = '<br>';
        if (list.querySelectorAll('.checklist-item').length <= 1) {
          list.replaceWith(p);
        } else {
          li.remove();
          list.after(p);
        }
        const r = document.createRange();
        r.setStart(p, 0); r.collapse(true);
        sel.removeAllRanges(); sel.addRange(r);
      } else {
        // Split item at cursor — content after cursor goes to a new item
        const tail = range.cloneRange();
        tail.selectNodeContents(li);
        tail.setStart(range.endContainer, range.endOffset);
        const frag = tail.extractContents();
        frag.querySelectorAll('.checklist-box').forEach(b => b.remove());

        const newLi  = document.createElement('li');
        newLi.className = 'checklist-item';
        newLi.appendChild(makeBox());
        const newContent = document.createElement('span');
        newContent.className = 'checklist-content';
        newContent.appendChild(frag);
        if (!newContent.textContent.trim()) newContent.innerHTML = '<br>';
        newLi.appendChild(newContent);
        li.after(newLi);
        focusAfterBox(newLi, sel);
      }
      scheduleAutoSave();
    });

    // ── Checkbox click ────────────────────────────────────
    bodyEl.addEventListener('click', (e) => {
      const box = e.target.closest('.checklist-box');
      if (!box) return;
      const li = box.closest('.checklist-item');
      if (!li) return;
      if (window.pushEditorSnapshot) window.pushEditorSnapshot();
      li.classList.toggle('checked');
      scheduleAutoSave();
    });

    // ── Toolbar active state ──────────────────────────────
    function updateBtnState() {
      const sel = window.getSelection();
      btn.classList.toggle('active', !!sel?.anchorNode?.parentElement?.closest('.checklist'));
    }
    bodyEl.addEventListener('keyup',  updateBtnState);
    bodyEl.addEventListener('mouseup', updateBtnState);
  })();

  // ── Link hover tooltip ───────────────────────────────

  (function initLinkTooltip() {
    const tooltip = document.createElement('div');
    tooltip.id = 'link-hover-tooltip';
    tooltip.innerHTML = `
      <button class="link-tooltip-embed" title="Embed as card">Embed</button>
      <button class="link-tooltip-open" title="Open link">Open</button>
    `;
    document.body.appendChild(tooltip);

    let hideTimer = null;

    function showTooltip(anchor) {
      clearTimeout(hideTimer);
      const url = anchor.href;
      tooltip.querySelector('.link-tooltip-open').onclick = () => window.open(url, '_blank', 'noopener');
      tooltip.querySelector('.link-tooltip-embed').onclick = () => {
        if (typeof window.insertEmbed === 'function') window.insertEmbed(url);
        tooltip.style.display = 'none';
      };

      const rect = anchor.getBoundingClientRect();
      tooltip.style.visibility = 'hidden';
      tooltip.style.display = 'flex';

      // Position to the right of the link so moving toward it is horizontal,
      // never crossing adjacent links above/below
      requestAnimationFrame(() => {
        const th = tooltip.offsetHeight;
        const tw = tooltip.offsetWidth;
        const vw = window.innerWidth;
        const top = rect.top + window.scrollY + (rect.height / 2) - (th / 2);
        let left = rect.right + window.scrollX + 8;
        if (left + tw > vw - 12) left = rect.left + window.scrollX - tw - 8; // flip left
        tooltip.style.top  = top + 'px';
        tooltip.style.left = Math.max(8, left) + 'px';
        tooltip.style.visibility = 'visible';
      });
    }

    function scheduleHide() {
      hideTimer = setTimeout(() => { tooltip.style.display = 'none'; }, 200);
    }

    bodyEl.addEventListener('mouseover', (e) => {
      const a = e.target.closest('a[href]');
      if (a) showTooltip(a);
    });

    bodyEl.addEventListener('mouseout', (e) => {
      const a = e.target.closest('a[href]');
      if (a) scheduleHide();
    });

    tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    tooltip.addEventListener('mouseleave', () => scheduleHide());
  })();

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
      // Ctrl/⌘+Shift+K inserts a link (Ctrl/⌘+K opens the search palette)
      if ((e.key === 'k' || e.key === 'K') && e.shiftKey) {
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
    const hasBody = bodyEl.innerText.trim().length > 0;

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

  // ── Sidebar collapse toggle (full-width editor / focus mode) ──
  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  const appEl = document.querySelector('.app');
  function applySidebarCollapsed(collapsed) {
    if (!appEl) return;
    appEl.classList.toggle('sidebar-collapsed', collapsed);
    if (sidebarToggleBtn) {
      const label = collapsed ? 'Show notes panel' : 'Hide notes panel';
      sidebarToggleBtn.title = label;
      sidebarToggleBtn.dataset.tip = label;
      sidebarToggleBtn.classList.toggle('active', collapsed);
    }
  }
  if (sidebarToggleBtn && appEl) {
    applySidebarCollapsed(localStorage.getItem('palmtree_sidebar_collapsed') === '1');
    sidebarToggleBtn.addEventListener('click', () => {
      const collapsed = !appEl.classList.contains('sidebar-collapsed');
      applySidebarCollapsed(collapsed);
      try { localStorage.setItem('palmtree_sidebar_collapsed', collapsed ? '1' : '0'); } catch (e) {}
    });
  }

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
      // Detach auto-backup first so the deletion never overwrites the backup
      // file — it's preserved as an archive of the deleted notes.
      if (window.backupDetachForReset) window.backupDetachForReset();
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
  initDownloadButton();
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
  let currentZoom = parseFloat(localStorage.getItem('pt-zoom')) || 0.85;
  let currentLineSpacing = localStorage.getItem('pt-line-spacing') || '1.5';
  // Sync toolbar select to saved value
  (function() {
    // Sync line spacing label on page view init
    const lsLabelEl = document.getElementById('doc-tb-ls-label');
    const LS_LABEL_MAP = { '1': '1×', '1.15': '1.15×', '1.5': '1.5×', '2': '2×', '2.5': '2.5×' };
    if (lsLabelEl) lsLabelEl.textContent = LS_LABEL_MAP[currentLineSpacing] || currentLineSpacing + '×';
    const lsPanel2 = document.getElementById('doc-tb-ls-panel');
    if (lsPanel2) lsPanel2.querySelectorAll('.doc-tb-dropdown-item').forEach(i => {
      i.classList.toggle('doc-tb-dropdown-item--selected', i.dataset.value === currentLineSpacing);
    });
  })();

  function applyZoom(z) {
    currentZoom = Math.max(0.4, Math.min(2.0, z));
    localStorage.setItem('pt-zoom', currentZoom);
    document.querySelectorAll('.page-sheet').forEach(sheet => {
      sheet.style.transform = `scale(${currentZoom})`;
      // margin-bottom compensation: negative margin = -(pageH * (1 - zoom))
      const dims = getPageDims();
      const pxPerMm = 96 / 25.4;
      const pageHpx = dims.h * pxPerMm;
      sheet.style.marginBottom = `calc(-${pageHpx * (1 - currentZoom)}px)`;
    });
    const label = document.getElementById('zoom-label');
    if (label) label.textContent = Math.round(currentZoom * 100) + '%';
    const zInput = document.getElementById('doc-tb-zoom-input');
    if (zInput && document.activeElement !== zInput) zInput.value = Math.round(currentZoom * 100) + '%';
    updateRuler();
  }

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
      if (window._pageViewMarkActive) window._pageViewMarkActive(sheet);
    });
    body.addEventListener('focus', () => {
      activePage = sheet;
      if (window._pageViewMarkActive) window._pageViewMarkActive(sheet);
    });
    const headerEl = sheet.querySelector('.page-header-editable');
    const footerEl = sheet.querySelector('.page-footer-editable');
    if (headerEl) headerEl.addEventListener('focus', () => {
      activePage = sheet;
      if (window._pageViewMarkActive) window._pageViewMarkActive(sheet);
    });
    if (footerEl) footerEl.addEventListener('focus', () => {
      activePage = sheet;
      if (window._pageViewMarkActive) window._pageViewMarkActive(sheet);
    });

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
    updateAllPageNumbers();
  }

  function updateAllPageNumbers() {
    const total = pages.length;
    pages.forEach((p, i) => {
      const num = p.querySelector('.page-footer-right');
      if (!num) return;
      num.dataset.page = i + 1;
      num.dataset.total = total;
      num.textContent = i + 1; // fallback text (hidden by CSS when data attrs present)
    });
  }

  // ── Ruler ────────────────────────────────────────────
  function updateRuler() {
    const ruler = document.getElementById('page-ruler');
    const track = document.getElementById('ruler-track');
    const ticks = document.getElementById('ruler-ticks');
    const marginL = document.getElementById('ruler-margin-left');
    const marginR = document.getElementById('ruler-margin-right');
    if (!ruler || !track || !ticks) return;

    const dims = getPageDims();
    const pxPerMm = 96 / 25.4;
    const pageWpx = dims.w * pxPerMm * currentZoom;
    const marginPx = dims.m * pxPerMm * currentZoom;

    track.style.width = pageWpx + 'px';

    // Margin shading
    if (marginL) { marginL.style.width = marginPx + 'px'; }
    if (marginR) { marginR.style.width = marginPx + 'px'; }

    // Indent handle position (left margin edge)
    const indentHandle = document.getElementById('ruler-indent-first');
    if (indentHandle) {
      indentHandle.style.left = (marginPx - 7) + 'px';
    }

    // Build tick marks (every 5mm minor, every 10mm major, label every 20mm)
    ticks.innerHTML = '';
    const totalMm = dims.w;
    for (let mm = 0; mm <= totalMm; mm += 5) {
      const x = mm * pxPerMm * currentZoom;
      const isMajor = mm % 10 === 0;
      const tick = document.createElement('div');
      tick.className = isMajor ? 'ruler-tick-major' : 'ruler-tick-minor';
      tick.style.left = x + 'px';
      ticks.appendChild(tick);
      if (isMajor && mm % 20 === 0 && mm > 0 && mm < totalMm) {
        const lbl = document.createElement('span');
        lbl.className = 'ruler-tick-label';
        lbl.style.left = x + 'px';
        lbl.textContent = mm;
        ticks.appendChild(lbl);
      }
    }
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

    // Apply saved zoom and line spacing
    setTimeout(() => {
      applyZoom(currentZoom);
      if (currentLineSpacing !== '1.5') {
        document.querySelectorAll('.page-content').forEach(el => {
          el.style.lineHeight = currentLineSpacing;
        });
      }
      updateRuler();
      updateAllPageNumbers();
    }, 60);
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
    const docToolbar = document.getElementById('doc-toolbar');
    const ruler = document.getElementById('page-ruler');
    if (mode === 'pages') {
      editor.classList.add('page-view');
      pagesBtn.classList.add('active');
      scrollBtn.classList.remove('active');
      pagesContainer.classList.remove('hidden');
      sideBtns.classList.remove('hidden');
      updateToolbarPosition(true);
      // Show doc toolbar + ruler, hide floating toolbar
      if (docToolbar) docToolbar.classList.remove('hidden');
      if (ruler) ruler.classList.remove('hidden');
      document.body.classList.add('page-view-active');
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
      // Hide doc toolbar + ruler, restore floating toolbar
      if (docToolbar) docToolbar.classList.add('hidden');
      if (ruler) ruler.classList.add('hidden');
      document.body.classList.remove('page-view-active');
    }
    localStorage.setItem('pt-view-mode', mode);
  }

  // ── Expose refresh hook for openNote() ──
  window.refreshPageView = function () {
    if (editor && editor.classList.contains('page-view')) {
      initPages();
    }
  };

  // ── Expose zoom level so Level4 can drive it ──
  window._pageViewGetZoom = () => currentZoom;
  window._pageViewSetZoom = (z) => applyZoom(z);
  window._pageViewGetPageCount = () => pages.length;
  window._pageViewGetDims = () => getPageDims();
  window._pageViewSetLineSpacing = (val) => {
    document.querySelectorAll('.page-content').forEach(el => {
      el.style.lineHeight = val;
    });
    currentLineSpacing = val;
    localStorage.setItem('pt-line-spacing', val);
  };
  window._pageViewMarkActive = (sheet) => {
    pages.forEach(p => p.classList.remove('page-active'));
    if (sheet) sheet.classList.add('page-active');
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
  pagesBtn.addEventListener('click',  () => {
    showToast('🚧 Page view is coming soon — stay tuned!');
    return;
    setView('pages'); // eslint-disable-line no-unreachable
  });

  const saved = localStorage.getItem('pt-view-mode');
  // Page view temporarily disabled — clear any saved state and stay in scroll mode
  if (saved === 'pages') localStorage.removeItem('pt-view-mode');

  // ── Print / PDF export ──
  const printBtn = document.getElementById('doc-tb-print');
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
// ── Level 4: Zoom, Line Spacing, Ruler drag ─────────────────────────────────

(function () {

  // ── Zoom buttons ──
  const zoomIn  = document.getElementById('doc-tb-zoom-in');
  const zoomOut = document.getElementById('doc-tb-zoom-out');
  const ZOOM_STEPS = [0.40, 0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 1.00, 1.10, 1.20, 1.50, 2.00];

  function stepZoom(dir) {
    if (!window._pageViewGetZoom) return;
    const cur = window._pageViewGetZoom();
    const idx = ZOOM_STEPS.findIndex(z => Math.abs(z - cur) < 0.01);
    let next;
    if (idx === -1) {
      next = dir > 0 ? 0.90 : 0.80;
    } else {
      next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + dir))];
    }
    if (window._pageViewSetZoom) window._pageViewSetZoom(next);
  }

  if (zoomIn)  zoomIn.addEventListener('click',  () => stepZoom(+1));
  if (zoomOut) zoomOut.addEventListener('click', () => stepZoom(-1));

  // ── Zoom input (typeable %) ──
  const zoomInput = document.getElementById('doc-tb-zoom-input');
  function syncZoomInput() {
    if (!zoomInput || !window._pageViewGetZoom) return;
    zoomInput.value = Math.round(window._pageViewGetZoom() * 100) + '%';
  }
  // Patch applyZoom to also update input
  const _origSetZoom = window._pageViewSetZoom;
  window._pageViewSetZoom = function(z) {
    if (_origSetZoom) _origSetZoom(z);
    syncZoomInput();
  };
  if (zoomInput) {
    zoomInput.addEventListener('focus', () => {
      zoomInput.select();
    });
    zoomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        let raw = zoomInput.value.replace('%', '').trim();
        let pct = parseFloat(raw);
        if (!isNaN(pct) && pct >= 10 && pct <= 300) {
          const z = pct / 100;
          if (window._pageViewSetZoom) window._pageViewSetZoom(z);
        } else {
          syncZoomInput(); // reset
        }
        zoomInput.blur();
      }
    });
    zoomInput.addEventListener('blur', () => {
      let raw = zoomInput.value.replace('%', '').trim();
      let pct = parseFloat(raw);
      if (!isNaN(pct) && pct >= 10 && pct <= 300) {
        const z = pct / 100;
        if (window._pageViewSetZoom) window._pageViewSetZoom(z);
      } else {
        syncZoomInput();
      }
    });
  }
  // Sync on page view enter
  setTimeout(syncZoomInput, 100);

  // ── Line spacing custom dropdown ──
  (function() {
    const LS_LABELS = { '1': '1×', '1.15': '1.15×', '1.5': '1.5×', '2': '2×', '2.5': '2.5×' };
    const lsBtn   = document.getElementById('doc-tb-ls-btn');
    const lsPanel = document.getElementById('doc-tb-ls-panel');
    if (!lsBtn || !lsPanel) return;

    // Restore saved value
    const saved = localStorage.getItem('pt-line-spacing') || '1.5';
    const lsLabel = document.getElementById('doc-tb-ls-label');
    if (lsLabel) lsLabel.textContent = LS_LABELS[saved] || saved + '×';
    lsPanel.querySelectorAll('.doc-tb-dropdown-item').forEach(i => {
      i.classList.toggle('doc-tb-dropdown-item--selected', i.dataset.value === saved);
    });

    lsBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll('.doc-tb-dropdown-panel:not(.hidden)').forEach(p => {
        if (p !== lsPanel) {
          p.classList.add('hidden');
          const b = p.previousElementSibling;
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      });
      const wasHidden = lsPanel.classList.contains('hidden');
      lsPanel.classList.toggle('hidden');
      lsBtn.setAttribute('aria-expanded', wasHidden ? 'true' : 'false');
    });

    lsPanel.querySelectorAll('.doc-tb-dropdown-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const val = item.dataset.value;
        lsPanel.querySelectorAll('.doc-tb-dropdown-item').forEach(i => i.classList.remove('doc-tb-dropdown-item--selected'));
        item.classList.add('doc-tb-dropdown-item--selected');
        lsPanel.classList.add('hidden');
        lsBtn.setAttribute('aria-expanded', 'false');
        if (lsLabel) lsLabel.textContent = LS_LABELS[val] || val + '×';
        if (window._pageViewSetLineSpacing) window._pageViewSetLineSpacing(val);
      });
    });

    document.addEventListener('mousedown', (e) => {
      const wrap = lsBtn.closest('.doc-tb-dropdown');
      if (wrap && !wrap.contains(e.target)) {
        lsPanel.classList.add('hidden');
        lsBtn.setAttribute('aria-expanded', 'false');
      }
    }, true);
  })();

  // ── Show/hide ruler and side panel when view changes ──
  const scrollBtn = document.getElementById('view-scroll-btn');
  const pagesBtn  = document.getElementById('view-pages-btn');
  const ruler     = document.getElementById('page-ruler');

  function setRulerVisible(show) {
    if (!ruler) return;
    ruler.classList.toggle('hidden', !show);
  }

  if (scrollBtn) scrollBtn.addEventListener('click', () => setRulerVisible(false));
  // Page view disabled — ruler listener intentionally skipped

  function updateRulerExternal() {
    // Trigger ruler update by calling the internal updater exposed on window
    if (window._pageViewSetZoom && window._pageViewGetZoom) {
      window._pageViewSetZoom(window._pageViewGetZoom());
    }
  }

  // Show ruler if page view is already active on load
  if (ruler) {
    const saved = localStorage.getItem('pt-view-mode');
    if (saved === 'pages') setRulerVisible(true);
  }

  // ── Ruler margin drag ──
  // Dragging the margin handles updates page padding live
  let dragging = null; // 'left' | 'right' | 'indent'
  let dragStart = 0;
  let dragStartVal = 0;

  function getRulerMmPerPx() {
    // mm per screen px, accounting for zoom
    const zoom = window._pageViewGetZoom ? window._pageViewGetZoom() : 0.85;
    return 25.4 / (96 * zoom);
  }

  function startDrag(which, e) {
    dragging = which;
    dragStart = e.clientX;
    const dims = window._pageViewGetDims ? window._pageViewGetDims() : { m: 20 };
    dragStartVal = dims.m;
    e.preventDefault();
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
  }

  function onDrag(e) {
    if (!dragging) return;
    const dx = e.clientX - dragStart;
    const mmPerPx = getRulerMmPerPx();
    const delta = dx * mmPerPx;
    const mInput = document.getElementById('ps-margin');
    if (!mInput) return;

    let newM = Math.max(5, Math.min(60, Math.round(dragStartVal + (dragging === 'right' ? -delta : delta))));
    mInput.value = newM;

    // Apply live
    document.querySelectorAll('.page-content').forEach(el => {
      el.style.padding = newM + 'mm';
      el.style.paddingTop = '12px';
      el.style.paddingBottom = '12px';
    });
    document.querySelectorAll('.page-header-zone, .page-footer-zone').forEach(el => {
      el.style.paddingLeft  = newM + 'mm';
      el.style.paddingRight = newM + 'mm';
    });

    const container = document.getElementById('pages-container');
    if (container) container.dataset.pageM = newM;

    if (window._pageViewSetZoom && window._pageViewGetZoom) {
      window._pageViewSetZoom(window._pageViewGetZoom()); // re-render ruler
    }
  }

  function stopDrag() {
    dragging = null;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  }

  const mLeft  = document.getElementById('ruler-margin-left');
  const mRight = document.getElementById('ruler-margin-right');
  if (mLeft)  mLeft.addEventListener('mousedown',  (e) => startDrag('left', e));
  if (mRight) mRight.addEventListener('mousedown', (e) => startDrag('right', e));

})();

// ── Doc Toolbar (Level 1) ────────────────────────────────────────────────────

(function () {
  const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64];

  function nearestIdx(px) {
    let best = 0, bestDiff = Math.abs(FONT_SIZES[0] - px);
    for (let i = 1; i < FONT_SIZES.length; i++) {
      const d = Math.abs(FONT_SIZES[i] - px);
      if (d < bestDiff) { bestDiff = d; best = i; }
    }
    return best;
  }

  function rgbToHex(rgb) {
    const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return rgb;
    return '#' + [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
  }
  let dtFontSize = 12;

  function getActiveBody() {
    const a = document.activeElement;
    if (a && a.isContentEditable) return a;
    // Fall back to last focused page-content
    const pages = document.querySelectorAll('.page-content');
    return pages[pages.length - 1] || null;
  }

  function dtExec(cmd, val) {
    const body = getActiveBody();
    if (body) body.focus();
    document.execCommand(cmd, false, val || null);
  }

  // ── Custom dropdown helper ──
  function makeDropdown(btnId, panelId, onSelect) {
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    if (!btn || !panel) return { setLabel: () => {}, setValue: () => {} };

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Close all other open panels
      document.querySelectorAll('.doc-tb-dropdown-panel:not(.hidden)').forEach(p => {
        if (p !== panel) {
          p.classList.add('hidden');
          const b = p.previousElementSibling;
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      });
      const wasHidden = panel.classList.contains('hidden');
      panel.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', wasHidden ? 'true' : 'false');
    });

    panel.querySelectorAll('.doc-tb-dropdown-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        panel.querySelectorAll('.doc-tb-dropdown-item').forEach(i => i.classList.remove('doc-tb-dropdown-item--selected'));
        item.classList.add('doc-tb-dropdown-item--selected');
        panel.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
        onSelect(item.dataset.value, item);
      });
    });

    document.addEventListener('mousedown', (e) => {
      const wrap = btn.closest('.doc-tb-dropdown');
      if (wrap && !wrap.contains(e.target)) {
        panel.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
      }
    }, true);

    return {
      setLabel(text) {
        const label = btn.querySelector('.doc-tb-dropdown-label');
        if (label) label.textContent = text;
      },
      setValue(val) {
        panel.querySelectorAll('.doc-tb-dropdown-item').forEach(i => {
          i.classList.toggle('doc-tb-dropdown-item--selected', i.dataset.value === val);
        });
        const active = panel.querySelector(`[data-value="${val}"]`);
        if (active) {
          const label = btn.querySelector('.doc-tb-dropdown-label');
          if (label) label.textContent = active.textContent.trim();
        }
      }
    };
  }

  // ── Paragraph style dropdown ──
  const PARA_LABELS = { p: 'Normal text', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4' };
  const paraDropdown = makeDropdown('doc-tb-para-btn', 'doc-tb-para-panel', (val) => {
    const body = getActiveBody();
    if (body) body.focus();
    document.execCommand('formatBlock', false, val);
    paraDropdown.setLabel(PARA_LABELS[val] || 'Normal text');
    if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
  });

  // ── Font family dropdown ──
  const FONT_LABELS = {
    '': 'Default',
    "'Georgia', serif": 'Georgia',
    "'Times New Roman', Times, serif": 'Times New Roman',
    "'Palatino Linotype', Palatino, serif": 'Palatino',
    "'Arial', sans-serif": 'Arial',
    "'Helvetica Neue', Helvetica, sans-serif": 'Helvetica',
    "'Trebuchet MS', sans-serif": 'Trebuchet',
    "'Verdana', sans-serif": 'Verdana',
    "'Courier New', Courier, monospace": 'Courier New',
  };
  const fontDropdown = makeDropdown('doc-tb-font-btn', 'doc-tb-font-panel', (val) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      const body = getActiveBody();
      if (body) body.dataset.nextFontFamily = val;
    } else {
      const span = document.createElement('span');
      span.style.fontFamily = val || 'inherit';
      try { range.surroundContents(span); }
      catch(e) {
        document.execCommand('insertHTML', false,
          `<span style="font-family:${val || 'inherit'}">${range.toString()}</span>`);
      }
      if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
    }
    fontDropdown.setLabel(FONT_LABELS[val] || 'Default');
  });

  // ── Font size ──
  const fsLabel = document.getElementById('doc-tb-fs-label');
  const fsDecBtn = document.getElementById('doc-tb-fs-dec');
  const fsIncBtn = document.getElementById('doc-tb-fs-inc');

  function applyDocFontSize(px) {
    dtFontSize = px;
    if (fsLabel) fsLabel.textContent = px;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    document.execCommand('fontSize', false, '7');
    document.querySelectorAll('.page-content font[size="7"]').forEach(el => {
      const span = document.createElement('span');
      span.style.fontSize = px + 'px';
      while (el.firstChild) span.appendChild(el.firstChild);
      el.replaceWith(span);
    });
    scheduleAutoSave();
  }

  if (fsDecBtn) fsDecBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const idx = nearestIdx(dtFontSize);
    applyDocFontSize(idx > 0 ? FONT_SIZES[idx - 1] : FONT_SIZES[0]);
  });

  if (fsIncBtn) fsIncBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const idx = nearestIdx(dtFontSize);
    applyDocFontSize(idx < FONT_SIZES.length - 1 ? FONT_SIZES[idx + 1] : FONT_SIZES[FONT_SIZES.length - 1]);
  });

  // ── B / I / U ──
  document.querySelectorAll('.doc-tb-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dtExec(btn.dataset.cmd);
      updateDocToolbarState();
    });
  });

  // ── Reflect cursor state ──
  function updateDocToolbarState() {
    // B / I / U active states
    document.querySelectorAll('.doc-tb-btn[data-cmd]').forEach(btn => {
      try { btn.classList.toggle('active', document.queryCommandState(btn.dataset.cmd)); }
      catch(e) {}
    });

    // Paragraph style
    const block = document.queryCommandValue('formatBlock').toLowerCase();
    const blockVal = block || 'p';
    if (typeof paraDropdown !== 'undefined') {
      paraDropdown.setValue(blockVal);
    }

    // Font size + family at cursor
    const sel = window.getSelection();
    if (sel && sel.anchorNode) {
      const node = sel.anchorNode.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement : sel.anchorNode;
      if (node) {
        const cs = window.getComputedStyle(node);
        // Font size
        const fs = cs.fontSize;
        if (fs) {
          const px = Math.round(parseFloat(fs));
          dtFontSize = px;
          if (fsLabel) fsLabel.textContent = px;
        }
        // Font family — find closest match in our list
        if (typeof fontDropdown !== 'undefined') {
          const ff = cs.fontFamily.toLowerCase();
          const FONT_VALS = ['', "'Georgia', serif", "'Times New Roman', Times, serif",
            "'Palatino Linotype', Palatino, serif", "'Arial', sans-serif",
            "'Helvetica Neue', Helvetica, sans-serif", "'Trebuchet MS', sans-serif",
            "'Verdana', sans-serif", "'Courier New', Courier, monospace"];
          const match = FONT_VALS.find(v => v && ff.includes(v.toLowerCase().replace(/'/g,'').split(',')[0].trim()));
          fontDropdown.setValue(match !== undefined ? match : '');
        }
        // Text colour
        try {
          const colour = document.queryCommandValue('foreColor');
          if (colour && colour !== 'false') {
            const bar = document.getElementById('doc-tb-textcolour-bar');
            const input = document.getElementById('doc-tb-textcolour-input');
            if (bar) bar.style.background = colour;
            if (input) { try { input.value = rgbToHex(colour); } catch(e) {} }
          }
        } catch(e) {}
      }
    }
  }

  document.addEventListener('selectionchange', () => {
    if (document.body.classList.contains('page-view-active')) {
      updateDocToolbarState();
    }
  });

  // Init state if already in page view on load
  if (document.body.classList.contains('page-view-active')) {
    updateDocToolbarState();
  }
})();

// ── Doc Toolbar Level 2 ──────────────────────────────────────────────────────

(function () {

  function getActiveBody() {
    const a = document.activeElement;
    if (a && a.isContentEditable) return a;
    const pages = document.querySelectorAll('.page-content');
    return pages[pages.length - 1] || null;
  }

  function dtExec(cmd, val) {
    const body = getActiveBody();
    if (body) body.focus();
    document.execCommand(cmd, false, val || null);
  }

  // ── Text colour ──
  const textColourBtn   = document.getElementById('doc-tb-textcolour-btn');
  const textColourInput = document.getElementById('doc-tb-textcolour-input');
  const textColourBar   = document.getElementById('doc-tb-textcolour-bar');
  let lastTextColour = '#000000';

  if (textColourBtn && textColourInput) {
    // Click the button area (not the hidden input) reapplies last colour
    textColourBtn.addEventListener('mousedown', (e) => {
      // If click is on the svg/span part, reapply last colour
      if (e.target === textColourBtn || e.target.closest('svg') || e.target === textColourBar) {
        e.preventDefault();
        const body = getActiveBody();
        if (body) body.focus();
        document.execCommand('foreColor', false, lastTextColour);
      }
      // Otherwise let the hidden input open (it sits on top via opacity:0)
    });

    textColourInput.addEventListener('input', () => {
      lastTextColour = textColourInput.value;
      if (textColourBar) textColourBar.style.background = lastTextColour;
      const body = getActiveBody();
      if (body) body.focus();
      document.execCommand('foreColor', false, lastTextColour);
    });
  }

  // ── Highlight colour ──
  const hlBtn   = document.getElementById('doc-tb-highlight-btn');
  const hlInput = document.getElementById('doc-tb-highlight-input');
  const hlBar   = document.getElementById('doc-tb-highlight-bar');
  let lastHlColour = '#FFFF00';

  if (hlBtn && hlInput) {
    hlBtn.addEventListener('mousedown', (e) => {
      if (e.target === hlBtn || e.target.closest('svg') || e.target === hlBar) {
        e.preventDefault();
        const body = getActiveBody();
        if (body) body.focus();
        document.execCommand('hiliteColor', false, lastHlColour);
      }
    });

    hlInput.addEventListener('input', () => {
      lastHlColour = hlInput.value;
      if (hlBar) hlBar.style.background = lastHlColour;
      const body = getActiveBody();
      if (body) body.focus();
      document.execCommand('hiliteColor', false, lastHlColour);
    });
  }

  // ── Alignment, lists, indent/outdent — all data-cmd, same pattern as B/I/U ──
  const level2Cmds = [
    'doc-tb-alignleft', 'doc-tb-aligncenter', 'doc-tb-alignright', 'doc-tb-alignjustify',
    'doc-tb-ul', 'doc-tb-ol', 'doc-tb-indent', 'doc-tb-outdent'
  ];

  level2Cmds.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dtExec(btn.dataset.cmd);
      // Reflect alignment active state immediately
      updateAlignState();
    });
  });

  function updateAlignState() {
    ['justifyLeft','justifyCenter','justifyRight','justifyFull'].forEach(cmd => {
      const map = {
        justifyLeft:    'doc-tb-alignleft',
        justifyCenter:  'doc-tb-aligncenter',
        justifyRight:   'doc-tb-alignright',
        justifyFull:    'doc-tb-alignjustify',
      };
      const btn = document.getElementById(map[cmd]);
      if (btn) {
        try { btn.classList.toggle('active', document.queryCommandState(cmd)); } catch(e) {}
      }
    });
    ['insertUnorderedList','insertOrderedList'].forEach(cmd => {
      const map = { insertUnorderedList: 'doc-tb-ul', insertOrderedList: 'doc-tb-ol' };
      const btn = document.getElementById(map[cmd]);
      if (btn) {
        try { btn.classList.toggle('active', document.queryCommandState(cmd)); } catch(e) {}
      }
    });
  }

  // ── Link button — reuses existing link modal ──
  const docLinkBtn = document.getElementById('doc-tb-link');
  if (docLinkBtn) {
    docLinkBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // Delegate to the existing link button in the tray
      const existing = document.getElementById('fmt-link-btn');
      if (existing) existing.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
  }

  // ── Clear formatting ──
  const clearBtn = document.getElementById('doc-tb-clear');
  if (clearBtn) {
    clearBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const body = getActiveBody();
      if (body) body.focus();
      document.execCommand('removeFormat', false, null);
    });
  }

  // ── Extend selectionchange to also update Level 2 state ──
  document.addEventListener('selectionchange', () => {
    if (document.body.classList.contains('page-view-active')) {
      updateAlignState();
    }
  });

  // ── Undo / Redo ──
  const undoBtn = document.getElementById('doc-tb-undo');
  const redoBtn = document.getElementById('doc-tb-redo');
  function docExec(cmd) {
    const body = getActiveBody();
    if (body) body.focus();
    document.execCommand(cmd, false, null);
  }
  if (undoBtn) undoBtn.addEventListener('mousedown', (e) => { e.preventDefault(); docExec('undo'); });
  if (redoBtn) redoBtn.addEventListener('mousedown', (e) => { e.preventDefault(); docExec('redo'); });

  // Keyboard undo/redo when in page view
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('page-view-active')) return;
    const focused = document.activeElement;
    const inPage = focused && focused.classList.contains('page-content');
    if (!inPage) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      // Let browser handle native undo in contenteditable
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      docExec('redo');
    }
  });

})();