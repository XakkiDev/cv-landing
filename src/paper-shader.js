import { createShader } from 'shaders/js';

/** Render one optional, static paper tile; return null when WebGPU is unavailable. */
export async function createPaperTexture({ aging = .35, color = '#eee3ca' } = {}) {
  if (!navigator.gpu) return null;
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', width: '256px', height: '256px', opacity: '0', pointerEvents: 'none' });
  document.body.append(canvas);
  let shader;
  let finish;
  const ready = new Promise(resolve => { finish = resolve; });
  try {
    shader = await createShader(canvas, {
      components: [{ type: 'Paper', props: { roughness: .15 + aging * .28, grainScale: 1.5, displacement: .08 + aging * .12, seed: 7 }, children: [{ type: 'SolidColor', props: { color } }] }]
    }, { colorSpace: 'srgb', disableTelemetry: true, onReady: () => finish(true), onError: () => finish(false) });
    const ok = await Promise.race([ready, new Promise(resolve => setTimeout(() => resolve(false), 3000))]);
    if (!ok) return null;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const check = document.createElement('canvas');
    check.width = check.height = 1;
    const context = check.getContext('2d');
    context.drawImage(canvas, 0, 0, 1, 1);
    if (!context.getImageData(0, 0, 1, 1).data[3]) return null;
    return canvas.toDataURL('image/png');
  } finally {
    shader?.destroy();
    canvas.remove();
  }
}
