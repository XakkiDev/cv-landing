import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import html2canvas from 'html2canvas';
import { sheetPoint, scrollWindow } from './scroll-geometry.js';
import { createPaperMaterial } from './paper-material.js';

const clamp = THREE.MathUtils.clamp;
const ease = t => t * t * (3 - 2 * t);
const stateKey = 'sluzhilaya-gramota:scroll:main:v1';
function readState() {
  try {
    const v = JSON.parse(localStorage.getItem(stateKey));
    if (v && typeof v === 'object') return v;
  } catch (_) {}
  return { broken: false, fragments: [], wasOpened: false, open: false, offset: 0 };
}
function saveState(state) { try { localStorage.setItem(stateKey, JSON.stringify(state)); } catch (_) {} }

/** One continuous UV-mapped sheet. Positions are derived from its material coordinates. */
class Scroll3D {
  constructor({ scene, texture, length, width = 2, thickness = .004, core = .044 }) {
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
    this.paper = new THREE.Mesh(this.geometry, createPaperMaterial({ texture, side: THREE.FrontSide, width, length }));
    this.back = new THREE.Mesh(this.geometry, createPaperMaterial({ side: THREE.BackSide, width, length }));
    this.group.add(this.paper, this.back);
  }
  update(top, bottom, progress = 1) {
    top = clamp(top, 0, this.length); bottom = clamp(bottom, top, this.length);
    const positions = this.geometry.attributes.position;
    const middle = (top + bottom) / 2;
    for (let i = 0; i <= this.rows; i++) {
      const s = this.length * i / this.rows;
      const p = sheetPoint(s, top, bottom, this.length, this.core, this.thickness);
      positions.setXYZ(i * 2, -this.width / 2, -(p.y - middle), p.z);
      positions.setXYZ(i * 2 + 1, this.width / 2, -(p.y - middle), p.z);
    }
    positions.needsUpdate = true; this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
    // While open, expose only a shallow curl at either edge. The rest of the
    // same sheet remains modelled but is outside the viewing window.
    const smooth = ease(clamp((progress - .35) / .55, 0, 1));
    const curl = this.core * 1.15;
    const first = Math.max(0, top - curl) * smooth;
    const last = this.length - Math.max(0, this.length - bottom - curl) * smooth;
    const rowStart = Math.max(0, Math.floor(first / this.length * this.rows));
    const rowEnd = Math.min(this.rows, Math.ceil(last / this.length * this.rows));
    this.geometry.setDrawRange(rowStart * 6, Math.max(0, rowEnd - rowStart) * 6);
  }
}

async function capturePaper(paper) {
  await document.fonts.ready;
  const copy = paper.cloneNode(true);
  copy.removeAttribute('id'); copy.classList.add('texture-source');
  const width = Math.min(794, Math.max(320, innerWidth - 32));
  copy.style.width = width + 'px';
  document.body.append(copy);
  const height = copy.scrollHeight;
  const leader = Math.round(width * .025);
  // Stay below common WebGL max texture dimensions; keep aspect ratio.
  const scale = Math.min(1.5, 8192 / (height + 2*leader), 4096 / width);
  const links = [...copy.querySelectorAll('a[href]')].map(a => ({ href:a.getAttribute('href'), target:a.target, x:a.offsetLeft, y:0, width:0, height:0, element:a }));
  const rootRect = copy.getBoundingClientRect();
  links.forEach(l => {const r=l.element.getBoundingClientRect(); l.x=r.left-rootRect.left;l.y=r.top-rootRect.top;l.width=r.width;l.height=r.height;delete l.element;});
  const sections = {};
  for (const el of copy.querySelectorAll('[id]')) sections[el.id] = el.getBoundingClientRect().top-rootRect.top;
  const canvas = await html2canvas(copy,{scale, backgroundColor:'#eee3ca', logging:false, useCORS:true, windowWidth:width, width, height});
  copy.remove();
  // Blank margins remain rolled up, so neither end becomes completely flat.
  const padded = document.createElement('canvas'); padded.width=canvas.width; padded.height=Math.ceil((height+2*leader)*scale);
  const ctx=padded.getContext('2d');ctx.fillStyle='#eee3ca';ctx.fillRect(0,0,padded.width,padded.height);ctx.drawImage(canvas,0,Math.round(leader*scale));
  links.forEach(link => link.y += leader);
  Object.keys(sections).forEach(key => sections[key] += leader);
  const texture = new THREE.CanvasTexture(padded); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return {texture,width,height:height+2*leader,leader,links,sections};
}

