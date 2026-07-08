// Lazy-load gallery videos and play/pause them as they enter/leave the viewport.
const videos = document.querySelectorAll("video");

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const v = entry.target;
      if (entry.isIntersecting) {
        if (v.dataset.src && !v.src) v.src = v.dataset.src;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  },
  { rootMargin: "200px 0px", threshold: 0.05 }
);
videos.forEach((v) => io.observe(v));

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
