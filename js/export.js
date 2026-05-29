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
  const title = (document.getElementById('editor-title').value || 'Untitled').trim();
  const name  = getNoteDownloadName();

  if (format === 'txt') {
    const content = title + '\n\n' + getNoteExportText();
    triggerDownload(new Blob([content], { type: 'text/plain;charset=utf-8' }), name + '.txt');
  } else if (format === 'pdf') {
    downloadPdf(title, name);
  } else if (format === 'docx') {
    downloadDocx(title, name);
  }
}

// ── Clean export copy ────────────────────────────────
// Returns a sanitized clone of the editor body with all editing chrome
// removed, so exports contain only the actual note content.
function buildExportRoot() {
  const bodyEl = document.getElementById('editor-body');
  const root = bodyEl ? bodyEl.cloneNode(true) : document.createElement('div');
  root.removeAttribute('id');
  root.className = ''; // drop "editor-body" so editor-scoped CSS doesn't leak into exports

  // Code blocks → clean <pre><code> built from the stored source
  root.querySelectorAll('.code-block-wrapper').forEach(w => {
    let code = w.getAttribute('data-code');
    if (code == null) {
      const lines = w.querySelectorAll('.CodeMirror-line');
      code = Array.from(lines).map(l => l.textContent.replace(/[​﻿]/g, '')).join('\n');
    }
    const pre = document.createElement('pre');
    pre.className = 'exp-code';
    pre.setAttribute('data-lang', w.getAttribute('data-lang') || '');
    const codeEl = document.createElement('code');
    codeEl.textContent = code || '';
    pre.appendChild(codeEl);
    w.replaceWith(pre);
  });

  // Strip table / image chrome (regenerated in-app, not real content)
  root.querySelectorAll('.table-toolbar, .col-resizer, .table-delete-btn, .img-resize-handle, .img-delete-btn')
    .forEach(el => el.remove());

  // Unwrap tables from their editor wrapper and drop sizing styles so the
  // export's own clean borders apply instead of the editor's partial divider.
  root.querySelectorAll('.table-block-wrapper').forEach(w => {
    const table = w.querySelector('table');
    if (table) w.replaceWith(table); else w.remove();
  });
  root.querySelectorAll('table, th, td').forEach(el => { el.style.width = ''; el.removeAttribute('class'); });

  // Unwrap images down to a bare <img>, then normalize sizing so they never
  // exceed the page/content width (keeps aspect ratio).
  root.querySelectorAll('.img-resize-wrapper').forEach(w => {
    const img = w.querySelector('img');
    if (img) w.replaceWith(img); else w.remove();
  });
  root.querySelectorAll('.img-block').forEach(b => {
    const img = b.querySelector('img');
    if (img) b.replaceWith(img); else b.remove();
  });
  root.querySelectorAll('img').forEach(img => {
    const wpx = parseInt(img.style.width, 10) || parseInt(img.getAttribute('width'), 10) || 0;
    img.removeAttribute('class');
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.style.cssText = 'max-width:100%;height:auto;' + (wpx ? 'width:' + wpx + 'px;' : '');
  });

  root.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  return root;
}

