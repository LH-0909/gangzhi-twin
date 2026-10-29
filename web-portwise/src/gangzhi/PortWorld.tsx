/**
 * 港智孪生 / Dalian coastal operations diorama.
 * Original procedural scene authored for Gangzhi Twin. The small Box/Beam
 * composition pattern is inspired by Portwise (MIT), retained in THIRD_PARTY_NOTICES.
 * All geometry, labels, motion and materials are local; no remote model/font CDN.
 */
import { Component, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

export interface PortWorldProps {
  resetKey?: number;
  scenario: string; running: boolean; speed: number; simTime: number;
  selected: string | null; onSelect: (id: string) => void;
  layer: 'all' | 'equipment' | 'routes' | 'energy';
  view: 'overview' | 'berth' | 'yard' | 'sea'; night: boolean;
  vessels?: Array<{ id: string; status: string; berth_id: string | null; progress: number; type: string; name: string; arrived?: boolean }>;
  equipment?: Array<{ id: string; status: string; utilization: number }>;
}
type V3 = [number, number, number];
type ClockRef = MutableRefObject<number>;
const CYAN = '#208e91';
const BLUE = '#427f9e';
const GOLD = '#e6a352';
const palette = ['#407e93', '#c97e52', '#d9bd78', '#6e9e88', '#566d91', '#ae665c', '#8bb1b1', '#dab085'];
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

function Box({ p = [0, 0, 0], s = [1, 1, 1], c = '#6b91a0', glow = false, r = [0, 0, 0] }: { p?: V3; s?: V3; c?: string; glow?: boolean; r?: V3 }) {
  return <mesh geometry={boxGeometry} position={p} scale={s} rotation={r} castShadow receiveShadow><meshStandardMaterial color={c} roughness={0.7} metalness={0.22} emissive={glow ? c : '#000000'} emissiveIntensity={glow ? 1.25 : 0}/></mesh>;
}
function Beam({ a, b, width = .38, color = '#9bc3c7' }: { a: V3; b: V3; width?: number; color?: string }) {
  const data = useMemo(() => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    return { p: start.add(end).multiplyScalar(.5), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()), length: delta.length() };
  }, [a[0], a[1], a[2], b[0], b[1], b[2]]);
  return <mesh geometry={boxGeometry} position={data.p} quaternion={data.q} scale={[width, data.length, width]} castShadow><meshStandardMaterial color={color} roughness={.6} metalness={.3}/></mesh>;
}
function Interactive({ id, onSelect, children }: { id: string; onSelect: PortWorldProps['onSelect']; children: ReactNode }) {
  return <group onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(id); }} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>{children}</group>;
}
function Label({ text, p, color = '#537d88', width = 18 }: { text: string; p: V3; color?: string; width?: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 120;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(252, 253, 247, .94)'; ctx.beginPath(); ctx.roundRect(2, 4, 764, 108, 14); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = .65; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#315866'; ctx.font = '500 43px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 384, 60);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={p} scale={[width, width * .156, 1]}><spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false}/></sprite>;
}
function Beacon({ p, color = CYAN, size = .45 }: { p: V3; color?: string; size?: number }) {
  return <mesh position={p}><sphereGeometry args={[size, 8, 6]}/><meshBasicMaterial color={color}/></mesh>;
}
function Ring({ p, size = 7, color = CYAN, clock }: { p: V3; size?: number; color?: string; clock?: ClockRef }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(() => { if (ring.current && clock) { const s = 1 + Math.sin(clock.current * .7) * .05; ring.current.scale.setScalar(s); } });
  return <group position={p}><mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[size - .13, size + .13, 64]}/><meshBasicMaterial color={color} transparent opacity={.85} depthWrite={false}/></mesh><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[size - .65, size - .5, 64]}/><meshBasicMaterial color={color} transparent opacity={.25}/></mesh></group>;
}

function Sea({ clock, scenario, night }: { clock: ClockRef; scenario: string; night: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uWind: { value: 0 }, uNight: { value: 0 } }), []);
  useFrame(() => { if (material.current) { material.current.uniforms.uNight.value = night ? 1 : 0; material.current.uniforms.uTime.value = clock.current; material.current.uniforms.uWind.value = scenario === 'wind' ? 1 : 0; } });
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.3, 0]}><planeGeometry args={[2000, 2000, 1, 1]}/><shaderMaterial ref={material} uniforms={uniforms} vertexShader={`varying vec2 vUv; varying vec3 vPos; void main(){vUv=uv;vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`} fragmentShader={`precision highp float; uniform float uTime; uniform float uWind; uniform float uNight; varying vec2 vUv; varying vec3 vPos;
    void main(){vec2 p=vPos.xy;float t=uTime*.04;float w=sin(p.x*.16+t)*sin(p.y*.21-t*.7);float detail=sin(p.x*.54+p.y*.27+t*2.);vec3 deep=mix(vec3(.43,.66,.71),vec3(.035,.14,.20),uNight);vec3 shallow=mix(vec3(.57,.77,.75),vec3(.07,.28,.32),uNight);float rad=1.-smoothstep(40.,240.,length(p-vec2(0.,25.)));vec3 c=mix(deep,shallow,rad*.75);c+=vec3(.04,.14,.15)*pow(max(0.,w*.5+.5),14.)*.38;c+=vec3(.04,.13,.14)*pow(max(0.,detail),22.)*(.1+uWind*.18);float gx=1.-smoothstep(.0,.12,abs(mod(p.x+10.,20.)-10.));float gy=1.-smoothstep(.0,.12,abs(mod(p.y+10.,20.)-10.));c+=vec3(.02,.07,.075)*max(gx,gy)*.18;gl_FragColor=vec4(c,1.);}`}/></mesh>;
}

