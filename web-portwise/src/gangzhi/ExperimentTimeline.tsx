import { useState } from 'react';
import { ArrowRight, Route } from 'lucide-react';
import type { Comparison, Timeline } from './api';
import { number } from './api';
import { PanelTitle, Pill } from './widgets';
const nodeNames:Record<string,string>={quay:'码头',junction:'路口',yard:'堆场',cold:'冷链',gate:'闸口',rail:'铁路',bypass:'绕行道',bulk:'外环路'};
export default function ExperimentTimeline({result}:{result:Comparison}){
  const [selected,setSelected]=useState('EXP-001');
  const duration=Math.max(result.baseline.makespan_minutes,result.optimized.makespan_minutes,1);
  const sides=[{name:'先到先服务 · 基线',data:result.baseline_timeline,tone:'baseline'},{name:'资源感知 + A* · 优化',data:result.optimized_timeline,tone:'optimized'}];
  const chosen=sides.map(s=>({...s,row:s.data.find(t=>t.vessel_id===selected)??s.data[0]}));
  return <div className="panel timeline-panel"><PanelTitle title="调度过程对照" eyebrow="SCHEDULE EVIDENCE" action={<span className="tiny-tag">点击船舶任务查看路径</span>}/><div className="experiment-timelines">{sides.map(side=><div className={`experiment-timeline ${side.tone}`} key={side.tone}><h4><i/>{side.name}</h4><div className="timeline-axis"><span>0</span><span>{number(duration/2)} min</span><span>{number(duration)} min</span></div>{['B01','B02','B03'].map(berth=><div className="gantt-lane" key={berth}><span>{berth}</span><div>{side.data.filter(t=>t.berth_id===berth).map(t=><button key={t.vessel_id} className={selected===t.vessel_id?'selected':''} style={{left:`${t.start/duration*100}%`,width:`${(t.finish-t.start)/duration*100}%`}} onClick={()=>setSelected(t.vessel_id)} title={`${t.vessel_id} · ${number(t.start,1)}–${number(t.finish,1)} min · 等待 ${number(t.wait_minutes,1)} min`}>{t.vessel_id.slice(-3)}</button>)}</div></div>)}</div>)}</div><div className="route-evidence"><div className="route-evidence-title"><Route size={17}/><h4>{selected} · 任务路径与等待</h4><Pill tone="slate">独立箱运实验模型</Pill></div><div className="route-pair">{chosen.map(s=><div key={s.tone}><span className="route-strategy">{s.tone==='baseline'?'基线方案':'优化方案'}<b>{number(s.row?.wait_minutes,1)} min 等待</b></span><div className="route-nodes">{s.row?.route_path.map((n,i)=><span key={`${n}-${i}`}>{i>0&&<ArrowRight size={10}/>}<b>{nodeNames[n]??n}</b></span>)}</div><small>{s.row?.berth_id} · {number(s.row?.cargo_teu)} TEU · {number(s.row?.distance_km,1)} km · {number(s.row?.energy_kwh,1)} kWh</small></div>)}</div></div></div>;
}
