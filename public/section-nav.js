// Presentation only: marks the section-navigation link of the section currently in view.
// No network request, no stored state; the page works the same when this module is absent.
const links = [...document.querySelectorAll('.section-nav a[href^="#"]')];
const byId = new Map(links.map((link) => [link.getAttribute('href').slice(1), link]));
const sections = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
const bar = document.querySelector('.topbar');
const navBar = document.querySelector('.section-nav-bar');
let current = null;
let pending = false;

function mark(id) {
  if (id === current) return;
  current = id;
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

// The active section is the last one whose top has passed just below the sticky bar;
// at the very bottom of the page the last section is active.
function update() {
  pending = false;
  if (!sections.length) return;
  // The tab bar is sticky under the app bar on wide screens and scrolls away on small ones.
  let line = bar?.getBoundingClientRect().bottom || 0;
  if (navBar && getComputedStyle(navBar).position === 'sticky') line = Math.max(line, navBar.getBoundingClientRect().bottom);
  line += 24;
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  let active = sections[0];
  for (const section of sections) if (section.getBoundingClientRect().top <= line) active = section;
  mark(atBottom ? sections[sections.length - 1].id : active.id);
}

function schedule() {
  if (!pending) { pending = true; requestAnimationFrame(update); }
}

window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('resize', schedule);
window.addEventListener('hashchange', schedule);
update();
