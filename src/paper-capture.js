import * as THREE from 'three';
import html2canvas from 'html2canvas';

const PAPER_COLOR = '#eee3ca';
const MOBILE_MAX_WIDTH = 700;
const DESKTOP_MAX_TEXTURE_WIDTH = 954;
const MAX_PIXEL_RATIO = 1.5;
const MAX_TEXTURE_HEIGHT = 8192; // stay below common WebGL texture limits
const MAX_TEXTURE_WIDTH = 4096;
// Parts of the page that must not be cloned: html2canvas would fetch their images and styles again.
const NOT_PAPER = '.ambience,.opening,.loader,.scroll-webgl,.chapter-rail,.mobile-chest';

const isMobile = () => innerWidth < MOBILE_MAX_WIDTH;

/** Width in CSS pixels at which the sheet is laid out and rasterized. */
function sheetWidth() {
  return isMobile() ? Math.max(1, innerWidth - 20) : Math.min(DESKTOP_MAX_TEXTURE_WIDTH, innerWidth - 32);
}

/** Wider spaces survive rasterization of the very long mobile texture. Visual clone only. */
function widenSpaces(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.nodeValue.trim()) node.nodeValue = node.nodeValue.replace(/ (?=\S)/g, ' ');
  }
}

/**
 * Point the clone's raster images at object URLs made from the images the page already decoded,
 * so html2canvas does not download them a second time. Returns a function that frees the URLs.
 */
async function reuseLoadedImages(source, clone) {
  const originals = [...source.querySelectorAll('img')];
  const copies = [...clone.querySelectorAll('img')];
  const urls = [];
  await Promise.all(copies.map(async (copy, index) => {
    const original = originals[index];
    if (!original?.complete || !original.naturalWidth || original.src.startsWith('data:') || original.src.endsWith('.svg')) return;
    const canvas = document.createElement('canvas');
    canvas.width = original.naturalWidth;
    canvas.height = original.naturalHeight;
    canvas.getContext('2d').drawImage(original, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    urls.push(url);
    copy.removeAttribute('loading');
    copy.src = url;
  }));
  return () => urls.forEach(URL.revokeObjectURL);
}

/** Rectangles of every link, relative to the clone's top-left corner, in CSS pixels. */
function measureLinks(root, rootRect) {
  return [...root.querySelectorAll('a[href]')].map(a => {
    const r = a.getBoundingClientRect();
    return { href: a.getAttribute('href'), target: a.target, x: r.left - rootRect.left, y: r.top - rootRect.top, width: r.width, height: r.height };
  });
}

/** Vertical offset of every element with an id (anchor targets). */
function measureSections(root, rootRect) {
  const sections = {};
  for (const el of root.querySelectorAll('[id]')) sections[el.id] = el.getBoundingClientRect().top - rootRect.top;
  return sections;
}

/** A faint, uneven cup ring on the blank lower margin of the manuscript. */
function drawCupRing(ctx, canvas, scale) {
  const x = canvas.width * .79, y = canvas.height - canvas.width * .09, radius = canvas.width * .065;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-.16);
  ctx.scale(1, .82);
  ctx.strokeStyle = 'rgba(111,65,33,.15)';
  ctx.lineWidth = Math.max(1, 3 * scale);
  ctx.beginPath();
  ctx.arc(0, 0, radius, .12, Math.PI * 1.92);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(130,76,35,.08)';
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  ctx.beginPath();
  ctx.arc(2 * scale, -scale, radius * .95, .45, Math.PI * 1.7);
  ctx.stroke();
  ctx.restore();
}

/** Blank margins stay rolled up, so neither end of the sheet becomes completely flat. */
function padWithLeader(rendered, height, leader, scale) {
  const padded = document.createElement('canvas');
  padded.width = rendered.width;
  padded.height = Math.ceil((height + 2 * leader) * scale);
  const ctx = padded.getContext('2d');
  ctx.fillStyle = PAPER_COLOR;
  ctx.fillRect(0, 0, padded.width, padded.height);
  ctx.drawImage(rendered, 0, Math.round(leader * scale));
  drawCupRing(ctx, padded, scale);
  return padded;
}

/**
 * Rasterize the résumé sheet into a texture and measure where its links and sections lie.
 * Link and section positions are in texture pixels (leader margin included).
 */
export async function capturePaper(paper) {
  await document.fonts.ready;
  const width = sheetWidth();
  // Cloned inside an inert document so its <img> elements do not start loading again.
  const clone = document.implementation.createHTMLDocument('').importNode(paper, true);
  clone.removeAttribute('id');
  clone.classList.add('texture-source');
  if (isMobile()) widenSpaces(clone);
  clone.style.width = width + 'px';
  // html2canvas lays the clone out in an iframe whose vw is the sheet width, not the window's;
  // a shared --vw keeps the measured DOM and the texture identical.
  clone.style.setProperty('--vw', width / 100 + 'px');
  const releaseImages = await reuseLoadedImages(paper, clone);
  document.body.append(document.adoptNode(clone));

  const height = clone.scrollHeight;
  const leader = Math.round(width * .025);
  const scale = Math.min(MAX_PIXEL_RATIO, MAX_TEXTURE_HEIGHT / (height + 2 * leader), MAX_TEXTURE_WIDTH / width);
  const rootRect = clone.getBoundingClientRect();
  const links = measureLinks(clone, rootRect);
  const sections = measureSections(clone, rootRect);

  let rendered;
  try {
    rendered = await html2canvas(clone, {
      scale, backgroundColor: PAPER_COLOR, logging: false, useCORS: true, windowWidth: width, width, height,
      ignoreElements: el => el.matches?.(NOT_PAPER),
    });
  } finally {
    clone.remove();
    releaseImages();
  }

  links.forEach(link => { link.y += leader; });
  Object.keys(sections).forEach(id => { sections[id] += leader; });
  const texture = new THREE.CanvasTexture(padWithLeader(rendered, height, leader, scale));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, width, height: height + 2 * leader, leader, links, sections };
}
