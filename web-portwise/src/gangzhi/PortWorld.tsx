/** Metre-scale harbour renderer. Portwise MIT scene patterns + original detailed construction. */
import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { HarbourAtmosphere, Ocean, PortTerrain } from './world/Environment';
import { STSCrane, YardGantries, FlowYardCrane } from './world/Cranes';
import { IndustrialFlows } from './world/Industrial';
import { TrackedCargo, PortGate } from './world/Cargo';
import type { CargoFlow, ColdChain, Equipment, Vessel } from './api';
import { DetailedShip } from './world/Ships';
import { YardContainers } from './world/Containers';
import { AGV, Breakwaters, Railway, TrafficOverlay } from './world/Infrastructure';
import { entityObjects } from './world/kit';
import { BERTH_X, findYardBox, YARD_BLOCKS, type V3 } from './world/layout';

export interface PortWorldProps {
  resetKey?: number; scenario: string; running: boolean; speed: number; simTime: number;
  selected: string | null; onSelect: (id: string) => void;
  layer: 'all' | 'equipment' | 'routes' | 'energy';
  autoLight?:boolean; view: 'immersive' | 'overview' | 'berth' | 'yard' | 'sea'; night: boolean;
  inspectColumn?: boolean; maxTier?: number; yardBlock?: string; cruise?: boolean; quality?: 'standard'|'high';
  onCruiseStop?:()=>void; onTourShot?:(name:string)=>void;
  vessels?: Vessel[]; cargoFlow?: CargoFlow; coldStatus?:ColdChain;
  equipment?: Equipment[];
}
const cranePositions=[-500,-397,-205,-101,100,205];
const tourShots:{name:string;p:V3;t:V3}[]=[
  {name:'海湾全景',p:[700,420,760],t:[0,20,-300]},
  {name:'船岸靠泊',p:[-285,84,220],t:[-235,22,10]},
  {name:'岸桥作业',p:[-30,100,130],t:[-100,38,-13]},
  {name:'堆场与海铁',p:[195,285,135],t:[-40,5,-385]},
  {name:'冷链与能源',p:[900,160,-180],t:[550,16,-520]},
];
function Camera({props}:{props:PortWorldProps}) {
  const {camera,size}=useThree(),controls=useRef<any>(null),transition=useRef(true);
  const follow=useRef(false);
  const tourStart=useRef(0),tourShot=useRef(-1);
  const eye=useRef(new THREE.Vector3(-40,160,300)),target=useRef(new THREE.Vector3(-275,22,-190));
  useEffect(()=>{if(props.cruise){tourStart.current=performance.now();tourShot.current=-1;follow.current=false;transition.current=true;}},[props.cruise]);
  useEffect(()=>{
    const views:Record<string,{p:V3;t:V3}>={immersive:{p:[-40,160,300],t:[-275,22,-190]},overview:{p:[700,420,760],t:[0,20,-300]},berth:{p:[100,92,250],t:[-260,19,-30]},yard:{p:[120,265,-40],t:[0,5,-300]},sea:{p:[-750,95,620],t:[-90,25,-120]}};
    let item=views[props.view];follow.current=!!props.selected?.startsWith('AGV-')||!!props.selected?.startsWith('V')||props.selected===props.cargoFlow?.box_id;
    const box=findYardBox(props.selected);
    if(box)item={p:[box.p[0]+23,box.p[1]+15,box.p[2]+26],t:[box.p[0],box.p[1]+.4,box.p[2]]};
    else if(props.selected?.startsWith('QC-')){const x=cranePositions[Number(props.selected.slice(-2))-1]??0;item={p:[x+140,90,170],t:[x,36,0]};}
    else if(props.selected?.startsWith('V')){const vessel=props.vessels?.find(v=>v.id===props.selected);if(vessel?.berth_id){const x=BERTH_X[vessel.berth_id]??0;item={p:[x+210,92,210],t:[x,18,0]};}}
    else if(props.selected==='SP-01'||props.selected==='ZONE-ENERGY'||props.selected==='ZONE-LIQUID')item={p:[680,95,-470],t:[540,15,-620]};
    else if(props.selected==='RF-01'||props.selected==='ZONE-COLD')item={p:[660,80,-350],t:[550,12,-480]};
    else if(props.selected==='ZONE-CHANNEL')item={p:[-750,220,900],t:[0,5,520]};
    else if(props.selected==='ZONE-BULK')item={p:[-410,100,-440],t:[-550,25,-620]};
    else if(props.view==='yard'){const block=YARD_BLOCKS.find(b=>b.id===props.yardBlock);if(block)item={p:[block.x+130,140,block.z+135],t:[block.x,7,block.z]};}
    const aspect=size.width/Math.max(size.height,1),extra=aspect<1.3?1.3/aspect:1;
    target.current.set(...item.t);eye.current.set(...item.p).sub(target.current).multiplyScalar(extra).add(target.current);transition.current=true;
  },[props.view,props.resetKey,props.selected,props.yardBlock,props.cargoFlow?.id,size.width,size.height]);
  useFrame((_,dt)=>{
    if(props.cruise){
      const elapsed=((performance.now()-tourStart.current)/1000)%(tourShots.length*17),idx=Math.floor(elapsed/17),next=(idx+1)%tourShots.length;
      const section=elapsed%17,raw=THREE.MathUtils.clamp((section-5)/12,0,1),blend=raw*raw*(3-2*raw);
      eye.current.set(...tourShots[idx].p).lerp(new THREE.Vector3(...tourShots[next].p),blend);
      target.current.set(...tourShots[idx].t).lerp(new THREE.Vector3(...tourShots[next].t),blend);
      if(idx!==tourShot.current){tourShot.current=idx;props.onTourShot?.(tourShots[idx].name);}
      transition.current=true;
    }else if(follow.current&&props.selected){const entity=entityObjects.get(props.selected);if(entity){entity.getWorldPosition(target.current);target.current.y+=2;eye.current.copy(target.current).add(props.selected.startsWith('V')?new THREE.Vector3(210,100,210):new THREE.Vector3(38,29,46));transition.current=true;}}
    if(!transition.current||!controls.current)return;
    const alpha=1-Math.exp(-dt*(props.cruise?2:4));camera.position.lerp(eye.current,alpha);controls.current.target.lerp(target.current,alpha);controls.current.update();
    if(!props.cruise&&camera.position.distanceTo(eye.current)<.2)transition.current=false;
  });
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.075} minDistance={10} maxDistance={4500} minPolarAngle={.06} maxPolarAngle={Math.PI*.485} onStart={()=>{transition.current=false;follow.current=false;props.onCruiseStop?.();}}/>;
}
function World(props:PortWorldProps) {
  const clock=useRef(props.simTime),sync=useRef({time:props.simTime,running:props.running,speed:props.speed,received:performance.now()});
  useEffect(()=>{const old=sync.current;sync.current={time:props.simTime,running:props.running,speed:props.speed,received:performance.now()};if(!props.running||props.simTime<old.time||Math.abs(props.simTime-clock.current)>Math.max(120,props.speed*4))clock.current=props.simTime;},[props.simTime,props.running,props.speed]);
  useFrame((_,dt)=>{const s=sync.current;if(s.running){const extrapolation=Math.min(2.25,(performance.now()-s.received)/1000);clock.current=THREE.MathUtils.damp(clock.current,s.time+extrapolation*s.speed,8,dt);}});
  const devices=props.equipment??[],vessels=props.vessels??[];
  return <><HarbourAtmosphere clock={clock} autoLight={props.autoLight??true} night={props.night} scenario={props.scenario}/><Ocean autoLight={props.autoLight??true} clock={clock} night={props.night} storm={props.scenario==='wind'} quality={props.quality??'high'}/><PortTerrain onSelect={props.onSelect} coldStatus={props.coldStatus}/><YardContainers simple={props.quality==='standard'} onSelect={props.onSelect} selected={props.selected} maxTier={props.maxTier??5} inspectColumn={props.inspectColumn}/><YardGantries/><IndustrialFlows vessels={vessels} clock={clock} syncedAt={props.simTime}/>
  {vessels.filter(v=>v.navigation?v.navigation.visible:v.status!=='departed'&&v.arrived!==false).map(v=>{const position=v.navigation?.position??[BERTH_X[v.berth_id??'']??0,0,28] as V3;return <DetailedShip key={v.id} id={v.id} name={v.name} type={v.type} draft={v.draft} position={position} navigation={v.navigation} progress={v.progress} selected={v.id===props.selected} onSelect={props.onSelect} clock={clock} atBerth={v.navigation?.phase==='working'||v.navigation?.phase==='waiting_departure'}/>;})}
  {props.layer==='routes'&&vessels.filter(v=>v.navigation?.visible&&['inbound','approaching','outbound'].includes(v.navigation.phase)).map(v=><Line key={v.id} points={v.navigation!.path.map(p=>[p[0],.3,p[2]] as V3)} color="#67c6d6" lineWidth={2} dashed dashSize={14} gapSize={8}/>)}
  {cranePositions.map((x,i)=>{const id=`QC-${String(i+1).padStart(2,'0')}`,device=devices.find(d=>d.id===id);return <STSCrane key={id} id={id} x={x} index={i} onSelect={props.onSelect} selected={props.selected===id} clock={clock} active={device?.status==='working'} held={['fault','weather_hold'].includes(device?.status??'')} fault={device?.status==='fault'} showLabel={props.layer==='equipment'} work={vessels.find(v=>v.berth_id===device?.zone&&v.status==='working')} bulk={i>=4} flow={props.cargoFlow?.crane_id===id?props.cargoFlow:undefined} syncedAt={props.simTime}/>;})}
  {devices.filter(d=>d.id.startsWith('AGV-')).map((d,i)=><AGV key={d.id} id={d.id} index={i} active={d.status==='working'} onSelect={props.onSelect} clock={clock} blocked={props.scenario==='road_block'} showRoute={d.id===props.selected} flow={props.cargoFlow?.vehicle_id===d.id?props.cargoFlow:undefined} syncedAt={props.simTime}/>)}<PortGate/>{props.cargoFlow&&<><TrackedCargo hidden={props.view==='yard'&&props.cargoFlow.phase==='stored'&&(props.maxTier??5)<props.cargoFlow.target.tier&&props.selected!==props.cargoFlow.box_id} flow={props.cargoFlow} clock={clock} syncedAt={props.simTime} onSelect={props.onSelect} selected={props.selected===props.cargoFlow.box_id} showRoute={props.layer==='routes'||props.selected===props.cargoFlow.box_id}/><FlowYardCrane flow={props.cargoFlow} clock={clock} syncedAt={props.simTime}/></>}<Railway clock={clock}/><Breakwaters/><TrafficOverlay layer={props.layer} blocked={props.scenario==='road_block'} channelClosed={props.scenario==='channel_closed'}/>{props.layer==='energy'&&<EnergyLines/>}<Camera props={props}/></>;
}
function EnergyLines(){return <>{Object.values(BERTH_X).map(x=><Line key={x} points={[[540,5,-620],[540,5,-575],[x,5,-575],[x,5,-12],[x,8,10]]} color="#8be1b3" lineWidth={2}/>)}<Line points={[[540,6,-620],[550,6,-480]]} color="#8be1b3" lineWidth={3}/></>;}
export default function PortWorld(props:PortWorldProps) {
  return <Canvas shadows={{type:THREE.PCFShadowMap}} dpr={[1,props.quality==='standard'?1.15:1.6]} camera={{position:[-40,160,300],fov:45,near:.4,far:28000}} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=.9;}} fallback={<div className="scene-fallback">请开启浏览器硬件加速以查看三维港区。</div>}><Suspense fallback={null}><World {...props}/></Suspense></Canvas>;
}
