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
const secondHero = document.querySelector(".showcase-2 video");
const lazyVideos = [...document.querySelectorAll("#gallery video[data-src]")];

let animMode = false;

// Diagnostic overlay, only with ?debug=1 in the URL.
const dbg = (() => {
  if (!location.search.includes("debug=1")) return () => {};
  const el = document.createElement("pre");
  el.style.cssText = "position:fixed;top:70px;left:8px;z-index:9999;background:#000c;color:#0f0;" +
    "font:12px/1.5 monospace;padding:8px 10px;border-radius:8px;max-width:520px;white-space:pre-wrap;";
  document.body.appendChild(el);
  const t0 = performance.now();
  return (msg) => {
    el.textContent += ((performance.now() - t0) / 1000).toFixed(1) + "s " + msg + "\n";
    const lines = el.textContent.split("\n");
    if (lines.length > 24) el.textContent = lines.slice(-24).join("\n");
  };
})();

function animUrlFor(v) {
  const src = v.getAttribute("src") || v.dataset.src || "";
  const name = src.split("/").pop().split("?")[0].replace(/\.mp4$/, "");
  return "static/anim/" + name + ".webp?v=13";
}

// Fallback re-insert interval when a clip has no data-anim-ms (ms).
const ANIM_LOOP_MS = 9000;

// Some Safari configurations play animated images only ONCE (Reduce Motion /
// auto-play-animated-images off), ignoring the loop count. So we fetch the
// whole file first (no mid-download stutter), then re-insert a fresh <img>
// from the cached blob at every loop boundary: each insertion replays the
// animation once, which together makes a seamless endless loop everywhere.
function coverWithAnim(v) {
  const frame = v.closest(".frame");
  if (!frame || frame.dataset.anim) return;
  frame.dataset.anim = "1";
  fetch(animUrlFor(v))
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
    .then((blob) => {
      dbg("blob ok " + (blob.size/1024|0) + "KB type=" + blob.type + " for " + animUrlFor(v).split("/").pop());
      delete frame.dataset.loading;
      try { v.pause(); } catch (e) { /* ignore */ }
      // A fresh object URL per cycle forces a fresh animation state -
      // reusing one URL would resume from the browser's decoded image
      // cache, which is already parked on the final frame.
      const loopMs = parseInt(v.dataset.animMs, 10) || ANIM_LOOP_MS;
      let cur = null, curUrl = null, n = 0;
      const cycle = () => {
        if (!frame.isConnected) return;
        if (v === heroVideo) dbg("cycle #" + (++n) + " loopMs=" + loopMs);
        const url = URL.createObjectURL(blob);
        const img = document.createElement("img");
        img.className = "vanim";
        img.alt = "";
        img.addEventListener("load", () => {
          if (v === heroVideo) dbg("img load, swap");
          if (cur) { cur.remove(); URL.revokeObjectURL(curUrl); }
          cur = img;
          curUrl = url;
          setTimeout(cycle, loopMs);
        }, { once: true });
        img.addEventListener("error", () => { if (v === heroVideo) dbg("img ERROR"); }, { once: true });
        img.src = url;
        frame.appendChild(img);
      };
      cycle();
    })
    .catch((e) => {
      dbg("fetch FAIL " + e);
      delete frame.dataset.loading;
      if (v === heroVideo) showPlayOverlay();
    });
}

function enableAnimMode() {
  if (animMode) return;
  animMode = true;
  dbg("animMode ON");
  document.querySelectorAll("video").forEach(coverWithAnim);
}

