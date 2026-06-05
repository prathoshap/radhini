/* =========================================================
   Radhini Rao · Kalaashaala — interactions
   ========================================================= */

/* ---------- Gallery data (caption + category) ---------- */
const GALLERY = [
  { src: "carnatic-concert-1.jpg",       cat: "performances", cap: "Smt. Radha Sathyanarayanan in concert — a Tyagaraja kriti" },
  { src: "new-students-1.jpg",           cat: "kalaashaala",  cap: "Young students performing Bharatanatyam" },
  { src: "arun-carnatic.jpg",            cat: "performances", cap: "Sri Arun Kumar Sathyanarayanan in a Carnatic vocal concert" },
  { src: "new-students-2.jpg",           cat: "kalaashaala",  cap: "Young students in performance" },
  { src: "carnatic-concert-2.jpg",       cat: "performances", cap: "Smt. Radha Sathyanarayanan in a Carnatic vocal concert" },
  { src: "new-student-yellow.jpg",       cat: "kalaashaala",  cap: "A young student of Kalaashaala" },
  { src: "carnatic-vocal.jpg",           cat: "performances", cap: "Radhini Rao — Carnatic vocal performance" },
  { src: "new-felicitation.jpg",         cat: "kalaashaala",  cap: "Honouring guests at a Kalaashaala event" },
  { src: "radhini-arun.jpg",             cat: "performances", cap: "With Sri Arun Kumar Sathyanarayanan" },
  { src: "geetamahotsav.jpg",            cat: "performances", cap: "Geetamahotsav — curated by the Embassy of India, with the Indian Ambassador" },
  { src: "abhinaya-vishnu.jpg",          cat: "performances", cap: "Abhinaya with live musicians" },
  { src: "diwali-scania.jpg",            cat: "performances", cap: "Diwali performance, curated by Scania" },
  { src: "sewa-sweden.jpg",              cat: "performances", cap: "Sewa Sweden — Diwali celebrations" },
  { src: "iskcon-jarna.jpg",             cat: "performances", cap: "Performing at ISKCON, Järna" },
  { src: "with-vyshnavi.jpg",            cat: "performances", cap: "With Kuchipudi dancer Vyshnavi Rohini" },
  { src: "duo-delight-1.jpg",            cat: "performances", cap: "Duo Delight — with Vyshnavi Rohini" },
  { src: "duo-delight-2.jpg",            cat: "performances", cap: "Duo Delight — with Vyshnavi Rohini" },
  { src: "nordic-bengali.jpg",           cat: "performances", cap: "Ensemble performance — Nordic Bengali Association" },
  { src: "tyagaraja-2025-1.jpg",         cat: "performances", cap: "Tyagaraja Aradhana 2025" },
  { src: "tyagaraja-2025-2.jpg",         cat: "performances", cap: "Tyagaraja Aradhana 2025" },
  { src: "tyagaraja-2025-3.jpg",         cat: "performances", cap: "Tyagaraja Aradhana 2025" },
  { src: "tyagaraja-2025-4.jpg",         cat: "performances", cap: "Tyagaraja Aradhana 2025" },
  { src: "tyagaraja-2025-5.jpg",         cat: "performances", cap: "Tyagaraja Aradhana 2025" },
  { src: "tyagaraja-2026.jpg",           cat: "performances", cap: "Tyagaraja Aradhana 2026" },
  { src: "tyagaraja.jpg",                cat: "performances", cap: "Tyagaraja Aradhana" },
  { src: "beginners-kannada-koota.jpg",  cat: "kalaashaala",  cap: "Beginners batch performing at Sweden Kannada Koota" },
  { src: "students-saraswathi.jpg",      cat: "kalaashaala",  cap: "Students' performance — Indian Festival, Saraswathi Kala Kendra" },
  { src: "students-young-sangeeth.jpg",  cat: "kalaashaala",  cap: "Students at the Young Sangeeth Festival" },
  { src: "anniversary-2025.jpg",         cat: "kalaashaala",  cap: "Kalaashaala anniversary, 2025" },
  { src: "anniversary.jpg",              cat: "kalaashaala",  cap: "Kalaashaala anniversary celebration" },
  { src: "class-1.jpg",                  cat: "kalaashaala",  cap: "In class at Kalaashaala" },
  { src: "class-2.jpg",                  cat: "kalaashaala",  cap: "In class at Kalaashaala" },
  { src: "embassy-appreciation.jpg",     cat: "kalaashaala",  cap: "Appreciation Award — Embassy of India, Stockholm" },
];
const BASE = "assets/img/gallery/";

