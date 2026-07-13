// Showcase videos wait for one user click, then loop while visible. Gallery
// videos autoplay only while visible; browsers that explicitly block muted
// autoplay get an animated-WebP fallback for the visible gallery clips only.
const allVideos = [...document.querySelectorAll("video")];
const visibleVideos = new Set();
const activatedVideos = new WeakSet();
const pendingPlays = new WeakSet();
const galleryFallbackVideos = new WeakSet();
const galleryFallbackStates = new WeakMap();
// Deterministic QA hook for verifying the blocked-autoplay path.
const forceGalleryFallback = location.search.includes("gallery-fallback=1");
const GALLERY_ANIM_LOOP_MS = 9000;

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

function animUrlFor(v) {
  const src = v.dataset.src || v.getAttribute("src") || "";
  const name = src.split("/").pop().split("?")[0].replace(/\.mp4$/, "");
  return "static/anim/" + name + ".webp?v=16";
}

function setLoading(v, loading) {
  const frame = frameFor(v);
  if (!frame) return;
  if (loading) frame.dataset.loading = "1";
  else delete frame.dataset.loading;
}

function loadVideo(v) {
  if (v.dataset.poster && !v.poster) v.poster = v.dataset.poster;
  if (!isShowcase(v)) {
    v.muted = true;
    v.defaultMuted = true;
    v.autoplay = true;
  }
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

function galleryFallbackState(v) {
  let state = galleryFallbackStates.get(v);
  if (!state) {
    state = {
      blob: null,
      promise: null,
      currentImg: null,
      currentUrl: null,
      pendingImg: null,
      pendingUrl: null,
      timer: null,
      generation: 0
    };
    galleryFallbackStates.set(v, state);
  }
  return state;
}

function removeGalleryImage(img, url) {
  if (img) img.remove();
  if (url) URL.revokeObjectURL(url);
}

function stopGalleryFallback(v) {
  const state = galleryFallbackStates.get(v);
  if (!state) return;
  state.generation += 1;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  removeGalleryImage(state.currentImg, state.currentUrl);
  removeGalleryImage(state.pendingImg, state.pendingUrl);
  state.currentImg = null;
  state.currentUrl = null;
  state.pendingImg = null;
  state.pendingUrl = null;
  setLoading(v, false);
}

function cycleGalleryFallback(v) {
  if (isShowcase(v) || !galleryFallbackVideos.has(v) ||
      !visibleVideos.has(v) || document.hidden) return;

  const frame = frameFor(v);
  const state = galleryFallbackState(v);
  if (!frame || !state.blob || state.pendingImg || state.timer) return;

  const generation = state.generation;
  const url = URL.createObjectURL(state.blob);
  const img = document.createElement("img");
  img.className = "vanim";
  img.alt = "";
  img.setAttribute("aria-hidden", "true");
  state.pendingImg = img;
  state.pendingUrl = url;

  img.addEventListener("load", () => {
    if (state.pendingImg !== img) return;
    state.pendingImg = null;
    state.pendingUrl = null;

    const stillVisible = generation === state.generation &&
      galleryFallbackVideos.has(v) && visibleVideos.has(v) && !document.hidden;
    if (!stillVisible) {
      removeGalleryImage(img, url);
      return;
    }

    const previousImg = state.currentImg;
    const previousUrl = state.currentUrl;
    // The replacement is already loaded while detached, so the current frame
    // stays visible until the swap and no black decode flash can appear.
    frame.appendChild(img);
    state.currentImg = img;
    state.currentUrl = url;
    removeGalleryImage(previousImg, previousUrl);
    setLoading(v, false);
    hidePlayOverlay(v);

    const loopMs = parseInt(v.dataset.animMs, 10) || GALLERY_ANIM_LOOP_MS;
    state.timer = setTimeout(() => {
      state.timer = null;
      cycleGalleryFallback(v);
    }, loopMs);
  }, { once: true });

  img.addEventListener("error", () => {
    if (state.pendingImg !== img) return;
    state.pendingImg = null;
    state.pendingUrl = null;
    removeGalleryImage(img, url);
    setLoading(v, false);
    dbg("animated fallback image failed: " + animUrlFor(v));
    if (!state.currentImg && visibleVideos.has(v)) showPlayOverlay(v);
  }, { once: true });

  img.src = url;
}

function useGalleryFallback(v) {
  if (isShowcase(v)) return;
  galleryFallbackVideos.add(v);
  v.pause();
  hidePlayOverlay(v);

  if (!visibleVideos.has(v) || document.hidden) {
    stopGalleryFallback(v);
    return;
  }

  const state = galleryFallbackState(v);
  setLoading(v, true);
  if (state.blob) {
    if (state.currentImg && state.timer) {
      setLoading(v, false);
      return;
    }
    cycleGalleryFallback(v);
    return;
  }
  if (state.promise) return;

  state.promise = fetch(animUrlFor(v))
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.blob();
    })
    .then((blob) => {
      if (!blob.size) throw new Error("empty animated fallback");
      state.blob = blob;
      state.promise = null;
      cycleGalleryFallback(v);
    })
    .catch((err) => {
      state.promise = null;
      setLoading(v, false);
      dbg("animated fallback failed: " + err);
      if (visibleVideos.has(v)) showPlayOverlay(v);
    });
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
    galleryFallbackVideos.delete(v);
    stopGalleryFallback(v);
    hidePlayOverlay(v);
    loadVideo(v);
    playVideo(v);
  });
  frame.appendChild(button);
}

function playVideo(v) {
  if (!visibleVideos.has(v) || document.hidden || pendingPlays.has(v)) return;
  if (!isShowcase(v) && galleryFallbackVideos.has(v)) {
    useGalleryFallback(v);
    return;
  }
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
      if (!isShowcase(v)) {
        useGalleryFallback(v);
        return;
      }
      if (visibleVideos.has(v)) showPlayOverlay(v);
    });
}

allVideos.forEach((v) => {
  v.addEventListener("canplay", () => {
    if (!isShowcase(v) && galleryFallbackVideos.has(v)) return;
    setLoading(v, false);
    if (!isShowcase(v) && visibleVideos.has(v) &&
        !galleryFallbackVideos.has(v) && v.paused) playVideo(v);
  });
  v.addEventListener("playing", () => {
    setLoading(v, false);
    hidePlayOverlay(v);
  });
  v.addEventListener("waiting", () => {
    if (visibleVideos.has(v) && !v.paused) setLoading(v, true);
  });
  v.addEventListener("error", () => {
    setLoading(v, false);
    if (!visibleVideos.has(v)) return;
    if (isShowcase(v)) showPlayOverlay(v);
    else useGalleryFallback(v);
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
        stopGalleryFallback(v);
        setLoading(v, false);
        return;
      }

      visibleVideos.add(v);
      if (!isShowcase(v) && (forceGalleryFallback || galleryFallbackVideos.has(v))) {
        if (v.dataset.poster && !v.poster) v.poster = v.dataset.poster;
        useGalleryFallback(v);
        return;
      }
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
    allVideos.forEach((v) => {
      v.pause();
      stopGalleryFallback(v);
    });
    return;
  }
  visibleVideos.forEach((v) => {
    if (!isShowcase(v) && galleryFallbackVideos.has(v)) useGalleryFallback(v);
    else if (isShowcase(v) && !activatedVideos.has(v)) showPlayOverlay(v);
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
