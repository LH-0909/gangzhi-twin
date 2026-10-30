import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { BoxInstances, shipContainers } from './Containers';
import { Label, Model, ModelMesh, Pick, Sign } from './kit';
import type { V3 } from './layout';
import type { NavigationState } from '../api';
import { navigationPose } from './motion';
import { hullGeometry } from './hull';


function paintedHullTexture(){
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=512;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#263d4b';ctx.fillRect(0,0,2048,512);
  const random=(n:number)=>{const s=Math.sin(n*78.233+18.571)*43758.5453;return s-Math.floor(s);};
  // Weathering is restrained: the visible blue freeboard carries faint plate
  // seams and salt/rust streaks while the red antifouling remains a separate material.
  for(let i=0;i<650;i++){const x=random(i+1)*2048,y=35+random(i+700)*280,w=1+random(i+1400)*3,h=8+random(i+2100)*105;ctx.fillStyle=i%7===0?'#a27959':'#647782';ctx.globalAlpha=.035+random(i+2800)*.11;ctx.fillRect(x,y,w,h);}
  ctx.globalAlpha=1;
  for(let x=0;x<2048;x+=72){ctx.fillStyle='#152a38';ctx.globalAlpha=.32;ctx.fillRect(x,0,2,270);ctx.fillStyle='#81909a';ctx.globalAlpha=.18;ctx.fillRect(x+3,0,1,270);}
  for(const y of [65,132,200,259]){ctx.fillStyle='#142c38';ctx.globalAlpha=.3;ctx.fillRect(0,y,2048,2);ctx.fillStyle='#7e9197';ctx.globalAlpha=.12;ctx.fillRect(0,y+3,2048,1);}
  ctx.globalAlpha=.18;const gradient=ctx.createLinearGradient(0,205,0,300);gradient.addColorStop(0,'#263d4b');gradient.addColorStop(.66,'#82513d');gradient.addColorStop(1,'#263d4b');ctx.fillStyle=gradient;ctx.fillRect(0,205,2048,95);
  ctx.globalAlpha=.8;ctx.fillStyle='#c9d2d1';ctx.font='bold 20px Arial';for(const x of [235,980,1690]){ctx.fillText('10',x,186);ctx.fillText('8',x,208);ctx.fillText('6',x,231);}
  ctx.globalAlpha=1;const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;return map;
}
const hullMaterials=[new THREE.MeshStandardMaterial({map:paintedHullTexture(),metalness:.26,roughness:.72,side:THREE.DoubleSide}),new THREE.MeshStandardMaterial({color:'#9f4134',metalness:.25,roughness:.65,side:THREE.DoubleSide}),new THREE.MeshStandardMaterial({color:'#50615b',roughness:.85,side:THREE.DoubleSide})];
function ContainerShipBody({length,beam,draft,boxes}:{length:number;beam:number;draft:number;boxes:Array<{p:V3;color:string}>}) {
  const {scene}=useGLTF('/assets/harbor/container-ship-loaded.glb');
  const body=useMemo(()=>{const clone=scene.clone(true);clone.traverse(object=>{if(object.name==='Deck containers')object.visible=false;if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;}});return clone;},[scene]);
  const cargo=useMemo(()=>boxes.map(box=>({...box,p:[box.p[0],box.p[1]+2.2,box.p[2]] as V3})),[boxes]);
  return <><group position={[-length/2,-draft,0]} scale={[length/262.2,1,beam/32.7]}><primitive object={body}/></group><BoxInstances boxes={cargo}/></>;
}
useGLTF.preload('/assets/harbor/container-ship-loaded.glb');
function deckModel(length:number,beam:number,type:string) {
  const m=new Model(),sx=-length/2+24,white='#e2e5dd',glass='#1d384a',steel='#a4afb0';
  // Accommodation decks, bridge wings, windows, deck rails and funnel.
  for(let level=0;level<5;level++) {
    const y=12+level*4.25,w=level===4?beam*.9:beam*.64;
    m.box([sx,y,0],[20,3.7,w],white).box([sx,y+1.25,0],[20.16,.85,w+.12],glass).box([sx,y+2.05,0],[21,.25,w+1.2],white);
    m.rail([sx+10.5,y+2.3,-w/2-.6],[sx+10.5,y+2.3,w/2+.6]);
    for(const z of [-1,1])m.rail([sx-10.5,y+2.3,z*(w/2+.6)],[sx+10.5,y+2.3,z*(w/2+.6)]);
  }
  m.box([sx-8,30,0],[7,12,7],'#893b30').box([sx-8,36,0],[7.3,2.5,7.3],'#252d31');
  m.cyl([sx+2,41,0],[.5,10,.5],white).beam([sx+2,44,-5],[sx+2,44,5],.18,white).beam([sx+2,39,0],[sx+7,46,0],.13,white);
  for(const z of [-1,1]) {m.box([sx,14,z*beam*.45],[9,2.1,3.4],'#e9853c');m.beam([sx-4,17,z*beam*.42],[sx-4,14,z*beam*.5],.16,steel);}
  // Walkways run alongside the deck with repeated stanchions.
  for(const z of [-1,1])m.rail([-length/2+2,10.2,z*beam*.44],[length/2-25,10.2,z*beam*.44],white);
  // Freeboard plate seams, draft ticks, and deck equipment remain 3D from
  // close camera angles rather than becoming a flat overlay.
  for(const side of [-1,1]){
    const z=side*beam*.495;
    for(let x=-length*.32;x<length*.27;x+=12)m.box([x,4.2,z],[.12,7.5,.13],'#56636a');
    for(let x=-length*.33;x<length*.27;x+=36){m.box([x,7.7,z],[3,.15,.14],'#d2d8cf');m.box([x,1.1,z],[2.4,.12,.14],'#c4d0c7');}
    for(const x of [-length*.37,-length*.11,length*.17]){
      m.cyl([x,11.4,side*beam*.34],[1.2,2.7,1.2],'#596a72');
      m.cyl([x,12.9,side*beam*.34],[1.7,.35,1.7],'#d6d9ca');
    }
  }
  m.box([length/2-20,10.3,0],[23,.2,beam*.5],'#65846c');
  m.cyl([length/2-15,11,0],[2,1.8,2],steel).cyl([length/2-20,11,5],[1.7,1.4,1.7],steel).cyl([length/2-20,11,-5],[1.7,1.4,1.7],steel);
  m.cyl([length/2-15,17,0],[.4,13,.4],white).beam([length/2-15,22,-3],[length/2-15,22,3],.12,white);
  if(type==='bulk') {
    for(let i=0;i<5;i++){const x=-length/2+53+i*(length-80)/5;m.box([x,11,0],[(length-90)/5,2.1,beam*.73],'#736c5c').box([x,12.15,0],[(length-90)/5-.5,.18,beam*.69],'#9a5d4d');if(i<4){m.cyl([x+15,18,0],[1.6,14,1.6],'#b79c5d').beam([x+15,23,0],[x+1,27,9],1.1,'#c0aa72').beam([x+1,27,9],[x+1,15,9],.09,'#323c42');}}
  } else if(type==='tanker') {
    m.box([18,10.5,0],[length-80,.2,beam*.82],'#61806a');
    for(let i=0;i<8;i++){const x=-length/2+49+i*(length-76)/8;for(const z of [-9,9])m.cyl([x,11.5,z],[3,2,3],'#c1c6bb');m.box([x,13,0],[2,.3,beam*.7],'#afb5a9');}
    for(const z of [-1.7,-.6,.6,1.7])m.beam([-length/2+38,12,z],[length/2-29,12,z],.35,'#c4c5ae');
    m.rail([-length/2+37,13,-3],[length/2-30,13,-3]);m.box([20,13.2,0],[length-90,.18,4],'#a1a79a');
  } else {
    for(let i=0;i<Math.floor((length-70)/13);i++)m.box([-length/2+43+i*13,10.2,0],[.3,.5,beam*.88],'#b0b5a8');
  }
  return m;
}
export function DetailedShip({id,name,type,position,progress,selected,onSelect,clock,atBerth,navigation,draft}:{id:string;name:string;type:string;position:V3;progress:number;selected:boolean;onSelect:(id:string)=>void;clock:React.RefObject<number>;atBerth:boolean;navigation?:NavigationState;draft:number}) {
  const root=useRef<THREE.Group>(null),length=navigation?.length_m??(type==='bulk'?220:type==='tanker'?235:278),beam=navigation?.beam_m??(type==='bulk'?34:type==='tanker'?38:42);
  const hull=useMemo(()=>hullGeometry(length,beam,draft),[length,beam,draft]),model=useMemo(()=>deckModel(length,beam,type),[length,beam,type]);
  const allBoxes=useMemo(()=>shipContainers(length,beam,Number(id.slice(-1))),[length,beam,id]);
  const boxes=useMemo(()=>allBoxes.slice(0,Math.max(0,Math.floor(allBoxes.length*(1-progress*.0055)))),[allBoxes,Math.floor(progress)]);
  useFrame(()=>{const g=root.current;if(!g)return;if(navigation){const pose=navigationPose(navigation,clock.current);g.position.set(...pose.p);g.rotation.y=pose.heading;}else{g.position.x=position[0];g.position.z=position[2];}g.position.y=Math.sin(clock.current*.2+position[0])*.08;g.rotation.x=Math.sin(clock.current*.11)*.001;});
  const containerShip=type!=='bulk'&&type!=='tanker';
  const original=<><mesh geometry={hull} material={hullMaterials} castShadow receiveShadow/><ModelMesh model={model}/>{containerShip&&<BoxInstances boxes={boxes}/>}</>;
  return <group ref={root} position={position}><Pick id={id} onSelect={onSelect}>{containerShip?<Suspense fallback={original}><ContainerShipBody length={length} beam={beam} draft={draft} boxes={boxes}/></Suspense>:original}{!containerShip&&<mesh position={[length/2-3,-.6,0]} scale={[8,2.3,2.1]}><sphereGeometry args={[1,18,12]}/><meshStandardMaterial color="#9d4034" roughness={.56}/></mesh>}<Sign text={`${name} · GANGZHI`} p={[length/2-55,5.8,beam*.485]} w={28} h={2.3} color="#e5e6db" background="#233644" size={57}/><Sign text={id} p={[-length/2+28,5.8,beam*.485]} w={12} h={1.9} color="#cdd6d2" background="#233644" size={54}/>{selected&&<Label text={`${name} · ${progress.toFixed(0)}%`} p={[0,49,0]}/>}</Pick>{atBerth&&<Mooring length={length} beam={beam}/>}</group>;
}
function Mooring({length,beam}:{length:number;beam:number}) {const m=useMemo(()=>{const b=new Model();for(const x of [-length*.4,length*.4]){b.beam([x,9,-beam*.42],[x-18,4.8,-28],.09,'#b7b099');b.beam([x+6,9,-beam*.42],[x+20,4.8,-28],.08,'#b7b099');}return b;},[length,beam]);return <ModelMesh model={m} castShadow={false}/>;}
