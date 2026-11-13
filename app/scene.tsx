import {useEffect,useRef} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {createExplosionLayout} from './explosion-layout';
import {decodeModelResponse} from './model-download';
import {PointerTap} from './pointer-tap';
import {SYSTEMS,type Atlas,type SceneState,type SystemId,getSystemTier,computeAnatomicalScale} from './anatomy';

interface Props {
 atlas:Atlas;
 state:SceneState;
 onSelect:(id:string)=>void;
 onPeelChange?:(n:number)=>void;
 onProgress:(n:number)=>void;
 onError:(s:string)=>void;
}

export default function AnatomyScene({atlas,state,onSelect,onPeelChange,onProgress,onError}:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(state),select=useRef(onSelect),peelChange=useRef(onPeelChange);
 latest.current=state;select.current=onSelect;peelChange.current=onPeelChange;

 useEffect(()=>{
  const el=host.current!;let disposed=false,frame=0,dirty=true,ready=false,lastView='',lastReset=-1,lastIsolate='',layoutKey='',amount=0;
  let lastState:SceneState|null=null;
  const abort=new AbortController();
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{onError('This browser could not start the 3D viewer. Please try a browser with WebGL enabled.');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<768?1.5:2));renderer.setClearColor('#f2f3f3');renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Interactive human anatomy. Drag to orbit, pinch or scroll to zoom, and tap a structure to inspect it.');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.005,100),controls=new OrbitControls(camera,renderer.domElement);
  camera.position.set(1.2,1.02,3.4);controls.target.set(0,.88,0);controls.enableDamping=true;controls.dampingFactor=.085;controls.minDistance=.07;controls.maxDistance=40;controls.minPolarAngle=.05;controls.maxPolarAngle=Math.PI*.95;controls.rotateSpeed=.85;controls.addEventListener('change',()=>{dirty=true;});
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xffffff,0xa7acb2,1.05));
  const key=new T.DirectionalLight(0xfffaf4,2.3);key.position.set(-2,4,3);scene.add(key);
  const rim=new T.DirectionalLight(0xe9f0ff,1.8);rim.position.set(2,2,-3);scene.add(rim);
  const ground=new T.Mesh(new T.CircleGeometry(30,96),new T.MeshStandardMaterial({color:0xd5d9dc,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.019;scene.add(ground);
  const platform=new T.Mesh(new T.CylinderGeometry(.68,.7,.028,100),new T.MeshStandardMaterial({color:0xeeeeec,metalness:.12,roughness:.67}));platform.position.y=-.016;scene.add(platform);
  const ring=new T.Mesh(new T.RingGeometry(.63,.632,128),new T.MeshBasicMaterial({color:0x8c969f,transparent:true,opacity:.4,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.001;scene.add(ring);
  const innerRing=new T.Mesh(new T.RingGeometry(.55,.551,128),new T.MeshBasicMaterial({color:0xa4aeb8,transparent:true,opacity:.16,side:T.DoubleSide}));innerRing.rotation.x=-Math.PI/2;innerRing.position.y=.001;scene.add(innerRing);
  const width=T.MathUtils.ceilPowerOfTwo(atlas.parts.length),data=new Float32Array(width*4),partTexture=new T.DataTexture(data,width,1,T.RGBAFormat,T.FloatType);partTexture.needsUpdate=true;
  const selectedData=new Uint8Array(width*4),selectionTexture=new T.DataTexture(selectedData,width,1);selectionTexture.needsUpdate=true;
  const glowData=new Uint8Array(width*4),glowTexture=new T.DataTexture(glowData,width,1);glowTexture.needsUpdate=true;
  const materials:T.Material[]=[],geometries:T.BufferGeometry[]=[],pickers:(T.Mesh|undefined)[]=[],centers=atlas.parts.map(p=>new T.Vector3().fromArray(p.bounds[0]).add(new T.Vector3().fromArray(p.bounds[1])).multiplyScalar(.5));
  const offsets:T.Vector3[]=[],bounds=atlas.parts.map(p=>new T.Box3(new T.Vector3().fromArray(p.bounds[0]),new T.Vector3().fromArray(p.bounds[1])));
  let packingWidth=1,packingHeight=1;
  const markerPositions=new Float32Array(atlas.parts.length*3),markerGeometry=new T.BufferGeometry();markerGeometry.setAttribute('position',new T.BufferAttribute(markerPositions,3));
  const markerMaterial=new T.PointsMaterial({color:0x64748b,size:5,sizeAttenuation:false,transparent:true,opacity:.72,depthTest:false});
  markerMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;');};
  const anatomyGroup=new T.Group();scene.add(anatomyGroup);
  const markers=new T.Points(markerGeometry,markerMaterial);markers.frustumCulled=false;markers.renderOrder=10;markers.visible=false;anatomyGroup.add(markers);

  // Centreline Spline from Actual BodyParts3D Reference Meshes
  const ingestionWaypoints = [
   new T.Vector3(0.000, 1.545, 0.055),   // Oral vestibule / teeth entrance (FJ2761 bounds)
   new T.Vector3(-0.001, 1.527, 0.040),  // Tongue surface centroid (FJ2761)
   new T.Vector3(0.000, 1.490, 0.015),   // Oropharynx / hypopharynx
   new T.Vector3(0.002, 1.440, 0.005),   // Upper esophagus entry (FJ2563 upper)
   new T.Vector3(0.007, 1.331, -0.005),  // Mid thoracic esophagus centroid (FJ2563 mid)
   new T.Vector3(0.018, 1.250, 0.005),   // Retrocardiac lower esophagus (FJ2563 lower)
   new T.Vector3(0.028, 1.215, 0.015),   // Gastroesophageal junction / Cardia (FJ2564)
   new T.Vector3(0.060, 1.228, 0.012),   // Gastric Fundus dome (FJ2564)
   new T.Vector3(0.045, 1.176, 0.040),   // Gastric Body / Greater curvature (FJ2564)
   new T.Vector3(0.010, 1.135, 0.042),   // Pyloric antrum (FJ2564)
   new T.Vector3(-0.012, 1.120, 0.035),  // Pylorus & Superior Duodenum (FJ2573)
   new T.Vector3(-0.032, 1.095, 0.028),  // Descending Duodenum C-loop (FJ2573)
   new T.Vector3(-0.015, 1.075, 0.026),  // Horizontal & ascending Duodenum (FJ2573)
   new T.Vector3(0.035, 1.070, 0.036),   // Duodenojejunal flexure (FJ2606)
   new T.Vector3(0.065, 1.035, 0.045),   // Proximal Jejunum upper loop (FJ2607)
   new T.Vector3(0.075, 1.010, 0.048),   // Mid Jejunum right loop (FJ2608)
   new T.Vector3(0.035, 0.995, 0.058),   // Mid Jejunum central loop (FJ2610)
   new T.Vector3(-0.035, 1.005, 0.050),  // Mid Jejunum left loop (FJ2611)
   new T.Vector3(-0.050, 0.985, 0.046),  // Distal Jejunum / Proximal Ileum (FJ2574)
   new T.Vector3(0.020, 0.965, 0.055),   // Ileal central coiled loop (FJ2576)
   new T.Vector3(0.055, 0.945, 0.045),   // Distal Ileum lower loop (FJ2578)
   new T.Vector3(-0.025, 0.940, 0.030),  // Terminal Ileum (FJ2580 / Ileocecal valve)
  ];
  const ingestionCurve = new T.CatmullRomCurve3(ingestionWaypoints, false, 'catmullrom', 0.15);
  const pillGroup = new T.Group();
  const pillCore = new T.Mesh(new T.SphereGeometry(0.014, 16, 16), new T.MeshStandardMaterial({color:0x38bdf8,emissive:0x0284c7,emissiveIntensity:1.6,roughness:0.2}));
  const pillHalo = new T.Mesh(new T.SphereGeometry(0.025, 16, 16), new T.MeshBasicMaterial({color:0x7dd3fc,transparent:true,opacity:0.45,depthWrite:false}));
  pillGroup.add(pillCore);pillGroup.add(pillHalo);pillGroup.visible=false;
  anatomyGroup.add(pillGroup);

  const NUM_PARTICLES = 240;
  const particleGeo = new T.SphereGeometry(0.0055, 8, 8);
  const particleMat = new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.88,depthWrite:false});
  const instancedParticles = new T.InstancedMesh(particleGeo, particleMat, NUM_PARTICLES);
  instancedParticles.instanceMatrix.setUsage(T.DynamicDrawUsage);
  instancedParticles.frustumCulled = false;
  instancedParticles.visible = false;
  anatomyGroup.add(instancedParticles);

  const particlePhases = new Float32Array(NUM_PARTICLES);
  const particleAngles = new Float32Array(NUM_PARTICLES);
  const particleOffsets = new Float32Array(NUM_PARTICLES);
  for (let i = 0; i < NUM_PARTICLES; i++) {
   particlePhases[i] = (i / NUM_PARTICLES) + (Math.random() - 0.5) * 0.04;
   particleAngles[i] = Math.random() * Math.PI * 2;
   particleOffsets[i] = 0.003 + Math.random() * 0.011;
  }
  const particleDummy = new T.Object3D();
  const particleColor = new T.Color();
  const pSplinePoint = new T.Vector3();
  const pSplineTangent = new T.Vector3();
  const pUpVec = new T.Vector3(0, 1, 0);
  const pBinormalVec = new T.Vector3();
  const pPerpVec = new T.Vector3();

  const liverPartIndices = new Set<number>();
  const kidneyPartIndices = new Set<number>();
  const stomachPartIndices = new Set<number>();
  const gutPartIndices = new Set<number>();
  atlas.parts.forEach((p, idx) => {
   const name = p.name.toLowerCase();
   if (name.includes('liver') || p.conceptId === 'FMA7197') liverPartIndices.add(idx);
   if (name.includes('kidney') || p.conceptId === 'FMA7203') kidneyPartIndices.add(idx);
   if (name.includes('stomach') || p.conceptId === 'FMA7148') stomachPartIndices.add(idx);
   if (name.includes('duodenum') || name.includes('jejunum') || name.includes('ileum') || p.conceptId === 'FMA7200') gutPartIndices.add(idx);
  });
  const hover=document.createElement('div');hover.className='part-hover';hover.setAttribute('role','tooltip');hover.hidden=true;el.appendChild(hover);
  type Target={index:number;x:number;y:number;left:number;right:number;top:number;bottom:number};let targets:Target[]=[];
  const projected=new T.Vector3();
  const findTarget=(x:number,y:number,radius:number)=>{
   let best=-1,score=Infinity;
   for(const t of targets){const dx=Math.max(t.left-x,0,x-t.right),dy=Math.max(t.top-y,0,y-t.bottom),distance=Math.hypot(dx,dy);if(distance>radius)continue;const candidate=distance+Math.hypot(t.x-x,t.y-y)*.025;if(candidate<score){score=candidate;best=t.index;}}
   return best;
  };

  const peelUniform={value:0},peelCenterUniform={value:new T.Vector3(0,.88,0)},peelRadiusUniform={value:0};
  const timeUniform={value:0},cutawayUniform={value:0},focusCenterUniform={value:new T.Vector3(0,.88,0)};
  let currentPeel=0,targetPeel=0,currentPeelRadius=0,targetPeelRadius=0;
  const currentPeelCenter=new T.Vector3(0,.88,0),targetPeelCenter=new T.Vector3(0,.88,0);
  let flyingTo:{target:T.Vector3;cameraPos:T.Vector3}|null=null;
  let glowActive=false;

  const materialFor=(system:string)=>{
   const tier=getSystemTier(system as SystemId);
   const isSkin=system==='integumentary';
   const motionType=system==='cardiac'?1.0:system==='respiratory'?2.0:system==='digestive'?3.0:0.0;
   const m=new T.MeshStandardMaterial({color:SYSTEMS.find(s=>s.id===system)?.color??'#aebbb8',metalness:.08,roughness:.53,side:T.DoubleSide,transparent:isSkin,opacity:isSkin?0.12:1.0,depthWrite:!isSkin});
   m.onBeforeCompile=shader=>{
    shader.uniforms.partState={value:partTexture};shader.uniforms.selectionState={value:selectionTexture};shader.uniforms.glowState={value:glowTexture};shader.uniforms.stateWidth={value:width};
    shader.uniforms.uPeel=peelUniform;shader.uniforms.uPeelCenter=peelCenterUniform;shader.uniforms.uPeelRadius=peelRadiusUniform;shader.uniforms.uTier={value:tier};
    shader.uniforms.uTime=timeUniform;shader.uniforms.uMotionType={value:motionType};
    shader.uniforms.uCutawayEnabled=cutawayUniform;shader.uniforms.uFocusCenter=focusCenterUniform;

    shader.vertexShader='attribute float partIndex; uniform sampler2D partState; uniform sampler2D selectionState; uniform float stateWidth; uniform float uTime; uniform float uMotionType; varying float partVisible; varying float partSelected; varying vec3 vWorldPosition; varying vec2 vStateUv;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vec2 stateUv = vec2((partIndex + 0.5) / stateWidth, 0.5);
vec4 state = texture2D(partState, stateUv);
transformed += state.xyz;

// Honest, physiological motion
if (uMotionType > 0.5 && uMotionType < 1.5) {
 float beat = sin(uTime * 7.54);
 float pulse = pow(max(0.0, beat), 3.0) * 0.040 - pow(max(0.0, -beat), 2.0) * 0.015;
 transformed += normal * pulse;
} else if (uMotionType > 1.5 && uMotionType < 2.5) {
 float breath = sin(uTime * 1.45) * 0.022;
 transformed.x += sign(transformed.x) * breath;
 transformed.z += breath * 0.65;
} else if (uMotionType > 2.5 && uMotionType < 3.5) {
 float wave = sin(transformed.y * 20.0 - uTime * 3.0) * 0.012;
 transformed += normal * wave;
}

partVisible = state.w;
partSelected = texture2D(selectionState, stateUv).r;
vStateUv = stateUv;
vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

    shader.fragmentShader='varying float partVisible; varying float partSelected; varying vec3 vWorldPosition; varying vec2 vStateUv;\nuniform float uPeel; uniform vec3 uPeelCenter; uniform float uPeelRadius; uniform float uTier; uniform float uCutawayEnabled; uniform vec3 uFocusCenter;\nuniform sampler2D glowState;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
if (partVisible < 0.5) discard;

// Cutaway slice for the focused organ
if (uCutawayEnabled > 0.5 && partSelected > 0.5) {
 float cutDist = vWorldPosition.z - uFocusCenter.z;
 if (cutDist > 0.001) discard;
}

float localPeel = uPeel;
if (uPeelRadius > 0.001) {
 float dist = distance(vWorldPosition, uPeelCenter);
 float radialFalloff = 1.0 - clamp(dist / uPeelRadius, 0.0, 1.0);
 radialFalloff = smoothstep(0.0, 1.0, radialFalloff);
 localPeel = clamp(uPeel + radialFalloff * 0.40, 0.0, 1.0);
}
float tierAlpha = 1.0;
if (partSelected < 0.5) {
 if (uTier < 0.5) {
  if (localPeel >= 0.20) discard;
  tierAlpha = 1.0 - smoothstep(0.0, 0.20, localPeel);
 } else if (uTier < 1.5) {
  if (localPeel >= 0.52) discard;
  if (localPeel > 0.18) {
   tierAlpha = 1.0 - smoothstep(0.18, 0.52, localPeel);
  }
 } else if (uTier < 2.5) {
  if (localPeel >= 0.76) discard;
  if (localPeel > 0.42) {
   tierAlpha = 1.0 - smoothstep(0.42, 0.76, localPeel);
  }
 }
}
if (tierAlpha < 0.02) discard;
if (tierAlpha < 0.98) {
 float ditherVal = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
 if (ditherVal > tierAlpha) discard;
}`);

    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
// Interior lumen mucosal shading for backfaces exposed by the cutaway
if (!gl_FrontFacing) {
 vec3 mucosalTint = vec3(0.68, 0.22, 0.24);
 diffuseColor.rgb = mix(diffuseColor.rgb * 0.60, mucosalTint, 0.65);
}

// Coloured cap / cross-sectional border at cut boundary
if (uCutawayEnabled > 0.5 && partSelected > 0.5) {
 float cutDist = abs(vWorldPosition.z - uFocusCenter.z);
 if (cutDist < 0.0035) {
  diffuseColor.rgb = vec3(0.95, 0.45, 0.38);
 }
}

diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.85, 0.78), partSelected * 0.75);

// Pharmacokinetic organ clearance and gastrointestinal transit illumination
vec4 organGlow = texture2D(glowState, vStateUv);
if (organGlow.r > 0.005) {
 vec3 hepaticGlow = vec3(0.98, 0.62, 0.16); // Golden-amber liver metabolic clearance
 diffuseColor.rgb = mix(diffuseColor.rgb, hepaticGlow, organGlow.r * 0.85);
}
if (organGlow.g > 0.005) {
 vec3 renalGlow = vec3(0.18, 0.84, 0.96); // Vibrant cyan kidney excretion filtration
 diffuseColor.rgb = mix(diffuseColor.rgb, renalGlow, organGlow.g * 0.85);
}
if (organGlow.b > 0.005) {
 vec3 gastroGlow = vec3(0.96, 0.82, 0.32); // Stomach and intestinal lumen chyme
 diffuseColor.rgb = mix(diffuseColor.rgb, gastroGlow, organGlow.b * 0.78);
}
if (organGlow.a > 0.005) {
 vec3 arterialGlow = vec3(0.95, 0.25, 0.35); // Systemic bloodstream circulation pulse
 diffuseColor.rgb = mix(diffuseColor.rgb, arterialGlow, organGlow.a * 0.65);
}`);
   };materials.push(m);return m;
  };

  const mats=new Map(SYSTEMS.map(s=>[s.id,materialFor(s.id)]));
  let loaded=0;
  const loadChunk=async(ci:number)=>{
   const chunk=atlas.chunks[ci],compressed=!!chunk.gzip&&typeof DecompressionStream!=='undefined';const response=await fetch(compressed?chunk.gzip!:chunk.url,{signal:abort.signal});const buffer=await decodeModelResponse(response,chunk.bytes,compressed);if(disposed)return;
   const groups=new Map<string,T.BufferGeometry[]>();
   atlas.parts.forEach((p,i)=>{
    if(p.chunk!==ci)return;
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(buffer,p.positions,p.vertexCount*3),3));
    g.setAttribute('normal',new T.BufferAttribute(new Int16Array(buffer,p.normals,p.vertexCount*3),3,true));g.setIndex(new T.BufferAttribute(new Uint32Array(buffer,p.indices,p.indexCount),1));
    g.boundingBox=bounds[i].clone();g.computeBoundingSphere();const pick=new T.Mesh(g);pick.matrixAutoUpdate=false;pick.visible=false;pickers[i]=pick;geometries.push(g);anatomyGroup.add(pick);
    g.setAttribute('partIndex',new T.BufferAttribute(new Float32Array(p.vertexCount).fill(i),1));
    const list=groups.get(p.system)??[];list.push(g);groups.set(p.system,list);
   });
   groups.forEach((gs,system)=>{const geometry=mergeGeometries(gs,false);if(!geometry)throw new Error('Could not assemble anatomy geometry.');geometries.push(geometry);const mesh=new T.Mesh(geometry,mats.get(system as never));mesh.frustumCulled=false;anatomyGroup.add(mesh);});
   lastState=null;loaded++;onProgress(Math.round(loaded/atlas.chunks.length*100));dirty=true;
  };

  const loadedChunks = new Set<number>();
  const inFlight = new Map<number, Promise<void>>();

  const loadChunkSafe = (ci: number): Promise<void> => {
   if (loadedChunks.has(ci)) return Promise.resolve();
   if (inFlight.has(ci)) return inFlight.get(ci)!;
   const p = loadChunk(ci).then(() => {
    loadedChunks.add(ci);
    inFlight.delete(ci);
   }).catch(err => {
    inFlight.delete(ci);
    throw err;
   });
   inFlight.set(ci, p);
   return p;
  };

  // Priority 1: Chunks 10, 11, 0 (Outer body skin, skeletal landmarks, primary GI organs) for instant <400ms First Paint
  const priorityChunks = [10, 11, 0];
  const remainingChunks = Array.from({length: atlas.chunks.length}, (_, i) => i).filter(i => !priorityChunks.includes(i));

  (async () => {
   try {
    await Promise.all(priorityChunks.map(ci => loadChunkSafe(ci)));
    if (!disposed) {
     ready = true;
     dirty = true;
    }

    // Stream remaining organ group chunks concurrently with 3 workers
    let cursor = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
     while (cursor < remainingChunks.length) {
      if (disposed) break;
      const ci = remainingChunks[cursor++];
      await loadChunkSafe(ci);
     }
    }));
   } catch (e) {
    if (!disposed) onError(e instanceof Error ? e.message : 'Could not load the anatomy.');
   }
  })();

  const fit=(view:string,extent=0)=>{
   const aspect=camera.aspect,mobile=el.clientWidth<768,normalDistance=mobile?Math.max(4.5,1.8*el.clientHeight/Math.max(160,el.clientHeight-350)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))):4;
   const reservedHeight=mobile?350:270;const availableAspect=Math.max(.35,(el.clientWidth-(mobile?40:340))/Math.max(160,el.clientHeight-reservedHeight));const atlasDistance=Math.max(packingHeight,packingWidth/availableAspect)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*(el.clientHeight/Math.max(160,el.clientHeight-reservedHeight))*1.08;
   const sy=anatomyGroup.scale.y||1;
   const distance=T.MathUtils.lerp(normalDistance*Math.max(.85,sy),Math.max(.2,atlasDistance),extent);if(extent>.8)view='front';
   const direction=view==='front'?new T.Vector3(0,.02,1):view==='back'?new T.Vector3(0,.02,-1):view==='side'?new T.Vector3(1,.02,0):new T.Vector3(.35,.06,1).normalize();
   const targetY=extent>.1?.85*sy:.88*sy;const targetX=extent>.1&&el.clientWidth>767?-packingWidth*.12:0;controls.target.set(targetX,targetY,0);camera.position.copy(controls.target).addScaledVector(direction,distance);controls.update();dirty=true;
  };
  const resize=()=>{layoutKey='';lastState=null;renderer.setPixelRatio(Math.min(devicePixelRatio,el.clientWidth<768||el.clientHeight<600?1.5:2));camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight);fit(latest.current.view,amount);};const observer=new ResizeObserver(resize);observer.observe(el);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),tap=new PointerTap(),worldBox=new T.Box3(),hitPoint=new T.Vector3();
  const down=(e:PointerEvent)=>{hover.hidden=true;tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?12:5);};
  const move=(e:PointerEvent)=>{
   tap.move(e.pointerId,e.clientX,e.clientY);
   if(e.buttons||amount>.45||e.pointerType==='touch'){
    if(amount>=.45){
     const rect=el.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,index=findTarget(x,y,12);hover.hidden=index<0;renderer.domElement.style.cursor=index<0?'grab':'pointer';if(index>=0){hover.textContent=atlas.parts[index].name;hover.style.left=`${Math.max(8,Math.min(x+14,el.clientWidth-260))}px`;hover.style.top=`${Math.max(8,Math.min(y+18,el.clientHeight-55))}px`;}
    }else{hover.hidden=true;}
    return;
   }
   const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
   let bestIndex=-1,bestTier=-1,nearestDist=Infinity;
   pickers.forEach((mesh,i)=>{
    if(!mesh||data[i*4+3]<.5)return;
    const tier=getSystemTier(atlas.parts[i].system);
    if(currentPeel>.25&&tier===0)return;
    if(currentPeel>.52&&tier===1)return;
    if(currentPeel>.76&&tier===2)return;
    worldBox.min.copy(bounds[i].min).add(mesh.position).multiply(anatomyGroup.scale);
    worldBox.max.copy(bounds[i].max).add(mesh.position).multiply(anatomyGroup.scale);
    if(!raycaster.ray.intersectBox(worldBox,hitPoint))return;
    const hits=raycaster.intersectObject(mesh,false);
    if(hits[0]){
     const hit=hits[0];
     if(tier>bestTier||(tier===bestTier&&hit.distance<nearestDist)){bestTier=tier;nearestDist=hit.distance;bestIndex=i;}
    }
   });
   if(bestIndex>=0){
    hover.hidden=false;hover.textContent=atlas.parts[bestIndex].name;
    const x=e.clientX-rect.left,y=e.clientY-rect.top;
    hover.style.left=`${Math.max(8,Math.min(x+14,el.clientWidth-260))}px`;hover.style.top=`${Math.max(8,Math.min(y+18,el.clientHeight-55))}px`;
    renderer.domElement.style.cursor='pointer';
   }else{
    hover.hidden=true;renderer.domElement.style.cursor='grab';
   }
  };
  const cancel=(e:PointerEvent)=>tap.cancel(e.pointerId);
  const up=(e:PointerEvent)=>{
   const validTap=tap.up(e.pointerId,e.clientX,e.clientY);if(!validTap||!ready)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
   let nearest=Infinity,found=-1,bestTier=-1;
   pickers.forEach((mesh,i)=>{
    if(!mesh||data[i*4+3]<.5)return;
    const tier=getSystemTier(atlas.parts[i].system);
    if(currentPeel>.25&&tier===0)return;
    if(currentPeel>.52&&tier===1)return;
    if(currentPeel>.76&&tier===2)return;
    worldBox.min.copy(bounds[i].min).add(mesh.position).multiply(anatomyGroup.scale);
    worldBox.max.copy(bounds[i].max).add(mesh.position).multiply(anatomyGroup.scale);
    if(!raycaster.ray.intersectBox(worldBox,hitPoint))return;
    const hits=raycaster.intersectObject(mesh,false);
    if(hits[0]){
     const hit=hits[0];
     if(tier>bestTier||(tier===bestTier&&hit.distance<nearest)){bestTier=tier;nearest=hit.distance;found=i;}
    }
   });
   if(found<0&&amount>.45)found=findTarget(e.clientX-rect.left,e.clientY-rect.top,e.pointerType==='touch'?24:16);
   if(found>=0){
    hover.hidden=true;
    select.current(atlas.parts[found].id);
    const organCenter = centers[found].clone().multiply(anatomyGroup.scale);
     focusCenterUniform.value.copy(organCenter);
     const size = bounds[found].getSize(new T.Vector3()).multiply(anatomyGroup.scale);
    const maxDim=Math.max(size.x,size.y,size.z,.08);
    const viewDir=new T.Vector3().subVectors(camera.position,controls.target).normalize();
    const focusDist=Math.max(.35,maxDim/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*1.65);
    flyingTo={target:organCenter.clone(),cameraPos:new T.Vector3().copy(organCenter).addScaledVector(viewDir,focusDist)};
    const partTier=getSystemTier(atlas.parts[found].system);
    if(partTier===3&&targetPeel<.78){targetPeel=.78;targetPeelCenter.copy(organCenter);targetPeelRadius=0;peelChange.current?.(targetPeel);}
    else if(partTier===2&&targetPeel<.54){targetPeel=.54;targetPeelCenter.copy(organCenter);targetPeelRadius=0;peelChange.current?.(targetPeel);}
    else if(partTier===1&&targetPeel<.26){targetPeel=.26;targetPeelCenter.copy(organCenter);targetPeelRadius=0;peelChange.current?.(targetPeel);}
    dirty=true;
   }
  };

  const onWheel=(e:WheelEvent)=>{
   if(!ready||amount>.3)return;
   e.preventDefault();
   const rect=renderer.domElement.getBoundingClientRect();
   pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
   raycaster.setFromCamera(pointer,camera);
   let bestIndex=-1,bestTier=-1,nearestDist=Infinity;
   const rayHitPoint=new T.Vector3();
   pickers.forEach((mesh,i)=>{
    if(!mesh||data[i*4+3]<.5)return;
    const tier=getSystemTier(atlas.parts[i].system);
    if(currentPeel>.25&&tier===0)return;
    if(currentPeel>.52&&tier===1)return;
    if(currentPeel>.76&&tier===2)return;
    worldBox.min.copy(bounds[i].min).add(mesh.position).multiply(anatomyGroup.scale);
    worldBox.max.copy(bounds[i].max).add(mesh.position).multiply(anatomyGroup.scale);
    if(!raycaster.ray.intersectBox(worldBox,hitPoint))return;
    const hits=raycaster.intersectObject(mesh,false);
    if(hits[0]){
     const hit=hits[0];
     if(tier>bestTier||(tier===bestTier&&hit.distance<nearestDist)){bestTier=tier;nearestDist=hit.distance;bestIndex=i;rayHitPoint.copy(hit.point);}
    }
   });
   const delta=Math.sign(e.deltaY)*.06;
   const nextPeel=Math.max(0,Math.min(1,targetPeel+delta));
   targetPeel=nextPeel;
   if(bestIndex>=0){targetPeelCenter.copy(rayHitPoint);targetPeelRadius=.38;}
   else if(nextPeel<=.05){targetPeelRadius=0;}
   const viewDir=new T.Vector3().subVectors(camera.position,controls.target).normalize();
   const baseTarget = new T.Vector3(0, .88 * (anatomyGroup.scale.y || 1), 0);
   const organTarget = bestIndex >= 0 ? centers[bestIndex].clone().multiply(anatomyGroup.scale) : controls.target;
   const targetLook=new T.Vector3().lerpVectors(baseTarget,organTarget,nextPeel);
   const baseDist=3.4;
   const size=bestIndex>=0?bounds[bestIndex].getSize(new T.Vector3()):new T.Vector3(.3,.3,.3);
   const maxDim=Math.max(size.x,size.y,size.z,.08);
   const focusDist=Math.max(.35,maxDim/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*1.65);
   const nextDist=T.MathUtils.lerp(baseDist,focusDist,nextPeel);
   flyingTo={target:targetLook,cameraPos:new T.Vector3().copy(targetLook).addScaledVector(viewDir,nextDist)};
   peelChange.current?.(nextPeel);
   dirty=true;
  };

  const onPointerLeave=()=>{hover.hidden=true;};
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);
  renderer.domElement.addEventListener('pointerleave',onPointerLeave);
  renderer.domElement.addEventListener('wheel',onWheel,{passive:false});
  const clock=new T.Clock();let lastExtent=-1;
  const animate=()=>{
   if(disposed)return;frame=requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05),s=latest.current;
   const changed=lastState?.visible!==s.visible||lastState?.selected!==s.selected||lastState?.isolate!==s.isolate;
   const moving=Math.abs(amount-s.explode)>.0001;
   if(moving){amount=T.MathUtils.damp(amount,s.explode,8,dt);dirty=true;}

   // Honest physiological animation continuously runs in vertex shader via uTime
   timeUniform.value = clock.getElapsedTime();
   dirty = true;

   // On-demand chunk boosting for user selections and active simulation
   if (s.selected.length > 0) {
    atlas.parts.forEach(p => {
     if (s.selected.includes(p.id) && !loadedChunks.has(p.chunk)) {
      loadChunkSafe(p.chunk);
     }
    });
   }
   if (s.simulation?.active) {
    [10, 11, 7, 8, 9].forEach(ci => {
     if (!loadedChunks.has(ci)) loadChunkSafe(ci);
    });
   }

   // Drug digestion simulation: pill transit, instanced particles & organ clearance glow
   if (s.simulation?.active) {
    const sim = s.simulation;
    const prog = Math.max(0, Math.min(1, sim.progress));
    
    // 1. Initial swallow bolus transit along esophagus into stomach
    if (prog < 0.35) {
     pillGroup.visible = true;
     const bolusU = Math.min(0.28, (prog / 0.35) * 0.28);
     ingestionCurve.getPoint(bolusU, pillGroup.position);
     const pillScale = Math.max(0.15, 1.0 - (prog / 0.35) * 0.65);
     pillGroup.scale.set(pillScale, pillScale, pillScale);
     pillHalo.scale.setScalar(1.0 + Math.sin(clock.getElapsedTime() * 12.0) * 0.22);
    } else {
     pillGroup.visible = false;
    }

    // 2. Instanced particles with density driven by compartment amounts
    instancedParticles.visible = true;
    const stomachFrac = Math.max(0, Math.min(1, sim.stomachLevel));
    const gutFrac = Math.max(0, Math.min(1, sim.gutLevel));
    const plasmaFrac = Math.max(0, Math.min(1, sim.plasmaLevel));
    const timeFlow = clock.getElapsedTime();

    for (let i = 0; i < NUM_PARTICLES; i++) {
     let u = 0;
     let scale = 0;
     let radialDist = particleOffsets[i];
     const ang = particleAngles[i] + timeFlow * 0.8;

     if (i < 120) {
      // Stomach pool: active when stomachFrac > 0.005
      if (stomachFrac > 0.005) {
       // Gastric segment is u in [0.26, 0.44]
       const localP = ((particlePhases[i] * 1.5 + timeFlow * 0.08) % 1.0);
       u = 0.26 + localP * 0.18;
       scale = Math.min(1.2, 0.4 + stomachFrac * 0.8);
       particleColor.setRGB(0.22, 0.74, 0.98); // Vibrant cyan / electric blue
      } else {
       scale = 0;
      }
     } else {
      // Intestinal gut pool: active when gutFrac > 0.005
      if (gutFrac > 0.005) {
       // Gut segment is u in [0.44, 0.98]
       const localP = ((particlePhases[i] * 1.2 + timeFlow * 0.15) % 1.0);
       u = 0.44 + localP * 0.54;
       scale = Math.min(1.1, 0.35 + gutFrac * 0.75);
       particleColor.setRGB(0.98, 0.75, 0.22); // Warm amber chyme
      } else if (plasmaFrac > 0.01 && (i % 2 === 0)) {
       // Absorbed drug particles diffusing into mesenteric capillaries & systemic blood
       const localP = ((particlePhases[i] + timeFlow * 0.25) % 1.0);
       u = 0.46 + localP * 0.40;
       scale = Math.min(0.8, plasmaFrac * 0.7);
       radialDist = particleOffsets[i] * 2.8;
       particleColor.setRGB(0.95, 0.25, 0.42); // Arterial capillary glow
      } else {
       scale = 0;
      }
     }

     if (scale > 0.001) {
      const clampedU = Math.max(0, Math.min(1, u));
      ingestionCurve.getPoint(clampedU, pSplinePoint);
      ingestionCurve.getTangent(clampedU, pSplineTangent);
      pBinormalVec.crossVectors(pSplineTangent, pUpVec).normalize();
      pPerpVec.crossVectors(pBinormalVec, pSplineTangent).normalize();

      particleDummy.position.copy(pSplinePoint)
       .addScaledVector(pBinormalVec, Math.cos(ang) * radialDist)
       .addScaledVector(pPerpVec, Math.sin(ang) * radialDist);
      particleDummy.scale.setScalar(scale);
      particleDummy.updateMatrix();
      instancedParticles.setMatrixAt(i, particleDummy.matrix);
      instancedParticles.setColorAt(i, particleColor);
     } else {
      particleDummy.position.set(0, -100, 0);
      particleDummy.scale.setScalar(0);
      particleDummy.updateMatrix();
      instancedParticles.setMatrixAt(i, particleDummy.matrix);
     }
    }
    instancedParticles.instanceMatrix.needsUpdate = true;
    if (instancedParticles.instanceColor) instancedParticles.instanceColor.needsUpdate = true;

    // 3. Organ clearance glow: Liver and Kidney illuminate strictly by clearance rate
    atlas.parts.forEach((p, i) => {
     let r = 0, g = 0, b = 0, a = 0;
     if (liverPartIndices.has(i)) r = Math.round(sim.liverIntensity * 255);
     if (kidneyPartIndices.has(i)) g = Math.round(sim.kidneyIntensity * 255);
     if (stomachPartIndices.has(i)) b = Math.max(b, Math.round(sim.stomachLevel * 255));
     if (gutPartIndices.has(i)) b = Math.max(b, Math.round(sim.gutLevel * 255));
     if (p.system === 'arterial' || p.system === 'cardiac') a = Math.round(sim.plasmaLevel * 255);
     glowData[i * 4] = r;
     glowData[i * 4 + 1] = g;
     glowData[i * 4 + 2] = b;
     glowData[i * 4 + 3] = a;
    });
    glowTexture.needsUpdate = true;
    glowActive = true;
    dirty = true;
   } else {
    if (pillGroup.visible) pillGroup.visible = false;
    if (instancedParticles.visible) {
     instancedParticles.visible = false;
     for (let i = 0; i < NUM_PARTICLES; i++) {
      particleDummy.position.set(0, -100, 0);
      particleDummy.scale.setScalar(0);
      particleDummy.updateMatrix();
      instancedParticles.setMatrixAt(i, particleDummy.matrix);
     }
     instancedParticles.instanceMatrix.needsUpdate = true;
    }
    if (glowActive) {
     glowData.fill(0);
     glowTexture.needsUpdate = true;
     glowActive = false;
     dirty = true;
    }
   }

   // Morphological scaling matching patient profile
   const patientScale = computeAnatomicalScale(s.patient);
   const prevScaleY = anatomyGroup.scale.y;
   anatomyGroup.scale.x = T.MathUtils.damp(anatomyGroup.scale.x, patientScale.scaleX, 8, dt);
   anatomyGroup.scale.y = T.MathUtils.damp(anatomyGroup.scale.y, patientScale.scaleY, 8, dt);
   anatomyGroup.scale.z = T.MathUtils.damp(anatomyGroup.scale.z, patientScale.scaleZ, 8, dt);
   if (Math.abs(anatomyGroup.scale.y - prevScaleY) > 0.0002) {
    anatomyGroup.updateMatrixWorld(true);
    dirty = true;
   }
   const pedScale = Math.max(1, anatomyGroup.scale.x * 1.05);
   platform.scale.set(pedScale, 1, Math.max(1, anatomyGroup.scale.z * 1.05));
   ring.scale.set(pedScale, Math.max(1, anatomyGroup.scale.z * 1.05), 1);
   innerRing.scale.set(pedScale, Math.max(1, anatomyGroup.scale.z * 1.05), 1);

   // Update cutaway center and state with scaled bounds
   if (s.selected.length > 0) {
    const box = new T.Box3();
    atlas.parts.forEach((p, i) => {
     if (s.selected.includes(p.id)) {
      const pBox = bounds[i].clone();
      pBox.min.multiply(anatomyGroup.scale);
      pBox.max.multiply(anatomyGroup.scale);
      box.union(pBox);
     }
    });
    if (!box.isEmpty()) { focusCenterUniform.value.copy(box.getCenter(new T.Vector3())); }
   }
   cutawayUniform.value=s.cutaway&&s.selected.length>0?1.0:0.0;

   if(Math.abs((s.peel??0)-targetPeel)>.001){targetPeel=s.peel??0;targetPeelRadius=0;dirty=true;}
   if(Math.abs(currentPeel-targetPeel)>.0001||Math.abs(currentPeelRadius-targetPeelRadius)>.0001){
    currentPeel=T.MathUtils.damp(currentPeel,targetPeel,10,dt);
    currentPeelRadius=T.MathUtils.damp(currentPeelRadius,targetPeelRadius,8,dt);
    currentPeelCenter.lerp(targetPeelCenter,Math.min(1,10*dt));
    peelUniform.value=currentPeel;peelRadiusUniform.value=currentPeelRadius;peelCenterUniform.value.copy(currentPeelCenter);
    dirty=true;
   }
   if(flyingTo){
    controls.target.lerp(flyingTo.target,Math.min(1,10*dt));
    camera.position.lerp(flyingTo.cameraPos,Math.min(1,10*dt));
    controls.update();dirty=true;
    if(controls.target.distanceTo(flyingTo.target)<.002&&camera.position.distanceTo(flyingTo.cameraPos)<.005){
     controls.target.copy(flyingTo.target);camera.position.copy(flyingTo.cameraPos);flyingTo=null;
    }
   }

   if(changed||moving||lastExtent<0){
    const visible=new Set(s.visible),selection=new Set(s.selected);
    const visibleParts=atlas.parts.filter(p=>s.isolate?selection.has(p.id):visible.has(p.system)||selection.has(p.id));
    const nextLayoutKey=visibleParts.map(p=>p.id).join(',')+':'+camera.aspect.toFixed(3);
    if(nextLayoutKey!==layoutKey){const layout=createExplosionLayout(visibleParts,camera.aspect);packingWidth=layout.width;packingHeight=layout.height;atlas.parts.forEach((p,i)=>{const cell=layout.cells.get(p.id);offsets[i]=cell?new T.Vector3(cell.x,cell.y+.85,0):centers[i].clone();});layoutKey=nextLayoutKey;if(amount>.05&&!s.isolate)fit(s.view,Math.max(0,(amount-.3)/.7));}

    atlas.parts.forEach((p,i)=>{
     const c=centers[i],destination=offsets[i];let dx=0,dy=0,dz=0;
     if(amount<=.45){const t=amount/.45;const group=SYSTEMS.findIndex(sys=>sys.id===p.system);const angle=group/SYSTEMS.length*Math.PI*2;dx=Math.sin(angle)*t*.48;dy=(c.y-.85)*t*.28;dz=Math.cos(angle)*t*.48;}
     else {const t=(amount-.45)/.55,group=SYSTEMS.findIndex(sys=>sys.id===p.system),angle=group/SYSTEMS.length*Math.PI*2;dx=T.MathUtils.lerp(Math.sin(angle)*.48,destination.x-c.x,t);dy=T.MathUtils.lerp((c.y-.85)*.28,destination.y-c.y,t);dz=T.MathUtils.lerp(Math.cos(angle)*.48,-c.z,t);}
     const selected=selection.has(p.id);data.set([dx,dy,dz,(s.isolate?selected:visible.has(p.system)||selected)?1:0],i*4);selectedData[i*4]=selected?255:0;
     markerPositions.set(data[i*4+3]>.5?[c.x+dx,c.y+dy,c.z+dz]:[10000,10000,10000],i*3);const mesh=pickers[i];if(mesh){mesh.position.set(dx,dy,dz);mesh.updateMatrix();mesh.updateMatrixWorld(true);}
    });partTexture.needsUpdate=true;selectionTexture.needsUpdate=true;markerGeometry.attributes.position.needsUpdate=true;lastState=s;lastExtent=amount;dirty=true;
   }
   if(s.view!==lastView||s.reset!==lastReset){
    if(s.reset!==lastReset){
     targetPeel=0;targetPeelRadius=0;targetPeelCenter.set(0, .88 * (anatomyGroup.scale.y || 1), 0);flyingTo=null;peelChange.current?.(0);
    }
    fit(s.view,amount);lastView=s.view;lastReset=s.reset;
   }
   if(moving&&!s.isolate)fit(amount>.5?'front':s.view,Math.max(0,(amount-.3)/.7));
   const isolateKey=s.isolate?s.selected.join(',')+':'+s.reset+':'+s.inspectorOpen+':'+camera.aspect:'';
   if(isolateKey!==lastIsolate||(s.isolate&&moving)){
    if(s.isolate){const box=new T.Box3();atlas.parts.forEach((p,i)=>{if(s.selected.includes(p.id))box.union(bounds[i].clone().translate(new T.Vector3(data[i*4],data[i*4+1],data[i*4+2])));});
     if(!box.isEmpty()){const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());const w=el.clientWidth,h=el.clientHeight,mobile=w<768,landscape=w>h&&h<=600;let left=20,right=w-20,top=mobile?175:110,bottom=h-170;if(s.inspectorOpen){if(landscape){right=w-335;top=100;bottom=h-125;}else if(mobile){const sheet=document.querySelector('.detail-sheet')?.getBoundingClientRect(),header=document.querySelector('.identity')?.getBoundingClientRect();top=(header?.bottom??94)+16;bottom=(sheet?.top??h*.58-139)-16;}else{right=w-370;left=w>1100?285:25;}}const availableWidth=Math.max(150,right-left),availableHeight=Math.max(40,bottom-top);camera.setViewOffset(w,h,w/2-(left+right)/2,h/2-(top+bottom)/2,w,h);const distance=Math.max(.07,Math.max(size.y*h/availableHeight,size.x*w/availableWidth/camera.aspect,size.z)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*1.35);controls.maxDistance=Math.max(40,distance*2);controls.target.copy(center);camera.position.copy(center).add(new T.Vector3(.2,.1,1).normalize().multiplyScalar(distance));controls.update();dirty=true;}
    }else if(lastIsolate){camera.clearViewOffset();fit(s.view,amount);}
    lastIsolate=isolateKey;
   }
   controls.enableRotate=amount<.8;controls.mouseButtons.LEFT=amount<.8?T.MOUSE.ROTATE:T.MOUSE.PAN;controls.touches.ONE=amount<.8?T.TOUCH.ROTATE:T.TOUCH.PAN;ground.visible=platform.visible=ring.visible=innerRing.visible=amount<.5&&!s.isolate;markers.visible=amount>.75;controls.autoRotate=s.rotate&&!s.isolate&&amount<.4;controls.autoRotateSpeed=.65;controls.update();if(controls.autoRotate)dirty=true;
   if(dirty){renderer.render(scene,camera);targets=[];if(amount>.45){const hasSolid=atlas.parts.some((p,i)=>p.system!=='integumentary'&&data[i*4+3]>.5);atlas.parts.forEach((p,i)=>{if(data[i*4+3]<.5||(hasSolid&&p.system==='integumentary'))return;let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(let corner=0;corner<8;corner++){projected.set(p.bounds[(corner&1)?1:0][0]+data[i*4],p.bounds[(corner&2)?1:0][1]+data[i*4+1],p.bounds[(corner&4)?1:0][2]+data[i*4+2]).project(camera);const x=(projected.x+1)*el.clientWidth/2,y=(1-projected.y)*el.clientHeight/2;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}projected.copy(centers[i]).add(new T.Vector3(data[i*4],data[i*4+1],data[i*4+2])).project(camera);if(projected.z< -1||projected.z>1)return;targets.push({index:i,x:(projected.x+1)*el.clientWidth/2,y:(1-projected.y)*el.clientHeight/2,left,right,top,bottom});});}dirty=false;}

  };animate();
  const contextLost=(e:Event)=>{e.preventDefault();onError('The 3D session was paused by your device. Reload to continue.');};renderer.domElement.addEventListener('webglcontextlost',contextLost);
  return()=>{disposed=true;abort.abort();cancelAnimationFrame(frame);observer.disconnect();controls.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());scene.traverse(o=>{if(o instanceof T.Mesh&&!geometries.includes(o.geometry)){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});env.dispose();partTexture.dispose();selectionTexture.dispose();glowTexture.dispose();markerGeometry.dispose();markerMaterial.dispose();hover.remove();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointercancel',cancel);renderer.domElement.removeEventListener('pointerleave',onPointerLeave);renderer.domElement.removeEventListener('wheel',onWheel);renderer.domElement.removeEventListener('webglcontextlost',contextLost);renderer.dispose();renderer.domElement.remove();};
 },[atlas]);
 return <div className="scene" ref={host}/>;
}
