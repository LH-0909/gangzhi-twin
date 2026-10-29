import { useEffect, useState } from 'react';
import { Activity, Anchor, ArrowUpRight, Bell, Box, ChevronRight, CloudFog, PanelRightClose, PanelRightOpen, ShieldCheck, Timer, TriangleAlert, Waves, Wind, Zap } from 'lucide-react';
import { cn, number, scenarios, type PortState } from './api';
import { TrendChart } from './widgets';

export default function OverviewHUD({ state, onSelect, onOperations, onEnvironment, onAlerts }: {
  state: PortState | null;
  onSelect: (id: string) => void;
  onOperations: () => void;
  onEnvironment: () => void;
  onAlerts: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'berths' | 'trend' | 'events'>('berths');
  useEffect(() => {
    const media = window.matchMedia('(min-width:981px)');
    const resize = () => setOpen(false);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  const alerts = state?.alerts.filter(a => !a.acknowledged && a.active !== false) ?? [];
  const berths = state?.vessels.filter(v => v.berth_id && ['working', 'berthing'].includes(v.status)) ?? [];
  const metrics = [
    { title: '累计吞吐', value: number(state?.kpis.throughput_teu), unit: 'TEU', icon: Box },
    { title: '泊位利用率', value: number(state?.kpis.berth_utilization, 1), unit: '%', icon: Anchor },
    { title: '平均等待', value: number(state?.kpis.avg_wait_minutes, 1), unit: 'min', icon: Timer },
    { title: '作业能耗', value: number(state?.kpis.energy_kwh, 1), unit: 'kWh', icon: Zap },
  ];
  return <div className={`overview-hud ${open ? '' : 'panels-hidden'}`}>
    <div className="port-metrics" aria-label="港区运行指标">{metrics.map(m => <div className="port-metric" key={m.title}><span><m.icon size={14}/>{m.title}</span><strong>{state ? m.value : '—'}<small>{m.unit}</small></strong></div>)}</div>
    <button className="insights-toggle" aria-label={open ? '收起面板' : '打开运行面板'} aria-expanded={open} aria-controls="port-insights" onClick={() => setOpen(!open)}>{open ? <PanelRightClose size={16}/> : <PanelRightOpen size={16}/>}<span>{open ? '收起面板' : '运行面板'}</span></button>
    {open && <aside id="port-insights" className="port-insights">
      <div className="insights-heading"><span className="eyebrow">PORT CONTROL</span><h2>港区运行简报 <span className="live-dot"/></h2><p>四类作业 · 一体协同</p></div>
      <div className="insight-tabs" role="tablist" aria-label="运行简报">{([['berths', '泊位作业'], ['trend', '吞吐趋势'], ['events', '事件']] as const).map(([id, title]) => <button key={id} id={`insight-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="insight-content" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{title}{id === 'events' && alerts.length > 0 && <b>{alerts.length}</b>}</button>)}</div>
      <div className="insight-content" id="insight-content" role="tabpanel" aria-labelledby={`insight-tab-${tab}`}>
        {tab === 'berths' && <><div className="berth-summary"><Anchor size={14}/><span>当前泊位</span><strong>{berths.length}<small> / 4 已占用</small></strong></div><div className="berth-cards">{['B01', 'B02', 'B03', 'B04'].map((id, i) => { const vessel = berths.find(v => v.berth_id === id); return <button className="berth-mini" key={id} onClick={() => onSelect(vessel?.id ?? id)}><div><span className={`berth-number berth-color-${i}`}>{id}</span><span><strong>{vessel?.name ?? '泊位空闲'}</strong><small>{['集装箱作业', '集装箱与冷链', '散粮作业', '液货与能源'][i]}</small></span><ChevronRight size={14}/></div><div className="berth-mini-progress"><i style={{ width: `${vessel?.progress ?? 0}%` }}/></div><footer><span>{vessel ? cn(vessel.status) : '等待任务'}</span><b>{vessel ? `${number(vessel.progress)}%` : '—'}</b></footer></button>; })}</div><button className="insight-link" onClick={onOperations}>进入港区作业中心 <ArrowUpRight size={14}/></button></>}
        {tab === 'trend' && <><div className="insight-trend-title"><span>累计完成量</span><strong>{number(state?.kpis.throughput_teu)} <small>TEU</small></strong></div><div className="insight-chart">{state && <TrendChart state={state}/>}</div><div className="insight-cargo"><span>散货累计 <b>{number(state?.kpis.bulk_tonnes, 1)} t</b></span><span>液货累计 <b>{number(state?.kpis.liquid_tonnes, 1)} t</b></span><small>散货、液货与 TEU 独立统计</small></div></>}
        {tab === 'events' && <div className="insight-events">{alerts.length ? alerts.slice(0, 4).map(a => <button key={a.id} onClick={() => { onSelect(a.entity_id); onAlerts(); }}><TriangleAlert size={17}/><span><strong>{a.title}</strong><small>{a.detail}</small></span><ChevronRight size={13}/></button>) : <div className="event-empty"><ShieldCheck size={31}/><span>港区运行平稳</span><small>当前无待处理告警</small></div>}<button className="insight-link" onClick={onAlerts}><Bell size={13}/>打开告警中心 <ArrowUpRight size={13}/></button></div>}
      </div>
      <button className="insight-weather" onClick={onEnvironment}>{state?.scenario === 'fog' ? <CloudFog size={27}/> : state?.scenario === 'wind' ? <Wind size={27}/> : <Waves size={27}/>}<span><strong>{scenarios.find(s => s.id === state?.scenario)?.label ?? '常态运行'}</strong><small>近岸海况 · 仿真情境</small></span><ChevronRight size={15}/></button>
      <div className="insights-foot"><Activity size={12}/><span>三维对象与业务状态同步</span></div>
    </aside>}
  </div>;
}
