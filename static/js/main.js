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

// --- Autoplay robustness -----------------------------------------------
// Some environments (Safari with "Never Auto-Play", macOS Low Power Mode,
// blocking extensions, data-saver) refuse autoplay even for muted video.
// Strategy: force muted before every play attempt, retry on media events,
// unlock everything on the first user gesture, and if the hero is buffered
// but still not playing, show an explicit play overlay.

function tryPlay(v) {
  v.muted = true;
  v.defaultMuted = true;
  return v.play().catch(() => {});
}

function unlockAllVideos() {
  document.querySelectorAll("video").forEach((v) => {
    const r = v.getBoundingClientRect();
    const nearViewport = r.bottom > -400 && r.top < innerHeight + 400;
    if (v === heroVideo || (nearViewport && v.getAttribute("src"))) tryPlay(v);
  });
}
["pointerdown", "touchstart", "keydown", "wheel", "scroll"].forEach((ev) =>
  addEventListener(ev, unlockAllVideos, { once: true, passive: true })
);

let heroOverlay = null;
function showPlayOverlay() {
  if (heroOverlay || !heroVideo || !heroVideo.paused) return;
  heroOverlay = document.createElement("button");
  heroOverlay.className = "playhint";
  heroOverlay.setAttribute("aria-label", "Play video");
  heroOverlay.innerHTML = '<span class="pbtn"></span>';
  heroOverlay.addEventListener("click", () => { unlockAllVideos(); });
  heroVideo.closest(".frame").appendChild(heroOverlay);
}
function hidePlayOverlay() {
  if (heroOverlay) { heroOverlay.remove(); heroOverlay = null; }
}

if (heroVideo) {
  const frame = heroVideo.closest(".frame");
  frame.dataset.loading = "1";

  heroVideo.addEventListener("playing", () => {
    delete frame.dataset.loading;
    hidePlayOverlay();
    loadGalleryQueue();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && heroVideo.paused) tryPlay(heroVideo);
  });

  tryPlay(heroVideo);

  // State-based watchdog (events can fire before this script runs, so we
  // poll the readyState instead of relying on canplay/canplaythrough).
  let ticks = 0;
  const watchdog = setInterval(() => {
    ticks++;
    if (!heroVideo.paused) { clearInterval(watchdog); return; } // 'playing' handler did the rest
    if (heroVideo.readyState >= 3) {
      // Enough data to play, yet still paused: retry, and if the retry is
      // rejected, autoplay is blocked - surface an explicit play button.
      delete frame.dataset.loading;
      const attempt = heroVideo.play();
      heroVideo.muted = true;
      if (attempt && attempt.catch) {
        attempt.catch(() => { showPlayOverlay(); });
      }
      loadGalleryQueue();
    }
    if (ticks >= 8) { clearInterval(watchdog); loadGalleryQueue(); } // ~8s last resort
  }, 1000);
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
        tryPlay(v);
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
