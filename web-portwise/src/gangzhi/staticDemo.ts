// 静态演示模式：用于 GitHub Pages 等纯静态托管。
// 构建时设置 VITE_STATIC_DEMO=1，前端不再轮询后端，而是读取构建时导出的
// /demo/state.json 快照；所有写操作（仿真控制、场景注入、调度实验）只读禁用。
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

export const STATIC_DEMO_NOTICE = '静态演示版为只读快照：仿真控制、场景注入与调度实验请在本机运行完整系统。';

let snapshot: unknown = null;

export async function loadStaticState<T>(): Promise<T> {
  if (snapshot) return snapshot as T;
  const response = await fetch(`${import.meta.env.BASE_URL}demo/state.json`);
  if (!response.ok) throw new Error(`静态快照加载失败 (${response.status})`);
  snapshot = await response.json();
  return snapshot as T;
}

export function mountStaticBadge() {
  if (!STATIC_DEMO || document.getElementById('static-demo-badge')) return;
  const badge = document.createElement('div');
  badge.id = 'static-demo-badge';
  badge.textContent = '静态演示 · 数据为模拟快照，交互仿真请在本机运行完整系统';
  badge.style.cssText = [
    'position:fixed', 'left:14px', 'bottom:14px', 'z-index:9999',
    'padding:7px 12px', 'border-radius:999px',
    'background:rgba(9,32,44,.86)', 'color:#d6efe8',
    'font:12px/1.4 "Microsoft YaHei",system-ui,sans-serif',
    'letter-spacing:.02em', 'border:1px solid rgba(126,205,190,.35)',
    'box-shadow:0 6px 18px rgba(0,0,0,.28)', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(badge);
}
