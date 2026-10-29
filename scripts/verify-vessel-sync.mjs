import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hullGeometry, HULL_SECTIONS, WATER_LEVEL } from '../web-portwise/src/gangzhi/world/hull.ts';
import { navigationPose } from '../web-portwise/src/gangzhi/world/motion.ts';

const sample = JSON.parse(await readFile(process.argv[2],'utf8'));
assert.deepEqual(HULL_SECTIONS,sample.sections,'backend outline must match actual hull geometry');
assert.equal(WATER_LEVEL,sample.water_level);
for(const spec of sample.specs) {
  const hull=hullGeometry(spec.length,spec.beam,spec.draft);
  hull.computeBoundingBox();
  assert.ok(Math.abs(hull.boundingBox.min.y-(WATER_LEVEL-spec.draft))<.00001,'keel must match stated draft');
  assert.ok(Math.abs(hull.boundingBox.max.z-spec.beam/2)<.00001,'beam must match the collision model');
  assert.ok(Math.abs(hull.boundingBox.min.x+spec.length/2)<.00001,'hull origin must be at the longitudinal center');
  hull.dispose();
}
for(const {nav,time} of sample.poses) {
  const rendered=navigationPose(nav,time);
  for(let i=0;i<3;i++)assert.ok(Math.abs(rendered.p[i]-nav.position[i])<1e-7,'renderer and server positions differ');
  assert.ok(Math.abs(Math.atan2(Math.sin(rendered.heading-nav.heading),Math.cos(rendered.heading-nav.heading)))<1e-7,'renderer and server orientations differ');
}
console.log(`Verified ${sample.poses.length} server/render poses and ${sample.specs.length} hull specifications.`);
