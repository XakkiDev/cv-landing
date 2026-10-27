# 3D scroll — experimental work in progress

The live deployment is intentionally unchanged while the WebGL version is visually unverified. Entry point `src/scroll-3d.js`, geometry math `src/scroll-geometry.js`. `npm run build` bundles Three.js, Rapier and html2canvas into `dist/scroll-3d.bundle.js`. If WebGL cannot be created, the page loads the prior HTML/CSS reader (`dist/fallback.js`).

## Current approach

A continuous indexed mesh is deformed along its material coordinate, with the straight section between two growing spirals. A canvas snapshot of the original HTML is mapped via UVs. Scroll wheel/touch moves the material through the opening. The scroll width, material thickness, roll core and length are parameters of `Scroll3D`. The original HTML is retained as source and fallback. Static local storage holds an opened flag, scroll offset and the positions and rotations of pre-cut wax pieces; no server is involved. Rapier precalculates simple rigid-body trajectories for the wax pieces and the closing drop. The cord is a 3D tube, not a simulated rope.

## Important unfinished work

- WebGL is disabled in the provided preview browser. The actual scene, animation, readable texture, ray-picked links, responsive sizing and performance have **not** been visually verified on a WebGL-capable device. Do not publish as a replacement for the working site without this validation.
- Seal is a procedural, pre-cut prototype with simple ball colliders, not a realistic fracture model. Cord has no physics. There are no Blender assets. The two closed spirals may overlap; the spiral integration is an approximation, not a full physical paper simulation.
- Texture is a single html2canvas bitmap with a size cap, so the very long document may become blurry or exceed a device's texture limits. Tiled textures and an accessible full HTML reading mode are needed. Resizing does not rebuild the texture at the new layout width.
- Mouse-drag scrolling and right-button rotation are deliberately deferred as requested. Position of broken pieces is stored, but there is no separate persistence of the rope or a full live physics world.
- The original requirement to use shader-effects-inc/shaders remains separate; its WebGPU shader bundle is not integrated into this WebGL material. Do not describe it as being used by the Three.js renderer.

Run `node --test tests/*.test.js` for the numerical geometry checks. These do not verify the visuals or interaction.