function getNoteExportText() {
  const root = buildExportRoot();
  let out = '';
  root.childNodes.forEach(n => out += _blockText(n));
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// Inline text of a node, turning <br> into newlines.
function _inlineText(node) {
  let s = '';
  node.childNodes.forEach(c => {
    if (c.nodeType === 3) s += c.nodeValue;
    else if (c.nodeType === 1) s += (c.tagName.toLowerCase() === 'br') ? '\n' : _inlineText(c);
  });
  return s.replace(/[ \t]+/g, ' ').trim();
}

// Render a table as a Markdown pipe table.
function _tableText(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (!rows.length) return '';
  const matrix = rows.map(tr =>
    Array.from(tr.children).filter(c => /^(td|th)$/i.test(c.tagName))
      .map(td => _inlineText(td).replace(/\n/g, ' ')));
  const cols = Math.max(...matrix.map(r => r.length));
  const line = cells => '| ' + Array.from({ length: cols }, (_, i) => cells[i] || '').join(' | ') + ' |';
  let out = line(matrix[0]) + '\n';
  out += '|' + Array.from({ length: cols }, () => '---').join('|') + '|\n';
  for (let i = 1; i < matrix.length; i++) out += line(matrix[i]) + '\n';
  return out;
}

function _blockText(node) {
  if (node.nodeType === 3) { const t = node.nodeValue.trim(); return t ? t + '\n\n' : ''; }
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  const hasBlockKids = node.querySelector &&
    node.querySelector('p,div,ul,ol,table,pre,img,h1,h2,h3,h4,h5,h6,blockquote');
  switch (tag) {
    case 'ul': case 'ol': {
      let s = '', i = 1;
      Array.from(node.children).forEach(li => {
        if (li.tagName.toLowerCase() !== 'li') return;
        s += (tag === 'ol' ? (i++ + '. ') : '- ') + _inlineText(li) + '\n';
      });
      return s + '\n';
    }
    case 'pre': {
      const lang = node.getAttribute('data-lang');
      const fence = lang && lang !== 'plaintext' ? lang : '';
      return '```' + fence + '\n' + node.textContent.replace(/\s+$/, '') + '\n```\n\n';
    }
    case 'table': return _tableText(node) + '\n';
    case 'img': return '[image]\n\n';
    case 'br': return '\n';
    default: {
      if (hasBlockKids) { let s = ''; node.childNodes.forEach(c => s += _blockText(c)); return s; }
      const t = _inlineText(node);
      return t ? t + '\n\n' : '';
    }
  }
}

// ── Shared CDN loader ────────────────────────────────
const _loadedScripts = {};
function loadScriptOnce(src) {
  if (_loadedScripts[src]) return _loadedScripts[src];
  _loadedScripts[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
  return _loadedScripts[src];
}

// ── PDF (direct download via html2pdf, print fallback) ──
const PDF_STYLE = `
  .pdf-export-root { font-family: Georgia, 'Times New Roman', serif; color: #111; font-size: 15px; line-height: 1.7; }
  .pdf-export-root .pdf-title { font-size: 26px; font-weight: 700; margin: 0 0 20px; font-family: Arial, sans-serif; }
  .pdf-export-root p { margin: 0 0 10px; }
  .pdf-export-root ul, .pdf-export-root ol { margin: 0 0 10px 0; padding-left: 26px; }
  .pdf-export-root ul { list-style: disc; }
  .pdf-export-root ol { list-style: decimal; }
  .pdf-export-root li { margin: 2px 0; }
  .pdf-export-root table { border-collapse: collapse; margin: 8px 0; }
  .pdf-export-root th, .pdf-export-root td { border: 1px solid #999; padding: 5px 9px; text-align: left; }
  .pdf-export-root img { max-width: 100% !important; height: auto !important; display: block; margin: 8px 0; }
  .pdf-export-root .exp-code-lang { font-family: Arial, sans-serif; font-size: 11px; font-weight: 700;
    letter-spacing: 0.04em; text-transform: uppercase; color: #888; margin: 10px 0 -2px; }
  .pdf-export-root pre.exp-code { background: #f4f4f4; border: 1px solid #e0e0e0; border-radius: 6px;
    padding: 12px 14px; margin: 6px 0 12px; font-family: Consolas, 'Courier New', monospace; font-size: 13px;
    line-height: 1.5; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
`;

function buildPdfContainer(title) {
  const container = document.createElement('div');
  container.className = 'pdf-export-root';
  const style = document.createElement('style');
  style.textContent = PDF_STYLE;
  container.appendChild(style);
  const h1 = document.createElement('h1');
  h1.className = 'pdf-title';
  h1.textContent = title;
  container.appendChild(h1);
  const body = buildExportRoot();
  // Label each code block with its language so it reads as code.
  body.querySelectorAll('pre.exp-code').forEach(pre => {
    const lang = pre.getAttribute('data-lang');
    if (lang && lang !== 'plaintext') {
      const label = document.createElement('div');
      label.className = 'exp-code-lang';
      label.textContent = lang;
      pre.parentNode.insertBefore(label, pre);
    }
  });
  container.appendChild(body);
  return container;
}

function downloadPdf(title, name) {
  const render = () => {
    // html2canvas reports 0 height (→ blank PDF) when the page can't scroll
    // (the app sets html/body overflow:hidden) and when the target is moved
    // far off-screen. So relax overflow and render the container in normal
    // flow just below the app, where it's outside the viewport but still
    // measurable. Restore everything in cleanup().
    const de = document.documentElement, body = document.body;
    const prevHtmlOv = de.style.overflow, prevBodyOv = body.style.overflow;
    de.style.overflow = 'visible';
    body.style.overflow = 'visible';

    const container = buildPdfContainer(title);
    container.style.cssText += ';width:760px;background:#fff;padding:0 8px;';
    body.appendChild(container);

    const cleanup = () => {
      if (container.parentNode) container.parentNode.removeChild(container);
      de.style.overflow = prevHtmlOv;
      body.style.overflow = prevBodyOv;
    };

    window.html2pdf().set({
      margin: [12, 12, 14, 12],
      filename: name + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(container).save().then(cleanup).catch((e) => { cleanup(); printFallback(title); });
  };

  if (typeof window.html2pdf !== 'undefined') {
    render();
  } else {
    showToast('Preparing PDF…');
    loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js')
      .then(render)
      .catch(() => printFallback(title));
  }
}

// Fallback: the original print-to-PDF path, used only if the library can't load.
function printFallback(title) {
  const win = window.open('', '_blank');
  if (!win) { showToast('Allow pop-ups to download the PDF', true); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
    <style>body{margin:40px auto;max-width:680px;padding:0 24px;}${PDF_STYLE}</style></head>
    <body><div class="pdf-export-root"><h1 class="pdf-title">${escapeHtml(title)}</h1>${buildExportRoot().innerHTML}</div></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

// ── DOCX (real formatting from the clean HTML) ──
function _xml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _run(text, fmt) {
  if (!text) return '';
  let rpr = '';
  if (fmt.b) rpr += '<w:b/>';
  if (fmt.i) rpr += '<w:i/>';
  if (fmt.u) rpr += '<w:u w:val="single"/>';
  if (fmt.code) rpr += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>';
  const rprXml = rpr ? `<w:rPr>${rpr}</w:rPr>` : '';
  return `<w:r>${rprXml}<w:t xml:space="preserve">${_xml(text)}</w:t></w:r>`;
}

// Recurse inline content, accumulating bold/italic/underline state.
function _inlineRuns(node, fmt) {
  let out = '';
  node.childNodes.forEach(child => {
    if (child.nodeType === 3) {
      out += _run(child.nodeValue, fmt);
    } else if (child.nodeType === 1) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'br') { out += '<w:r><w:br/></w:r>'; return; }
      const f = Object.assign({}, fmt);
      if (tag === 'b' || tag === 'strong') f.b = true;
      if (tag === 'i' || tag === 'em') f.i = true;
      if (tag === 'u') f.u = true;
      if (tag === 'code') f.code = true;
      out += _inlineRuns(child, f);
    }
  });
  return out;
}

function _para(node, style) {
  const runs = _inlineRuns(node, {});
  const ppr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  if (!runs) return style ? '' : '<w:p/>';
  return `<w:p>${ppr}${runs}</w:p>`;
}

function _preToDocx(node) {
  const lang = node.getAttribute('data-lang');
  const shade = '<w:shd w:val="clear" w:color="auto" w:fill="F4F4F4"/>';
  let out = '';
  if (lang && lang !== 'plaintext') {
    out += `<w:p><w:pPr>${shade}</w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/><w:color w:val="888888"/></w:rPr>` +
      `<w:t xml:space="preserve">${_xml(lang.toUpperCase())}</w:t></w:r></w:p>`;
  }
  out += node.textContent.replace(/\r/g, '').split('\n').map(line =>
    `<w:p><w:pPr><w:pStyle w:val="Code"/>${shade}</w:pPr>${_run(line || ' ', { code: true })}</w:p>`
  ).join('');
  return out;
}

// Collected during DOCX build so the images can be added to the zip + rels.
let _docxImages = [];

function _imgToDocx(node) {
  const src = node.getAttribute('src') || '';
  const m = src.match(/^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) return ''; // only embed inline data-URL images
  const ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
  const idx = _docxImages.length + 1;
  const rId = 'rIdImg' + idx;

  let w = parseInt(node.style.width, 10) || parseInt(node.getAttribute('width'), 10) || 320;
  let h = parseInt(node.style.height, 10) || parseInt(node.getAttribute('height'), 10) || Math.round(w * 0.75);
  const maxW = 576; // ~6 inches of content width
  if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
  const cx = Math.round(w * 9525), cy = Math.round(h * 9525); // px → EMU

  _docxImages.push({ ext, b64: m[2], rId, file: 'image' + idx + '.' + ext });

  return `<w:p><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${idx}" name="Picture ${idx}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${idx}" name="Picture ${idx}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline>` +
    `</w:drawing></w:r></w:p>`;
}

function _listToDocx(node, ordered) {
  let out = '', i = 1;
  Array.from(node.children).forEach(li => {
    if (li.tagName.toLowerCase() !== 'li') return;
    const marker = ordered ? (i++ + '. ') : '• ';
    out += `<w:p><w:pPr><w:ind w:left="360"/></w:pPr>${_run(marker, {})}${_inlineRuns(li, {})}</w:p>`;
    li.querySelectorAll(':scope > ul, :scope > ol').forEach(sub =>
      out += _listToDocx(sub, sub.tagName.toLowerCase() === 'ol'));
  });
  return out;
}

function _tableToDocx(node) {
  const rows = Array.from(node.querySelectorAll('tr'));
  if (!rows.length) return '';
  const borders = `<w:tblBorders>
    <w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/>
    <w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/>
    <w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/>
  </w:tblBorders>`;
  const rowsXml = rows.map(tr => {
    const cells = Array.from(tr.children).filter(c => /^(td|th)$/i.test(c.tagName));
    const cellsXml = cells.map(td => {
      const runs = _inlineRuns(td, td.tagName.toLowerCase() === 'th' ? { b: true } : {});
      return `<w:tc><w:tcPr/><w:p>${runs}</w:p></w:tc>`;
    }).join('');
    return `<w:tr>${cellsXml}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr>${borders}</w:tblPr>${rowsXml}</w:tbl><w:p/>`;
}

function _blockToDocx(node) {
  if (node.nodeType === 3) {
    return node.nodeValue.trim() ? `<w:p>${_run(node.nodeValue, {})}</w:p>` : '';
  }
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case 'h1': return _para(node, 'Heading1');
    case 'h2': return _para(node, 'Heading2');
    case 'h3': case 'h4': case 'h5': case 'h6': return _para(node, 'Heading3');
    case 'p': return _para(node, null);
    case 'pre': return _preToDocx(node);
    case 'blockquote': return _para(node, 'Quote');
    case 'ul': return _listToDocx(node, false);
    case 'ol': return _listToDocx(node, true);
    case 'table': return _tableToDocx(node);
    case 'br': return '<w:p/>';
    case 'img': return _imgToDocx(node);
    default:
      // Container: recurse if it holds block-level children, else one paragraph
      if (node.querySelector && node.querySelector('p,div,ul,ol,table,pre,img,h1,h2,h3,h4,h5,h6,blockquote')) {
        let inner = '';
        node.childNodes.forEach(c => inner += _blockToDocx(c));
        return inner;
      }
      return _para(node, null);
  }
}

function downloadDocx(title, name) {
  if (typeof JSZip === 'undefined') {
    showToast('Preparing DOCX…');
    loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')
      .then(() => downloadDocx(title, name))
      .catch(() => showToast('Could not load DOCX library', true));
    return;
  }

  _docxImages = [];
  const root = buildExportRoot();
  let bodyXml = '';
  root.childNodes.forEach(n => bodyXml += _blockToDocx(n));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${_run(title, {})}</w:p>
    ${bodyXml}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="56"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`;

  const imgRels = _docxImages.map(im =>
    `<Relationship Id="${im.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${im.file}"/>`
  ).join('');

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${imgRels}
</Relationships>`;

  const imgTypeDefaults = [...new Set(_docxImages.map(im => im.ext))]
    .map(ext => `<Default Extension="${ext}" ContentType="image/${ext}"/>`).join('');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${imgTypeDefaults}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/_rels/document.xml.rels', relsXml);
  _docxImages.forEach(im => zip.file('word/media/' + im.file, im.b64, { base64: true }));
  zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    .then(blob => triggerDownload(blob, name + '.docx'));
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