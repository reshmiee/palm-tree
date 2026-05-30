// typing-test.js — typing speed test modal

(function () {

  const PASSAGES = [
    "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump at my whim.",
    "To be or not to be, that is the question. Whether it is nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take arms against a sea of troubles.",
    "All things are difficult before they are easy. Every expert was once a beginner. Success is the sum of small efforts, repeated day in and day out.",
    "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity.",
    "Programming is not about typing, it is about thinking. The best code is no code at all. Write code that is easy to delete, not easy to extend.",
    "She sells seashells by the seashore. How much wood would a woodchuck chuck if a woodchuck could chuck wood? Peter Piper picked a peck of pickled peppers.",
    "The only way to do great work is to love what you do. Innovation distinguishes between a leader and a follower. Stay hungry, stay foolish.",
    "In the beginning was the word, and the word was with the creator of all things great and small. From a single seed, a mighty forest grows in time.",
    "Simplicity is the ultimate sophistication. Design is not just what it looks like and feels like. Design is how it works. Less is more, always.",
    "Not everything that is faced can be changed, but nothing can be changed until it is faced. The beautiful thing about learning is that no one can take it away from you.",
  ];

  // ── State ─────────────────────────────────────────────

  let passage  = '';
  let typed    = '';
  let startTime = null;
  let elapsed  = 0;
  let rafId    = null;
  let finished = false;

  // ── DOM ───────────────────────────────────────────────

  const overlay = document.createElement('div');
  overlay.id = 'typing-test-overlay';
  overlay.className = 'tt-overlay hidden';
  overlay.innerHTML = `
    <div class="tt-modal">
      <div class="tt-header">
        <span class="tt-title">Typing Test</span>
        <button class="tt-close" aria-label="Close">×</button>
      </div>

      <div class="tt-body">
        <div class="tt-passage" id="tt-passage"></div>
        <input class="tt-hidden-input" id="tt-input"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />

        <div class="tt-stats">
          <div class="tt-stat">
            <span class="tt-stat-val" id="tt-wpm">—</span>
            <span class="tt-stat-lbl">WPM</span>
          </div>
          <div class="tt-stat-divider"></div>
          <div class="tt-stat">
            <span class="tt-stat-val" id="tt-acc">—</span>
            <span class="tt-stat-lbl">Accuracy</span>
          </div>
          <div class="tt-stat-divider"></div>
          <div class="tt-stat">
            <span class="tt-stat-val" id="tt-time">0:00</span>
            <span class="tt-stat-lbl">Time</span>
          </div>
        </div>

        <div class="tt-actions">
          <button class="tt-btn" id="tt-restart">↺  Restart</button>
          <button class="tt-btn" id="tt-new">New Text</button>
        </div>
      </div>

      <div class="tt-result hidden" id="tt-result">
        <div class="tt-result-wpm"><span id="tt-final-wpm">0</span></div>
        <div class="tt-result-wpm-label">words per minute</div>
        <div class="tt-result-sub">
          <span id="tt-final-acc">100</span>% accuracy
          &nbsp;·&nbsp;
          <span id="tt-final-time">0:00</span>
        </div>
        <button class="tt-btn tt-btn-primary" id="tt-try-again">Try Again</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const passageEl  = overlay.querySelector('#tt-passage');
  const inputEl    = overlay.querySelector('#tt-input');
  const wpmEl      = overlay.querySelector('#tt-wpm');
  const accEl      = overlay.querySelector('#tt-acc');
  const timeEl     = overlay.querySelector('#tt-time');
  const resultEl   = overlay.querySelector('#tt-result');

  // ── Helpers ───────────────────────────────────────────

  function pickPassage() {
    return PASSAGES[Math.floor(Math.random() * PASSAGES.length)];
  }

  function fmtTime(s) {
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  function countCorrect() {
    let n = 0;
    for (let i = 0; i < typed.length; i++) {
      if (typed[i] === passage[i]) n++;
    }
    return n;
  }

  function getWpm() {
    if (!startTime || elapsed < 0.5) return 0;
    return Math.round((countCorrect() / 5) / (elapsed / 60));
  }

  function getAcc() {
    if (!typed.length) return 100;
    return Math.round((countCorrect() / typed.length) * 100);
  }

  // ── Render ────────────────────────────────────────────

  function renderPassage() {
    passageEl.innerHTML = passage.split('').map((ch, i) => {
      let cls = 'tt-ch';
      if (i < typed.length) {
        cls += typed[i] === ch ? ' ok' : ' err';
      } else if (i === typed.length) {
        cls += ' cur';
      }
      // Use a non-breaking thin space so consecutive spaces are visible
      const disp = ch === ' ' ? ' ' : ch;
      return `<span class="${cls}">${disp}</span>`;
    }).join('');
  }

  function updateStats() {
    wpmEl.textContent  = startTime ? getWpm()        : '—';
    accEl.textContent  = startTime ? getAcc() + '%'  : '—';
    timeEl.textContent = fmtTime(elapsed);
  }

  // ── Timer loop ────────────────────────────────────────

  function tick() {
    if (!startTime || finished) return;
    elapsed = (Date.now() - startTime) / 1000;
    updateStats();
    rafId = requestAnimationFrame(tick);
  }

  // ── Finish ────────────────────────────────────────────

  function finish() {
    finished = true;
    cancelAnimationFrame(rafId);
    elapsed = (Date.now() - startTime) / 1000;
    updateStats();

    overlay.querySelector('#tt-final-wpm').textContent  = getWpm();
    overlay.querySelector('#tt-final-acc').textContent  = getAcc();
    overlay.querySelector('#tt-final-time').textContent = fmtTime(elapsed);

    inputEl.disabled = true;
    // Slight delay so last char renders before result appears
    setTimeout(() => resultEl.classList.remove('hidden'), 200);
  }

  // ── Reset ─────────────────────────────────────────────

  function reset(newPassage) {
    passage  = newPassage || passage;
    typed    = '';
    startTime = null;
    elapsed  = 0;
    finished = false;
    cancelAnimationFrame(rafId);
    inputEl.value    = '';
    inputEl.disabled = false;
    resultEl.classList.add('hidden');
    renderPassage();
    updateStats();
    inputEl.focus();
  }

  // ── Input ─────────────────────────────────────────────

  inputEl.addEventListener('input', () => {
    if (finished) return;

    const val = inputEl.value;

    if (!startTime && val.length > 0) {
      startTime = Date.now();
      rafId = requestAnimationFrame(tick);
    }

    typed = val.slice(0, passage.length);
    inputEl.value = typed;

    renderPassage();
    updateStats();

    if (typed.length === passage.length) finish();
  });

  // Prevent paste cheating
  inputEl.addEventListener('paste', e => e.preventDefault());

  // Click anywhere inside modal re-focuses input
  overlay.querySelector('.tt-modal').addEventListener('click', () => {
    if (!finished) inputEl.focus();
  });

  // ── Button wiring ─────────────────────────────────────

  overlay.querySelector('.tt-close').addEventListener('click', closeTest);
  overlay.querySelector('#tt-restart').addEventListener('click', () => reset());
  overlay.querySelector('#tt-new').addEventListener('click', () => reset(pickPassage()));
  overlay.querySelector('#tt-try-again').addEventListener('click', () => reset());
  overlay.addEventListener('click', e => { if (e.target === overlay) closeTest(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeTest();
  });

  // ── Open / close ──────────────────────────────────────

  function openTest() {
    overlay.classList.remove('hidden');
    reset(pickPassage());
  }

  function closeTest() {
    overlay.classList.add('hidden');
    cancelAnimationFrame(rafId);
    finished = false;
    startTime = null;
  }

  // ── Navbar button ─────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('typing-test-btn');
    if (btn) btn.addEventListener('click', openTest);
  });

})();

// ── Live editor WPM badge ─────────────────────────────
// Tracks typing in #editor-body and shows a small floating
// WPM pill. Uses a 30-second rolling window so it reflects
// current speed, not a lifetime average.

(function () {

  const WINDOW_MS  = 30000;  // rolling window
  const HIDE_DELAY = 3000;   // hide after this many ms of inactivity

  const events = [];  // { t } — one entry per character inserted
  let hideTimer = null;

  // ── Badge element ─────────────────────────────────────

  const badge = document.createElement('div');
  badge.id = 'editor-wpm-badge';
  badge.className = 'editor-wpm-badge hidden';
  badge.title = 'Your live typing speed (30-second rolling average)';
  document.body.appendChild(badge);

  // ── WPM calculation ───────────────────────────────────

  function calcLiveWpm() {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    // Drop stale events
    while (events.length && events[0].t < cutoff) events.shift();

    if (events.length < 5) return null;  // not enough data yet

    const span = (now - events[0].t) / 60000;  // minutes
    if (span < 0.05) return null;

    return Math.round((events.length / 5) / span);
  }

  // ── Show / hide ───────────────────────────────────────

  function showBadge(wpm) {
    badge.textContent = wpm + ' wpm';
    badge.classList.remove('hidden');
    badge.classList.add('visible');
  }

  function schedulHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      badge.classList.remove('visible');
      badge.classList.add('hidden');
      events.length = 0;
    }, HIDE_DELAY);
  }

  // ── Hook into editor ──────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const body = document.getElementById('editor-body');
    if (!body) return;

    body.addEventListener('input', (e) => {
      // Only count actual character insertions, not deletions/pastes
      if (e.inputType && !e.inputType.startsWith('insert')) return;

      const inserted = e.data ? e.data.length : 1;
      const now = Date.now();
      for (let i = 0; i < inserted; i++) events.push({ t: now });

      const wpm = calcLiveWpm();
      if (wpm !== null) showBadge(wpm);

      schedulHide();
    });
  });

})();
