import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cn, vesselStatus, type Equipment, type Vessel } from '../api';
import { entityObjects } from './kit';

function Marker({id,caption,status,kind,selected,onSelect,offset}:{id:string;caption:string;status:string;kind:'crane'|'vessel'|'vehicle';selected:boolean;onSelect:(id:string)=>void;offset:[number,number,number]}) {
  const anchor=useRef<THREE.Group>(null);
  const point=useRef(new THREE.Vector3());
  useFrame(()=>{const target=entityObjects.get(id),group=anchor.current;if(!group)return;group.visible=!!target;if(target){target.getWorldPosition(point.current);group.position.set(point.current.x+offset[0],point.current.y+offset[1],point.current.z+offset[2]);}});
  const severity=['fault','weather_hold'].includes(status)?'warning':status==='working'?'working':'idle';
  return <group ref={anchor} visible={false}><Html center zIndexRange={[12,6]}><button className={`command-marker ${kind} ${severity} ${selected?'selected':''}`} onClick={()=>onSelect(id)} aria-label={`定位 ${caption}，${cn(status)}`}>
    <strong>{id}</strong><span>{caption}</span><small>{kind==='vessel'?status:cn(status)}</small>
  </button></Html></group>;
}

export default function CommandMarkers({equipment,vessels,selected,onSelect,trackedVehicle}:{equipment:Equipment[];vessels:Vessel[];selected:string|null;onSelect:(id:string)=>void;trackedVehicle?:string}) {
  const cranes=equipment.filter(e=>e.id.startsWith('QC-'));
  const ships=vessels.filter(v=>v.navigation?.visible&&v.berth_id&&['berthing','working','waiting_departure'].includes(v.status));
  const vehicles=equipment.filter(e=>e.id.startsWith('AGV-')&&(e.id===trackedVehicle||e.id===selected));
  return <>{cranes.map((e,i)=><Marker key={e.id} id={e.id} caption="岸桥" status={e.status} kind="crane" selected={selected===e.id} onSelect={onSelect} offset={[0,i%2?111:93,-12]}/>)}
    {ships.map(v=><Marker key={v.id} id={v.id} caption={`${v.berth_id} · ${v.name}`} status={vesselStatus(v)} kind="vessel" selected={selected===v.id} onSelect={onSelect} offset={[0,58,0]}/>)}
    {vehicles.map(e=><Marker key={e.id} id={e.id} caption="水平运输" status={e.status} kind="vehicle" selected={selected===e.id} onSelect={onSelect} offset={[0,10,0]}/>)}</>;
}
