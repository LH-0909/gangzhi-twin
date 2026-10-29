import { useCallback, useEffect, useRef, useState } from 'react';
export type Scenario = 'normal' | 'fog' | 'wind' | 'road_block' | 'crane_fault';
export type NavigationState = {phase:'inbound'|'anchored'|'approaching'|'working'|'outbound'|'departed';started_at:number;duration:number;progress:number;path:[number,number,number][];position:[number,number,number];heading:number;visible:boolean};
export type Vessel = { id: string; name: string; type: string; status: string; berth_id: string | null; eta: string; progress: number; cargo_teu: number; draft: number; cargo_amount?: number; cargo_unit?: 'TEU'|'t'; cargo_tonnes?: number; arrived?: boolean; navigation?:NavigationState };
export type CargoPhase = 'queued'|'quay_lift'|'drive_yard'|'yard_lift'|'stored'|'yard_pickup'|'drive_gate'|'gate_check'|'completed';
export type CargoFlow = {id:string;box_id:string;vessel_id:string;crane_id:string;vehicle_id:string;box_type:string;weight_kg:number;cargo:string;phase:CargoPhase;phase_name:string;elapsed:number;phase_duration:number;created_at:number;position:[number,number,number];heading:number;distance_m:number;target:{block:string;bay:number;row:number;tier:number;position:[number,number,number]};route:[number,number,number][];route_index:number;history:{phase:CargoPhase;at:number}[];hold_reason:string|null;rate:number;drive_speed:number;scope:string};
export type Equipment = { id: string; name: string; kind: string; zone: string; status: string; utilization: number; energy_kwh: number };
export type PortTask = { id: string; vessel_id: string; kind: string; source: string; target: string; status: string; progress: number; priority: number | string };
export type PortAlert = { id: string; level: string; title: string; detail: string; entity_id: string; acknowledged: boolean; created_at: string; active?: boolean };
export type PortState = { flows?:CargoFlow[]; data_basis?:{mode:string;model_version:number;coordinates:string;tracked_cargo:string;bulk_kpis:string;carbon_factor_kg_per_kwh:number}; timeline?: { minimum:number; head:number; replaying:boolean; events:{id:string;title:string;entity_id:string;level:string;time:string;sim_time:number}[] }; sim_time: number; running: boolean; speed: number; scenario: Scenario; seed: number; vessels: Vessel[]; equipment: Equipment[]; tasks: PortTask[]; alerts: PortAlert[]; kpis: { throughput_teu: number; berth_utilization: number; avg_wait_minutes: number; energy_kwh: number; carbon_kg: number; completed_tasks: number; bulk_tonnes?:number; liquid_tonnes?:number }; series: { time: string; throughput: number; energy: number }[] };
export type Metrics = { avg_wait_minutes: number; makespan_minutes: number; distance_km: number; energy_kwh: number; completed_tasks: number; berth_utilization: number };
export type Timeline = {vessel_id:string;berth_id:string;arrival:number;start:number;finish:number;wait_minutes:number;cargo_teu:number;route_path:string[];distance_km:number;energy_kwh:number};
export type Comparison = { seed: number; scenario: string; vessel_count: number; baseline: Metrics; optimized: Metrics; improvement: { wait_pct: number; makespan_pct: number; distance_pct: number; energy_pct: number }; explanation: string[]; baseline_timeline: Timeline[]; optimized_timeline: Timeline[] };
export const scenarios: { id: Scenario; label: string; short: string; description: string; tag: string }[] = [
  { id: 'normal', label: '常态运行', short: '晴朗', description: '泊位、岸桥与运输通道正常开放，建立运行基线。', tag: '基准场景' },
  { id: 'fog', label: '近岸海雾', short: '海雾', description: '降低船舶进港效率，观察等待与泊位衔接变化。', tag: '海况扰动' },
  { id: 'wind', label: '大风预警', short: '大风', description: '岸桥作业受到限制，联动设备状态和装卸进度。', tag: '海况扰动' },
  { id: 'road_block', label: '疏港道路封闭', short: '路段封闭', description: '关闭一段运输道路，用 A* 重新计算可用路径。', tag: '交通事件' },
  { id: 'crane_fault', label: '岸桥设备故障', short: '岸桥故障', description: '暂停一台岸桥，观察设备资源约束与重排结果。', tag: '设备事件' },
];
export const statusName: Record<string, string> = { waiting: '等待靠泊', berthing: '正在靠泊', working: '作业中', departed: '已离港', idle: '待命', fault: '故障', weather_hold: '天气停机', completed: '已完成', pending: '待执行', queued: '排队中', running: '执行中', in_progress: '执行中', blocked: '受阻', ready: '待执行', unloading: '卸船中', transit: '运输中', container: '集装箱船', bulk: '散货船', reefer: '冷链运输船', tanker: '油轮', crane: '岸桥', agv: '运输车', shore_power: '岸电设备', loading: '装卸作业', transport: '水平运输', discharge: '卸船作业' };
export const cn = (s: string) => statusName[s] ?? s;
export const navigationName:Record<string,string>={inbound:'航道进港',anchored:'锚地等泊',approaching:'引航靠泊',working:'泊位作业',outbound:'离泊出港',departed:'已出港'};
export const vesselStatus = (v:Vessel) => v.navigation?navigationName[v.navigation.phase]:v.arrived===false?'待到港':cn(v.status);
export const cargo = (v:Vessel) => `${number(v.cargo_amount ?? v.cargo_teu)} ${v.cargo_unit ?? (v.type==='bulk'||v.type==='tanker'?'t':'TEU')}`;
export const number = (n: number | undefined, digits = 0) => Number(n ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export function simClock(seconds: number) { const t = 8 * 3600 + Math.floor(seconds); return `${String(Math.floor(t / 3600) % 24).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(path, { signal: controller.signal, method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) { let message = `请求失败 (${r.status})`; try { const d = await r.json(); message = typeof d.detail === 'string' ? d.detail : message; } catch {} throw new Error(message); }
    return await r.json() as T;
  } catch (e) {
    if (controller.signal.aborted) throw new Error('仿真服务响应超时，请稍后重试');
    throw e;
  } finally { window.clearTimeout(timeout); }
}
export function usePort() {
  const [state, setState] = useState<PortState | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const rev = useRef(0);
  const refreshing=useRef(false); const mutating=useRef(false);
  const refresh = useCallback(async () => { if(refreshing.current||mutating.current)return; refreshing.current=true; const n = ++rev.current; try { const s = await request<PortState>('/api/state'); if (n === rev.current) { setState(s); setError(''); } } catch (e) { if (n === rev.current) setError(e instanceof Error ? e.message : '连接失败'); } finally {refreshing.current=false;} }, []);
  useEffect(() => { void refresh(); const t = window.setInterval(() => void refresh(), 1500); return () => { clearInterval(t); rev.current++; }; }, [refresh]);
  const act = useCallback(async (path: string, body: unknown) => { if(mutating.current)throw new Error('操作正在处理，请稍候'); mutating.current=true; setBusy(true); ++rev.current; try { const s = await request<PortState>(path, body); ++rev.current; setState(s); setError(''); return s; } finally { mutating.current=false; setBusy(false); } }, []);
  return { state, error, busy, act, refresh };
}