const containerData = (() => {
  const list: { p: V3; color: string }[] = [];
  for (let block = 0; block < 6; block++) {
    const bx = -52 + (block % 3) * 37, bz = -39 - Math.floor(block / 3) * 18;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
      const tiers = 1 + ((col * 3 + row + block * 2) % 3);
      for (let tier = 0; tier < tiers; tier++) list.push({ p: [bx + col * 6.2, 2 + tier * 2.3, bz - row * 2.65], color: palette[(col + row * 3 + block + tier) % palette.length] });
    }
  }
  return list;
})();
function ContainerYard({ onSelect, highlighted }: { onSelect: PortWorldProps['onSelect']; highlighted: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    containerData.forEach((item, i) => { matrix.compose(new THREE.Vector3(...item.p), new THREE.Quaternion(), new THREE.Vector3(5.8, 2.15, 2.4)); mesh.current!.setMatrixAt(i, matrix); mesh.current!.setColorAt(i, new THREE.Color(item.color)); });
    mesh.current.instanceMatrix.needsUpdate = true; if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, []);
  return <Interactive id="ZONE-CONTAINER" onSelect={onSelect}><instancedMesh ref={mesh} args={[boxGeometry, undefined, containerData.length]} castShadow receiveShadow><meshStandardMaterial roughness={.78} metalness={.15}/></instancedMesh>{highlighted && <Ring p={[0, 1.1, -50]} size={45}/>}<Label text="01 / 集装箱作业区" p={[2, 12, -49]} color={CYAN} width={25}/></Interactive>;
}

function Ship({ id, p, rotation = 0, type = 'container', color = '#496e87', selected, onSelect, clock, drifting = false, name, progress = 0 }: { id: string; p: V3; rotation?: number; type?: 'container' | 'bulk' | 'tanker'; color?: string; selected: boolean; onSelect: PortWorldProps['onSelect']; clock: ClockRef; drifting?: boolean; name?: string; progress?: number }) {
  const root = useRef<THREE.Group>(null);
  const firstPosition = useRef<V3>(p);
  const hull = useMemo(() => {
    const shape = new THREE.Shape(); shape.moveTo(-18, -4.4); shape.lineTo(-19.5, -2); shape.lineTo(-19.5, 2); shape.lineTo(-17, 4.4); shape.lineTo(14.8, 4.4); shape.lineTo(20.5, 1.4); shape.lineTo(22, 0); shape.lineTo(20.5, -1.4); shape.lineTo(14.8, -4.4); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 3.6, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .4, bevelThickness: .4 }); g.rotateX(-Math.PI / 2); return g;
  }, []);
  useEffect(() => () => hull.dispose(), [hull]);
  useFrame((_, delta) => { if (root.current) { root.current.position.y = p[1] + Math.sin(clock.current * .2 + p[0]) * .08; if (drifting) { const t = (clock.current * .022 + Number(id.slice(-1)) * .45) % 1; root.current.position.x = p[0] + t * 130 - 65; } else { root.current.position.x = THREE.MathUtils.lerp(root.current.position.x, p[0], Math.min(1, delta * .8)); root.current.position.z = THREE.MathUtils.lerp(root.current.position.z, p[2], Math.min(1, delta * .8)); } } });
  return <group ref={root} position={firstPosition.current} rotation={[0, rotation, 0]}><Interactive id={id} onSelect={onSelect}>
    <mesh geometry={hull} castShadow><meshStandardMaterial color={color} roughness={.48} metalness={.3}/></mesh>
    <Box p={[0, .2, 0]} s={[35, .7, 8.7]} c="#6f3f3e"/>
    <Box p={[-13, 4.6, 0]} s={[5.4, 2, 7.5]} c="#d0d7cb"/><Box p={[-13, 6.3, 0]} s={[4.6, 1.5, 7.7]} c="#d8ded4"/><Box p={[-13, 6.5, 3.91]} s={[4.8, .72, .1]} c="#315d70"/>
    <Box p={[-13, 7.3, 0]} s={[3.4, .35, 8.2]} c="#476b76"/><Box p={[-14, 8.4, 0]} s={[.25, 2, .25]} c="#ced7ce"/><Box p={[-15.5, 7.9, 0]} s={[1.25, 2.3, 1.3]} c="#cf8054"/>
    {type === 'container' ? Array.from({ length: 5 }, (_, col) => Array.from({ length: 3 }, (_, row) => Array.from({ length: col === 4 ? 1 : 2 }, (_, tier) => <Box key={`${col}-${row}-${tier}`} p={[-7.5 + col * 4.7, 4.8 + tier * 2, -2.7 + row * 2.65]} s={[4.35, 1.9, 2.4]} c={palette[(col + row + tier * 3) % palette.length]}/>))) : type === 'bulk' ? [-4, 3, 10].map((x) => <group key={x}><Box p={[x, 3.9, 0]} s={[6, .4, 7]} c="#c0b58f"/><Box p={[x, 4.35, 0]} s={[5.4, .55, 6.3]} c="#3c4e52"/></group>) : [-4, 3, 10].map((x) => <group key={x}><mesh position={[x, 4.5, 0]}><cylinderGeometry args={[2.8, 2.8, 2, 16]}/><meshStandardMaterial color="#acc2b7" metalness={.5} roughness={.5}/></mesh><Box p={[x, 5.6, 0]} s={[.4, .2, 7.5]} c={GOLD}/></group>)}
    <Beacon p={[18, 3.8, 3.8]} color="#5af3bf" size={.22}/><Beacon p={[18, 3.8, -3.8]} color="#ff8c78" size={.22}/>
    {selected && <><Ring p={[0, -.05, 0]} size={25} clock={clock}/><Label text={`${name || id} / ${progress.toFixed(0)}%`} p={[0, 15, 0]} width={23} color={CYAN}/></>}
  </Interactive></group>;
}

