import { useState } from 'react';
import { ArrowUpRight, Box, Cpu, Search, Ship, X } from 'lucide-react';
import { findYardBox } from './world/layout';
import { cn, vesselStatus, type PortState } from './api';
export default function GlobalSearch({state,onChoose}:{state:PortState|null;onChoose:(id:string)=>void}) {
  const [query,setQuery]=useState(''); const [open,setOpen]=useState(false);
  const normalized=query.trim().toLowerCase();
  const box=findYardBox(query.trim().toUpperCase());
  const items=state?[...state.vessels.map(v=>({id:v.id,name:v.name,detail:vesselStatus(v),type:'vessel'})),...(box?[{id:box.id,name:box.id,detail:`演示箱 · ${box.block} / ${box.bay}-${box.row}-${box.tier}`,type:'container'}]:[]),...state.equipment.map(e=>({id:e.id,name:e.name,detail:cn(e.status),type:'equipment'}))].filter(x=>`${x.id} ${x.name}`.toLowerCase().includes(normalized)).slice(0,7):[];
  const choose=(id:string)=>{onChoose(id);setQuery('');setOpen(false);};
  return <div className="search-field global-search"><Search size={15}/><input aria-label="搜索船舶、设备或箱号" placeholder="搜索船舶、设备、箱号…" value={query} onChange={e=>{setQuery(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),140)} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);setQuery('');}if(e.key==='Enter'&&items.length&&normalized)choose(items[0].id);}}/>{query?<button className="search-clear" aria-label="清除搜索" onMouseDown={e=>e.preventDefault()} onClick={()=>setQuery('')}><X size={12}/></button>:<kbd>⌕</kbd>}{open&&normalized&&<div className="search-results" role="listbox" aria-label="匹配的船舶和设备"><div className="search-summary">实体搜索 · {items.length} 项匹配</div>{items.length?items.map(item=><button key={item.id} role="option" aria-selected={false} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(item.id)}>{item.type==='vessel'?<Ship size={17}/>:item.type==='container'?<Box size={17}/>:<Cpu size={17}/>}<span><strong>{item.name}</strong><small>{item.id} · {item.detail}</small></span><ArrowUpRight size={13}/></button>):<p>没有匹配对象，试试“辽海”或“QC-01”。</p>}</div>}</div>;
}