async function start() {
  const paper = document.querySelector('.paper'), opening = document.querySelector('#opening'), site = document.querySelector('.site');
  const openButton = document.querySelector('#open-scroll'), skipButton = document.querySelector('#skip-opening'), foldButton = document.querySelector('#fold-scroll');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  await RAPIER.init();
  const capture = await capturePaper(paper);
  const state = readState();
  state.open = false; state.offset = 0; saveState(state);
  const canvas = document.createElement('canvas'); canvas.className = 'scroll-webgl'; canvas.setAttribute('aria-hidden','true'); document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0,0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1,1,1,-1,.01,100); camera.position.set(0,0,20); camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xffedd0,0x71503c,2.0));
  const lamp = new THREE.DirectionalLight(0xffe8bf,2.3); lamp.position.set(-3,5,8);scene.add(lamp);
  const length = 2*capture.height/capture.width;
  const scroll = new Scroll3D({scene,texture:capture.texture,length});
  const edgeLength = 2*capture.leader/capture.width;
  let viewportHeight = 1.5, open = false, busy = false, fraction = 0, offset = 0, animation = null, fallHeight = 0, closing = false;
  // Temporary orientation tool: rotations are in radians, UI reports degrees.
  const defaultOrientation = { x: THREE.MathUtils.degToRad(5), y: THREE.MathUtils.degToRad(-10), z: 0 };
  const orientation = { ...defaultOrientation };
  const panel = document.createElement('aside');
  panel.className = 'rotation-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Поворот грамоты');
  panel.innerHTML = '<span class="rotation-hint">Поворот: ПКМ · Shift + ПКМ — вращение</span><output class="rotation-values"></output><div class="rotation-buttons"><button type="button" data-axis="x" data-step="-1" aria-label="Наклонить вверх">↑</button><button type="button" data-axis="x" data-step="1" aria-label="Наклонить вниз">↓</button><button type="button" data-axis="y" data-step="-1" aria-label="Повернуть влево">←</button><button type="button" data-axis="y" data-step="1" aria-label="Повернуть вправо">→</button><button type="button" data-axis="z" data-step="-1" aria-label="Повернуть против часовой стрелки">↶</button><button type="button" data-axis="z" data-step="1" aria-label="Повернуть по часовой стрелке">↷</button><button type="button" data-reset="true">Сбросить</button></div>';
  document.body.append(panel);
  const values = panel.querySelector('.rotation-values');
  function showAngles() { values.textContent = ['x','y','z'].map(axis => `${axis.toUpperCase()}: ${(orientation[axis]*180/Math.PI).toFixed(1)}°`).join('  ·  '); }
  function setOrientation(axis, value) { orientation[axis] = clamp(value, -.7, .7); showAngles(); update(); }
  showAngles();
  panel.addEventListener('click', event => {
    const button=event.target.closest('button'); if(!button)return;
    if(button.dataset.reset) { Object.assign(orientation, defaultOrientation); showAngles(); update(); }
    else if(button.dataset.axis) setOrientation(button.dataset.axis, orientation[button.dataset.axis] + Number(button.dataset.step) * Math.PI / 60);
  });
  let drag = null, suppressContext = false;
  window.addEventListener('pointerdown', event => {
    if(event.button!==2 || !open || busy || event.target.closest('button,a,.rotation-panel') || !hitScroll(event))return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};suppressContext=true;
    event.target.setPointerCapture?.(event.pointerId);event.preventDefault();
  });
  window.addEventListener('pointermove', event => {
    if(!drag || event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;
    if(event.shiftKey) orientation.z=clamp(orientation.z+dx*.002,-.7,.7);
    else {orientation.y=clamp(orientation.y+dx*.002,-.7,.7);orientation.x=clamp(orientation.x+dy*.002,-.7,.7);}
    showAngles();update();event.preventDefault();
  });
  window.addEventListener('pointerup', event => { if(drag?.id===event.pointerId){drag=null;setTimeout(()=>suppressContext=false,500);} });
  window.addEventListener('pointercancel',()=>{drag=null;suppressContext=false;});
  window.addEventListener('contextmenu', event => {if(suppressContext || (open && hitScroll(event)))event.preventDefault();});
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function hitScroll(event) { pointer.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1); ray.setFromCamera(pointer,camera); return ray.intersectObjects([scroll.paper,scroll.back])[0]; }
  function resize() {
    renderer.setSize(innerWidth,innerHeight,false);
    const px = Math.min(794,innerWidth-32), unit=2/px;
    camera.left=-innerWidth*unit/2;camera.right=innerWidth*unit/2;camera.top=innerHeight*unit/2;camera.bottom=-innerHeight*unit/2;camera.updateProjectionMatrix();
    viewportHeight = Math.min(innerHeight-60,1100)*unit;
    update();
  }
  function update() {
    // A single roll starts at the leading edge; the second one starts
    // winding only after both circular envelopes have room to separate.
    const window = scrollWindow({length,viewport:viewportHeight,offset,progress:fraction,edge:edgeLength,core:scroll.core,thickness:scroll.thickness});
    offset=window.offset;
    const {top,bottom}=window;
    scroll.update(top,Math.max(top,bottom),fraction);
    const mobile=innerWidth<700;
    const closedY=-(innerHeight*(mobile?.19:.24))*(2/Math.min(794,innerWidth-32));
    scroll.group.position.y=closedY*(1-fraction)+fallHeight+(closing ? .65*(1-fraction) : 0);
    scroll.group.rotation.z=-.16*(1-fraction)+orientation.z*fraction;
    scroll.group.rotation.x=.27*(1-fraction)+orientation.x*fraction;
    scroll.group.rotation.y=-.48*(1-fraction)+orientation.y*fraction;
    scroll.group.scale.setScalar(.72+.28*fraction);
  }
  function animate(to, done) {
    const from=fraction, start=performance.now(), duration=reduced?0:1000;busy=true;
    function frame(now){const t=duration?Math.min(1,(now-start)/duration):1;fraction=THREE.MathUtils.lerp(from,to,ease(t));update();if(t<1)animation=requestAnimationFrame(frame);else{busy=false;done?.();}}
    cancelAnimationFrame(animation);animation=requestAnimationFrame(frame);
  }
  function show() {
    if(busy||open)return;open=true;offset=0;
    state.open=true;state.offset=0;saveState(state);panel.hidden=false;opening.classList.add('webgl-open');site.classList.remove('is-folded');site.inert=false;
    animate(1,()=>{foldButton.focus({preventScroll:true});});
  }
  function close() {
    if(busy||!open)return;open=false;panel.hidden=true;closing=!reduced;state.open=false;state.offset=0;saveState(state);site.inert=true;site.classList.add('is-folded');
    animate(0,()=>{
      if (reduced) {offset=0;opening.classList.remove('webgl-open');openButton.focus({preventScroll:true});return;}
      // Pre-simulate one small rigid body drop, then play those samples without a live world.
      const world=new RAPIER.World({x:0,y:-9.81,z:0});
      const ground=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.05,0));
      world.createCollider(RAPIER.ColliderDesc.cuboid(3,.05,1).setRestitution(.22),ground);
      const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,.65,0));
      world.createCollider(RAPIER.ColliderDesc.ball(.06).setRestitution(.22),body);
      const samples=[];for(let i=0;i<100;i++){world.step();samples.push(Math.max(0,body.translation().y-.06));}world.free();
      const started=performance.now();busy=true;closing=false;
      function drop(now){const i=Math.min(samples.length-1,Math.floor((now-started)/1000*60));fallHeight=samples[i];update();if(i<samples.length-1)requestAnimationFrame(drop);else{fallHeight=0;offset=0;busy=false;update();opening.classList.remove('webgl-open');openButton.focus({preventScroll:true});}}
      requestAnimationFrame(drop);
    });
  }
  function scrollBy(delta){if(!open||busy)return;offset=clamp(offset+delta*(2/capture.width),0,Math.max(0,length-viewportHeight-2*edgeLength));state.offset=offset;saveState(state);update();}
  window.addEventListener('resize',resize);
  openButton.addEventListener('click',show);skipButton.addEventListener('click',show);foldButton.hidden=false;foldButton.addEventListener('click',close);
  document.querySelector('.ambience').addEventListener('click',e=>{if(open&&!e.target.closest('a')&&!hitScroll(e))close();});
  window.addEventListener('wheel',e=>{if(open&&!busy){e.preventDefault();scrollBy(e.deltaY);}}, {passive:false});
  let touchY=null;window.addEventListener('touchstart',e=>{if(open)touchY=e.touches[0].clientY;},{passive:true});
  window.addEventListener('touchmove',e=>{if(open&&touchY!==null){e.preventDefault();const y=e.touches[0].clientY;scrollBy(touchY-y);touchY=y;}},{passive:false});
  window.addEventListener('touchend',()=>touchY=null,{passive:true});
  document.addEventListener('keydown',e=>{if(!open)return;if(e.key==='Escape'){close();return;}let d=0;if(e.key==='ArrowDown')d=60;if(e.key==='ArrowUp')d=-60;if(e.key==='PageDown'||e.key===' ')d=innerHeight*.7;if(e.key==='PageUp')d=-innerHeight*.7;if(d){e.preventDefault();scrollBy(d);}});
  document.querySelectorAll('.chapter-rail a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const id=a.hash.slice(1);offset=clamp((capture.sections[id]||0)*2/capture.width-viewportHeight*.12,0,Math.max(0,length-viewportHeight-2*edgeLength));update();}));
  // UV picking maps links to their original HTML coordinates.
  window.addEventListener('click',e=>{if(!open||busy||e.target.closest('a,button'))return;const hit=hitScroll(e);if(!hit?.uv)return;const x=hit.uv.x*capture.width,y=(1-hit.uv.y)*capture.height;const link=capture.links.find(l=>x>=l.x&&x<=l.x+l.width&&y>=l.y&&y<=l.y+l.height);if(link){if(link.href.startsWith('#')){offset=clamp((capture.sections[link.href.slice(1)]||0)*2/capture.width,0,Math.max(0,length-viewportHeight-2*edgeLength));update();}else window.open(link.href,link.target||'_blank','noopener');}});
  document.documentElement.classList.add('has-scroll-3d');site.classList.add('is-folded');site.inert=true;opening.hidden=false;
  resize();
  // Draw the closed geometry before revealing the canvas, avoiding a flash
  // of the ordinary HTML document or an unpositioned mesh at startup.
  renderer.render(scene,camera);
  document.documentElement.classList.remove('scroll-loading');
  function render(){renderer.render(scene,camera);requestAnimationFrame(render);}render();
}
start().catch(error=>{console.error('3D scroll unavailable; using HTML reader',error);import(new URL('fallback.js', location.href).href).finally(()=>document.documentElement.classList.remove('scroll-loading'));});
