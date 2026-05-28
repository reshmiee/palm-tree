// landing.js — info carousel

const slides = [
  "Palm Tree is a private writing space that lives entirely in your browser. No accounts, no servers — just open and write.",
  "Everything you write stays on your device. Nothing is ever sent anywhere. Your words are yours, always.",
  "Organize notes into folders, browse by month, and search across everything instantly as you type.",
  "Export all your notes as a JSON file anytime, and import them back whenever you need. Your data, your control.",
  "No distractions, no notifications, no clutter. Just a clean space to think, write, and remember.",
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
  }, 350);
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
  autoTimer = setInterval(next, 4000);
}

function resetAuto() {
  clearInterval(autoTimer);
  startAuto();
}

nextBtn.addEventListener('click', () => { next(); resetAuto(); });
prevBtn.addEventListener('click', () => { prev(); resetAuto(); });

showSlide(current);
startAuto();