function Crane({ id, x, selected, onSelect, clock, held, layer, active = true }: { id: string; x: number; selected: boolean; onSelect: PortWorldProps['onSelect']; clock: ClockRef; held: boolean; layer: string; active?: boolean }) {
  const trolley = useRef<THREE.Group>(null), rope = useRef<THREE.Mesh>(null), container = useRef<THREE.Group>(null);
  const i = Number(id.slice(-2)); const c = held ? '#d7955d' : '#dbe5df';
  useFrame(() => {
    const t = clock.current * .13 + i * 1.9, z = held || !active ? 1 : 4 + Math.sin(t) * 8, drop = held || !active ? 1 : 2.4 + (Math.sin(t * 1.8) + 1) * 2.8;
    if (trolley.current) trolley.current.position.z = z;
    if (rope.current) { rope.current.scale.y = drop; rope.current.position.y = -drop / 2; }
    if (container.current) container.current.position.y = -drop;
  });
  return <group position={[x, 1.2, -5]}><Interactive id={id} onSelect={onSelect}>
    {[-4, 4].map((xx) => <group key={xx}>{[-3.6, 3.6].map((zz) => <group key={zz}><Box p={[xx, .8, zz]} s={[1.4, 1.2, 2.8]} c="#344e5c"/><Beam a={[xx, 1.4, zz]} b={[xx * .68, 16.4, zz * .8]} width={.72} color={c}/></group>)}<Beam a={[xx, 1, -3.6]} b={[xx * .7, 14, 3.6]} width={.22} color={c}/><Beam a={[xx, 1, 3.6]} b={[xx * .7, 14, -3.6]} width={.22} color={c}/></group>)}
    <Box p={[0, 15.8, 3]} s={[8.4, 1.2, 27]} c={c}/><Box p={[0, 16.5, 3]} s={[.3, .25, 27]} c={GOLD}/>
    {[-2.8, 2.8].map((xx) => <group key={xx}><Beam a={[xx, 15, -6]} b={[xx, 24, -3]} width={.55} color={c}/><Beam a={[xx, 24, -3]} b={[xx, 16, 15]} width={.16} color="#b1c4ba"/><Beam a={[xx, 24, -3]} b={[xx, 16, -10]} width={.16} color="#b1c4ba"/><Beam a={[xx, 15, -10]} b={[xx, 16.5, 15]} width={.2} color={c}/></group>)}
    <Box p={[0, 24, -3]} s={[6.2, .5, .6]} c={c}/><Box p={[5.2, 12.4, 2]} s={[2, 2.5, 2.3]} c="#b0c7c8"/><Box p={[5.3, 12.6, 3.2]} s={[1.6, 1.3, .1]} c="#2e7588"/>
    <group ref={trolley} position={[0, 15, 4]}><Box s={[3, 1.1, 2]} c="#d0a267"/><mesh ref={rope} position={[0, -2, 0]}><boxGeometry args={[.12, 1, .12]}/><meshStandardMaterial color="#c7d0c4"/></mesh><group ref={container} position={[0, -5, 0]}><Box s={[5.3, .4, 2.8]} c={GOLD}/>{!held && active && <Box p={[0, -1.3, 0]} s={[5.3, 2.1, 2.5]} c="#c47a4f"/>}</group></group>
    <Beacon p={[0, 24.6, -3]} color={held ? '#ff976a' : active ? CYAN : '#678691'} size={.32}/>
    {(selected || layer === 'equipment') && <Label text={`${id} / ${held ? '作业受限' : active ? '岸桥运行中' : '空闲待命'}`} p={[0, 28, 0]} color={held ? GOLD : CYAN} width={19}/>}
    {selected && <Ring p={[0, .1, 0]} size={8} clock={clock}/>}
  </Interactive></group>;
}

