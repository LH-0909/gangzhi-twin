/** Scene coordinates are metres. The arrangement is a simulation, not surveyed Dalian geometry. */
export type V3 = [number, number, number];
export const BERTH_X: Record<string, number> = { B01: -450, B02: -150, B03: 150, B04: 450 };
export const QUAY_Y = 4.2;
export const BOX_SIZE: V3 = [12.192, 2.896, 2.438];
export const BOX_COLORS = ['#25536b','#993f32','#bf7347','#52736d','#b9b7a0','#375764','#7b403a','#66858c','#d5d4c9','#536d4a'];
export interface YardBox { id: string; block: string; bay: number; row: number; tier: number; p: V3; color: string; type: string; weight: number; destination: string; cargo: string; }
export const YARD_BLOCKS = Array.from({ length: 42 }, (_, i) => ({ id: `${'ABCDEFG'[Math.floor(i / 6)]}${i % 6 + 1}`, x: -500 + i % 6 * 185, z: -150 - Math.floor(i / 6) * 65 }));
function rng(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; }; }
const random = rng(42);
function checkDigit(s: string) { const values = '0123456789A?BCDEFGHIJK?LMNOPQRSTU?VWXYZ'; let total=0; for(let i=0;i<10;i++)total+=values.indexOf(s[i])*2**i; return total%11%10; }
export const YARD_BOXES: YardBox[] = [];
for (const block of YARD_BLOCKS) {
  for(let bay=0;bay<10;bay++) for(let row=0;row<10;row++) {
    const generatedTiers=2+Math.floor(random()*4);
    const tiers=block.id==='C4'&&bay===7&&row===5?4:generatedTiers;
    for(let tier=0;tier<tiers;tier++) {
      const n=YARD_BOXES.length; const serial=`GZTU${String(300001+n).padStart(6,'0')}`;
      YARD_BOXES.push({id:serial+checkDigit(serial),block:block.id,bay:(bay+1)*2,row:row+1,tier:tier+1,p:[block.x-59+bay*12.8,QUAY_Y+BOX_SIZE[1]/2+tier*2.97,block.z-10+row*2.8],color:BOX_COLORS[Math.floor(random()*BOX_COLORS.length)],type:'40HC',weight:Math.round(6000+random()*22000),destination:['上海','釜山','青岛','横滨','宁波'][n%5],cargo:['工业部件','树脂颗粒','纺织品'][n%3]});
    }
  }
}
// Match the user-supplied example as an explicitly simulated demonstration record.
const sample = YARD_BOXES.find(c=>c.block==='C4'&&c.bay===16&&c.row===6&&c.tier===4)!;
sample.id='MSKU5809014';
sample.weight=23200; sample.cargo='PP 树脂';
const lookup = new Map(YARD_BOXES.map(c=>[c.id,c]));
export const findYardBox = (id: string | null) => id ? lookup.get(id) : undefined;
export const YARD_COUNT = YARD_BOXES.length;
