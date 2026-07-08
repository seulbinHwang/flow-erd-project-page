// Video loading strategy: the hero video gets the network to itself first.
// Gallery videos start downloading only once the hero is fully buffered
// (canplaythrough) and then load two at a time in DOM order, so nothing
// competes with the hero and the clips nearest the viewport arrive first.
const heroVideo = document.querySelector(".showcase video");
const lazyVideos = [...document.querySelectorAll("video[data-src]")];

function loadVideo(v) {
  if (v.dataset.poster && !v.poster) v.poster = v.dataset.poster;
  if (v.getAttribute("src")) return false;
  v.src = v.dataset.src;
  v.preload = "auto";
  v.load();
  return true;
}

let queueStarted = false;
function loadGalleryQueue() {
  if (queueStarted) return;
  queueStarted = true;
  lazyVideos.forEach((v) => { if (v.dataset.poster && !v.poster) v.poster = v.dataset.poster; });
  const queue = lazyVideos.slice();
  let active = 0;
  const pump = () => {
    while (active < 2 && queue.length) {
      const v = queue.shift();
      if (v.getAttribute("src")) continue; // already loaded (e.g. scrolled into view)
      active++;
      let settled = false;
      const done = () => { if (settled) return; settled = true; active--; pump(); };
      v.addEventListener("canplaythrough", done, { once: true });
      v.addEventListener("error", done, { once: true });
      setTimeout(done, 10000); // never let one stalled file block the queue
      loadVideo(v);
    }
  };
  pump();
}

if (heroVideo) {
  heroVideo.play().catch(() => {});
  heroVideo.addEventListener("canplay", () => heroVideo.play().catch(() => {}), { once: true });
  heroVideo.addEventListener("canplaythrough", loadGalleryQueue, { once: true });
  setTimeout(loadGalleryQueue, 8000); // last-resort fallback if the hero stalls
} else {
  loadGalleryQueue();
}

// Play/pause videos as they enter/leave the viewport. A video scrolled into
// view before the queue reaches it jumps the queue and loads immediately.
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const v = entry.target;
      if (entry.isIntersecting) {
        if (v.dataset.src) loadVideo(v);
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
