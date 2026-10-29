import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vessel } from '../api';
import { Model, ModelMesh } from './kit';
import { pathPose } from './motion';
import type { V3 } from './layout';

// These facility links are visual demonstrations of aggregate material flow.
// The markers move from the backend's actual work clock, not a separate timer.
const bulk:V3[]=[[150,22,15],[150,24,-95],[-620,24,-95],[-620,24,-590],[-550,37,-620]];
const liquid:V3[]=[[450,16,15],[450,16,-92],[620,16,-92],[620,16,-620],[540,16,-620]];
function length(points:V3[]){return points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((n,j)=>n-points[i][j])),0);}
function construction(points:V3[],isBulk:boolean) {
  const m=new Model(),steel=isBulk?'#879598':'#d9b762';
  for(let i=1;i<points.length;i++){
    m.beam(points[i-1],points[i],isBulk?1.4:.8,steel,isBulk?4:.8);
    if(isBulk){const a=points[i-1],b=points[i];m.beam([a[0],a[1]+1.2,a[2]-1.6],[b[0],b[1]+1.2,b[2]-1.6],.14,'#d1c59b');m.beam([a[0],a[1]+1.2,a[2]+1.6],[b[0],b[1]+1.2,b[2]+1.6],.14,'#d1c59b');}
  }
  const x=isBulk?-620:620,top=isBulk?24:16;
  for(const z of [-140,-240,-340,-440,-540]){m.beam([x,4.3,z],[x,top,z],.8,'#9ca9a1');m.box([x,4.4,z],[4,.4,4],'#b7bcb1');}
  m.box([isBulk?150:450,8,-80],[10,8,8],isBulk?'#a5b4ac':'#d1c18d');
  return m;
}
const bulkModel=construction(bulk,true),liquidModel=construction(liquid,false);
function MovingMaterial({vessel,points,color,clock,syncedAt}:{vessel?:Vessel;points:V3[];color:string;clock:React.RefObject<number>;syncedAt:number}) {
  const ref=useRef<THREE.InstancedMesh>(null),total=useMemo(()=>length(points),[points]);
  const geometry=useMemo(()=>new THREE.BoxGeometry(1.4,1.2,1.4),[]);
  const material=useMemo(()=>new THREE.MeshStandardMaterial({color,roughness:.7,emissive:color,emissiveIntensity:.12}),[color]);
  useLayoutEffect(()=>()=>{geometry.dispose();material.dispose();},[geometry,material]);
  useFrame(()=>{if(!ref.current)return;const rate=vessel?.work_rate??0,active=vessel?.status==='working'&&rate>0;ref.current.visible=active;if(!active)return;const time=(vessel?.work_seconds??0)+Math.max(0,clock.current-syncedAt)*rate,matrix=new THREE.Matrix4();for(let i=0;i<22;i++){const p=pathPose(points,((time*4+i*total/22)%total)).p;matrix.makeTranslation(...p);ref.current.setMatrixAt(i,matrix);}ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();});
  return <instancedMesh ref={ref} args={[geometry,material,22]} raycast={()=>null}/>;
}
export function IndustrialFlows({vessels,clock,syncedAt}:{vessels:Vessel[];clock:React.RefObject<number>;syncedAt:number}) {
  const grain=vessels.find(v=>v.type==='bulk'),tanker=vessels.find(v=>v.type==='tanker');
  return <><ModelMesh model={bulkModel}/><ModelMesh model={liquidModel}/><MovingMaterial vessel={grain} points={bulk} color="#ddc786" clock={clock} syncedAt={syncedAt}/><MovingMaterial vessel={tanker} points={liquid} color="#e3d7a3" clock={clock} syncedAt={syncedAt}/></>;
}
