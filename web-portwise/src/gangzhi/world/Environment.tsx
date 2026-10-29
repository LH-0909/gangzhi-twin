import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, useEnvironment, useTexture } from '@react-three/drei';
import { Water } from 'three/addons/objects/Water.js';
import * as THREE from 'three';
import { Model, ModelMesh, Pick, Sign } from './kit';
import { QUAY_Y, YARD_BLOCKS } from './layout';

const sunDirection=new THREE.Vector3(-.55,.78,.42).normalize();
function daylight(time:number,auto:boolean,night:boolean) {return auto?THREE.MathUtils.smoothstep(Math.sin(((8+time/3600)%24-6)/12*Math.PI),-.08,.18):night?0:1;}
function SkyDome({night,clock,autoLight}:{night:boolean;clock:React.RefObject<number>;autoLight:boolean}) {
  const map=useEnvironment({files:'/assets/harbor/daylight.hdr'});
  const uniforms=useMemo(()=>({uMap:{value:map},uNight:{value:night?1:0}}),[map]);
  uniforms.uNight.value=night?1:0;
  useFrame(()=>{uniforms.uNight.value=1-daylight(clock.current,autoLight,night);});
  return <mesh renderOrder={-1000}><sphereGeometry args={[12000,64,32]}/><shaderMaterial side={THREE.BackSide} depthWrite={false} uniforms={uniforms} vertexShader={`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`} fragmentShader={`uniform sampler2D uMap;uniform float uNight;varying vec2 vUv;void main(){vec3 c=texture2D(uMap,vec2(fract(vUv.x+.175),vUv.y)).rgb;float l=dot(c,vec3(.2126,.7152,.0722));float blue=clamp((c.b-c.r)/max(.001,l),0.,1.);c=mix(c,c*vec3(.22,.75,1.12),blue*.88);c*=mix(1.1,.025,uNight);gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`}/></mesh>;
}
export function HarbourAtmosphere({night,scenario,clock,autoLight}:{night:boolean;scenario:string;clock:React.RefObject<number>;autoLight:boolean}) {
  const sun=useRef<THREE.DirectionalLight>(null),sky=useRef<THREE.HemisphereLight>(null);
  const dayColor=useMemo(()=>new THREE.Color('#fff3db'),[]),nightColor=useMemo(()=>new THREE.Color('#b5c9ed'),[]);
  useFrame(({scene})=>{const d=daylight(clock.current,autoLight,night),angle=((8+clock.current/3600)%24-6)/12*Math.PI;if(sun.current){if(autoLight)sun.current.position.set(-Math.cos(angle)*1400,Math.max(180,Math.sin(angle)*1400),600);sun.current.intensity=THREE.MathUtils.lerp(.35,3.4,d);sun.current.color.copy(nightColor).lerp(dayColor,d);}if(sky.current)sky.current.intensity=THREE.MathUtils.lerp(.12,.55,d);scene.environmentIntensity=THREE.MathUtils.lerp(.16,.46,d);if(scene.fog instanceof THREE.Fog)scene.fog.color.set('#0c2438').lerp(new THREE.Color(scenario==='fog'?'#adc0c7':'#b8cfe0'),d);});
  return <><SkyDome clock={clock} autoLight={autoLight} night={night}/><Environment files="/assets/harbor/daylight.hdr" background={false} environmentIntensity={.46} environmentRotation={[0,1.1,0]} backgroundRotation={[0,1.1,0]}/><fog attach="fog" args={['#b8cfe0',scenario==='fog'?110:1400,scenario==='fog'?1600:7500]}/><ambientLight intensity={.12}/><hemisphereLight ref={sky} args={['#c9dff0','#647572',.55]}/><directionalLight ref={sun} position={[-750,1200,600]} intensity={3.4} color="#fff3db" castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-1000} shadow-camera-right={1000} shadow-camera-top={850} shadow-camera-bottom={-850} shadow-camera-far={2900} shadow-bias={-.00015} shadow-normalBias={.16}/></>;
}
export function Ocean({clock,night,storm,quality,autoLight}:{clock:React.RefObject<number>;night:boolean;storm:boolean;quality:'standard'|'high';autoLight:boolean}) {
  const normals=useTexture('/assets/harbor/waternormals.jpg');
  const water=useMemo(()=>{normals.wrapS=normals.wrapT=THREE.RepeatWrapping;const w=new Water(new THREE.PlaneGeometry(30000,30000),{textureWidth:quality==='high'?512:256,textureHeight:quality==='high'?512:256,waterNormals:normals,sunDirection,sunColor:'#fff0dc',waterColor:'#10566c',distortionScale:2.5,fog:true});w.rotation.x=-Math.PI/2;w.position.y=-.12;w.material.uniforms.size.value=9;w.material.fragmentShader=w.material.fragmentShader.replace('noise.xzy * vec3( 1.5, 1.0, 1.5 )','noise.xzy * vec3( 0.6, 1.0, 0.6 )').replace('vec3 outgoingLight = albedo;','vec3 outgoingLight = mix(albedo * vec3(0.40, 0.65, 0.90), waterColor * 2.0, 0.55);');return w;},[normals,quality]);
  useFrame(()=>{const d=daylight(clock.current,autoLight,night),angle=((8+clock.current/3600)%24-6)/12*Math.PI;water.material.uniforms.time.value=clock.current*.4;water.material.uniforms.distortionScale.value=storm?3.5:1.6;water.material.uniforms.waterColor.value.set('#041a31').lerp(new THREE.Color('#00679e'),d);water.material.uniforms.sunColor.value.set('#617d9e').lerp(new THREE.Color('#fff0dc'),d);if(autoLight)water.material.uniforms.sunDirection.value.set(-Math.cos(angle),Math.max(.15,Math.sin(angle)),.42).normalize();});
  useEffect(()=>()=>{water.geometry.dispose();water.material.dispose();},[water]);
  return <primitive object={water}/>;
}
function usePavement(name:string,w:number,d:number,tile:number) {
  const maps=useTexture([`/assets/harbor/${name}_diff.jpg`,`/assets/harbor/${name}_nor_gl.jpg`,`/assets/harbor/${name}_rough.jpg`]);
  return useMemo(()=>{const textures=maps.map((t,i)=>{const c=t.clone();c.wrapS=c.wrapT=THREE.RepeatWrapping;c.repeat.set(w/tile,d/tile);c.anisotropy=8;if(i===0)c.colorSpace=THREE.SRGBColorSpace;return c;});const material=new THREE.MeshStandardMaterial({map:textures[0],normalMap:textures[1],roughnessMap:textures[2],roughness:1,normalScale:new THREE.Vector2(.3,.3),color:name==='concrete_floor'?'#d8dedf':'#adb5b8'});if(name==='concrete_floor')material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat luma=dot(diffuseColor.rgb,vec3(.299,.587,.114));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(luma)*vec3(.98,1.,1.04),.95);');};return material;},[maps[0],maps[1],maps[2],w,d,tile,name]);
}
function Surface({x,z,w,d,asphalt=false,y=QUAY_Y+.04}:{x:number;z:number;w:number;d:number;asphalt?:boolean;y?:number}) {const material=usePavement(asphalt?'asphalt_02':'concrete_floor',w,d,asphalt?18:22);return <mesh position={[x,y,z]} rotation={[-Math.PI/2,0,0]} material={material} receiveShadow><planeGeometry args={[w,d]}/></mesh>;}
const markings=(()=>{const m=new Model();
  // Quay edge, rail tracks and expansion joints are geometry on the apron.
  m.box([0,QUAY_Y+.08,-.8],[1300,.05,.35],'#d6b251');
  for(const z of [-12,-43]){m.box([0,QUAY_Y+.09,z],[1280,.1,.24],'#9b9c95');m.box([0,QUAY_Y+.055,z-1],[1280,.03,.12],'#a8a994');}
  for(let x=-640;x<640;x+=5) {m.box([x,QUAY_Y+.1,-1.7],[2.5,.05,1.2],Math.floor(x/5)%2?'#cab15b':'#454b4c');}
  for(const z of [-72,-195,-260,-325,-390,-455,-520,-575])for(let x=-630;x<630;x+=14)m.box([x,QUAY_Y+.1,z],[6,.04,.22],'#e0dfc8');
  for(const x of [-620,-350,-165,20,205,390,590])for(let z=-610;z<-70;z+=15)m.box([x,QUAY_Y+.11,z],[.22,.04,6],'#dfddc6');
  for(let x=-650;x<650;x+=32)m.box([x,QUAY_Y+.055,-25],[.035,.025,48],'#696e6b');
  for(const b of YARD_BLOCKS){for(const z of [-17,20])m.box([b.x,QUAY_Y+.13,b.z+z],[136,.05,.22],'#dbce95');for(const x of [-68,68])m.box([b.x+x,QUAY_Y+.13,b.z+1.5],[.22,.05,37],'#dbce95');}
  // Fender panels, bollards and quay-side utility cabinets.
  for(let x=-630;x<=630;x+=18){m.box([x,1.8,.45],[3.2,3.1,1.2],'#343d3e');m.box([x,QUAY_Y+.3,-3],[1.9,.6,1.9],'#6d7470');m.cyl([x,QUAY_Y+.9,-3],[.8,1.2,.8],'#655d42');m.box([x,QUAY_Y+1.5,-3],[1.5,.3,.6],'#74694c');}
  for(let x=-580;x<610;x+=160){m.cyl([x,QUAY_Y+15,-87],[.35,30,.35],'#c6cecb');m.box([x,QUAY_Y+30,-87],[8,.4,1.5],'#9caeae');for(const xx of [-3,0,3])m.box([x+xx,QUAY_Y+29.6,-87],[1.8,.3,1.5],'#e1dfb6');}
  return m;
})();
function warehouseModel(w:number,d:number) {const m=new Model(),wall='#a9b5b8';m.box([0,11,0],[w,22,d],wall).box([0,22.2,0],[w+2,.6,d+2],'#8d9b9d');for(let x=-w/2+5;x<w/2;x+=10){m.box([x,8,d/2+.08],[6,13,.15],'#4a626d').box([x,3,d/2+3],[7,.5,6],'#b7bdba');m.box([x,22.7,0],[7,.18,d*.8],'#2b5369');}for(let z=-d/2;z<=d/2;z+=4)m.box([0,22.6,z],[w+1,.15,.08],'#d2d6cc');return m;}
const warehouse=warehouseModel(165,48),cold=warehouseModel(108,65);
function BulkSilos(){const m=useMemo(()=>{const b=new Model();for(const x of [-40,-20,0,20,40])for(const z of [-14,14]){b.cyl([x,22,z],[17,44,17],'#b7beb6');b.cyl([x,44.3,z],[17.8,.7,17.8],'#d9d9cc');b.beam([x-7,1,z+7],[x-7,46,z+7],.14,'#d6bf72');}b.box([0,47,0],[105,2,4],'#9caeac');b.beam([0,45,0],[70,12,60],3,'#879b99');return b;},[]);return <group position={[-550,QUAY_Y,-620]}><ModelMesh model={m}/><Sign text="散粮与食品储运" p={[0,35,23]} w={65} h={5}/></group>;}
function EnergySite(){const model=useMemo(()=>{const m=new Model();for(const x of [-26,26])for(const z of [-22,22]){m.cyl([x,12,z],[35,24,35],'#b6c1bc');m.cyl([x,24.2,z],[35.4,.6,35.4],'#cfd4ca');m.rail([x-12,24.6,z-12],[x+12,24.6,z-12]);m.beam([x,25,z],[x,29,z],.2,'#c6c9be');}for(const z of [-9,-3,3,9])m.beam([-60,3,z],[65,3,z],.45,'#a9b5a7');m.box([65,7,0],[16,14,26],'#aebdb7');return m;},[]);return <group position={[540,QUAY_Y,-620]}><ModelMesh model={model}/></group>;}
function Hinterland(){const geometry=useMemo(()=>{const g=new THREE.PlaneGeometry(10000,2500,80,30);g.rotateX(-Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,Math.max(0,Math.sin(x*.0024)+Math.cos(z*.004+x*.001))*65+8);}g.computeVertexNormals();return g;},[]);return <mesh geometry={geometry} position={[0,-2,-2200]}><meshStandardMaterial color="#718c7a" roughness={1}/></mesh>;}
function IndustrialHorizon(){const model=useMemo(()=>{const m=new Model();for(let row=0;row<12;row++)for(let col=0;col<32;col++){const n=row*32+col,h=8+(n*17%25);m.box([-3000+col*185,h/2,-1600-row*195],[80+n%40,h,65+n%30],['#8d9c9c','#9daba6','#829599','#b2bab0'][n%4]);if(n%11===0)m.cyl([-3000+col*185+50,h+15,-1600-row*195],[3,60,3],'#b5b7aa');}return m;},[]);return <ModelMesh model={model} castShadow={false}/>;}
export function PortTerrain({onSelect}:{onSelect:(id:string)=>void}) {return <><mesh position={[0,1.4,-325]} receiveShadow><boxGeometry args={[1300,5.6,650]}/><meshStandardMaterial color="#788b8d" roughness={.96}/></mesh><Surface x={0} z={-325} w={1300} d={650}/>{[-72,-195,-260,-325,-390,-455,-520,-575].map(z=><Surface key={z} x={0} z={z} w={1290} d={18} asphalt y={QUAY_Y+.07}/>)}<ModelMesh model={markings}/>{[-330,-140,50,240].map(x=><group key={x} position={[x,QUAY_Y,-615]}><ModelMesh model={warehouse}/></group>)}<Pick id="RF-01" onSelect={onSelect}><group position={[550,QUAY_Y,-480]}><ModelMesh model={cold}/><Sign text="大连海洋冷链中心" p={[0,16,32.7]} w={69} h={5}/></group></Pick><Pick id="ZONE-BULK" onSelect={onSelect}><BulkSilos/></Pick><Pick id="SP-01" onSelect={onSelect}><EnergySite/></Pick>{YARD_BLOCKS.map(b=><Sign key={b.id} text={b.id} p={[b.x-79,QUAY_Y+.15,b.z]} rotation={[-Math.PI/2,0,Math.PI/2]} w={16} h={7} background="#6e7771" color="#ddd4a7" size={110}/>)}<mesh position={[0,.5,-5000]}><boxGeometry args={[18000,2,10000]}/><meshStandardMaterial color="#768875" roughness={1}/></mesh><IndustrialHorizon/></>;}