const roadRoute: V3[] = [[-91, 1.6, -17], [91, 1.6, -17], [91, 1.6, -70], [-91, 1.6, -70], [-91, 1.6, -17]];
const detourRoute: V3[] = [[-91, 1.6, -17], [-26, 1.6, -17], [-26, 1.6, -29], [49, 1.6, -29], [49, 1.6, -17], [91, 1.6, -17], [91, 1.6, -70], [-91, 1.6, -70], [-91, 1.6, -17]];
function pointOnRoute(points: V3[], t: number) {
  const total = points.slice(1).reduce((sum, p, i) => sum + new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...points[i])), 0);
  let d = ((t % 1) + 1) % 1 * total;
  for (let i = 1; i < points.length; i++) { const a = new THREE.Vector3(...points[i - 1]), b = new THREE.Vector3(...points[i]), len = a.distanceTo(b); if (d <= len) return { p: a.lerp(b, d / len), angle: Math.atan2(b.z - points[i - 1][2], b.x - points[i - 1][0]) }; d -= len; }
  return { p: new THREE.Vector3(...points[0]), angle: 0 };
}
function AGV({ index, clock, blocked, onSelect, selected, layer, id = `AGV-${String(index + 1).padStart(2, '0')}`, active = true }: { index: number; clock: ClockRef; blocked: boolean; onSelect: PortWorldProps['onSelect']; selected: boolean; layer: string; id?: string; active?: boolean }) {
  const root = useRef<THREE.Group>(null), parkedTime = useRef(clock.current);
  useFrame(() => { if (root.current) { if (active) parkedTime.current = clock.current; const state = pointOnRoute(blocked ? detourRoute : roadRoute, parkedTime.current * .0015 + index / 8); root.current.position.copy(state.p); root.current.rotation.y = -state.angle; } });
  return <group ref={root}><Interactive id={id} onSelect={onSelect}><Box p={[0, .55, 0]} s={[6.4, .7, 2.7]} c="#7eacb4"/><Box p={[-2.5, 1.25, 0]} s={[1.1, 1.5, 2.4]} c="#cee4da"/><Box p={[.8, 1.7, 0]} s={[4.3, 1.55, 2.3]} c={palette[index % palette.length]}/>{[-2, 2].map((x) => [-1.4, 1.4].map((z) => <mesh key={`${x}-${z}`} position={[x, .3, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.5, .5, .3, 8]}/><meshStandardMaterial color="#182c36"/></mesh>))}<Beacon p={[-3.1, 1, 0]} size={.16} color={GOLD}/>{selected && <Ring p={[0, -.2, 0]} size={5} clock={clock}/>}<Line points={[[3.5, .02, 0], [10, .02, 0]]} color={CYAN} transparent opacity={.35} lineWidth={1.2}/>{(selected || layer === 'equipment') && <Label text={id} p={[0, 5, 0]} width={8}/>}</Interactive></group>;
}