/* ---------- Build gallery tiles ---------- */
const grid = document.getElementById("galleryGrid");
GALLERY.forEach((item, i) => {
  const tile = document.createElement("button");
  tile.className = "tile";
  tile.dataset.cat = item.cat;
  tile.dataset.index = i;
  tile.innerHTML = `
    <img src="${BASE}${item.src}" alt="${item.cap}" loading="lazy" />
    <span class="tile__cap">${item.cap}</span>`;
  grid.appendChild(tile);
});

/* ---------- Header scroll state ---------- */
const header = document.getElementById("header");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 60);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

/* ---------- Mobile nav ---------- */
const nav = document.getElementById("nav");
const navToggle = document.getElementById("navToggle");
navToggle.addEventListener("click", () => {
  nav.classList.toggle("open");
  navToggle.classList.toggle("active");
});
nav.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    nav.classList.remove("open");
    navToggle.classList.remove("active");
  })
);

/* ---------- Reveal on scroll (reveal + tiles) ---------- */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
);
document.querySelectorAll(".reveal, .tile").forEach((el) => io.observe(el));

/* ---------- Gallery filtering ---------- */
const filters = document.getElementById("filters");
filters.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter");
  if (!btn) return;
  filters.querySelectorAll(".filter").forEach((f) => f.classList.remove("is-active"));
  btn.classList.add("is-active");
  const f = btn.dataset.filter;
  grid.querySelectorAll(".tile").forEach((t) => {
    t.classList.toggle("is-hidden", f !== "all" && t.dataset.cat !== f);
  });
});

/* ---------- Lightbox ---------- */
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbCap = document.getElementById("lbCap");
let current = 0;

function visibleTiles() {
  return [...grid.querySelectorAll(".tile:not(.is-hidden)")];
}
function openLightbox(tile) {
  const tiles = visibleTiles();
  current = tiles.indexOf(tile);
  showCurrent(tiles);
  lb.classList.add("open");
  lb.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function showCurrent(tiles) {
  const item = GALLERY[+tiles[current].dataset.index];
  lbImg.src = BASE + item.src;
  lbImg.alt = item.cap;
  lbCap.textContent = item.cap;
}
function step(dir) {
  const tiles = visibleTiles();
  current = (current + dir + tiles.length) % tiles.length;
  showCurrent(tiles);
}
function closeLightbox() {
  lb.classList.remove("open");
  lb.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

grid.addEventListener("click", (e) => {
  const tile = e.target.closest(".tile");
  if (tile) openLightbox(tile);
});
document.getElementById("lbClose").addEventListener("click", closeLightbox);
document.getElementById("lbPrev").addEventListener("click", () => step(-1));
document.getElementById("lbNext").addEventListener("click", () => step(1));
lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
document.addEventListener("keydown", (e) => {
  if (!lb.classList.contains("open")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowRight") step(1);
  if (e.key === "ArrowLeft") step(-1);
});

/* ---------- Hero slideshow ---------- */
const slides = document.querySelectorAll(".hero__slide");
let slideIdx = 0;
setInterval(() => {
  slides[slideIdx].classList.remove("is-active");
  slideIdx = (slideIdx + 1) % slides.length;
  slides[slideIdx].classList.add("is-active");
}, 6000);

/* ---------- Footer year ---------- */
document.getElementById("year").textContent = new Date().getFullYear();
