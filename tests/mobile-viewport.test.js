import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Scroll3D } from '../src/scroll-mesh.js';
import { scrollWindow, rollRadius } from '../src/scroll-geometry.js';

test('open scroll fits representative portrait and landscape mobile viewports', () => {
  for (const [width,height] of [[320,568],[375,812],[412,915],[667,375]]) {
    const unit=2/(width-20), length=12, edge=.05;
    const scroll=new Scroll3D({scene:new THREE.Scene(),texture:null,length});
    let viewport=Math.max(.25,(height-20)*unit-rollRadius(length,scroll.core,scroll.thickness)*2.15);
    let min,max;
    for(let pass=0;pass<3;pass++) {
      const win=scrollWindow({length,viewport,offset:0,progress:1,edge,core:scroll.core,thickness:scroll.thickness});
      scroll.update(win.top,win.bottom);
      const a=scroll.geometry.attributes.position;min=Infinity;max=-Infinity;
      for(let i=0;i<a.count;i++){min=Math.min(min,a.getY(i));max=Math.max(max,a.getY(i));}
      const delta=(height-20)*unit-(max-min);
      if(pass<2)viewport=Math.max(.25,Math.min(length,viewport+delta));
    }
    assert.ok((max-min)/unit <= height-18, `${width}x${height}: scroll exceeds viewport`);
    assert.ok(scroll.width/unit <= width-20 + 1e-6);
  }
});
