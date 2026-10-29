/** STS structure and hoist stages extend Portwise's beam + staged trolley pattern (MIT). */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { containerGeometry, containerMaterial } from './Containers';
import { Label, Model, ModelMesh, Pick } from './kit';
import { QUAY_Y, YARD_BLOCKS, type V3 } from './layout';
import type { CargoFlow, Vessel } from '../api';
import { cargoMotion } from './motion';

function stsModel() {
  const m=new Model(),steel='#4b7895',light='#a9c6d1',dark='#284b60',rail='#e1e6de',safety='#d8a34b';
  for(const x of [-13,13])for(const z of [-31,0]) {
    m.box([x,1.9,z],[8.8,2.4,2.8],dark).beam([x,3,z],[x*.7,43,z],1.35,steel);
    for(let i=0;i<4;i++)m.cyl([x-3+i*2,.85,z],[1.7,1.4,1.7],'#30383c',[Math.PI/2,0,0]);
    m.box([x,6,z],[3,2,3.1],light);
    for(let y=9;y<37;y+=9)m.box([x*.84,y,z],[2.8,.25,2.6],safety);
  }
  for(const x of [-13,13]) {
    m.beam([x,7,-31],[x*.7,38,0],.48,steel).beam([x,7,0],[x*.7,38,-31],.48,steel);
    m.beam([x*.7,42,-35],[x*.7,42,5],1.4,steel);
  }
  for(const z of [-31,0])m.beam([-13,24,z],[13,24,z],.95,steel).beam([-13,25,z],[13,37,z],.35,light).beam([13,25,z],[-13,37,z],.35,light);
  // Twin truss booms with a maintenance catwalk and repeating diagonal web members.
  for(const x of [-3.5,3.5]) {
    m.beam([x,45,-65],[x,45,80],.6,steel).beam([x,49,-65],[x,49,80],.6,steel);
    for(let z=-65;z<80;z+=6){m.beam([x,45,z],[x,49,z],.28,light).beam([x,45,z],[x,49,Math.min(80,z+6)],.22,light);}
  }
  for(let z=-65;z<80;z+=6)m.beam([-3.5,45,z],[3.5,45,z],.24,light);
  m.box([5,45,-2],[1.4,.15,141],dark).rail([5.7,45,-65],[5.7,45,80],rail);
  for(const z of [-59,-31,0,34,70]){
    m.box([0,44.8,z],[8,.22,1.1],safety);
    m.beam([-3.5,44.6,z],[3.5,44.6,z],.12,rail);
  }
  for(const x of [-4,4]) {
    m.beam([x,49,-20],[x,87,-12],.85,steel).beam([x,87,-12],[x,49,2],.64,steel);
    m.beam([x,87,-12],[x,49,75],.13,'#bac3bf').beam([x,87,-12],[x,49,-61],.15,'#bac3bf');
  }
  m.beam([-4,87,-12],[4,87,-12],.6,steel).box([0,50,-45],[12,8,18],'#d8ded7');
  for(let z=-52;z<=-39;z+=2)m.box([6.05,50,z],[.12,4,.7],'#6f858d');
  m.box([0,54.4,-45],[12.5,.5,18.5],'#b4bdb8');
  // Cable reels, service ladders and a framed control cab give close-up views
  // recognizable machinery instead of a single silhouette.
  for(const x of [-6.3,6.3])m.cyl([x,51,-45],[6.6,1.4,6.6],dark,[0,0,Math.PI/2]);
  m.box([-7.4,50,-45],[.35,3.8,15],light);
  for(let z=-50;z<=-39;z+=1.6)m.box([-7.7,50,z],[.8,.12,.12],rail);
  m.box([0,49,-45],[11.6,5,17.5],'#c8d6d9');
  for(const z of [-52,-48,-44,-40])m.box([0,49.3,z],[11.8,2.4,.12],'#31596b');
  // Access stair tower and cable reel.
  for(let i=0;i<12;i++){const y=4+i*3.3;m.box([-12,y,-31],[3,.18,7.4],'#8e9fa0').beam([-13,y,-34],[-13,y+3.3,-27],.16,rail).beam([-11,y,-34],[-11,y+3.3,-27],.16,rail);}
  m.rail([-15,43,-35],[-15,43,5],rail).box([-13,43,-15],[4,.2,42],dark);
  m.box([0,88,-12],[1.5,1.1,1.5],'#da664b');
  m.beam([0,88.7,-12],[0,94,-12],.12,rail).box([0,94,-12],[1.8,.8,1.8],'#e5794b');
  return m;
}
const structure=stsModel();
function alertModel(tint:string){const m=new Model();const recolor=(c:string)=>c==='#4b7895'||c==='#284b60'?tint:c;m.boxes=structure.boxes.map(p=>({...p,c:recolor(p.c)}));m.cylinders=structure.cylinders.map(p=>({...p,c:recolor(p.c)}));return m;}
const faultStructure=alertModel('#bf514d'),weatherStructure=alertModel('#c38a3d');
const trolleyModel=(()=>{const m=new Model();m.box([0,0,0],[12,1.5,5],'#3c4b52').box([-7,-2,0],[2.8,3.4,3.6],'#e1e4db').box([-7,-1.7,1.84],[2.3,1.6,.1],'#284a5d');return m;})();
const spreaderModel=(()=>{const m=new Model();m.box([0,0,0],[12.5,.65,2.8],'#dbad54');for(const x of [-5.8,5.8])m.box([x,-.5,0],[.45,.9,2.6],'#494b42');return m;})();
const bulkGrab=(()=>{const m=new Model();m.box([0,-1.5,0],[5,2.2,3.8],'#a4946b').box([0,-2.9,0],[4.4,.8,3.4],'#736d56');for(const x of [-2,2])m.beam([x,-.3,0],[x*.6,-2.5,0],.25,'#555c57');return m;})();
export function STSCrane({id,x,index,onSelect,selected,clock,active,held,fault,showLabel,flow,syncedAt=0,bulk=false,work}:{id:string;x:number;index:number;onSelect:(id:string)=>void;selected:boolean;clock:React.RefObject<number>;active:boolean;held:boolean;fault:boolean;showLabel:boolean;flow?:CargoFlow;syncedAt?:number;bulk?:boolean;work?:Vessel}) {
  const trolley=useRef<THREE.Group>(null),spreader=useRef<THREE.Group>(null),carried=useRef<THREE.Mesh>(null),cables=useRef<THREE.Group>(null);
  useFrame(()=>{const workClock=work?(work.work_seconds??0)+Math.max(0,clock.current-syncedAt)*(work.work_rate??0):clock.current;const t=(workClock*.18+index*13)%72;const ease=(n:number)=>{const a=Math.max(0,Math.min(1,n));return a*a*(3-2*a);};let z=35,y=39,carrying=false;
    if(active&&!held){if(t<12)y=THREE.MathUtils.lerp(39,20,ease(t/12));else if(t<26){y=THREE.MathUtils.lerp(20,39,ease((t-12)/14));carrying=true;}else if(t<42){z=THREE.MathUtils.lerp(35,-23,ease((t-26)/16));carrying=true;}else if(t<55){z=-23;y=THREE.MathUtils.lerp(39,6,ease((t-42)/13));carrying=true;}else if(t<64){z=-23;y=THREE.MathUtils.lerp(6,39,ease((t-55)/9));}else z=THREE.MathUtils.lerp(-23,35,ease((t-64)/8));}
    if(flow&&(flow.phase==='queued'||flow.phase==='quay_lift')){const pose=cargoMotion(flow,clock.current,syncedAt);z=flow.phase==='quay_lift'?pose.trolley:-23;y=flow.phase==='quay_lift'?pose.hoist:39;carrying=false;}
    if(trolley.current)trolley.current.position.z=z;if(spreader.current)spreader.current.position.set(0,y,z);if(carried.current)carried.current.visible=carrying&&!bulk;
    if(cables.current){cables.current.position.set(0,(44+y)/2,z);cables.current.scale.y=Math.max(.1,44-y);}
  });
  return <group position={[x,QUAY_Y,-12]}><Pick id={id} onSelect={onSelect}><ModelMesh model={fault?faultStructure:held?weatherStructure:structure}/><group ref={trolley} position={[0,44,35]}><ModelMesh model={trolleyModel}/></group><group ref={cables}>{[-4.5,4.5].map(xx=>[-.9,.9].map(zz=><mesh key={`${xx}-${zz}`} position={[xx,0,zz]}><boxGeometry args={[.055,1,.055]}/><meshStandardMaterial color="#404b50"/></mesh>))}</group><group ref={spreader}><ModelMesh model={spreaderModel}/>{bulk&&<ModelMesh model={bulkGrab}/>}<mesh ref={carried} geometry={containerGeometry} material={containerMaterial} position={[0,-1.9,0]} castShadow/></group>{held&&<mesh position={[0,95,-12]}><sphereGeometry args={[1.7,12,8]}/><meshStandardMaterial color={fault?'#ee5c4d':'#e5a445'} emissive={fault?'#df301c':'#a96b12'} emissiveIntensity={2.5}/></mesh>}{(selected||showLabel||held)&&<Label text={`${id} · ${fault?'设备故障':held?'天气停工':active?(bulk?'散货卸船':'岸桥作业'):'空闲待命'}`} p={[0,99,-10]}/>}</Pick></group>;
}
function rtgModel() {const m=new Model(),c='#bda150',d='#555b58';for(const x of [-5,5])for(const z of [-15,15]){m.box([x,1,z],[4,1.5,2],d).beam([x,2,z],[x,19,z],.65,c);for(const xx of [-1,1])m.cyl([x+xx,.6,z],[1.1,.8,1.1],'#2c3232',[Math.PI/2,0,0]);}for(const x of [-5,5])m.beam([x,19,-17],[x,19,17],1,c);m.beam([-5,18,-15],[5,18,-15],.6,c).beam([-5,18,15],[5,18,15],.6,c).box([0,18,0],[6,1.2,4],d).box([6,16,0],[2,2,2],'#d8d8c6');m.beam([-4,3,-15],[-4,15,15],.2,c);return m;}
const rtg=rtgModel();
export function FlowYardCrane({flow,clock,syncedAt}:{flow:CargoFlow;clock:React.RefObject<number>;syncedAt:number}) {const head=useRef<THREE.Group>(null),lines=useRef<THREE.Group>(null);useFrame(()=>{const pose=cargoMotion(flow,clock.current,syncedAt),lifting=flow.phase==='yard_lift'||flow.phase==='yard_pickup';const z=lifting?pose.box[2]+280:0,y=lifting?pose.box[1]+1.9-QUAY_Y:18;if(head.current)head.current.position.set(0,y,z);if(lines.current){lines.current.position.set(0,(19+y)/2,z);lines.current.scale.y=Math.max(.1,19-y);}});return <group position={[85.6,QUAY_Y,-280]}><ModelMesh model={rtg}/><group ref={head}><ModelMesh model={spreaderModel}/></group><group ref={lines}>{[-4.5,4.5].map(x=>[-.8,.8].map(z=><mesh key={`${x}/${z}`} position={[x,0,z]}><boxGeometry args={[.05,1,.05]}/><meshStandardMaterial color="#4c5757"/></mesh>))}</group></group>;}
export function YardGantries(){return <>{YARD_BLOCKS.filter((_,i)=>i%2===0).map((b,i)=><group key={b.id} position={[b.x+(i%3-1)*30,QUAY_Y,b.z]}><ModelMesh model={rtg}/></group>)}</>;}
