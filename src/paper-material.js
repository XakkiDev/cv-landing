import * as THREE from 'three';

/** WebGL paper material. Two sides share the same ageing, only the inside is printed. */
export function createPaperMaterial({ texture = null, side, width, length, aging = .52, fiber = .30 }) {
  const material = new THREE.MeshStandardMaterial({
    map: texture, color: texture ? 0xfff8e9 : 0xe8d4ae,
    side, roughness: .96, metalness: 0,
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
        float stains = paperNoise(paperPoint * 5.1) * .65 + paperNoise(paperPoint * 13.0) * .35;
        float fibers = paperNoise(paperPoint * vec2(210.0, 26.0));
        float fine = paperNoise(paperPoint * vec2(430.0, 85.0));
        float edge = 1.0 - smoothstep(0.0, .055, min(paperUv.x, 1.0-paperUv.x));
        float age = paperAging * ((stains-.5)*.28 - edge*.14) + paperFiber*((fibers-.5)*.18 + (fine-.5)*.09);
        diffuseColor.rgb *= 1.0 + age;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.0,.94,.82), edge * paperAging * .38);`);
  };
  material.customProgramCacheKey = () => 'aged-scroll-paper-v1';
  return material;
}
