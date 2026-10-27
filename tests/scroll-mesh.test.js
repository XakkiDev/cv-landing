import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Scroll3D } from '../src/scroll-mesh.js';

test('the paper has distinct faces and connected side walls over the entire sheet', () => {
  const scroll = new Scroll3D({ scene:new THREE.Scene(), texture:null, length:5, width:2, thickness:.004, paperThickness:.0028 });
  scroll.update(.05,2.05);
  const front=scroll.geometry.attributes.position, back=scroll.backGeometry.attributes.position;
  const side=scroll.sideGeometry.attributes.position;
  assert.equal(scroll.geometry.drawRange.count, Infinity, 'the complete continuous sheet must remain visible');
  for(const row of [0,Math.floor(scroll.rows/4),Math.floor(scroll.rows/2),scroll.rows]) {
    for(let edge=0;edge<2;edge++) {
      const f=new THREE.Vector3().fromBufferAttribute(front,row*2+edge);
      const b=new THREE.Vector3().fromBufferAttribute(back,row*2+edge);
      assert.ok(Math.abs(f.distanceTo(b)-scroll.paperThickness)<1e-6, 'paper faces retain their thickness');
      const sf=new THREE.Vector3().fromBufferAttribute(side,row*4+edge*2);
      const sb=new THREE.Vector3().fromBufferAttribute(side,row*4+edge*2+1);
      assert.ok(f.distanceTo(sf)<1e-6 && b.distanceTo(sb)<1e-6, 'side wall joins both faces');
    }
  }
});

test('paper thickness cannot exceed the distance between turns', () => {
  assert.throws(() => new Scroll3D({scene:new THREE.Scene(),texture:null,length:5,thickness:.004,paperThickness:.004}), RangeError);
});
