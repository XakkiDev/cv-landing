import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rolledPoint, rollRadius, sheetPoint, scrollWindow } from '../src/scroll-geometry.js';

const core=.044, thickness=.002;

test('a roll enters at its outer radius and ends at the inner radius', () => {
  const length=4;
  const start=rolledPoint(0,length,core,thickness), end=rolledPoint(length,length,core,thickness);
  assert.equal(start.radius, rollRadius(length,core,thickness));
  assert.equal(start.angle,0); assert.equal(start.along,0); assert.equal(start.depth,0);
  assert.ok(Math.abs(end.radius-core)<1e-12);
  assert.ok(end.angle>2*Math.PI);
});

test('adjacent turns have a paper-thickness radial gap', () => {
  const length=6, start=rolledPoint(0,length,core,thickness);
  // Exact angle inversion of the radius relation, to inspect one turn inside.
  const radius=start.outer-thickness;
  const distance=length-Math.PI*(radius*radius-core*core)/thickness;
  const oneTurn=rolledPoint(distance,length,core,thickness);
  assert.ok(Math.abs(oneTurn.angle-2*Math.PI)<1e-10);
  assert.ok(Math.abs(start.radius-oneTurn.radius-thickness)<1e-12);
});

test('both rolls join the flat sheet continuously and lie above it', () => {
  const top=1,bottom=3,length=5;
  assert.deepEqual(sheetPoint(top,top,bottom,length,core,thickness),{y:top,z:0});
  assert.deepEqual(sheetPoint(bottom,top,bottom,length,core,thickness),{y:bottom,z:0});
  assert.deepEqual(sheetPoint(2,top,bottom,length,core,thickness),{y:2,z:0});
  for(const s of [top-1e-7,bottom+1e-7]) {
    const p=sheetPoint(s,top,bottom,length,core,thickness);
    assert.ok(Math.abs(p.y-s)<1e-8); assert.ok(p.z>=0 && p.z<1e-7);
  }
});

test('the spiral preserves paper length within the thin-sheet approximation', () => {
  const length=4, n=20000;
  let previous=rolledPoint(0,length,core,thickness), arc=0;
  for(let i=1;i<=n;i++) {
    const p=rolledPoint(length*i/n,length,core,thickness);
    arc+=Math.hypot(p.along-previous.along,p.depth-previous.depth);previous=p;
  }
  assert.ok(Math.abs(arc-length)/length < .0001, `arc length ${arc}`);
});


test('roll envelopes stay apart while opening and closing at several offsets', () => {
  const length=8,viewport=2,edge=.18,thickness=.004;
  for(const offset of [0,1,3,5]) for(let step=0;step<=1000;step++) {
    const {top,bottom}=scrollWindow({length,viewport,edge,core,thickness,offset,progress:step/1000});
    if(top<=1e-12 || length-bottom<=1e-12)continue;
    const a=rollRadius(top,core,thickness),b=rollRadius(length-bottom,core,thickness);
    const centres=Math.hypot(bottom-top,a-b);
    assert.ok(centres+1e-12>=a+b, `intersect at ${step}/1000 with offset ${offset}`);
  }
});


test('scrolling transfers sheet length from the lower roll to the upper roll', () => {
  const options={length:10,viewport:2,edge:.05,core,thickness:.004,progress:1};
  const start=scrollWindow({...options,offset:0});
  const middle=scrollWindow({...options,offset:2});
  const last=scrollWindow({...options,offset:5});
  assert.ok(start.top>0 && start.top<core*1.3, 'leading edge starts slightly bent');
  assert.ok(middle.top>start.top && last.top>middle.top);
  assert.ok(options.length-middle.bottom<options.length-start.bottom);
  assert.ok(options.length-last.bottom<options.length-middle.bottom);
  for(const position of [start,middle,last]) assert.ok(Math.abs((position.bottom-position.top)-options.viewport)<1e-10);
});
