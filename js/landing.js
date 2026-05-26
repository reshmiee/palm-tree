// landing.js — carousel logic

const slides = [
  "No accounts. No clouds. Just you and your words.",
  "Everything you write stays with you, always.",
  "A quiet place on the internet that's entirely yours.",
  "Write freely. No one is watching.",
  "Your thoughts, organized the way you think.",
  "No distractions. No notifications. Just write.",
  "Like a diary, but always in your pocket.",
  "Export your mind, anytime you want.",
];

let current = 0;
let autoTimer = null;

const textEl = document.getElementById('carousel-text');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

function showSlide(index) {
  textEl.classList.add('fade');
  setTimeout(() => {
    textEl.textContent = slides[index];
    textEl.classList.remove('fade');
  }, 300);
}

function next() {
  current = (current + 1) % slides.length;
  showSlide(current);
}

function prev() {
  current = (current - 1 + slides.length) % slides.length;
  showSlide(current);
}

function startAuto() {
  autoTimer = setInterval(next, 3500);
}

function resetAuto() {
  clearInterval(autoTimer);
  startAuto();
}

nextBtn.addEventListener('click', () => { next(); resetAuto(); });
prevBtn.addEventListener('click', () => { prev(); resetAuto(); });

// Init
showSlide(current);
startAuto();