function tryPlay(v) {
  // Just attempt playback. Do NOT give up / switch to a fallback on the
  // first rejection: Safari often refuses autoplay for a beat right after
  // load (tab still settling) and then allows it a moment later. The retry
  // scheduler below keeps trying; the fallback only fires after real failure.
  v.muted = true;
  v.defaultMuted = true;
  const p = v.play();
  if (p && p.catch) p.catch((err) => {
    dbg("play() rejected: " + (err && err.name) + " vis=" + document.visibilityState);
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

// Fully download a clip into memory and play it from a blob URL. Blob
// playback can never stall on the network, so the video is guaranteed
// smooth once it starts. Returns a promise that resolves when ready.
function blobLoad(v) {
  const url = v.dataset.src || v.getAttribute("src");
  return fetch(url)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
    .then((b) => { v.src = URL.createObjectURL(b); v.load(); return v; });
}

// Call cb once v has buffered essentially its whole duration (fully
// downloaded), so nothing else touches the network while it is still
// filling its buffer. Falls back after maxWait so we never stall forever.
function whenFullyBuffered(v, cb, maxWait) {
  let done = false;
  const fire = () => { if (done) return; done = true; cb(); };
  const ok = () => {
    const d = v.duration;
    if (!d || isNaN(d)) return false;
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.end(i) >= d - 0.6) return true;
    }
    return false;
  };
  if (ok()) { fire(); return; }
  const iv = setInterval(() => { if (animMode || ok()) { clearInterval(iv); fire(); } }, 250);
  setTimeout(() => { clearInterval(iv); fire(); }, maxWait || 15000);
}

// Load the second showcase only after the first hero is fully buffered
// (so it never steals bandwidth mid-playback), then likewise gate the
// gallery on the second hero. This keeps the visible hero perfectly
// smooth instead of stuttering under concurrent downloads.
let secondaryStarted = false;
function startSecondaryThenGallery() {
  if (secondaryStarted) return;
  secondaryStarted = true;
  if (!secondHero || animMode) { loadGalleryQueue(); return; }
  delete secondHero.dataset.defer;
  loadVideo(secondHero);
  if (!animMode) tryPlay(secondHero);
  whenFullyBuffered(secondHero, loadGalleryQueue, 12000);
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

// Play button shown on a hero when autoplay is blocked. Clicking any hero's
// button counts as a user gesture that unlocks playback for the whole page,
// so we play EVERY hero as full-quality video and drop all the buttons.
function playAllHeroes() {
  document.querySelectorAll(".showcase video").forEach((v) => {
    v.muted = true;
    if (!v.getAttribute("src") && v.dataset.src) loadVideo(v);
    v.play().catch(() => {});
  });
  hidePlayOverlay();
}
function showPlayOverlay(video) {
  const frame = (video || heroVideo) && (video || heroVideo).closest(".frame");
  if (!frame || frame.querySelector(".playhint")) return;
  const btn = document.createElement("button");
  btn.className = "playhint";
  btn.setAttribute("aria-label", "Play video");
  btn.innerHTML = '<span class="pbtn"></span>';
  btn.addEventListener("click", playAllHeroes);
  frame.appendChild(btn);
}
function hidePlayOverlay() {
  document.querySelectorAll(".playhint").forEach((b) => b.remove());
}

if (heroVideo) {
  const frame = heroVideo.closest(".frame");
  frame.dataset.loading = "1";

  heroVideo.addEventListener("playing", () => {
    delete frame.dataset.loading;
    hidePlayOverlay();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !animMode && heroVideo.paused) tryPlay(heroVideo);
  });

  // Retry playing any in-view hero. Autoplay is frequently refused for a
  // beat right after load (tab still settling / visibility flipping), so we
  // retry hard on timers, on visibility change, on window load, and on the
  // first user gesture instead of giving up.
  function retryHeroes() {
    if (animMode) return;
    document.querySelectorAll(".showcase video").forEach((v) => {
      if (!v.getAttribute("src")) return;
      const r = v.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight && v.paused) tryPlay(v);
    });
  }
  [0, 120, 300, 600, 1000, 1600, 2400, 3400, 4500].forEach((ms) => setTimeout(retryHeroes, ms));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) retryHeroes(); });
  window.addEventListener("load", retryHeroes);
  ["pointerdown", "touchstart", "keydown", "wheel", "scroll", "mousemove"].forEach((ev) =>
    addEventListener(ev, retryHeroes, { passive: true }));

  // Load hero2 + gallery only after hero1 is fully buffered (no contention).
  whenFullyBuffered(heroVideo, startSecondaryThenGallery, 15000);

  // Some Safari installs block muted-video autoplay per-site (no amount of
  // retrying overrides that). If the hero is still paused shortly after load,
  // switch to the animated-image fallback, which auto-plays and loops without
  // a gesture. (Animated images are exempt from the autoplay policy.)
  setTimeout(() => {
    if (!heroVideo.isConnected) return;
    delete frame.dataset.loading;
    if (heroVideo.paused && document.visibilityState === "visible") enableAnimMode();
  }, 2500);
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
      if (v.dataset.defer) return; // not unlocked yet (second hero waits for the first)
      const isShowcase = !!v.closest(".showcase");
      if (entry.isIntersecting) {
        // Showcase heroes are blob-loaded exclusively; never progressive-load
        // them here (that would double-download and can stall playback).
        if (v.dataset.src && !isShowcase) loadVideo(v);
        if (v.getAttribute("src")) tryPlay(v);
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
