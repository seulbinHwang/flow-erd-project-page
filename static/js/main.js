// Video loading strategy: the hero video gets the network to itself first.
// Gallery videos start downloading only once the hero is fully buffered,
// then load two at a time in DOM order.
//
// Autoplay strategy: browsers that refuse muted-video autoplay (Safari with
// "Never Auto-Play", Low Power Mode, blocking extensions) reject play() with
// NotAllowedError. Animated images are NOT subject to autoplay policy, so in
// that case every clip is covered with its animated-WebP twin, which always
// plays. If a WebP fails to load, an explicit play button appears instead.
const heroVideo = document.querySelector(".showcase video");
const lazyVideos = [...document.querySelectorAll("video[data-src]")];

let animMode = false;

function animUrlFor(v) {
  const src = v.getAttribute("src") || v.dataset.src || "";
  const name = src.split("/").pop().split("?")[0].replace(/\.mp4$/, "");
  return "static/anim/" + name + ".webp?v=2";
}

function coverWithAnim(v) {
  const frame = v.closest(".frame");
  if (!frame || frame.querySelector(".vanim")) return;
  delete frame.dataset.loading;
  const img = document.createElement("img");
  img.className = "vanim";
  img.alt = "";
  img.decoding = "async";
  img.loading = v === heroVideo ? "eager" : "lazy";
  img.addEventListener("error", () => { img.remove(); if (v === heroVideo) showPlayOverlay(); });
  img.src = animUrlFor(v);
  frame.appendChild(img);
  try { v.pause(); } catch (e) { /* ignore */ }
}

function enableAnimMode() {
  if (animMode) return;
  animMode = true;
  document.querySelectorAll("video").forEach(coverWithAnim);
}

function tryPlay(v) {
  if (animMode) return;
  v.muted = true;
  v.defaultMuted = true;
  const p = v.play();
  if (p && p.catch) p.catch((err) => {
    if (err && err.name === "NotAllowedError" && document.visibilityState === "visible") {
      enableAnimMode();
    }
  });
}

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
  if (queueStarted || animMode) return;
  queueStarted = true;
  lazyVideos.forEach((v) => { if (v.dataset.poster && !v.poster) v.poster = v.dataset.poster; });
  const queue = lazyVideos.slice();
  let active = 0;
  const pump = () => {
    if (animMode) return;
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

// First user gesture unlocks playback in environments that merely require
// interaction (does nothing once anim mode has taken over).
function unlockAllVideos() {
  if (animMode) return;
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
  heroOverlay.addEventListener("click", () => {
    heroVideo.muted = true;
    heroVideo.play().catch(() => {});
    document.querySelectorAll("video").forEach((v) => { v.muted = true; v.play().catch(() => {}); });
  });
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
    if (!document.hidden && !animMode && heroVideo.paused) tryPlay(heroVideo);
  });

  tryPlay(heroVideo);

  // State-based watchdog (media events can fire before this script runs,
  // so poll readyState instead of relying on canplay/canplaythrough).
  let ticks = 0;
  const watchdog = setInterval(() => {
    ticks++;
    if (animMode || !heroVideo.isConnected) { clearInterval(watchdog); return; }
    if (!heroVideo.paused) { clearInterval(watchdog); return; }
    if (heroVideo.readyState >= 3) {
      // Enough data to play, yet still paused: one more attempt, and if it
      // is rejected the animated fallback takes over via tryPlay's catch.
      delete frame.dataset.loading;
      tryPlay(heroVideo);
      loadGalleryQueue();
      if (ticks >= 3) { clearInterval(watchdog); enableAnimMode(); }
    }
    if (ticks >= 8) { clearInterval(watchdog); loadGalleryQueue(); } // last resort
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
      if (animMode) return;
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
