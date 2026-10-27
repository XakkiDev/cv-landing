import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import html2canvas from 'html2canvas';
import { sheetPoint } from './scroll-geometry.js';

const clamp = THREE.MathUtils.clamp;
const ease = t => t * t * (3 - 2 * t);
const stateKey = 'sluzhilaya-gramota:scroll:main:v1';
function readState() {
  try {
    const v = JSON.parse(localStorage.getItem(stateKey));
    if (v && typeof v.broken === 'boolean' && Array.isArray(v.fragments)) return v;
  } catch (_) {}
  return { broken: false, fragments: [], wasOpened: false, open: false, offset: 0 };
}
function saveState(state) { try { localStorage.setItem(stateKey, JSON.stringify(state)); } catch (_) {} }

/** One continuous UV-mapped sheet. Positions are derived from its material coordinates. */
class Scroll3D {
  constructor({ scene, texture, length, width = 2, thickness = .002, core = .044 }) {
    Object.assign(this, { length, width, thickness, core });
    this.group = new THREE.Group(); scene.add(this.group);
    // The sampling interval tracks the tightest roll, so layers stay smooth.
    this.rows = Math.min(10000, Math.max(600, Math.ceil(length / .008)));
    const vertices = new Float32Array((this.rows + 1) * 2 * 3);
    const uv = new Float32Array((this.rows + 1) * 2 * 2);
    const indices = [];
    for (let i = 0; i <= this.rows; i++) {
      const v = i / this.rows;
      uv.set([0, 1 - v, 1, 1 - v], i * 4);
      if (i < this.rows) { const n = i * 2; indices.push(n,n+2,n+1,n+1,n+2,n+3); }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry.setIndex(indices);
    this.paper = new THREE.Mesh(this.geometry, new THREE.MeshStandardMaterial({ map: texture, color: 0xfff8e9, side: THREE.DoubleSide, roughness: .94, metalness: 0 }));
    this.group.add(this.paper);
  }
  update(top, bottom) {
    top = clamp(top, 0, this.length); bottom = clamp(bottom, top, this.length);
    const positions = this.geometry.attributes.position;
    const middle = (top + bottom) / 2;
    for (let i = 0; i <= this.rows; i++) {
      const s = this.length * i / this.rows;
      const p = sheetPoint(s, top, bottom, this.core, this.thickness);
      positions.setXYZ(i * 2, -this.width / 2, -(p.y - middle), p.z);
      positions.setXYZ(i * 2 + 1, this.width / 2, -(p.y - middle), p.z);
    }
    positions.needsUpdate = true; this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}

function createSeal() {
  const group = new THREE.Group(), pieces = [];
  const red = new THREE.MeshStandardMaterial({color:0x8b251b, roughness:.46, metalness:.03});
  // Five individually extruded, uneven wax fragments; fracture lines remain visible.
  const radius = .145, count = 5;
  for (let i=0;i<count;i++) {
    const shape = new THREE.Shape(); shape.moveTo(0,0);
    const a = i * Math.PI * 2 / count, b = (i+1) * Math.PI * 2 / count;
    for (let j=0;j<=8;j++) { const t=a+(b-a)*j/8; const r=radius*(1+.055*Math.sin(t*7)); shape.lineTo(Math.cos(t)*r,Math.sin(t)*r); }
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:2}),red);
    mesh.position.z=.005; group.add(mesh); pieces.push(mesh);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.112,.004,5,48),new THREE.MeshStandardMaterial({color:0xb44d38,roughness:.6}));
  rim.position.z=.028; group.add(rim);
  return {group,pieces,rim};
}

async function capturePaper(paper) {
  await document.fonts.ready;
  const copy = paper.cloneNode(true);
  copy.removeAttribute('id'); copy.classList.add('texture-source');
  const width = Math.min(794, Math.max(320, innerWidth - 32));
  copy.style.width = width + 'px';
  document.body.append(copy);
  const height = copy.scrollHeight;
  // Stay below common WebGL max texture dimensions; keep aspect ratio.
  const scale = Math.min(1.5, 8192 / height, 4096 / width);
  const links = [...copy.querySelectorAll('a[href]')].map(a => ({ href:a.getAttribute('href'), target:a.target, x:a.offsetLeft, y:0, width:0, height:0, element:a }));
  const rootRect = copy.getBoundingClientRect();
  links.forEach(l => {const r=l.element.getBoundingClientRect(); l.x=r.left-rootRect.left;l.y=r.top-rootRect.top;l.width=r.width;l.height=r.height;delete l.element;});
  const sections = {};
  for (const el of copy.querySelectorAll('[id]')) sections[el.id] = el.getBoundingClientRect().top-rootRect.top;
  const canvas = await html2canvas(copy,{scale, backgroundColor:'#eee3ca', logging:false, useCORS:true, windowWidth:width, width, height});
  copy.remove();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return {texture,width,height,links,sections};
}

