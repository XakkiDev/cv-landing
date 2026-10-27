import { PaperScroll } from './paper-scroll.js';
const intro = document.querySelector('#opening');
const openButton = document.querySelector('#open-scroll');
const skipButton = document.querySelector('#skip-opening');
const foldButton = document.querySelector('#fold-scroll');
const site = document.querySelector('.site');
const paper = document.querySelector('.paper');
const heading = document.querySelector('h1');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const simulation = new PaperScroll(paper, { curlHeight: 62, segments: 6, aging: .34, shader: true });
document.documentElement.classList.add('has-scroll-simulation');
let transition = null;
let opening = false;
function finishOpening() {
  site.classList.remove('is-expanding');
  paper.focus({ preventScroll: true });
  simulation.requestUpdate();
  opening = false;
}
function reveal(immediate = false) {
  clearTimeout(transition);
  intro.hidden = true;
  intro.classList.remove('is-opening');
  site.classList.remove('is-folded', 'is-folding');
  site.inert = false;
  if (!immediate && !motion.matches) {
    site.classList.add('is-expanding');
    transition = setTimeout(finishOpening, 1050);
  } else finishOpening();
  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => simulation.goTo(target, 'instant'));
  }
}
function unfold(immediate = false) {
  if (opening) { if (immediate) reveal(true); return; }
  opening = true;
  if (immediate || motion.matches) { reveal(true); return; }
  intro.classList.add('is-opening');
  transition = setTimeout(() => reveal(false), 520);
}
function showFolded() {
  clearTimeout(transition);
  opening = false;
  site.inert = true;
  site.classList.remove('is-folding', 'is-expanding');
  site.classList.add('is-folded');
  intro.classList.remove('is-opening');
  intro.hidden = false;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  paper.scrollTop = 0;
  openButton.focus({ preventScroll: true });
}
function fold() {
  if (site.classList.contains('is-folded')) return;
  if (motion.matches) { showFolded(); return; }
  site.classList.add('is-folding');
  transition = setTimeout(showFolded, 450);
}
foldButton.hidden = false;
openButton.addEventListener('click', () => unfold());
skipButton.addEventListener('click', () => unfold(true));
foldButton.addEventListener('click', fold);
document.querySelector('.ambience').addEventListener('click', event => {
  if (!event.target.closest('a') && intro.hidden) fold();
});
if (!location.hash && !motion.matches) {
  intro.hidden = false;
  site.inert = true;
  site.classList.add('is-folded');
} else if (location.hash) {
  requestAnimationFrame(() => {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) simulation.goTo(target, 'instant');
  });
}
motion.addEventListener?.('change', event => { if (event.matches && !intro.hidden) reveal(true); });
const links = Array.from(document.querySelectorAll('.chapter-rail a[href^="#"]'));
const sections = links.map(link => document.getElementById(link.hash.slice(1)));
document.addEventListener('click', event => {
  const anchor = event.target.closest('a[href^="#"]');
  if (!anchor || !site.contains(anchor)) return;
  const target = document.getElementById(anchor.hash.slice(1));
  if (!target) return;
  event.preventDefault();
  history.replaceState(null, '', anchor.hash);
  simulation.goTo(target, motion.matches ? 'instant' : 'smooth');
});
function markSection() {
  let current = 0;
  const top = paper.getBoundingClientRect().top + paper.clientHeight * .35;
  sections.forEach((section, index) => { if (section && section.getBoundingClientRect().top <= top) current = index; });
  links.forEach((link, index) => index === current ? link.setAttribute('aria-current','location') : link.removeAttribute('aria-current'));
}
paper.addEventListener('scroll', markSection, { passive: true });
addEventListener('resize', markSection, { passive: true });
markSection();

addEventListener('hashchange', () => {
  if (!location.hash) return;
  if (!intro.hidden) reveal(true);
  else {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) simulation.goTo(target, motion.matches ? 'instant' : 'smooth');
  }
});
