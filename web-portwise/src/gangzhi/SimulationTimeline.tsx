import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, HelpCircle, History, Pause, Play, Radio, RotateCcw } from 'lucide-react';
import { simClock, type PortState } from './api';

export function SimulationClock({state}:{state:PortState|null}) {
  return <>{simClock(useSimulationTime(state))}</>;
}
function useSimulationTime(state:PortState|null) {
  const [time,setTime]=useState(state?.sim_time??0);
  useEffect(()=>{const received=performance.now(),base=state?.sim_time??0;const tick=()=>setTime(base+(state?.running?Math.min(2.25,(performance.now()-received)/1000)*state.speed:0));tick();const id=window.setInterval(tick,100);return()=>clearInterval(id);},[state?.sim_time,state?.speed,state?.running]);
  return time;
}
type Props={state:PortState|null;busy:boolean;connected:boolean;onHelp:()=>void;action:(path:string,body:unknown,message?:string)=>Promise<void>};
export default function SimulationTimeline({state,busy,connected,onHelp,action}:Props) {
  const now=useSimulationTime(state),[draft,setDraft]=useState<number|null>(null),[eventsOpen,setEventsOpen]=useState(false),[windowSize,setWindowSize]=useState(3600);
  const pending=useRef<number|null>(null);
  const head=state?.timeline?.head??state?.sim_time??0,minimum=state?.timeline?.minimum??0;
  const end=Math.max(head,now),start=windowSize?Math.max(minimum,end-windowSize):minimum;
  const cursor=draft??Math.max(start,Math.min(end,now)),replaying=state?.timeline?.replaying??false;
  useEffect(()=>{if(state?.timeline?.replaying&&state.sim_time<start)setWindowSize(0);},[state?.sim_time,start,state?.timeline?.replaying]);
  const events=(state?.timeline?.events??[]).filter(e=>e.sim_time>=start&&e.sim_time<=head);
  const seek=(time:number)=>{pending.current=null;setDraft(null);void action('/api/simulation/seek',{seconds:Math.max(minimum,Math.min(head,time))});};
  const commit=()=>{if(pending.current!==null)seek(pending.current);};
  const toggle=()=>void action('/api/simulation/control',{action:state?.running?'pause':'play'});
  useEffect(()=>{const key=(event:KeyboardEvent)=>{const target=event.target as HTMLElement;if(event.code==='Space'&&!event.repeat&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(target.tagName)&&!target.isContentEditable){event.preventDefault();if(connected&&!busy)toggle();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
  return <footer className="sim-bar time-console">
    <div className="time-clock"><span className={`time-mode ${replaying?'replay':''}`}><i/>{replaying?'历史回放':state?.running?'仿真 LIVE':'仿真已暂停'}</span><b>{simClock(draft??now)}</b><small>第{Math.floor((8*3600+now)/86400)+1}天 · UTC+8</small></div>
    <div className="time-controls"><button className="icon-button" title="归档本轮并重置到 08:20" aria-label="重置仿真" disabled={busy||!connected} onClick={()=>void action('/api/simulation/control',{action:'reset'},'本轮仿真已重置')}><RotateCcw size={14}/></button><button className="icon-button" aria-label="后退30秒" disabled={busy||!connected||cursor<=minimum} onClick={()=>seek((state?.sim_time??0)-30)}><ChevronLeft size={18}/></button><button className="play-button" title="空格键 播放/暂停" aria-label={state?.running?'暂停仿真':'开始仿真'} disabled={busy||!connected} onClick={toggle}>{state?.running?<Pause size={16} fill="currentColor"/>:<Play size={16} fill="currentColor"/>}</button><button className="icon-button" aria-label="前进30秒" disabled={busy||!connected||cursor>=head} onClick={()=>seek((state?.sim_time??0)+30)}><ChevronRight size={18}/></button><select aria-label="仿真倍速" value={state?.speed??1} disabled={busy||!connected} onChange={e=>void action('/api/simulation/control',{action:state?.running?'play':'pause',speed:Number(e.target.value)})}>{[1,10,30,60,120].map(n=><option key={n} value={n}>{n}×</option>)}</select></div>
    <div className="time-track-wrap"><div className="time-track-labels"><span>{simClock(start).slice(0,5)}</span><span><select className="time-window" aria-label="时间轴范围" value={windowSize} onChange={e=>setWindowSize(Number(e.target.value))}><option value={3600}>近1小时</option><option value={0}>全部记录</option></select>{draft!==null?'释放以恢复该时刻状态':replaying?'回放同一轮历史 · 拖动定位':'拖动回放 · 点击事件定位'}</span><span>{simClock(end).slice(0,5)}</span></div><div className="time-track"><div className="time-track-fill" style={{width:`${(cursor-start)/Math.max(1,end-start)*100}%`}}/><input type="range" aria-label="仿真时间轴" aria-valuetext={simClock(cursor)} min={start} max={Math.max(start+1,end)} step={1} value={cursor} disabled={busy||!connected||head<=minimum} onChange={e=>{const value=Number(e.target.value);pending.current=value;setDraft(value);}} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/><div className="time-event-markers">{events.map(e=><button key={e.id} className={e.level} title={`${e.time} · ${e.title}`} aria-label={`回放事件：${e.title}`} style={{left:`${(e.sim_time-start)/Math.max(1,end-start)*100}%`}} disabled={busy||!connected} onClick={()=>seek(e.sim_time)}/>)}</div></div></div>
    <div className="time-actions"><button className={`latest-button ${replaying?'':'at-head'}`} disabled={busy||!connected||(!replaying&&!!state?.running)} onClick={()=>void action('/api/simulation/live',{},'已回到最新仿真时刻')}><Radio size={13}/>回到最新</button><button className={`icon-button ${eventsOpen?'active':''}`} aria-expanded={eventsOpen} aria-label="时间事件记录" onClick={()=>setEventsOpen(!eventsOpen)}><History size={16}/><small>{events.length}</small></button><button className="icon-button" aria-label="演示指南" onClick={onHelp}><HelpCircle size={16}/></button></div>
    {eventsOpen&&<div className="time-events"><div><strong>本轮时间事件</strong><span>选择事件，恢复当时业务状态</span></div>{[...events].reverse().map(e=><button key={e.id} disabled={busy||!connected} onClick={()=>seek(e.sim_time)}><time>{e.time}</time><i className={e.level}/><span>{e.title}</span><ChevronLeft size={13}/></button>)}{!events.length&&<p>当前时间窗口暂无事件</p>}</div>}
  </footer>;
}
