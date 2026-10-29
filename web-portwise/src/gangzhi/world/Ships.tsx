import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BoxInstances, shipContainers } from './Containers';
import { Label, Model, ModelMesh, Pick, Sign } from './kit';
import type { V3 } from './layout';

function hullGeometry(length:number,beam:number) {
  const sections=[[-.5,.8],[-.47,.98],[-.35,1],[.2,1],[.33,.95],[.42,.69],[.48,.28],[.5,.015]];
  const profile=[[10,-.44],[7,-.50],[1.4,-.49],[-5,-.42],[-8,-.26],[-8,.26],[-5,.42],[1.4,.49],[7,.50],[10,.44]];
  const p:number[]=[],groups:Array<{start:number;count:number;materialIndex:number}>=[];
  for(let s=0;s<sections.length-1;s++)for(let r=0;r<profile.length-1;r++) {
    const make=(si:number,ri:number)=>[sections[si][0]*length,profile[ri][0],profile[ri][1]*beam*sections[si][1]];
    const a=make(s,r),b=make(s+1,r),c=make(s+1,r+1),d=make(s,r+1),start=p.length/3;
    p.push(...a,...d,...b,...b,...d,...c);groups.push({start,count:6,materialIndex:(profile[r][0]+profile[r+1][0])/2<2?1:0});
  }
  // Close the weather deck; it follows the tapered bow instead of a rectangular slab.
  for(let s=0;s<sections.length-1;s++){const a=[sections[s][0]*length,10,-.44*beam*sections[s][1]],b=[sections[s+1][0]*length,10,-.44*beam*sections[s+1][1]],c=[b[0],10,-b[2]],d=[a[0],10,-a[2]],start=p.length/3;p.push(...a,...b,...d,...b,...c,...d);groups.push({start,count:6,materialIndex:2});}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));for(const group of groups)g.addGroup(group.start,group.count,group.materialIndex);g.computeVertexNormals();return g;
}
const hullMaterials=[new THREE.MeshStandardMaterial({color:'#233644',metalness:.38,roughness:.55,side:THREE.DoubleSide}),new THREE.MeshStandardMaterial({color:'#9f4134',metalness:.25,roughness:.65,side:THREE.DoubleSide}),new THREE.MeshStandardMaterial({color:'#50615b',roughness:.85,side:THREE.DoubleSide})];
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
export function DetailedShip({id,name,type,position,progress,selected,onSelect,clock,atBerth}:{id:string;name:string;type:string;position:V3;progress:number;selected:boolean;onSelect:(id:string)=>void;clock:React.RefObject<number>;atBerth:boolean}) {
  const root=useRef<THREE.Group>(null),length=type==='bulk'?220:type==='tanker'?235:278,beam=type==='bulk'?34:type==='tanker'?38:42;
  const hull=useMemo(()=>hullGeometry(length,beam),[length,beam]),model=useMemo(()=>deckModel(length,beam,type),[length,beam,type]);
  const allBoxes=useMemo(()=>shipContainers(length,beam,Number(id.slice(-1))),[length,beam,id]);
  const boxes=useMemo(()=>allBoxes.slice(0,Math.max(0,Math.floor(allBoxes.length*(1-progress*.0055)))),[allBoxes,Math.floor(progress)]);
  useFrame((_,dt)=>{const g=root.current;if(!g)return;g.position.x=THREE.MathUtils.damp(g.position.x,position[0],1,dt);g.position.z=THREE.MathUtils.damp(g.position.z,position[2],1,dt);g.position.y=Math.sin(clock.current*.2+position[0])*.08;g.rotation.x=Math.sin(clock.current*.11)*.001;});
  return <group ref={root} position={position}><Pick id={id} onSelect={onSelect}><mesh geometry={hull} material={hullMaterials} castShadow receiveShadow/><ModelMesh model={model}/>{type!=='bulk'&&type!=='tanker'&&<BoxInstances boxes={boxes}/>}<mesh position={[length/2-3,-.6,0]} scale={[8,2.3,2.1]}><sphereGeometry args={[1,18,12]}/><meshStandardMaterial color="#9d4034" roughness={.56}/></mesh><Sign text={`${name} · GANGZHI`} p={[length/2-55,5.8,beam*.485]} w={28} h={2.3} color="#e5e6db" background="#233644" size={57}/><Sign text={id} p={[-length/2+28,5.8,beam*.485]} w={12} h={1.9} color="#cdd6d2" background="#233644" size={54}/>{selected&&<Label text={`${name} · ${progress.toFixed(0)}%`} p={[0,49,0]}/>}</Pick>{atBerth&&<Mooring length={length} beam={beam}/>}</group>;
}
function Mooring({length,beam}:{length:number;beam:number}) {const m=useMemo(()=>{const b=new Model();for(const x of [-length*.4,length*.4]){b.beam([x,9,-beam*.42],[x-18,4.8,-28],.09,'#b7b099');b.beam([x+6,9,-beam*.42],[x+20,4.8,-28],.08,'#b7b099');}return b;},[length,beam]);return <ModelMesh model={m} castShadow={false}/>;}
