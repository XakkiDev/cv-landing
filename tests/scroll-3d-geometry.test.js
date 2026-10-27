import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rolledPoint, sheetPoint } from '../src/scroll-geometry.js';

test('roll starts tangent to the straight sheet and grows with paper length', () => {
  const core=.044, thickness=.002;
  assert.deepEqual(rolledPoint(0,core,thickness),{along:0,depth:0,radius:core,angle:0});
  assert.ok(rolledPoint(3,core,thickness).radius>rolledPoint(1,core,thickness).radius);
  const near=sheetPoint(1-1e-6,1,2,core,thickness);
  assert.ok(Math.abs(near.y-(1-1e-6))<1e-7);
  assert.ok(Math.abs(near.z)<1e-6);
});

test('the straight section is undistorted and both seams are continuous', () => {
  const a=sheetPoint(2,2,5,.05,.002),b=sheetPoint(5,2,5,.05,.002);
  assert.deepEqual(a,{y:2,z:0});assert.deepEqual(b,{y:5,z:0});
  const mid=sheetPoint(3.5,2,5,.05,.002);assert.deepEqual(mid,{y:3.5,z:0});
  for(const s of [2-1e-6,5+1e-6]) {const p=sheetPoint(s,2,5,.05,.002);assert.ok(Math.abs(p.y-s)<1e-7);assert.ok(Math.abs(p.z)<1e-6);}
});