async function start() {
  const paper = document.querySelector('.paper'), opening = document.querySelector('#opening'), site = document.querySelector('.site');
  const openButton = document.querySelector('#open-scroll'), skipButton = document.querySelector('#skip-opening'), foldButton = document.querySelector('#fold-scroll');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  await RAPIER.init();
  const capture = await capturePaper(paper);
  const state = readState();
  const canvas = document.createElement('canvas'); canvas.className = 'scroll-webgl'; canvas.setAttribute('aria-hidden','true'); document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0,0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1,1,1,-1,.01,100); camera.position.set(0,0,20); camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xffedd0,0x71503c,2.0));
  const lamp = new THREE.DirectionalLight(0xffe8bf,2.3); lamp.position.set(-3,5,8);scene.add(lamp);
  const length = 2*capture.height/capture.width;
  const scroll = new Scroll3D({scene,texture:capture.texture,length});
  const seal = createSeal(); scroll.group.add(seal.group); seal.group.position.set(0,0,.16);
  // The cord is actual tube geometry. Its fibres can receive a shader later.
  const ropeMaterial = new THREE.MeshStandardMaterial({color:0x705138,roughness:1});
  const ropePath = new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.3,0),new THREE.Vector3(.015,-.15,.015),new THREE.Vector3(0,0,.035),new THREE.Vector3(-.015,.15,.015),new THREE.Vector3(0,.3,0)]);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(ropePath,40,.009,7,false),ropeMaterial); seal.group.add(rope);rope.position.z=-.012;
  let viewportHeight = 1.5, open = false, busy = false, fraction = 0, offset = 0, animation = null, fallHeight = 0, closing = false, fractureFrames = null;
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function hitScroll(event) { pointer.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1); ray.setFromCamera(pointer,camera); return ray.intersectObject(scroll.paper)[0]; }
  function resize() {
    renderer.setSize(innerWidth,innerHeight,false);
    const px = Math.min(794,innerWidth-32), unit=2/px;
    camera.left=-innerWidth*unit/2;camera.right=innerWidth*unit/2;camera.top=innerHeight*unit/2;camera.bottom=-innerHeight*unit/2;camera.updateProjectionMatrix();
    viewportHeight = Math.min(innerHeight-60,1100)*unit;
    update();
  }
  function update() {
    const visible = Math.min(length, viewportHeight * fraction);
    const maxOffset = Math.max(0,length-visible);
    offset=clamp(offset,0,maxOffset);
    const centerAtStart = Math.min(length/2,viewportHeight/2);
    const top = open ? Math.max(0, offset + (viewportHeight-visible)/2) : Math.max(0,centerAtStart-visible/2);
    scroll.update(top,Math.min(length,top+visible));
    seal.group.visible = fraction < .45;
    const mobile=innerWidth<700;
    const closedY=-(innerHeight*(mobile?.12:.15))*(2/Math.min(794,innerWidth-32));
    scroll.group.position.y=closedY*(1-fraction)+fallHeight+(closing ? .65*(1-fraction) : 0);
    scroll.group.rotation.z=-.16*(1-fraction);
    scroll.group.rotation.x=.35*(1-fraction);
    scroll.group.scale.setScalar(.72+.28*fraction);
    rope.visible=!state.broken;
    seal.rim.visible=!state.broken;
    if(state.broken) seal.pieces.forEach((p,i)=>{
      const frame=fractureFrames?.[Math.min(fractureFrames.length-1, Math.floor(fraction*2.2*fractureFrames.length))];
      const saved=frame?.[i] || state.fragments[i];
      if(saved && saved.position?.length===3 && saved.rotation?.length===4) {p.position.fromArray(saved.position);p.quaternion.fromArray(saved.rotation);}
    });
  }
  function simulateBreak() {
    if(state.broken) return;
    const world=new RAPIER.World({x:0,y:-4,z:0});
    const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.13,0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(2,.01,1).setRestitution(.18),floor);
    const bodies=seal.pieces.map((_,i)=>{
      const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,.01,.005).setLinvel((i-2)*.09,.12+i*.015,.012).setAngvel({x:0,y:0,z:(i-2)*.8}));
      world.createCollider(RAPIER.ColliderDesc.ball(.035).setRestitution(.2).setFriction(.8),body);return body;
    });
    fractureFrames=[];
    for(let step=0;step<70;step++){world.step();fractureFrames.push(bodies.map(b=>{const p=b.translation(),q=b.rotation();return {position:[p.x,p.y,p.z],rotation:[q.x,q.y,q.z,q.w]};}));}
    state.fragments=fractureFrames[fractureFrames.length-1];
    state.broken=true;state.wasOpened=true;saveState(state);world.free();
  }
  function animate(to, done) {
    const from=fraction, start=performance.now(), duration=reduced?0:1000;busy=true;
    function frame(now){const t=duration?Math.min(1,(now-start)/duration):1;fraction=THREE.MathUtils.lerp(from,to,ease(t));update();if(t<1)animation=requestAnimationFrame(frame);else{busy=false;done?.();}}
    cancelAnimationFrame(animation);animation=requestAnimationFrame(frame);
  }
  function show() {
    if(busy||open)return;simulateBreak();open=true;offset=0;
    state.open=true;state.offset=0;saveState(state);opening.classList.add('webgl-open');site.classList.remove('is-folded');site.inert=false;
    animate(1,()=>{fractureFrames=null;foldButton.focus({preventScroll:true});});
  }
  function close() {
    if(busy||!open)return;open=false;closing=!reduced;offset=0;state.open=false;state.offset=0;saveState(state);site.inert=true;site.classList.add('is-folded');
    animate(0,()=>{
      if (reduced) {opening.classList.remove('webgl-open');openButton.focus({preventScroll:true});return;}
      // Pre-simulate one small rigid body drop, then play those samples without a live world.
      const world=new RAPIER.World({x:0,y:-9.81,z:0});
      const ground=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.05,0));
      world.createCollider(RAPIER.ColliderDesc.cuboid(3,.05,1).setRestitution(.22),ground);
      const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,.65,0));
      world.createCollider(RAPIER.ColliderDesc.ball(.06).setRestitution(.22),body);
      const samples=[];for(let i=0;i<100;i++){world.step();samples.push(Math.max(0,body.translation().y-.06));}world.free();
      const started=performance.now();busy=true;closing=false;
      function drop(now){const i=Math.min(samples.length-1,Math.floor((now-started)/1000*60));fallHeight=samples[i];update();if(i<samples.length-1)requestAnimationFrame(drop);else{fallHeight=0;busy=false;update();opening.classList.remove('webgl-open');openButton.focus({preventScroll:true});}}
      requestAnimationFrame(drop);
    });
  }
  function scrollBy(delta){if(!open||busy)return;offset=clamp(offset+delta*(2/capture.width),0,Math.max(0,length-viewportHeight));state.offset=offset;saveState(state);update();}
  window.addEventListener('resize',resize);
  openButton.addEventListener('click',show);skipButton.addEventListener('click',show);foldButton.hidden=false;foldButton.addEventListener('click',close);
  document.querySelector('.ambience').addEventListener('click',e=>{if(open&&!e.target.closest('a')&&!hitScroll(e))close();});
  window.addEventListener('wheel',e=>{if(open&&!busy){e.preventDefault();scrollBy(e.deltaY);}}, {passive:false});
  let touchY=null;window.addEventListener('touchstart',e=>{if(open)touchY=e.touches[0].clientY;},{passive:true});
  window.addEventListener('touchmove',e=>{if(open&&touchY!==null){e.preventDefault();const y=e.touches[0].clientY;scrollBy(touchY-y);touchY=y;}},{passive:false});
  window.addEventListener('touchend',()=>touchY=null,{passive:true});
  document.addEventListener('keydown',e=>{if(!open)return;if(e.key==='Escape'){close();return;}let d=0;if(e.key==='ArrowDown')d=60;if(e.key==='ArrowUp')d=-60;if(e.key==='PageDown'||e.key===' ')d=innerHeight*.7;if(e.key==='PageUp')d=-innerHeight*.7;if(d){e.preventDefault();scrollBy(d);}});
  document.querySelectorAll('.chapter-rail a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const id=a.hash.slice(1);offset=clamp((capture.sections[id]||0)*2/capture.width-viewportHeight*.12,0,length-viewportHeight);update();}));
  // UV picking maps links to their original HTML coordinates.
  window.addEventListener('click',e=>{if(!open||busy||e.target.closest('a,button'))return;const hit=hitScroll(e);if(!hit?.uv)return;const x=hit.uv.x*capture.width,y=(1-hit.uv.y)*capture.height;const link=capture.links.find(l=>x>=l.x&&x<=l.x+l.width&&y>=l.y&&y<=l.y+l.height);if(link){if(link.href.startsWith('#')){offset=clamp((capture.sections[link.href.slice(1)]||0)*2/capture.width,0,length-viewportHeight);update();}else window.open(link.href,link.target||'_blank','noopener');}});
  document.documentElement.classList.add('has-scroll-3d');site.classList.add('is-folded');site.inert=true;opening.hidden=false;
  resize();
  if(state.open) { open=true;fraction=1;offset=clamp(Number(state.offset)||0,0,Math.max(0,length-viewportHeight));opening.classList.add('webgl-open');site.classList.remove('is-folded');site.inert=false;update(); }
  function render(){renderer.render(scene,camera);requestAnimationFrame(render);}render();
}
start().catch(error=>{console.error('3D scroll unavailable; using HTML reader',error);import(new URL('fallback.js', location.href).href);});
