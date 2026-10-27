/**
 * PaperScroll: a DOM-first, progressively enhanced scroll surface.
 * The content remains live HTML. Decorative, inert strips reproduce and bend
 * its visible edge. The scroll container, not a texture, owns interaction.
 * All distances are CSS pixels. Instances are independent and can be destroyed.
 */
export function calculateRollRadius(length, coreRadius, thickness) {
  // Area of rolled paper: pi * (r² - r0²) = length * thickness.
  return Math.sqrt(coreRadius * coreRadius + Math.max(0, length) * thickness / Math.PI);
}

export class PaperScroll {
  constructor(content, options = {}) {
    if (!(content instanceof HTMLElement)) throw new TypeError('PaperScroll expects an element');
    this.content = content;
    this.originalTabIndex = content.getAttribute('tabindex');
    this.originalLabel = content.getAttribute('aria-label');
    content.classList.add('paper-scroll__content');
    this.options = { curlHeight: 58, segments: 6, paperColor: '#eee3ca', aging: .35, textureUrl: '', shader: false, coreRadius: 18, paperThickness: .18, ...options };
    this.options.segments = Math.max(2, Math.min(32, Math.round(Number(this.options.segments) || 6)));
    this.options.curlHeight = Math.max(24, Number(this.options.curlHeight) || 58);
    this.options.aging = Math.max(0, Math.min(1, Number(this.options.aging) || 0));
    this.options.coreRadius = Math.max(1, Number(this.options.coreRadius) || 18);
    this.options.paperThickness = Number.isFinite(Number(this.options.paperThickness)) ? Math.max(0, Number(this.options.paperThickness)) : .18;
    this.raf = 0;
    this.host = document.createElement('div');
    this.host.className = 'scroll-shell';
    this.host.style.setProperty('--paper-color', this.options.paperColor);
    this.host.style.setProperty('--paper-aging', Math.max(0, Math.min(1, this.options.aging)));
    this.host.style.setProperty('--curl-height', `${Math.max(24, this.options.curlHeight)}px`);
    if (this.options.textureUrl) this.host.style.setProperty('--paper-texture', `url(${JSON.stringify(this.options.textureUrl)})`);
    content.before(this.host);
    this.host.append(content);
    content.tabIndex = 0;
    content.setAttribute('aria-label', 'Текст грамоты');
    this.inner = content.querySelector('.paper-inner') || content.firstElementChild;
    if (!this.inner) throw new Error('PaperScroll needs a content element');
    this.top = this.makeCurl('top');
    this.bottom = this.makeCurl('bottom');
    this.host.append(this.top, this.bottom);
    this.onScroll = () => this.requestUpdate();
    content.addEventListener('scroll', this.onScroll, { passive: true });
    this.resize = new ResizeObserver(() => this.requestUpdate());
    this.resize.observe(content);
    this.resize.observe(this.inner);
    this.requestUpdate();
    if (this.options.shader && 'gpu' in navigator) this.loadShader();
  }
  makeCurl(side) {
    const roll = document.createElement('div');
    roll.className = `scroll-curl scroll-curl--${side}`;
    roll.setAttribute('aria-hidden', 'true');
    roll.inert = true;
    this[`${side}Slices`] = [];
    for (let i = 0; i < this.options.segments; i++) {
      const slice = document.createElement('div');
      slice.className = 'scroll-curl__slice';
      const clone = this.inner.cloneNode(true);
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      clone.removeAttribute('id');
      clone.classList.add('scroll-curl__copy');
      slice.append(clone);
      roll.append(slice);
      this[`${side}Slices`].push({ slice, clone });
    }
    return roll;
  }
  requestUpdate() {
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.update(); });
  }
  update() {
    const width = this.content.clientWidth;
    const scroll = this.content.scrollTop;
    const viewport = this.content.clientHeight;
    if (!width || !viewport) return;
    const n = this.options.segments;
    const maxScroll = Math.max(0, this.content.scrollHeight - viewport);
    for (const side of ['top', 'bottom']) {
      const rolled = side === 'top' ? scroll : maxScroll - scroll;
      const radius = calculateRollRadius(rolled, this.options.coreRadius, this.options.paperThickness);
      const height = Math.min(this.options.curlHeight * (.8 + .2 * radius / this.options.coreRadius), viewport / 4);
      this[side].style.height = `${height}px`;
      const row = height / n;
      const pieces = this[`${side}Slices`];
      const scales = pieces.map((_, i) => {
        const edge = side === 'top' ? 1 - i / n : (i + 1) / n;
        return Math.max(.55, Math.cos(edge * .9));
      });
      const surfaceHeight = scales.reduce((sum, scale) => sum + row / scale, 0);
      // Top is anchored at the flat-paper seam; bottom is anchored at its start.
      const base = side === 'top' ? scroll + height - surfaceHeight : scroll + viewport - height;
      let sourceOffset = 0;
      pieces.forEach(({ slice, clone }, i) => {
        const edge = side === 'top' ? 1 - i / n : (i + 1) / n;
        const scale = scales[i];
        const sourceHeight = row / scale;
        slice.style.top = `${i * row}px`;
        slice.style.height = `${sourceHeight + .2}px`;
        slice.style.transform = `scaleY(${scale})`;
        slice.style.setProperty('--slice-shade', `${edge * .11}`);
        clone.style.width = `${width}px`;
        clone.style.transform = `translateY(${-base - sourceOffset}px)`;
        sourceOffset += sourceHeight;
      });
    }
    this.host.classList.toggle('scroll-at-start', scroll <= 1);
    this.host.classList.toggle('scroll-at-end', scroll + viewport >= this.content.scrollHeight - 1);
  }
  async loadShader() {
    try {
      const { createPaperTexture } = await import('./paper-shader.bundle.js');
      const texture = await createPaperTexture({ aging: this.options.aging, color: this.options.paperColor });
      if (texture && this.host.isConnected) this.host.style.setProperty('--paper-texture', `url(${JSON.stringify(texture)})`);
    } catch { /* Keep the CSS paper texture when WebGPU is unavailable. */ }
  }
  goTo(element, behavior = 'smooth') {
    if (!this.content.contains(element)) return;
    const top = element === this.content ? 0 : this.content.scrollTop + element.getBoundingClientRect().top - this.content.getBoundingClientRect().top - this.options.curlHeight - 12;
    this.content.scrollTo({ top: Math.max(0, top), behavior });
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.content.removeEventListener('scroll', this.onScroll);
    this.host.before(this.content);
    this.host.remove();
    this.content.classList.remove('paper-scroll__content');
    this.originalTabIndex === null ? this.content.removeAttribute('tabindex') : this.content.setAttribute('tabindex', this.originalTabIndex);
    this.originalLabel === null ? this.content.removeAttribute('aria-label') : this.content.setAttribute('aria-label', this.originalLabel);
  }
}
