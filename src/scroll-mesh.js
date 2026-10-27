import * as THREE from 'three';
import { sheetPoint } from './scroll-geometry.js';
import { createPaperMaterial } from './paper-material.js';
const clamp = THREE.MathUtils.clamp;

/** One continuous UV-mapped sheet with two faces and physical side walls. */
export class Scroll3D {
  constructor({ scene, texture, length, width = 2, thickness = .004, core = .044, paperThickness = thickness * .7 }) {
    if (paperThickness <= 0 || paperThickness >= thickness) throw new RangeError('Paper thickness must be positive and smaller than the winding pitch');
    Object.assign(this, { length, width, thickness, core, paperThickness });
    this.group = new THREE.Group(); scene.add(this.group);
    this.rows = Math.min(10000, Math.max(600, Math.ceil(length / .008)));
    this.centerline = new Float64Array((this.rows+1)*2);
    const uv = new Float32Array((this.rows+1)*4);
    const indices = [], sideIndices = [];
    const sideUV = new Float32Array((this.rows+1)*8);
    const sideNormals = new Float32Array((this.rows+1)*12);
    for(let i=0;i<=this.rows;i++) {
      const v=1-i/this.rows;
      uv.set([0,v,1,v],i*4);sideUV.set([0,v,0,v,1,v,1,v],i*8);
      sideNormals.set([-1,0,0,-1,0,0,1,0,0,1,0,0],i*12);
      if(i<this.rows) {
        const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);
        const k=i*4; sideIndices.push(k,k+4,k+1,k+1,k+4,k+5,k+2,k+3,k+6,k+3,k+7,k+6);
      }
    }
    const normal = new THREE.BufferAttribute(new Float32Array((this.rows+1)*6),3).setUsage(THREE.DynamicDrawUsage);
    const faceGeometry = () => {
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.BufferAttribute(new Float32Array((this.rows+1)*6),3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal',normal);g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(indices);return g;
    }
    this.geometry=faceGeometry();this.backGeometry=faceGeometry();
    this.sideGeometry=new THREE.BufferGeometry();
    this.sideGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array((this.rows+1)*12),3).setUsage(THREE.DynamicDrawUsage));
    this.sideGeometry.setAttribute('normal',new THREE.BufferAttribute(sideNormals,3));
    this.sideGeometry.setAttribute('uv',new THREE.BufferAttribute(sideUV,2));this.sideGeometry.setIndex(sideIndices);
    this.paper = new THREE.Mesh(this.geometry, createPaperMaterial({ texture, side: THREE.FrontSide, width, length }));
    this.back = new THREE.Mesh(this.backGeometry, createPaperMaterial({ side: THREE.BackSide, width, length }));
    const edgeMaterial=createPaperMaterial({side:THREE.DoubleSide,width,length});edgeMaterial.color.set(0xc4aa82);
    this.sides = new THREE.Mesh(this.sideGeometry,edgeMaterial);
    this.group.add(this.paper,this.back,this.sides);
  }
  update(top, bottom) {
    top=clamp(top,0,this.length);bottom=clamp(bottom,top,this.length);
    const middle=(top+bottom)/2, points=this.centerline, half=this.paperThickness/2;
    const front=this.geometry.attributes.position, back=this.backGeometry.attributes.position;
    const normals=this.geometry.attributes.normal, sides=this.sideGeometry.attributes.position;
    for(let i=0;i<=this.rows;i++) {
      const p=sheetPoint(this.length*i/this.rows,top,bottom,this.length,this.core,this.thickness);
      points[i*2]=p.y;points[i*2+1]=p.z;
    }
    for(let i=0;i<=this.rows;i++) {
      const prev=Math.max(0,i-1)*2,next=Math.min(this.rows,i+1)*2;
      const dy=points[next]-points[prev],dz=points[next+1]-points[prev+1];
      const inv=1/(Math.hypot(dy,dz)||1),ny=dz*inv,nz=dy*inv;
      const y=-(points[i*2]-middle),z=points[i*2+1];
      // Worn deckled edges remain part of the geometry as the sheet winds.
      const s=this.length*i/this.rows;
      const left=-this.width/2 + .0035*(1+Math.sin(s*31)+.45*Math.sin(s*79+1.2));
      const right=this.width/2 - .0035*(1+Math.sin(s*29+2)+.45*Math.sin(s*83));
      const fy=y+ny*half,fz=z+nz*half,by=y-ny*half,bz=z-nz*half;
      front.setXYZ(i*2,left,fy,fz);front.setXYZ(i*2+1,right,fy,fz);
      back.setXYZ(i*2,left,by,bz);back.setXYZ(i*2+1,right,by,bz);
      normals.setXYZ(i*2,0,ny,nz);normals.setXYZ(i*2+1,0,ny,nz);
      sides.setXYZ(i*4,left,fy,fz);sides.setXYZ(i*4+1,left,by,bz);
      sides.setXYZ(i*4+2,right,fy,fz);sides.setXYZ(i*4+3,right,by,bz);
    }
    front.needsUpdate=true;back.needsUpdate=true;normals.needsUpdate=true;sides.needsUpdate=true;
    this.geometry.computeBoundingSphere();this.backGeometry.computeBoundingSphere();this.sideGeometry.computeBoundingSphere();
  }
}

