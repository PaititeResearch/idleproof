// Presentation only: marks the section-navigation link of the section currently in view.
// No network request, no stored state; the page works the same when this module is absent.
const links = [...document.querySelectorAll('.section-nav a[href^="#"]')];
const byId = new Map(links.map((link) => [link.getAttribute('href').slice(1), link]));
const sections = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
const visible = new Map();

function mark(id) {
  for (const [key, link] of byId) {
    if (key === id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  // Keep the active tab visible in the horizontally scrolling strip without moving the page.
  const active = byId.get(id), strip = active?.parentElement;
  if (active && strip && strip.scrollWidth > strip.clientWidth) {
    const left = active.offsetLeft - strip.offsetLeft, right = left + active.offsetWidth;
    if (left < strip.scrollLeft) strip.scrollLeft = left - 16;
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth + 16;
  }
}

if ('IntersectionObserver' in window && sections.length) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting ? entry.boundingClientRect.top : null);
    const current = sections.find((section) => visible.get(section.id) != null);
    if (current) mark(current.id);
  }, { rootMargin: '-120px 0px -55% 0px' });
  sections.forEach((section) => observer.observe(section));
}