function Ground({ onSelect, night, layer, selected }: { onSelect: PortWorldProps['onSelect']; night: boolean; layer: string; selected: string | null }) {
  return <>
    <Box p={[0, -.8, -48]} s={[222, 3.3, 101]} c="#8caaab"/><Box p={[0, 1, -48]} s={[220, .4, 100]} c="#bfc9bc"/>
    <Box p={[0, .9, 1.2]} s={[220, 2, 3]} c="#b0beb2"/><Box p={[0, 1.95, 2.7]} s={[220, .16, .22]} c={GOLD}/>
    {[-79, -28, 25, 77].map((x, i) => <group key={x}><Box p={[x - 22, 2.05, 1]} s={[.2, .15, 1.5]} c={GOLD}/><Label text={`B0${i + 1}`} p={[x, 3.4, -4]} width={6}/>{selected === `B0${i + 1}` && <Ring p={[x, 2.1, 6]} size={23} color={GOLD}/>}</group>)}
    {[-17, -29, -70].map((z) => <group key={z}><Box p={[0, 1.26, z]} s={[208, .12, 5.5]} c="#738e8d"/>{Array.from({ length: 35 }, (_, i) => <Box key={i} p={[-102 + i * 6, 1.34, z]} s={[2.6, .04, .12]} c="#dde1c7"/>)}</group>)}
    {[-91, -65, -26, 49, 91].map((x) => <Box key={x} p={[x, 1.25, -44]} s={[5, .14, 56]} c="#738e8d"/>)}
    {[-74.5, -77].map((z) => <Box key={z} p={[0, 1.35, z]} s={[210, .1, .1]} c="#acb7a4"/>)}
    {Array.from({ length: 70 }, (_, i) => <Box key={i} p={[-105 + i * 3, 1.3, -75.7]} s={[.3, .13, 3.6]} c="#586967"/>)}
    {[-82, -40, 2, 44, 86].map((x) => <group key={x}><Box p={[x, 8, -26]} s={[.25, 13.6, .25]} c="#749b9f"/><Box p={[x, 14.7, -26]} s={[7, .3, .8]} c="#749b9f"/>{[-2.6, 0, 2.6].map((xx) => <Box key={xx} p={[x + xx, 14.4, -25.8]} s={[1.4, .16, .7]} c={night ? '#dcfcd9' : '#d1e3ce'} glow={night}/>)}</group>)}
    <Interactive id="ZONE-BULK" onSelect={onSelect}><group position={[-90, 1.5, -49]}>{[-5, 3].map((x) => [-5, 4].map((z) => <group key={`${x}-${z}`}><mesh position={[x, 5, z]} castShadow><cylinderGeometry args={[3.4, 3.4, 9, 18]}/><meshStandardMaterial color="#d2d8c9" metalness={.3} roughness={.65}/></mesh><mesh position={[x, 10.2, z]}><coneGeometry args={[3.6, 2, 18]}/><meshStandardMaterial color="#e3e2cd"/></mesh><Box p={[x, 5, z + 3.5]} s={[.16, 10, .2]} c={GOLD}/></group>))}<Beam a={[-6, 11, 0]} b={[12, 11, 0]} width={1.1} color="#b6ba95"/><Beam a={[12, 11, 0]} b={[12, 2, 15]} width={1.2} color="#7ba6a6"/><Label text="02 / 散粮作业区" p={[0, 16, 0]} width={23}/>{selected === 'ZONE-BULK' && <Ring p={[0, 0, 0]} size={17}/>}</group></Interactive>
    <Interactive id={layer === 'equipment' ? 'RF-01' : 'ZONE-COLD'} onSelect={onSelect}><group position={[81, 1.4, -48]}><Box p={[0, 5, 0]} s={[24, 10, 26]} c="#d1dfd7"/><Box p={[0, 10.3, 0]} s={[25, .6, 27]} c="#e3e5d5"/>{[-8, -4, 0, 4, 8].map((x) => <group key={x}><Box p={[x, 4, 13.1]} s={[2.8, 6, .2]} c="#254c5e"/><Box p={[x, .3, 15]} s={[3.1, .5, 4]} c="#7faaa9"/><Box p={[x, 10.7, 1]} s={[2.5, .3, 18]} c="#3b6882"/></group>)}<Box p={[0, 8.2, 13.3]} s={[22, .3, .1]} c={CYAN} glow/><Label text="03 / 海洋冷链中心" p={[0, 16, 0]} width={26} color={CYAN}/>{(selected === 'ZONE-COLD' || selected === 'RF-01') && <Ring p={[0, .1, 0]} size={18}/>}</group></Interactive>
    <Interactive id={layer === 'equipment' ? 'SP-01' : 'ZONE-ENERGY'} onSelect={onSelect}><group position={[-80, 1.4, -88]}>{[-8, 5].map((x) => <group key={x}><mesh position={[x, 3.6, 0]} castShadow><cylinderGeometry args={[5.2, 5.2, 7, 24]}/><meshStandardMaterial color="#c7d6cf" metalness={.42} roughness={.48}/></mesh><mesh position={[x, 7.2, 0]}><cylinderGeometry args={[5.4, 5.4, .35, 24]}/><meshStandardMaterial color="#e1e4d3"/></mesh><Box p={[x, 7.5, 0]} s={[.3, .2, 10]} c={GOLD}/></group>)}<Label text="04 / 岸电能源站" p={[0, 13, 0]} width={23} color={layer === 'energy' ? CYAN : '#9bc9d2'}/>{(selected === 'ZONE-ENERGY' || selected === 'SP-01' || layer === 'energy') && <Ring p={[0, .1, 0]} size={17}/>}</group></Interactive>
    {[-35, 8, 49].map((x, i) => <group key={x}><Box p={[x, 5.4, -87]} s={[31, 8.4, 15]} c={i === 1 ? '#adc5bd' : '#c5d4c9'}/><Box p={[x, 9.7, -87]} s={[32, .5, 16]} c="#e0e3d3"/>{Array.from({ length: 6 }, (_, j) => <group key={j}><Box p={[x - 12 + j * 4.8, 10.1, -87]} s={[3.8, .12, 11]} c="#2e5b74"/><Box p={[x - 12 + j * 4.8, 4.3, -79.3]} s={[3, 5, .13]} c="#254354"/></group>)}</group>)}
    <Label text="港铁联运 / RAIL CONNECTION" p={[11, 12, -88]} width={31}/>
    {[0, 1, 2].map((row) => <group key={row} position={[99 + row * 6, 1.5, -88]}>{Array.from({ length: 5 }, (_, j) => <group key={j}><mesh position={[0, .7, j * 3]} castShadow><sphereGeometry args={[1, 8, 6]}/><meshStandardMaterial color="#467c71" roughness={1}/></mesh><Box p={[0, .5, j * 3]} s={[.2, 1, .2]} c="#947b55"/></group>)}</group>)}
  </>;
}

