import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { V3 } from './layout';

export const unitBox = new THREE.BoxGeometry(1,1,1);
export const entityObjects = new Map<string,THREE.Object3D>();
const unitCylinder = new THREE.CylinderGeometry(.5,.5,1,12);
const painted = new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.67,metalness:.36});
export interface Part { p: V3; s: V3; c: string; q?: THREE.Quaternion; }
export class Model {
  boxes: Part[]=[]; cylinders: Part[]=[];
  box(p: V3,s: V3,c: string) { this.boxes.push({p,s,c}); return this; }
  cyl(p: V3,s: V3,c: string,r?: V3) { this.cylinders.push({p,s,c,q:r?new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)):undefined}); return this; }
  beam(a: V3,b: V3,w: number,c: string,depth=w) {
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),d=end.clone().sub(start);
    this.boxes.push({p:start.add(end).multiplyScalar(.5).toArray() as V3,s:[w,d.length(),depth],c,q:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize())}); return this;
  }
  rail(a: V3,b: V3,c='#d2d5ce',height=1.1) {
    this.beam(a,b,.055,c); this.beam([a[0],a[1]+height*.5,a[2]],[b[0],b[1]+height*.5,b[2]],.045,c);
    this.beam([a[0],a[1]+height,a[2]],[b[0],b[1]+height,b[2]],.055,c);
    const len=new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)),n=Math.max(1,Math.ceil(len/2.5));
    for(let i=0;i<=n;i++){const t=i/n,p=a.map((v,k)=>v+(b[k]-v)*t) as V3;this.beam(p,[p[0],p[1]+height,p[2]],.055,c);}
    return this;
  }
}
function Instances({items,geometry,material=painted,castShadow=true}:{items:Part[];geometry:THREE.BufferGeometry;material?:THREE.Material;castShadow?:boolean}) {
  const ref=useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(()=>{const mesh=ref.current;if(!mesh)return;const matrix=new THREE.Matrix4(),q=new THREE.Quaternion();items.forEach((v,i)=>{matrix.compose(new THREE.Vector3(...v.p),v.q??q,new THREE.Vector3(...v.s));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new THREE.Color(v.c));});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();},[items]);
  return items.length?<instancedMesh ref={ref} args={[geometry,material,items.length]} castShadow={castShadow} receiveShadow/>:null;
}
export function ModelMesh({model,castShadow=true}:{model:Model;castShadow?:boolean}) { return <><Instances items={model.boxes} geometry={unitBox} castShadow={castShadow}/><Instances items={model.cylinders} geometry={unitCylinder} castShadow={castShadow}/></>; }
export function Pick({id,onSelect,children}:{id:string;onSelect:(id:string)=>void;children:ReactNode}) { const ref=useRef<THREE.Group>(null);useEffect(()=>{if(ref.current)entityObjects.set(id,ref.current);return()=>{entityObjects.delete(id);};},[id]);return <group ref={ref} onClick={(e:ThreeEvent<MouseEvent>)=>{e.stopPropagation();onSelect(id);}} onPointerOver={e=>{e.stopPropagation();document.body.style.cursor='pointer';}} onPointerOut={()=>{document.body.style.cursor='';}}>{children}</group>; }
export function Sign({text,p,w=16,h=3,color='#173b4d',background='#e8e9df',rotation=[0,0,0],size=48}:{text:string;p:V3;w?:number;h?:number;color?:string;background?:string;rotation?:V3;size?:number}) {
  const texture=useMemo(()=>{const cv=document.createElement('canvas');cv.width=1024;cv.height=192;const c=cv.getContext('2d')!;c.fillStyle=background;c.fillRect(0,0,1024,192);c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font=`600 ${size}px "Microsoft YaHei",Arial,sans-serif`;c.fillText(text,512,98,980);const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;},[text,color,background,size]);
  useEffect(()=>()=>texture.dispose(),[texture]);return <mesh position={p} rotation={rotation}><planeGeometry args={[w,h]}/><meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide}/></mesh>;
}
export function Label({text,p}:{text:string;p:V3}) { const ref=useRef<THREE.Sprite>(null),point=useMemo(()=>new THREE.Vector3(),[]),{camera,size}=useThree();const texture=useMemo(()=>{const cv=document.createElement('canvas');cv.width=768;cv.height=96;const c=cv.getContext('2d')!;c.fillStyle='#ffffffee';c.fillRect(0,0,768,96);c.fillStyle='#274957';c.font='500 38px "Microsoft YaHei",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,384,48);const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;return t;},[text]);useFrame(()=>{if(ref.current&&camera instanceof THREE.PerspectiveCamera){ref.current.getWorldPosition(point);const w=2*point.distanceTo(camera.position)*Math.tan(camera.fov*Math.PI/360)*220/Math.max(1,size.height);ref.current.scale.set(w,w/8,1);}});useEffect(()=>()=>texture.dispose(),[texture]);return <sprite ref={ref} position={p}><spriteMaterial map={texture} depthTest={false} depthWrite={false} toneMapped={false}/></sprite>; }
