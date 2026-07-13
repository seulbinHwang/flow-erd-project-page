// Native MP4 playback only. Showcase videos wait for one user click, then
// loop while visible. Gallery videos autoplay only while visible. Keeping
// off-screen videos paused avoids needless decoding and protects smoothness.
const allVideos = [...document.querySelectorAll("video")];
const visibleVideos = new Set();
const activatedVideos = new WeakSet();
const pendingPlays = new WeakSet();

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

function isShowcase(v) {
  return Boolean(v.closest(".showcase"));
}

function frameFor(v) {
  return v.closest(".frame");
}

function setLoading(v, loading) {
  const frame = frameFor(v);
  if (!frame) return;
  if (loading) frame.dataset.loading = "1";
  else delete frame.dataset.loading;
}

function loadVideo(v) {
  if (v.dataset.poster && !v.poster) v.poster = v.dataset.poster;
  if (v.getAttribute("src")) return false;
  if (!v.dataset.src) return false;
  v.src = v.dataset.src;
  v.preload = "auto";
  v.load();
  return true;
}

function hidePlayOverlay(v) {
  const frame = frameFor(v);
  if (!frame) return;
  frame.querySelectorAll(".playhint").forEach((button) => button.remove());
}

function showPlayOverlay(v) {
  const frame = frameFor(v);
  if (!frame || frame.querySelector(".playhint")) return;
  setLoading(v, false);
  const button = document.createElement("button");
  button.className = "playhint";
  button.type = "button";
  button.setAttribute("aria-label", "Play high-quality looping video");
  button.innerHTML = '<span class="pbtn"></span>';
  button.addEventListener("click", () => {
    activatedVideos.add(v);
    hidePlayOverlay(v);
    loadVideo(v);
    playVideo(v);
  });
  frame.appendChild(button);
}

function playVideo(v) {
  if (!visibleVideos.has(v) || document.hidden || pendingPlays.has(v)) return;
  loadVideo(v);
  v.muted = true;
  v.defaultMuted = true;
  if (!v.paused && !v.ended) return;
  if (v.readyState < 3) setLoading(v, true);

  pendingPlays.add(v);
  const attempt = v.play();
  if (!attempt || !attempt.then) {
    pendingPlays.delete(v);
    return;
  }
  attempt
    .then(() => {
      pendingPlays.delete(v);
      setLoading(v, false);
      hidePlayOverlay(v);
    })
    .catch((err) => {
      pendingPlays.delete(v);
      setLoading(v, false);
      // Pausing while a play() request is pending is expected during a fast
      // scroll and must not turn into a false autoplay error.
      if (err && err.name === "AbortError") {
        const shouldResume = visibleVideos.has(v) &&
          (!isShowcase(v) || activatedVideos.has(v));
        if (shouldResume) playVideo(v);
        return;
      }
      dbg("play() rejected: " + (err && err.name));
      if (visibleVideos.has(v)) showPlayOverlay(v);
    });
}

allVideos.forEach((v) => {
  v.addEventListener("canplay", () => setLoading(v, false));
  v.addEventListener("playing", () => {
    setLoading(v, false);
    hidePlayOverlay(v);
  });
  v.addEventListener("waiting", () => {
    if (visibleVideos.has(v) && !v.paused) setLoading(v, true);
  });
  v.addEventListener("error", () => {
    setLoading(v, false);
    if (visibleVideos.has(v)) showPlayOverlay(v);
  });
});

// Loading and playback are both tied to the real viewport. Showcase videos
// wait for one click; after that they resume automatically whenever the user
// scrolls back to them. Native `loop` on each <video> keeps playback seamless.
const playbackObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const v = entry.target;
      const inView = entry.isIntersecting && entry.intersectionRatio >= 0.25;
      if (!inView) {
        visibleVideos.delete(v);
        v.pause();
        setLoading(v, false);
        return;
      }

      visibleVideos.add(v);
      loadVideo(v);
      if (isShowcase(v) && !activatedVideos.has(v)) showPlayOverlay(v);
      else playVideo(v);
    });
  },
  { rootMargin: "0px", threshold: [0, 0.25] }
);
allVideos.forEach((v) => playbackObserver.observe(v));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    allVideos.forEach((v) => v.pause());
    return;
  }
  visibleVideos.forEach((v) => {
    if (isShowcase(v) && !activatedVideos.has(v)) showPlayOverlay(v);
    else playVideo(v);
  });
});

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