function Rail({ clock }: { clock: ClockRef }) {
  const train = useRef<THREE.Group>(null);
  useFrame(() => { if (train.current) train.current.position.x = ((clock.current * .15) % 200) - 70; });
  return <group ref={train} position={[-70, 1.55, -75.8]}><Box p={[0, 1.5, 0]} s={[7, 2.8, 2.7]} c="#599d9e"/><Box p={[-1, 3.2, 0]} s={[3.3, .8, 2.5]} c="#a4c9bb"/>{Array.from({ length: 6 }, (_, i) => <group key={i} position={[9 + i * 8, 0, 0]}><Box p={[0, .5, 0]} s={[7.6, .5, 2.8]} c="#53666d"/><Box p={[0, 1.9, 0]} s={[7.1, 2.2, 2.5]} c={palette[i]}/>{[-2, 2].map((x) => <Box key={x} p={[x, .18, 0]} s={[1.2, .5, 3]} c="#1c303c"/>)}</group>)}</group>;
}
function Coast({ night }: { night: boolean }) {
  return <>
    {[[-132, -85, 20], [-100, -120, 28], [-50, -127, 23], [8, -134, 18], [58, -122, 26], [120, -111, 31], [151, -64, 19]].map(([x, z, size], i) => <mesh key={i} position={[x, -1, z]} rotation={[0, i * .65, 0]}><coneGeometry args={[size, size * .65, 5]}/><meshStandardMaterial color={night ? '#3a6260' : i % 2 ? '#8fa68c' : '#a0b19a'} flatShading roughness={1}/></mesh>)}
    <group position={[-131, .4, 16]} rotation={[0, -.2, 0]}><Box p={[0, 0, 0]} s={[9, 2, 98]} c="#a1b5ae"/><Box p={[0, .9, 0]} s={[7.5, .5, 98]} c="#d6d6be"/>{Array.from({ length: 14 }, (_, i) => <mesh key={i} position={[5.5, -.3, -45 + i * 7]} rotation={[.4, i * .9, .6]}><dodecahedronGeometry args={[2.8, 0]}/><meshStandardMaterial color="#a9b6a8" flatShading/></mesh>)}<group position={[0, 0, 44]}><mesh position={[0, 5, 0]}><cylinderGeometry args={[1.7, 2.5, 10, 14]}/><meshStandardMaterial color="#c2c8b4"/></mesh><Box p={[0, 6.2, 0]} s={[4, 1.8, 4]} c="#a25242"/><mesh position={[0, 11, 0]}><cylinderGeometry args={[2, 2, 2, 14]}/><meshStandardMaterial color="#68b7ad" emissive={GOLD} emissiveIntensity={night ? .7 : .1}/></mesh><mesh position={[0, 12.5, 0]}><coneGeometry args={[2.4, 1.5, 14]}/><meshStandardMaterial color="#9a5a46"/></mesh><Beacon p={[0, 12, 0]} color={GOLD} size={.5}/></group></group>
    <group position={[143, 0, 0]} rotation={[0, -.6, 0]}><Box p={[0, .2, 0]} s={[6, 2, 75]} c="#9cafa5"/><Box p={[0, 1.4, 0]} s={[5, .4, 75]} c="#c9d0b9"/><Beacon p={[0, 3, 35]} color="#ff9c77"/></group>
    {[-80, -40, 0, 40, 80].map((x, i) => <group key={x} position={[x + 10, 0, 72]}><mesh position={[0, .5, 0]}><cylinderGeometry args={[.6, 1.6, 1.1, 8]}/><meshStandardMaterial color={i % 2 ? '#9d6551' : '#6c9c65'}/></mesh><Box p={[0, 2.2, 0]} s={[.15, 2.5, .15]} c="#8ab4b5"/><Beacon p={[0, 3.7, 0]} size={.23} color={i % 2 ? '#ff9177' : CYAN}/></group>)}
    <Line points={[[-109, .05, 89], [-60, .05, 65], [0, .05, 54], [62, .05, 60], [112, .05, 89]]} color={BLUE} lineWidth={1} transparent opacity={.4} dashed dashScale={1} dashSize={2.5} gapSize={2}/>
  </>;
}

