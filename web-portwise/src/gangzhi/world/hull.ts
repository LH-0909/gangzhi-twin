import * as THREE from 'three';

export const HULL_SECTIONS: Array<[number,number]> = [[-.5,.8],[-.47,.98],[-.35,1],[.2,1],[.33,.95],[.42,.69],[.48,.28],[.5,.015]];
export const WATER_LEVEL = -.12;

export function hullGeometry(length:number,beam:number,draft:number) {
  const sections=HULL_SECTIONS;
  // Model origin is at mean water level; draft is measured down from y=-0.12.
  const water=WATER_LEVEL,mid=water-draft*.625,keel=water-draft;
  const profile=[[10,-.44],[7,-.50],[water,-.49],[mid,-.42],[keel,-.26],[keel,.26],[mid,.42],[water,.49],[7,.50],[10,.44]];
  const p:number[]=[],uv:number[]=[],groups:Array<{start:number;count:number;materialIndex:number}>=[];
  const vertex=(point:number[])=>{p.push(...point);uv.push(point[0]/length+.5,Math.max(0,Math.min(1,(point[1]+draft)/(10+draft))));};
  const face=(a:number[],b:number[],c:number[])=>{vertex(a);vertex(b);vertex(c);};
  for(let s=0;s<sections.length-1;s++)for(let r=0;r<profile.length-1;r++) {
    const make=(si:number,ri:number)=>[sections[si][0]*length,profile[ri][0],profile[ri][1]*beam*sections[si][1]];
    const a=make(s,r),b=make(s+1,r),c=make(s+1,r+1),d=make(s,r+1),start=p.length/3;
    face(a,d,b);face(b,d,c);groups.push({start,count:6,materialIndex:(profile[r][0]+profile[r+1][0])/2<water?1:0});
  }
  // Close the weather deck; it follows the tapered bow instead of a rectangular slab.
  for(let s=0;s<sections.length-1;s++){const a=[sections[s][0]*length,10,-.44*beam*sections[s][1]],b=[sections[s+1][0]*length,10,-.44*beam*sections[s+1][1]],c=[b[0],10,-b[2]],d=[a[0],10,-a[2]],start=p.length/3;face(a,b,d);face(b,c,d);groups.push({start,count:6,materialIndex:2});}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));for(const group of groups)g.addGroup(group.start,group.count,group.materialIndex);g.computeVertexNormals();return g;
}
