// tooltip.js — instant custom tooltips for any element with a `title`.
//
// Native `title` tooltips appear only after a ~1s delay and get cancelled on
// the slightest pointer movement, so they "mostly don't show". This replaces
// them with a single styled tooltip that appears immediately. It uses event
// delegation on the document, so it also covers buttons created later at
// runtime (table/code/image controls, modals, etc.).

(function initInstantTooltips() {
  let tipEl = null;

  function ensureTip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'instant-tooltip';
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }

  // Walk up from the hovered node to the nearest element that carries a label.
  function findLabelled(node) {
    while (node && node !== document.body && node.nodeType === 1) {
      if (node.getAttribute('data-tip') || node.getAttribute('title')) return node;
      node = node.parentElement;
    }
    return null;
  }

  function position(tip, target) {
    const r = target.getBoundingClientRect();
    // measure off-screen-safe
    tip.style.visibility = 'hidden';
    tip.classList.add('show');
    const tr = tip.getBoundingClientRect();

    let top = r.top - tr.height - 8;          // prefer above
    if (top < 4) top = r.bottom + 8;          // flip below if no room
    let left = r.left + r.width / 2 - tr.width / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tr.width - 4));

    tip.style.top = Math.round(top) + 'px';
    tip.style.left = Math.round(left) + 'px';
    tip.style.visibility = '';
  }

  function show(target) {
    // Move the native title into data-tip so the browser's own (slow) tooltip
    // never fires; data-tip then serves every subsequent hover.
    if (target.hasAttribute('title')) {
      const t = target.getAttribute('title');
      if (t) target.setAttribute('data-tip', t);
      target.removeAttribute('title');
    }
    const text = target.getAttribute('data-tip');
    if (!text) return;
    const tip = ensureTip();
    tip.textContent = text;
    position(tip, target);
    tip.classList.add('show');
  }

  function hide() {
    if (tipEl) tipEl.classList.remove('show');
  }

  document.addEventListener('mouseover', (e) => {
    const target = findLabelled(e.target);
    if (target) show(target); else hide();
  });
  document.addEventListener('mouseout', (e) => {
    // hide when leaving the labelled element entirely
    const from = findLabelled(e.target);
    const to = findLabelled(e.relatedTarget);
    if (from && from !== to) hide();
  });

  // Don't let a tooltip linger after a click or while scrolling.
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('scroll', hide, true);
})();