function Routes({ blocked, layer }: { blocked: boolean; layer: string }) {
  const visible = layer === 'all' || layer === 'routes';
  return <group visible={visible}>
    <Line points={blocked ? detourRoute : roadRoute} color={blocked ? GOLD : CYAN} lineWidth={1.7} transparent opacity={.65} dashed dashScale={1} dashSize={2} gapSize={1.3}/>
    {[-79, -28, 25, 77].map((x) => <group key={x}><Line points={[[x, 1.6, -3], [x, 1.6, -17], [x < 0 ? -26 : 49, 1.6, -17], [x < 0 ? -26 : 49, 1.6, -30]]} color={CYAN} lineWidth={1} transparent opacity={.35}/></group>)}
    {blocked && <group position={[14, 1.5, -17]}><Box p={[0, .5, 0]} s={[27, 1, 2]} c="#a34f43"/><Line points={[[-14, 1.1, -1.1], [14, 1.1, 1.1]]} color="#ff8c6d" lineWidth={2}/><Label text="道路受阻 / 已启用绕行" p={[0, 8, 0]} width={25} color={GOLD}/></group>}
  </group>;
}
function Energy({ visible }: { visible: boolean }) {
  return <group visible={visible}>{[-79, -28, 25, 77].map((x) => <group key={x}><Line points={[[-80, 2, -87], [x, 2, -87], [x, 2, -7], [x, 3, 10]]} color="#b8ec83" lineWidth={2} transparent opacity={.55}/><Beacon p={[x, 2.2, -7]} color="#b8ec83" size={.6}/></group>)}<Label text="岸电联供 / 冷链保供" p={[-42, 10, -22]} width={27} color="#c9eda4"/></group>;
}
function Mist({ scenario, clock }: { scenario: string; clock: ClockRef }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => { if (ref.current) ref.current.position.x = Math.sin(clock.current * .015) * 12; });
  if (scenario !== 'fog' && scenario !== 'wind') return null;
  return <group ref={ref}>{Array.from({ length: 14 }, (_, i) => <mesh key={i} position={[-130 + i * 19, 5 + i % 3 * 3, 36 + Math.sin(i) * 40]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[55, 18]}/><meshBasicMaterial color={scenario === 'fog' ? '#b2d0d0' : '#89b7bb'} transparent opacity={scenario === 'fog' ? .045 : .018} depthWrite={false}/></mesh>)}</group>;
}

