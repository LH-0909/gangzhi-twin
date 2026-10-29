import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { YARD_BOXES, YARD_BLOCKS, BOX_SIZE, QUAY_Y, findYardBox } from '../web-portwise/src/gangzhi/world/layout.ts';
import { cargoMotion } from '../web-portwise/src/gangzhi/world/motion.ts';

const isoValues=[10,12,13,14,15,16,17,18,19,20,21,23,24,25,26,27,28,29,30,31,32,34,35,36,37,38];
function validISO(id) {let sum=0;for(let i=0;i<10;i++){const c=id[i],n=/[0-9]/.test(c)?Number(c):isoValues[c.charCodeAt(0)-65];sum+=n*2**i;}return sum%11%10===Number(id[10]);}
assert.equal(YARD_BLOCKS.length,42);
assert.equal(new Set(YARD_BOXES.map(b=>b.id)).size,YARD_BOXES.length,'box IDs must be unique');
const occupied=new Set();
for(const box of YARD_BOXES) {
  assert.match(box.id,/^[A-Z]{3}U\d{7}$/);
  assert.ok(validISO(box.id),`invalid ISO 6346 check digit: ${box.id}`);
  assert.ok(box.p.every(Number.isFinite));
  assert.ok(box.tier>=1&&box.tier<=5);
  assert.ok(Math.abs(box.p[1]-BOX_SIZE[1]/2-QUAY_Y-(box.tier-1)*2.97)<1e-6,'container must sit on its actual tier');
  const slot=`${box.block}-${box.bay}-${box.row}-${box.tier}`;
  assert.ok(!occupied.has(slot),'two boxes must not occupy one slot');occupied.add(slot);
}
assert.equal(findYardBox('MSKU5809014')?.block,'C4');
assert.equal(findYardBox('MSKU5809014')?.tier,4);
// The tracked inbound box occupies the reserved tier immediately above the
// reference box; verify placement and crane-to-vehicle hand-off geometrically.
const below=findYardBox('MSKU5809014');
const target=[85.6,17.528,-276];
assert.ok(!YARD_BOXES.some(b=>b.block==='C4'&&b.bay===16&&b.row===6&&b.tier===5));
assert.ok(Math.abs(below.p[0]-target[0])<1e-6&&Math.abs(below.p[2]-target[2])<1e-6);
assert.ok(Math.abs(below.p[1]+2.97-target[1])<1e-6);
const flow={phase:'quay_lift',elapsed:135,rate:1,position:[-397,4.2,-35],heading:0,target:{position:target},route:[],route_index:0,drive_speed:4.5};
const landed=cargoMotion(flow,0,0);
assert.ok(Math.abs(landed.box[1]-QUAY_Y-3.55)<1e-6,'STS hand-off must meet the vehicle deck');
flow.phase='yard_lift';flow.elapsed=120;
assert.deepEqual(cargoMotion(flow,0,0).box,target,'yard hand-off must meet the reserved slot');
const assets=new URL('../web-portwise/public/assets/harbor/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('sources.json',assets),'utf8'));
for(const asset of manifest) {
  const data=await readFile(new URL(asset.file,assets));
  assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256,`asset changed: ${asset.file}`);
  assert.ok(['CC0','MIT'].includes(asset.license));
}
console.log(`Scene verified: ${YARD_BOXES.length} unique ISO box IDs, 42 blocks, tier geometry, C4 sample, ${manifest.length} local assets.`);
