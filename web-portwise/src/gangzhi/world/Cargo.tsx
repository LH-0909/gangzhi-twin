import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { CargoFlow } from '../api';
import { containerGeometry } from './Containers';
import { cargoMotion } from './motion';
import { Label, Model, ModelMesh, Pick, Sign } from './kit';
import { QUAY_Y } from './layout';

export function TrackedCargo({flow,clock,syncedAt,onSelect,selected,showRoute,hidden=false}:{flow:CargoFlow;clock:React.RefObject<number>;syncedAt:number;onSelect:(id:string)=>void;selected:boolean;showRoute:boolean;hidden?:boolean}) {
  const root=useRef<THREE.Group>(null);
  const material=useMemo(()=>new THREE.MeshStandardMaterial({color:'#ab5d3d',roughness:.82,metalness:.2}),[]);
  useFrame(()=>{if(root.current){const pose=cargoMotion(flow,clock.current,syncedAt);root.current.position.set(...pose.box);root.current.rotation.y=pose.rotation;root.current.visible=pose.visible&&!hidden;}});
  return <><group ref={root}><Pick id={flow.box_id} onSelect={onSelect}><mesh geometry={containerGeometry} material={material} castShadow receiveShadow/><Sign text={flow.box_id} p={[0,.45,1.278]} w={8} h={.75} color="#ede6d7" background="#ab5d3d" size={70}/><Sign text="GANGZHI · TRACKED CARGO" p={[0,-.45,1.278]} w={8} h={.45} color="#eadac3" background="#ab5d3d" size={45}/>{selected&&<Label text={`${flow.box_id} · ${flow.phase_name}`} p={[0,4,0]}/>}</Pick></group>{showRoute&&flow.route.length>1&&<Line points={flow.route.map(p=>[p[0],p[1]+.2,p[2]] as [number,number,number])} color="#dfae54" lineWidth={3} dashed dashSize={5} gapSize={3}/>}</>;
}
const gate=(()=>{const m=new Model();for(const z of [-81,-63])m.box([0,5,z],[1.5,10,1.5],'#9bafb1');m.box([0,10,-72],[2,2,21],'#e1e5da').box([-8,2,-85],[5,4,5],'#d0d9d4').beam([-3,2,-80],[-3,2,-65],.25,'#caa05d');m.box([7,.2,-72],[1,.4,15],'#efe7c6');return m;})();
export function PortGate(){return <group position={[625,QUAY_Y,0]}><ModelMesh model={gate}/><Sign text="港智孪生 · 出场核验" p={[-1.1,10,-72]} rotation={[0,-Math.PI/2,0]} w={16} h={1.5} background="#e1e5da" color="#55757e" size={55}/></group>;}
