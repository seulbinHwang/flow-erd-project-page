// Videos: the hero loads first and starts immediately; once it can play
// through (or after a short fallback), every gallery video is fetched
// eagerly in the background so playback is instant when scrolled to.
const heroVideo = document.querySelector(".showcase video");
const lazyVideos = [...document.querySelectorAll("video[data-src]")];

function eagerLoadAll() {
  lazyVideos.forEach((v) => {
    if (!v.getAttribute("src")) {
      v.src = v.dataset.src;
      v.preload = "auto";
      v.load();
    }
  });
}
if (heroVideo) {
  heroVideo.play().catch(() => {});
  heroVideo.addEventListener("canplay", () => heroVideo.play().catch(() => {}), { once: true });
  heroVideo.addEventListener("canplaythrough", eagerLoadAll, { once: true });
  setTimeout(eagerLoadAll, 1500); // fallback if canplaythrough never fires
} else {
  eagerLoadAll();
}

// Play/pause videos as they enter/leave the viewport (they are already buffered).
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const v = entry.target;
      if (entry.isIntersecting) {
        if (v.dataset.src && !v.getAttribute("src")) { v.src = v.dataset.src; v.load(); }
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  },
  { rootMargin: "300px 0px", threshold: 0.05 }
);
document.querySelectorAll("video").forEach((v) => io.observe(v));

// Reveal sections on scroll.
const reveal = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        reveal.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.08 }
);
document.querySelectorAll(".band, .showcase").forEach((el) => reveal.observe(el));

// Scroll-spy for the left table of contents.
const tocItems = [...document.querySelectorAll(".toc li")];
const tocSections = tocItems
  .map((li) => document.querySelector(li.querySelector("a").getAttribute("href")))
  .filter(Boolean);

function updateToc() {
  const probe = window.scrollY + window.innerHeight * 0.35;
  let active = 0;
  tocSections.forEach((sec, i) => {
    if (sec.offsetTop <= probe) active = i;
  });
  tocItems.forEach((li, i) => {
    li.classList.toggle("active", i === active);
    li.classList.toggle("passed", i < active);
  });
}
window.addEventListener("scroll", updateToc, { passive: true });
window.addEventListener("resize", updateToc);
updateToc();
