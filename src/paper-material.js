import * as THREE from 'three';

// Seamless, deterministic height tile: fine fibers and softly raised flecks.
// The color of the resume remains independent of this relief map.
let paperHeightTile;
function heightTile(width, length) {
  if (typeof document === 'undefined') return null;
  if (!paperHeightTile) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d'), img=ctx.createImageData(256,256);
    for(let y=0;y<256;y++) for(let x=0;x<256;x++) {
      const fiber=Math.sin(x*.29+Math.sin(y*.049)*1.4)*5;
      const flecks=Math.sin(x*.098+y*.074)*4+Math.sin(x*.172-y*.123)*3;
      const grain=(Math.sin(x*127.1+y*311.7)*43758.5453)%1;
      const v=Math.max(0,Math.min(255,128+fiber+flecks+grain*5));
      const i=(y*256+x)*4;img.data[i]=img.data[i+1]=img.data[i+2]=v;img.data[i+3]=255;
    }
    ctx.putImageData(img,0,0);paperHeightTile=canvas;
  }
  const result=new THREE.CanvasTexture(paperHeightTile);
  result.wrapS=result.wrapT=THREE.RepeatWrapping;
  result.repeat.set(width*2.2,length*2.2);return result;
}

/** WebGL paper material. Two sides share the same ageing, only the inside is printed. */
export function createPaperMaterial({ texture = null, side, width, length, aging = .52, fiber = .30 }) {
  const material = new THREE.MeshStandardMaterial({
    map: texture, color: texture ? 0xfff8e9 : 0xe8d4ae,
    side, roughness: .96, metalness: 0, bumpMap: heightTile(width,length), bumpScale: .014,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.paperSize = { value: new THREE.Vector2(width, length) };
    shader.uniforms.paperAging = { value: aging };
    shader.uniforms.paperFiber = { value: fiber };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 paperUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\npaperUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 paperUv;
        uniform vec2 paperSize;
        uniform float paperAging;
        uniform float paperFiber;
        float paperHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float paperNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(paperHash(i),paperHash(i+vec2(1.,0.)),f.x),
                     mix(paperHash(i+vec2(0.,1.)),paperHash(i+vec2(1.,1.)),f.x),f.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 paperPoint = paperUv * paperSize;
        // The short ends are irregular, including more weathered corners.
        float endDistance = min(paperUv.y, 1.0-paperUv.y) * paperSize.y;
        float corner = 1.0-smoothstep(0.0,.12,min(paperUv.x,1.0-paperUv.x));
        float wornCut = .0015 + paperNoise(vec2(paperUv.x*55.0, 1.7))*.004 + corner*.009;
        if(endDistance < wornCut) discard;
        float stains = paperNoise(paperPoint * 5.1) * .65 + paperNoise(paperPoint * 13.0) * .35;
        float fibers = paperNoise(paperPoint * vec2(210.0, 26.0));
        float fine = paperNoise(paperPoint * vec2(430.0, 85.0));
        float edge = 1.0 - smoothstep(0.0, .055, min(paperUv.x, 1.0-paperUv.x));
        float age = paperAging * ((stains-.5)*.28 - edge*.14) + paperFiber*((fibers-.5)*.18 + (fine-.5)*.09);
        diffuseColor.rgb *= 1.0 + age;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.0,.94,.82), edge * paperAging * .38);`);
  };
  material.customProgramCacheKey = () => 'aged-scroll-paper-v2';
  return material;
}
