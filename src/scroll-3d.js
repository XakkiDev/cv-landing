import * as THREE from 'three';
import { scrollWindow, rollRadius } from './scroll-geometry.js';
import { Scroll3D } from './scroll-mesh.js';
import { capturePaper } from './paper-capture.js';
import { bounceSamples } from './bounce.js';

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
const closedPoseKey = 'sluzhilaya-gramota:scroll:closed-pose:v1';
const orientationKey = 'sluzhilaya-gramota:scroll:orientation:v1';
/** Overlay the numbers the visitor saved onto `defaults`; unknown fields and non-finite values are ignored. */
function readStored(key, defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && typeof saved === 'object') {
      for (const field of Object.keys(defaults)) if (Number.isFinite(saved[field])) defaults[field] = saved[field];
    }
  } catch (_) {}
  return defaults;
}
function writeStored(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
function saveState(state) { try { localStorage.setItem(stateKey, JSON.stringify(state)); } catch (_) {} }

async function start() {
  const paper = document.querySelector('.paper'), opening = document.querySelector('#opening'), site = document.querySelector('.site');
  const openButton = document.querySelector('#open-scroll'), skipButton = document.querySelector('#skip-opening'), foldButton = document.querySelector('#fold-scroll');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  let viewportHeight = 1.5, open = false, busy = false, fraction = 0, offset = 0, targetOffset = 0, animation = null, fallHeight = 0, closing = false, lastFrame = 0;
  // Temporary orientation tool: rotations are in radians, UI reports degrees.
  const defaultOrientation = { x: THREE.MathUtils.degToRad(8), y: THREE.MathUtils.degToRad(8), z: 0 };
  const orientation = readStored(orientationKey, { ...defaultOrientation });
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
  const closedPose = readStored(closedPoseKey,{x:.0121,y:.3028,rx:19*Math.PI/180,ry:-27.5*Math.PI/180,rz:-2.4*Math.PI/180,scale:.495});
  let debugVisible=false;
  document.querySelector('#debug-toggle').addEventListener('click',()=>{debugVisible=!debugVisible; panel.hidden=!debugVisible||!open;posePanel.hidden=!debugVisible||open;});
  const posePanel=document.createElement('aside');posePanel.className='rotation-panel closed-pose-panel';
  posePanel.innerHTML='<span>Свиток: ПКМ — двигать · Ctrl+ПКМ — поворот<br>Ctrl+Alt+ПКМ: вверх — крупнее, вниз — мельче</span><output></output>';
  document.body.append(posePanel);
  function sceneSize(){const rect=document.querySelector('.ambience .scene').getBoundingClientRect();return {width:rect.width,height:rect.height};}
  function showPose(){posePanel.querySelector('output').textContent=`От центра фона: X ${(closedPose.x*100).toFixed(2)}% · Y ${(closedPose.y*100).toFixed(2)}% (вниз) | RX ${(closedPose.rx*180/Math.PI).toFixed(1)}° · RY ${(closedPose.ry*180/Math.PI).toFixed(1)}° · RZ ${(closedPose.rz*180/Math.PI).toFixed(1)}° | Масштаб ${closedPose.scale.toFixed(3)}`;}
  showPose();
  let drag = null, suppressContext = false;
  window.addEventListener('pointerdown', event => {
    if(event.button!==2 || busy || event.target.closest('.rotation-panel') || (open && (event.target.closest('button,a') || !hitScroll(event))))return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};suppressContext=true;
    event.target.setPointerCapture?.(event.pointerId);event.preventDefault();
  });
  window.addEventListener('pointermove', event => {
    if(!drag || event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;
    if(!open){
      if(event.ctrlKey && event.altKey) closedPose.scale=clamp(closedPose.scale*Math.exp(-dy*.008),.1,4);
      else if(event.ctrlKey){closedPose.rz+=dx*.005;closedPose.rx+=dy*.005;}
      else {const size=sceneSize();closedPose.x+=dx/size.width;closedPose.y+=dy/size.height;}
      showPose();update();event.preventDefault();return;
    }
    if(event.shiftKey) orientation.z=clamp(orientation.z+dx*.002,-.7,.7);
    else {orientation.y=clamp(orientation.y+dx*.002,-.7,.7);orientation.x=clamp(orientation.x+dy*.002,-.7,.7);}
    showAngles();update();event.preventDefault();
  });
  window.addEventListener('pointerup', event => { if(drag?.id===event.pointerId){if(open)writeStored(orientationKey,orientation);else writeStored(closedPoseKey,closedPose);drag=null;setTimeout(()=>suppressContext=false,500);} });
  window.addEventListener('pointercancel',()=>{drag=null;suppressContext=false;});
  window.addEventListener('contextmenu', event => {if(suppressContext || (!open || hitScroll(event)))event.preventDefault();});
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function hitScroll(event) { pointer.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1); ray.setFromCamera(pointer,camera); return ray.intersectObjects([scroll.paper,scroll.back])[0]; }
  function resize() {
    renderer.setSize(innerWidth,innerHeight,false);
    const mobile=innerWidth<700;
    const px = mobile ? Math.max(1,innerWidth-20) : Math.min(954,innerWidth-32), unit=2/px;
    camera.left=-innerWidth*unit/2;camera.right=innerWidth*unit/2;camera.top=innerHeight*unit/2;camera.bottom=-innerHeight*unit/2;camera.updateProjectionMatrix();
    // Keep room for the true rolled ends rather than cutting them at the viewport.
    const rollMargin=rollRadius(length,scroll.core,scroll.thickness)*2.15;
    viewportHeight = Math.max(.25, (innerHeight-20)*unit-rollMargin);
    update();
  }
  function update() {
    // A single roll starts at the leading edge; the second one starts
    // winding only after both circular envelopes have room to separate.
    const window = scrollWindow({length,viewport:viewportHeight,offset,progress:fraction,edge:edgeLength,core:scroll.core,thickness:scroll.thickness});
    offset=window.offset;
    const {top,bottom}=window;
    scroll.update(top,Math.max(top,bottom));
    canvas.dataset.upperRoll = String(top);
    canvas.dataset.lowerRoll = String(length-bottom);
    const mobile=innerWidth<700;
    const unit=(camera.right-camera.left)/innerWidth;
    const size=sceneSize();
    const closedY=-size.height*closedPose.y*unit;
    posePanel.hidden=!debugVisible||open;
    scroll.group.position.x=size.width*closedPose.x*unit*(1-fraction);
    scroll.group.position.y=closedY*(1-fraction)+fallHeight+(closing ? .65*(1-fraction) : 0);
    scroll.group.rotation.z=closedPose.rz*(1-fraction)+(mobile?0:orientation.z)*fraction;
    // When closed, show the outside edge of the wound sheet to the camera;
    // turn the same geometry into its readable orientation as it opens.
    const closedTurn=1-ease(Math.min(1,fraction/.45));
    scroll.group.rotation.x=closedPose.rx*(1-fraction)+(mobile?0:orientation.x)*fraction+Math.PI*closedTurn;
    scroll.group.rotation.y=closedPose.ry*(1-fraction)+(mobile?0:orientation.y)*fraction;
    scroll.group.scale.setScalar(closedPose.scale*(size.width*794/1920)*(unit/2)*(1-fraction)+fraction);
    // Fit the projected rolled sheet into the requested vertical space. Use
    // the actual mesh, including rotation and roll thickness, not a fixed cap.
    if (fraction === 1 && open) {
      const target=(innerHeight-20)*unit;
      const q=scroll.group.quaternion, point=new THREE.Vector3();
      for(let pass=0;pass<3;pass++) {
        const attr=scroll.geometry.attributes.position;
        let min=Infinity,max=-Infinity;
        for(let i=0;i<attr.count;i++) {point.fromBufferAttribute(attr,i).applyQuaternion(q);min=Math.min(min,point.y);max=Math.max(max,point.y);}
        const delta=target-(max-min);
        if(pass===2 || Math.abs(delta)<unit*.5){scroll.group.position.y=-(min+max)/2;break;}
        viewportHeight=Math.max(.25,Math.min(length,viewportHeight+delta/Math.max(.3,Math.cos(mobile ? 0 : orientation.x))));
        const fitted=scrollWindow({length,viewport:viewportHeight,offset,progress:1,edge:edgeLength,core:scroll.core,thickness:scroll.thickness});
        offset=fitted.offset;scroll.update(fitted.top,fitted.bottom);
      }
    }
  }
  function animate(to, done) {
    const from=fraction, start=performance.now(), duration=reduced?0:1000;busy=true;
    function frame(now){const t=duration?Math.min(1,(now-start)/duration):1;fraction=THREE.MathUtils.lerp(from,to,ease(t));update();if(t<1)animation=requestAnimationFrame(frame);else{busy=false;done?.();}}
    cancelAnimationFrame(animation);animation=requestAnimationFrame(frame);
  }
  function show() {
    if(busy||open)return;open=true;offset=0;targetOffset=0;
    state.open=true;state.offset=0;saveState(state);panel.hidden=!debugVisible;opening.classList.add('webgl-open');site.classList.remove('is-folded');site.inert=false;
    animate(1,()=>{foldButton.focus({preventScroll:true});});
  }
  function close() {
    if(busy||!open)return;open=false;targetOffset=offset;panel.hidden=true;closing=!reduced;state.open=false;state.offset=0;saveState(state);site.inert=true;site.classList.add('is-folded');
    animate(0,()=>{
      if (reduced) {offset=0;opening.classList.remove('webgl-open');openButton.focus({preventScroll:true});return;}
      const samples=bounceSamples();
      const started=performance.now();busy=true;closing=false;
      function drop(now){const i=Math.min(samples.length-1,Math.floor((now-started)/1000*60));fallHeight=samples[i];update();if(i<samples.length-1)requestAnimationFrame(drop);else{fallHeight=0;offset=0;busy=false;update();opening.classList.remove('webgl-open');openButton.focus({preventScroll:true});}}
      requestAnimationFrame(drop);
    });
  }
  function setScrollTarget(value) {
    targetOffset=clamp(value,0,Math.max(0,length-viewportHeight-2*edgeLength));
    state.offset=targetOffset;saveState(state);
    if(reduced){offset=targetOffset;update();}
  }
  function scrollBy(delta){if(!open||busy)return;setScrollTarget(targetOffset+delta*(2/capture.width));}
  window.addEventListener('resize',resize);
  openButton.addEventListener('click',show);foldButton.hidden=false;foldButton.addEventListener('click',close);
  document.querySelector('.ambience').addEventListener('click',e=>{if(open&&!e.target.closest('a')&&!hitScroll(e))close();});
  window.addEventListener('wheel',e=>{if(open&&!busy){e.preventDefault();scrollBy(e.deltaY * (e.deltaMode===1 ? 16 : e.deltaMode===2 ? innerHeight : 1));}}, {passive:false});
  let touchY=null;window.addEventListener('touchstart',e=>{if(open)touchY=e.touches[0].clientY;},{passive:true});
  window.addEventListener('touchmove',e=>{if(open&&touchY!==null){e.preventDefault();const y=e.touches[0].clientY;scrollBy(touchY-y);touchY=y;}},{passive:false});
  window.addEventListener('touchend',()=>touchY=null,{passive:true});
  document.addEventListener('keydown',e=>{if(!open)return;if(e.key==='Escape'){close();return;}let d=0;if(e.key==='ArrowDown')d=60;if(e.key==='ArrowUp')d=-60;if(e.key==='PageDown'||e.key===' ')d=innerHeight*.7;if(e.key==='PageUp')d=-innerHeight*.7;if(d){e.preventDefault();scrollBy(d);}});
  document.querySelectorAll('.chapter-rail a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const id=a.hash.slice(1);setScrollTarget((capture.sections[id]||0)*2/capture.width-viewportHeight*.12);}));
  // The sheet is only a texture, so links are found by ray-casting the pointer onto the mesh
  // and mapping the UV hit back to the link rectangles measured in the source HTML.
  function linkAt(event) {
    if(isControl(event))return null;
    const hit=hitScroll(event);
    if(!hit?.uv||hit.object!==scroll.paper)return null;
    const x=hit.uv.x*capture.width,y=(1-hit.uv.y)*capture.height;
    return capture.links.find(l=>x>=l.x&&x<=l.x+l.width&&y>=l.y&&y<=l.y+l.height)||null;
  }
  // The chest link sits under the scroll, so it is hit-tested here after the scroll itself.
  const chestLink=document.querySelector('.chest-link');
  function overChest(event) {
    const r=chestLink.getBoundingClientRect();
    return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;
  }
  const isControl=event=>event.target.closest('button,a,.rotation-panel,.chapter-rail,.mobile-chest');
  // What a click at this point would do: follow a sheet link, unroll the closed scroll, or open the chest link.
  function actionAt(event) {
    if(busy)return null;
    if(open){
      const link=linkAt(event);
      if(!link)return null;
      return link.href.startsWith('#')
        ?()=>setScrollTarget((capture.sections[link.href.slice(1)]||0)*2/capture.width)
        :()=>window.open(link.href,'_blank','noopener');
    }
    if(isControl(event))return null;
    if(hitScroll(event))return show;
    return overChest(event)?()=>window.open(chestLink.href,'_blank','noopener'):null;
  }
  window.addEventListener('click',e=>actionAt(e)?.());
  let hovering=false;
  window.addEventListener('pointermove',e=>{
    if(drag)return;
    const over=!!actionAt(e);
    if(over!==hovering){hovering=over;document.documentElement.style.cursor=over?'pointer':'';}
  });
  if(document.documentElement.classList.contains('reader-fallback')) { renderer.dispose(); canvas.remove(); panel.remove(); posePanel.remove(); return; }
  document.documentElement.classList.add('has-scroll-3d');site.classList.add('is-folded');site.inert=true;opening.hidden=false;
  resize();
  // Draw the closed geometry before revealing the canvas, avoiding a flash
  // of the ordinary HTML document or an unpositioned mesh at startup.
  renderer.render(scene,camera);
  document.documentElement.classList.remove('scroll-loading');
  function render(now=performance.now()){
    const dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
    if(open&&!busy&&Math.abs(targetOffset-offset)>0.00001){
      offset=THREE.MathUtils.damp(offset,targetOffset,10,dt);
      if(Math.abs(targetOffset-offset)<0.0001)offset=targetOffset;
      update();
    }
    renderer.render(scene,camera);requestAnimationFrame(render);
  }render();
}
start().catch(error=>{console.error('3D scroll unavailable; using HTML reader',error);window.showReaderFallback();});