function Camera({ view, resetKey }: { view: PortWorldProps['view']; resetKey: number }) {
  const { camera, size } = useThree(); const controls = useRef<any>(null); const transition = useRef(0);
  const target = useRef(new THREE.Vector3(0, 0, -24)), eye = useRef(new THREE.Vector3(136, 148, 175));
  useEffect(() => {
    const views: Record<string, { p: V3; t: V3 }> = { overview: { p: [147, 148, 161], t: [22, 0, -17] }, berth: { p: [83, 86, 103], t: [2, 1, 3] }, yard: { p: [62, 100, 40], t: [0, 2, -50] }, sea: { p: [118, 74, 182], t: [0, 0, 42] } };
    const item = views[view], aspect = size.width / Math.max(size.height, 1), extra = aspect < 1.3 ? 1.4 / aspect : 1;
    const look = view === 'overview' && aspect < 1.3 ? new THREE.Vector3(0, 0, -20) : new THREE.Vector3(...item.t);
    target.current.copy(look); eye.current.set(...item.p).sub(new THREE.Vector3(...item.t)).multiplyScalar(extra).add(look); transition.current = 1;
  }, [view, resetKey, size.width, size.height]);
  useFrame((_, delta) => { if (transition.current > 0 && controls.current) { const alpha = Math.min(1, delta * 4); camera.position.lerp(eye.current, alpha); controls.current.target.lerp(target.current, alpha); controls.current.update(); if (camera.position.distanceTo(eye.current) < .2) transition.current = 0; } });
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.08} minDistance={40} maxDistance={440} maxPolarAngle={Math.PI * .47} minPolarAngle={.15} enablePan target={[0, 0, -24]} onStart={() => { transition.current = 0; }}/>
}
function Scene(props: PortWorldProps) {
  const clock = useRef(props.simTime);
  const sync = useRef({ simTime: props.simTime, running: props.running, speed: props.speed, received: performance.now() });
  useEffect(() => {
    const previous = sync.current;
    sync.current = { simTime: props.simTime, running: props.running, speed: props.speed, received: performance.now() };
    // Pause, reset and manual stepping land on the exact server snapshot.
    // During playback, ease small poll corrections to avoid a visible jump.
    if (!props.running || props.simTime < previous.simTime || Math.abs(props.simTime - clock.current) > Math.max(120, props.speed * 4)) clock.current = props.simTime;
  }, [props.simTime, props.running, props.speed]);
  useFrame((_, delta) => {
    const current = sync.current;
    if (!current.running) return;
    // Bound extrapolation if the service disconnects; the last state remains
    // visible rather than letting scene motion diverge from business records.
    const elapsed = Math.min(2.25, (performance.now() - current.received) / 1000);
    const target = current.simTime + elapsed * current.speed;
    clock.current = THREE.MathUtils.lerp(clock.current, target, Math.min(1, delta * 8));
  });
  const { night, scenario, selected, onSelect, layer } = props;
  const berthX: Record<string, number> = { B01: -79, B02: -28, B03: 25, B04: 77 };
  // The API state owns berth assignment and visibility. This fallback is only
  // the initial scene while the first local API request is in flight.
  const vessels: NonNullable<PortWorldProps['vessels']> = props.vessels ?? Array.from({ length: 8 }, (_, i) => ({ id: `V00${i + 1}`, name: `V00${i + 1}`, status: i < 4 ? 'working' : 'waiting', berth_id: i < 4 ? `B0${i + 1}` : null, progress: 0, type: i === 2 ? 'bulk' : i === 3 ? 'tanker' : 'container' }));
  const devices = props.equipment;
  const agvs = devices ? devices.filter((d) => d.id.startsWith('AGV-')) : Array.from({ length: 8 }, (_, i) => ({ id: `AGV-${String(i + 1).padStart(2, '0')}`, status: 'working', utilization: 80 }));
  return <>
    <color attach="background" args={[night ? '#112d3d' : '#b8d5d6']}/>
    <fog attach="fog" args={[scenario === 'fog' ? '#b6cdcb' : night ? '#112d3d' : '#b8d5d6', scenario === 'fog' ? 160 : 260, scenario === 'fog' ? 400 : 650]}/>
    <ambientLight intensity={night ? .85 : 1.4} color={night ? '#99c2d3' : '#edf8f3'}/><hemisphereLight args={['#def2ee', '#81918b', night ? .8 : 1.7]}/>
    <directionalLight position={[55, 120, 95]} intensity={night ? 1.8 : 2.6} color={night ? '#c8d9ed' : '#fff1d6'} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-170} shadow-camera-right={170} shadow-camera-top={150} shadow-camera-bottom={-150} shadow-camera-far={420} shadow-normalBias={.05}/>
    {night && <pointLight position={[0, 24, -30]} color={CYAN} intensity={120} distance={100} decay={1.3}/>}
    <Sea clock={clock} scenario={scenario} night={night}/><Ground onSelect={onSelect} night={night} selected={selected} layer={layer}/><Coast night={night}/>
    <ContainerYard onSelect={onSelect} highlighted={selected === 'ZONE-CONTAINER'}/>
    {vessels.filter((v) => v.status !== 'departed' && v.arrived !== false).map((v) => {
      const i = Math.max(0, Number(v.id.slice(1)) - 1);
      const atBerth = v.berth_id && (v.status === 'working' || v.status === 'berthing');
      const p: V3 = atBerth ? [berthX[v.berth_id!] ?? 0, .1, 13] : [[-107, -52, 3, 58][i % 4], .1, 54 + Math.floor(i / 4) * 25];
      return <Ship key={v.id} id={v.id} name={v.name} progress={v.progress} p={p} rotation={atBerth ? 0 : -.12} color={['#3e7490', '#557f89', '#6d827c', '#9c715b'][i % 4]} type={v.type === 'bulk' ? 'bulk' : v.type === 'tanker' ? 'tanker' : 'container'} selected={selected === v.id} onSelect={onSelect} clock={clock}/>;
    })}
    {[-87, -71, -36, -20, 17, 34].map((x, i) => {
      const id = `QC-${String(i + 1).padStart(2, '0')}`, device = devices?.find((d) => d.id === id);
      const held = device ? device.status === 'fault' || device.status === 'weather_hold' : scenario === 'wind' || (scenario === 'crane_fault' && i === 1);
      return <Crane key={id} id={id} x={x} selected={selected === id} onSelect={onSelect} clock={clock} held={held} active={device ? device.status === 'working' : !held} layer={layer}/>;
    })}
    {agvs.map((device, i) => <AGV key={device.id} id={device.id} index={i} clock={clock} blocked={scenario === 'road_block'} selected={selected === device.id} active={device.status === 'working'} onSelect={onSelect} layer={layer}/>)}
    <Rail clock={clock}/><Routes blocked={scenario === 'road_block'} layer={layer}/><Energy visible={layer === 'energy'}/><Mist scenario={scenario} clock={clock}/><Camera view={props.view} resetKey={props.resetKey??0}/>
  </>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div role="status" style={{ height: '100%', display: 'grid', placeContent: 'center', textAlign: 'center', color: '#4f7e87', padding: 30 }}><strong>三维引擎暂时无法加载</strong><p>请开启浏览器硬件加速后刷新。运行数据和调度实验仍可使用。</p></div> : this.props.children; }
}
export default function PortWorld(props: PortWorldProps) {
  return <SceneBoundary><Canvas shadows={{type:THREE.PCFShadowMap}} dpr={[1, 1.6]} camera={{ position: [147, 148, 161], fov: 40, near: 1, far: 1200 }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1; }} fallback={<div role="status" style={{ color: '#4f7e87', padding: 30 }}>浏览器未提供 WebGL。请开启硬件加速查看三维港区。</div>}><Scene {...props}/></Canvas></SceneBoundary>;
}
