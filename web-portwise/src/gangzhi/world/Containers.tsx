import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import { Edges, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { BOX_COLORS, BOX_SIZE, findYardBox, YARD_BOXES, type V3, type YardBox } from './layout';
import { Model, ModelMesh, Sign } from './kit';

// Corrugations are geometry, so grazing light and silhouettes have actual depth.
export const containerGeometry=(()=>{
  const positions:number[]=[],uvs:number[]=[],L=BOX_SIZE[0]/2,H=BOX_SIZE[1]/2,W=BOX_SIZE[2]/2;
  const quad=(a:number[],b:number[],c:number[],d:number[])=>{const end=a[0]===b[0]&&b[0]===c[0],top=a[1]===b[1]&&b[1]===c[1];for(const p of [a,b,d,b,c,d]){positions.push(...p);uvs.push(end?(p[2]+W)/(W*2):(p[0]+L)/(L*2),top?(p[2]+W)/(W*2):(p[1]+H)/(H*2));}};
  for(const side of [-1,1])for(let i=0;i<48;i++){
    const x0=-L+i*BOX_SIZE[0]/48,x1=-L+(i+1)*BOX_SIZE[0]/48,z0=side*(W+.045*Math.cos(i*Math.PI)),z1=side*(W+.045*Math.cos((i+1)*Math.PI));
    const a=[x0,-H,z0],b=[x1,-H,z1],c=[x1,H,z1],d=[x0,H,z0];
    if(side>0)quad(a,b,c,d);else quad(d,c,b,a);
  }
  for(let i=0;i<48;i++){const x0=-L+i*BOX_SIZE[0]/48,x1=-L+(i+1)*BOX_SIZE[0]/48,y0=H+.025*Math.cos(i*Math.PI),y1=H+.025*Math.cos((i+1)*Math.PI);quad([x0,y0,-W],[x0,y0,W],[x1,y1,W],[x1,y1,-W]);}
  quad([-L,-H,W],[-L,-H,-W],[L,-H,-W],[L,-H,W]);
  quad([L,-H,W],[L,-H,-W],[L,H,-W],[L,H,W]);
  quad([-L,-H,-W],[-L,-H,W],[-L,H,W],[-L,H,-W]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeVertexNormals();return g;
})();
export const containerMaterial=new THREE.MeshStandardMaterial({color:'#fff',roughness:.78,metalness:.22});
export function ContainerSurface(){const maps=useTexture(['/assets/harbor/concrete_floor_rough.jpg','/assets/harbor/concrete_floor_nor_gl.jpg']);useEffect(()=>{containerMaterial.roughnessMap=maps[0];containerMaterial.normalMap=maps[1];containerMaterial.normalScale.set(.075,.075);containerMaterial.roughness=.98;containerMaterial.needsUpdate=true;},[maps[0],maps[1]]);return null;}
const brandMaterial=(()=>{const cv=document.createElement('canvas');cv.width=1024;cv.height=160;const c=cv.getContext('2d')!;c.clearRect(0,0,1024,160);c.fillStyle='#e9e7d9';c.font='bold 65px Arial,sans-serif';c.textAlign='center';c.fillText('LIAOHAI',512,78);c.font='22px Arial,sans-serif';c.fillText('INTERMODAL  /  40 HIGH CUBE',512,124);const map=new THREE.CanvasTexture(cv);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return new THREE.MeshStandardMaterial({map,transparent:true,alphaTest:.25,side:THREE.DoubleSide,roughness:.85});})();
const labelGeometry=new THREE.PlaneGeometry(7.4,1.15);
const simpleContainerGeometry=new THREE.BoxGeometry(...BOX_SIZE);
function Brands({boxes}:{boxes:Array<{p:V3}>}) {
  const ref=useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(()=>{const m=ref.current;if(!m)return;const matrix=new THREE.Matrix4(),q=new THREE.Quaternion();boxes.forEach((b,i)=>{for(let side=0;side<2;side++){matrix.compose(new THREE.Vector3(b.p[0],b.p[1]+.15,b.p[2]+(side===0?1.284:-1.284)),q.setFromAxisAngle(new THREE.Vector3(0,1,0),side*Math.PI),new THREE.Vector3(1,1,1));m.setMatrixAt(i*2+side,matrix);}});m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();},[boxes]);
  return <instancedMesh ref={ref} args={[labelGeometry,brandMaterial,boxes.length*2]} raycast={()=>null}/>;
}
export function BoxInstances({boxes,onSelect,maxTier=5,simple=false}:{boxes:Array<{p:V3;color:string;id?:string;tier?:number}>;onSelect?:(id:string)=>void;maxTier?:number;simple?:boolean}) {
  const ref=useRef<THREE.InstancedMesh>(null);
  const visible=useMemo(()=>boxes.filter(b=>(b.tier??1)<=maxTier),[boxes,maxTier]);
  useLayoutEffect(()=>{const m=ref.current;if(!m)return;const matrix=new THREE.Matrix4();visible.forEach((b,i)=>{matrix.makeTranslation(...b.p);m.setMatrixAt(i,matrix);m.setColorAt(i,new THREE.Color(b.color));});m.count=visible.length;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();},[visible,simple]);
  const pick=(e:ThreeEvent<MouseEvent>)=>{if(e.instanceId===undefined||!onSelect)return;const box=visible[e.instanceId];if(box?.id){e.stopPropagation();onSelect(box.id);}};
  return <><instancedMesh ref={ref} args={[simple?simpleContainerGeometry:containerGeometry,containerMaterial,boxes.length]} castShadow receiveShadow onClick={pick} onPointerOver={onSelect?e=>{e.stopPropagation();document.body.style.cursor='pointer';}:undefined} onPointerOut={()=>{document.body.style.cursor='';}}/><Brands boxes={visible}/></>;
}
function Detail({box}:{box:YardBox}) {
  const model=useMemo(()=>{const m=new Model(),x=BOX_SIZE[0]/2+.04;for(const z of [-.59,.59]){m.box([x,0,z],[.06,2.68,1.12],box.color);for(const zz of [z-.36,z+.36]){m.cyl([x+.08,0,zz],[.07,2.61,.07],'#b2b9b8');for(const yy of [-.9,.9])m.box([x+.14,yy,zz],[.13,.15,.2],'#afb6b4');}}for(const y of [-1.32,1.32])for(const z of [-1.12,1.12])m.box([x+.04,y,z],[.25,.23,.23],'#a5afa8');return m;},[box]);
  return <group position={box.p}><mesh geometry={containerGeometry} scale={[1.015,1.025,1.04]}><meshBasicMaterial color="#f7b64d" transparent opacity={.07}/><Edges color="#ffb23d" threshold={25}/></mesh><ModelMesh model={model}/><Sign text={box.id} p={[1,.65,1.276]} w={6.7} h={.67} color="#f1eedd" background={box.color} size={60}/><Sign text="GANGZHI • INTERMODAL" p={[-1,-.1,1.276]} w={7.8} h={.6} color="#f1eedd" background={box.color} size={43}/></group>;
}
export function YardContainers({onSelect,selected,maxTier,inspectColumn=false,simple=false}:{onSelect:(id:string)=>void;selected:string|null;maxTier:number;inspectColumn?:boolean;simple?:boolean}) {const box=findYardBox(selected);const boxes=useMemo(()=>inspectColumn&&box?YARD_BOXES.filter(b=>b.block===box.block&&b.bay===box.bay&&b.row===box.row):YARD_BOXES,[inspectColumn,box]);return <><ContainerSurface/><BoxInstances boxes={boxes} onSelect={onSelect} maxTier={maxTier} simple={simple}/>{box&&box.tier<=maxTier&&<Detail box={box}/>}</>;}
export function shipContainers(length:number,beam:number,seed:number) {
  const out:Array<{p:V3;color:string}>=[],bays=Math.floor((length-58)/12.7),rows=Math.min(12,Math.floor((beam-3)/2.55));
  for(let bay=0;bay<bays;bay++)for(let row=0;row<rows;row++){const tiers=bay===bays-1?3:4+(bay+row+seed)%3;for(let tier=0;tier<tiers;tier++)out.push({p:[-length/2+45+bay*12.7,9.6+BOX_SIZE[1]/2+tier*2.97,(row-(rows-1)/2)*2.55],color:BOX_COLORS[(bay*3+row+seed+tier*3)%BOX_COLORS.length]});}
  return out;
}
