import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { harbor } from './assets';

// A deliberately schematic coastal backdrop. It evokes Dalian's bay, wooded
// ridges and port-facing urban edge; it is not a surveyed terrain or GIS mesh.
const shore = (x:number) => -860 + 78*Math.sin(x*.0019) + 38*Math.sin(x*.0041+1.2);
export function backdropHeight(x:number,z:number) {
  const inland=Math.max(0,(shore(x)-z)/480);
  if(inland<=0)return -.6;
  const ridge=(cx:number,cz:number,rx:number,rz:number,h:number)=>h*Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2)*1.25);
  const hills=ridge(-1240,-2140,740,750,175)+ridge(80,-2330,920,790,137)+ridge(1320,-1900,670,750,162);
  const folds=12*Math.sin(x*.008+z*.003)+8*Math.sin(x*.015-z*.006);
  return Math.max(0,Math.min(1,inland)*5+Math.max(0,hills+folds)*Math.min(1,inland*.75));
}

function seeded(i:number){const x=Math.sin(i*127.1+13.7)*43758.5453;return x-Math.floor(x);}

function terrainGeometry(){
  const g=new THREE.PlaneGeometry(5200,2750,144,76);
  g.rotateX(-Math.PI/2);
  g.translate(0,0,-1925);
  const p=g.attributes.position,colors:number[]=[];
  const coastal=new THREE.Color('#737e73'),grass=new THREE.Color('#3f6550'),wooded=new THREE.Color('#2c5242'),rock=new THREE.Color('#65746c');
  const c=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),h=backdropHeight(x,z);
    p.setY(i,h-.45);
    if(h<8)c.copy(coastal);
    else if(h<55)c.copy(grass).lerp(wooded,Math.min(1,(h-8)/70));
    else c.copy(wooded).lerp(rock,Math.min(.58,(h-55)/220));
    const grain=(seeded(i)*.12)-.06;c.offsetHSL(0,0,grain);
    colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();
  return g;
}

type Place={x:number;y:number;z:number;w:number;h:number;d:number;color:THREE.Color};
function buildings(){
  const out:Place[]=[],palette=['#8b9d99','#839a9b','#a0a69b','#788e94','#919c91'];
  for(let row=0;row<10;row++)for(let col=0;col<42;col++){
    const i=row*42+col,x=-1800+col*86+(seeded(i+40)-.5)*18,z=-1120-row*96+(seeded(i+240)-.5)*15;
    if(seeded(i+100)<.42||Math.abs(x)<780&&row<2)continue;
    const ground=backdropHeight(x,z);if(ground>62)continue;
    const h=10+Math.pow(seeded(i+343),2.5)*55,w=17+seeded(i+455)*22,d=16+seeded(i+566)*23;
    out.push({x,y:ground+h/2,z,w,h,d,color:new THREE.Color(palette[Math.floor(seeded(i+680)*palette.length)])});
  }
  return out;
}

function City(){
  const places=useMemo(buildings,[]);
  const geometry=useMemo(()=>new THREE.BoxGeometry(1,1,1),[]);
  const facade=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#dce2df';ctx.fillRect(0,0,256,256);for(let row=0;row<13;row++)for(let col=0;col<8;col++){const on=seeded(row*11+col+932)>.68;ctx.fillStyle=on?'#93a9ac':'#587480';ctx.fillRect(7+col*31,7+row*19,19,10);ctx.fillStyle='#edf0e9';ctx.fillRect(7+col*31,17+row*19,19,2);}const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;},[]);
  const materials=useMemo(()=>{const wall=new THREE.MeshStandardMaterial({map:facade,metalness:.03,roughness:.79});const roof=new THREE.MeshStandardMaterial({color:'#b7c4c2',metalness:.08,roughness:.86});return [wall,wall,roof,roof,wall,wall];},[facade]);
  const mesh=useMemo(()=>{
    const m=new THREE.InstancedMesh(geometry,materials,places.length),matrix=new THREE.Matrix4();
    places.forEach((b,i)=>{matrix.makeScale(b.w,b.h,b.d);matrix.setPosition(b.x,b.y,b.z);m.setMatrixAt(i,matrix);m.setColorAt(i,b.color);});
    m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();return m;
  },[geometry,materials,places]);
  useEffect(()=>()=>{geometry.dispose();facade.dispose();materials[0].dispose();materials[2].dispose();mesh.dispose();},[geometry,facade,materials,mesh]);
  return <primitive object={mesh}/>;
}

function TreeBelt(){
  const places=useMemo(()=>{
    const out:{x:number;y:number;z:number;r:number}[]=[];
    for(let i=0;i<470;i++){
      const x=-2500+seeded(i+2000)*5000,z=-1450-seeded(i+3000)*1750,h=backdropHeight(x,z);
      if(h<24||h>185)continue;
      out.push({x,y:h,z,r:3+seeded(i+4000)*5});
    }
    return out;
  },[]);
  const geometry=useMemo(()=>new THREE.ConeGeometry(1,1,5),[]);
  const material=useMemo(()=>new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1}),[]);
  const mesh=useMemo(()=>{
    const m=new THREE.InstancedMesh(geometry,material,places.length),matrix=new THREE.Matrix4();
    places.forEach((p,i)=>{matrix.makeScale(p.r,p.r*2.4,p.r);matrix.setPosition(p.x,p.y+p.r,p.z);m.setMatrixAt(i,matrix);m.setColorAt(i,new THREE.Color(i%3===0?'#426a52':i%3===1?'#557959':'#3e634f'));});
    m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();return m;
  },[geometry,material,places]);
  useEffect(()=>()=>{geometry.dispose();material.dispose();mesh.dispose();},[geometry,material,mesh]);
  return <primitive object={mesh}/>;
}

export default function DalianBackdrop(){
  const geometry=useMemo(terrainGeometry,[]);
  const source=useTexture([harbor('aerial_grass_rock_diff.jpg'),harbor('aerial_grass_rock_nor_gl.jpg'),harbor('aerial_grass_rock_rough.jpg')]);
  const maps=useMemo(()=>source.map((texture,i)=>{const copy=texture.clone();copy.wrapS=copy.wrapT=THREE.RepeatWrapping;copy.repeat.set(9,5);copy.anisotropy=8;if(i===0)copy.colorSpace=THREE.SRGBColorSpace;copy.needsUpdate=true;return copy;}),[source]);
  useEffect(()=>()=>{geometry.dispose();maps.forEach(map=>map.dispose());},[geometry,maps]);
  return <group><mesh geometry={geometry} receiveShadow><meshStandardMaterial map={maps[0]} normalMap={maps[1]} roughnessMap={maps[2]} normalScale={new THREE.Vector2(.2,.2)} vertexColors roughness={1} side={THREE.DoubleSide}/></mesh><City/><TreeBelt/></group>;
}
