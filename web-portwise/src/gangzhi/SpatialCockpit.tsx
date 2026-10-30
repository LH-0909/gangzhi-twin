import { useState } from 'react';
import { Activity, Anchor, ArrowUpRight, Box, Focus, Route, Ship, TriangleAlert, Waves, Wrench } from 'lucide-react';
import { cn, cargo, number, simClock, vesselStatus, type PortState } from './api';
import { findYardBox } from './world/layout';

type Tab='berths'|'equipment'|'alerts';
const berths=['B01','B02','B03','B04'];

export default function SpatialCockpit({state,selected,onSelect,onOperations,onAlerts,onStartCargo,onShowRoutes,routesVisible}:{state:PortState|null;selected:string|null;onSelect:(id:string)=>void;onOperations:()=>void;onAlerts:()=>void;onStartCargo:()=>void;onShowRoutes:()=>void;routesVisible:boolean}) {
  const [tab,setTab]=useState<Tab>('berths');
  const vessel=state?.vessels.find(v=>v.id===selected);
  const equipment=state?.equipment.find(e=>e.id===selected);
  const box=findYardBox(selected);
  const flow=state?.flows?.find(f=>f.box_id===selected);
  const alerts=state?.alerts.filter(a=>a.active!==false&&!a.acknowledged)??[];
  const cranes=state?.equipment.filter(e=>e.id.startsWith('QC-'))??[];
  const activeTasks=state?.tasks.filter(t=>['working','running','in_progress'].includes(t.status))??[];
  const focused=!!selected;
  return <>
    {!focused&&<div className="command-chain" aria-label="空间作业链">
      <header><Activity size={15}/><span>当前作业链</span><small>仿真</small></header>
      <div className="command-chain-stats"><b>{state?.vessels.filter(v=>v.status==='working').length??0}<small>作业船舶</small></b><b>{cranes.filter(e=>e.status==='working').length}<small>运行岸桥</small></b><b>{activeTasks.length}<small>活跃任务</small></b></div>
      {activeTasks.slice(0,3).map(task=><button key={task.id} onClick={()=>onSelect(task.vessel_id)}><span><strong>{task.id}</strong><small>{cn(task.kind)} · {task.vessel_id}</small></span><em>{number(task.progress)}%</em></button>)}
      {!activeTasks.length&&<p>暂无执行中的任务，启动仿真后会在这里显示。</p>}
    </div>}
    <aside className="command-panel" aria-label="空间指挥舱运行面板">
      <header className="command-panel-head"><div><span className="command-kicker">SPATIAL OPERATIONS</span><h2>空间指挥舱</h2><p>船 · 岸桥 · 车辆 · 任务联动</p></div><span className="command-sim-badge"><i/>模拟运行</span></header>
      <div className="command-status-line"><span><Waves size={14}/>{state?.running?'仿真推进中':'仿真已暂停'}</span><strong>{state?simClock(state.sim_time):'--:--:--'}</strong></div>
      {focused&&<div className="command-focus" aria-live="polite"><span><Focus size={14}/>当前锁定对象</span><h3>{vessel?.name??equipment?.name??box?.id??flow?.box_id??selected}</h3><small>{selected}</small><div className="command-focus-grid">
        {vessel?<><span>运行状态<b>{vesselStatus(vessel)}</b></span><span>所在泊位<b>{vessel.berth_id??'航道 / 锚地'}</b></span><span>任务货量<b>{cargo(vessel)}</b></span><span>作业进度<b>{number(vessel.progress)}%</b></span></>:equipment?<><span>设备状态<b>{cn(equipment.status)}</b></span><span>所属区域<b>{equipment.zone}</b></span><span>利用率<b>{number(equipment.utilization,1)}%</b></span><span>累计能耗<b>{number(equipment.energy_kwh,1)} kWh</b></span></>:box?<><span>箱位<b>{box.block}-{box.bay}-{box.row}-{box.tier}</b></span><span>货类<b>{box.cargo}</b></span></>:flow?<><span>作业阶段<b>{flow.phase_name}</b></span><span>关联车辆<b>{flow.vehicle_id}</b></span></>:<span>对象类型<b>港区场景</b></span>}
      </div></div>}
      <div className="command-tabs" role="tablist" aria-label="指挥舱对象列表">{([['berths','泊位'],['equipment','岸桥'],['alerts','告警']] as const).map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}{id==='alerts'&&alerts.length>0&&<em>{alerts.length}</em>}</button>)}</div>
      <div className="command-list" role="tabpanel">
        {tab==='berths'&&berths.map((id,index)=>{const v=state?.vessels.find(item=>item.berth_id===id&&item.navigation?.visible);return <button key={id} disabled={!v} className={`command-list-row ${v&&selected===v.id?'selected':''}`} onClick={()=>v&&onSelect(v.id)}><span className="command-list-icon"><Anchor size={15}/></span><span className="command-row-main"><strong>{id} <small>{['集装箱','冷链箱','散货','液货'][index]}</small></strong><span>{v?.name??'泊位空闲'}</span></span><span className="command-row-end"><b>{v?vesselStatus(v):'待任务'}</b><small>{v?`${number(v.progress)}%`:'—'}</small></span></button>;})}
        {tab==='equipment'&&cranes.map(e=><button key={e.id} className={`command-list-row ${selected===e.id?'selected':''}`} onClick={()=>onSelect(e.id)}><span className="command-list-icon"><Wrench size={15}/></span><span className="command-row-main"><strong>{e.id}</strong><span>{e.name}</span></span><span className={`command-row-end ${['fault','weather_hold'].includes(e.status)?'warning':''}`}><b>{cn(e.status)}</b><small>{number(e.utilization,1)}%</small></span></button>)}
        {tab==='alerts'&&(alerts.length?alerts.map(a=><button key={a.id} className="command-list-row alert" onClick={()=>onSelect(a.entity_id)}><span className="command-list-icon"><TriangleAlert size={15}/></span><span className="command-row-main"><strong>{a.title}</strong><span>{a.entity_id} · {a.detail}</span></span><ArrowUpRight size={13}/></button>):<p className="command-list-empty">当前没有待处理告警。</p>)}
      </div>
      <div className="command-actions"><button onClick={onShowRoutes} aria-pressed={routesVisible}><Route size={14}/>{routesVisible?'收起路线':'显示路线'}</button><button onClick={state?.flows?.length?()=>onSelect(state.flows![0].box_id):onStartCargo}><Box size={14}/>{state?.flows?.length?'追踪箱号':'启动单箱演示'}</button></div>
      <footer><button onClick={tab==='alerts'?onAlerts:onOperations}>{tab==='alerts'?'打开告警中心':'进入作业中心'} <ArrowUpRight size={13}/></button><span><Ship size={12}/> 数据为教学模拟</span></footer>
    </aside>
  </>;
}
