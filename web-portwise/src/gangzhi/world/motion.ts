import type { CargoFlow, NavigationState } from '../api';
import type { V3 } from './layout';
const lerp=(a:number,b:number,t:number)=>a+(b-a)*Math.max(0,Math.min(1,t));
const mix=(a:V3,b:V3,t:number):V3=>a.map((v,i)=>lerp(v,b[i],t)) as V3;
const distance=(a:V3,b:V3)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const smooth=(t:number)=>{const n=Math.max(0,Math.min(1,t));return n*n*(3-2*n);};
export function pathPose(points:V3[],meters:number) {
  let left=Math.max(0,meters);
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=distance(a,b);if(left<=length||i===points.length-1)return {p:mix(a,b,length?left/length:1),heading:-Math.atan2(b[2]-a[2],b[0]-a[0])};left-=length;}
  return {p:points[0]??[0,0,0] as V3,heading:0};
}
export function navigationPose(nav:NavigationState,time:number) {
  if(!nav.duration)return {p:nav.position,heading:nav.heading};
  const length=nav.path.slice(1).reduce((sum,p,i)=>sum+distance(p,nav.path[i]),0);
  return pathPose(nav.path,length*(time-nav.started_at)/nav.duration);
}
export function cargoMotion(flow:CargoFlow,time:number,syncedAt:number) {
  const elapsed=flow.elapsed+Math.max(0,time-syncedAt)*flow.rate;
  let vehicle={p:flow.position,heading:flow.heading};
  if(flow.phase==='drive_yard'||flow.phase==='drive_gate')vehicle=pathPose([flow.position,...flow.route.slice(flow.route_index)],Math.max(0,time-syncedAt)*flow.drive_speed);
  let box:V3=[vehicle.p[0],vehicle.p[1]+3.55,vehicle.p[2]],rotation=vehicle.heading,visible=flow.phase!=='completed';
  let trolley=35,hoist=39;
  if(flow.phase==='queued'){box=[-397,27.8,23];rotation=0;}
  else if(flow.phase==='quay_lift'){
    const t=Math.min(160,elapsed);
    if(t<30)hoist=lerp(39,25.5,smooth(t/30));
    else if(t<65)hoist=lerp(25.5,39,smooth((t-30)/35));
    else if(t<105)trolley=lerp(35,-23,smooth((t-65)/40));
    else if(t<135){trolley=-23;hoist=lerp(39,5.45,smooth((t-105)/30));}
    else {trolley=-23;hoist=lerp(5.45,39,smooth((t-135)/25));}
    box=t<30?[-397,27.8,23]:t<135?[-397,4.2+hoist-1.9,-12+trolley]:[-397,7.75,-35];rotation=0;
  } else if(flow.phase==='stored'){box=flow.target.position;rotation=0;}
  else if(flow.phase==='yard_lift'||flow.phase==='yard_pickup'){
    let t=Math.min(120,elapsed);if(flow.phase==='yard_pickup')t=120-t;
    const from:V3=[85.6,7.75,-260],to=flow.target.position;
    box=t<35?mix(from,[from[0],20,from[2]],smooth(t/35)):t<85?mix([from[0],20,from[2]],[to[0],20,to[2]],smooth((t-35)/50)):mix([to[0],20,to[2]],to,smooth((t-85)/35));rotation=0;
  }
  return {vehicle,box,rotation,visible,trolley,hoist};
}
