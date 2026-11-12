import {flushSync} from 'react-dom';
import {registerAtlasTools} from './agent-tools';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Activity,AlertTriangle,ArrowUpRight,CheckCircle2,ChevronRight,FastForward,Focus,Info,Layers3,Pause,Pill,Play,RotateCcw,RotateCw,Search,ShieldAlert,Sparkles,User,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty} from '@/components/ui/combobox';
import AnatomyScene from './scene';
import {DEFAULT_VISIBLE,SYSTEMS,EXPLANATIONS,explanation,getSystemTier,getOrganDossier,computeAnatomicalScale,DEFAULT_PATIENT_PROFILE,type Atlas,type Concept,type SceneState,type SystemId,type View,type PatientProfile,type BloodGroup,type DrugAllergy,type Sex,type SimulationVisualState} from './anatomy';
import {DRUGS,checkDrugSafety,getDrugById} from '@/src/pk/safety';
import {runSimulation} from '@/src/pk/engine';
import type {DrugDefinition,DrugId,PatientPkParams,PkCompartmentState,SafetyCheckResult,SimulationResult} from '@/src/pk/types';

const initial:SceneState={explode:0,peel:0,cutaway:true,visible:DEFAULT_VISIBLE,selected:[],isolate:false,view:'three-quarter',rotate:false,reset:0,patient:DEFAULT_PATIENT_PROFILE};

function getPeelTierLabel(peel:number=0):string{
 const p=peel??0;
 if(p<=.18)return 'Skin';
 if(p<=.45)return 'Muscles';
 if(p<=.72)return 'Skeleton';
 return 'Organs';
}

export default function Home(){
 const detailTitle=useRef<HTMLHeadingElement>(null);
 const [atlas,setAtlas]=useState<Atlas|null>(null),[state,setState]=useState(initial),[progress,setProgress]=useState(0),[error,setError]=useState(''),[panel,setPanel]=useState<'layers'|'search'|null>(null),[details,setDetails]=useState(false),[about,setAbout]=useState(false),[patientOpen,setPatientOpen]=useState(false),[query,setQuery]=useState(''),[chosen,setChosen]=useState<Concept|null>(null);
 const [simPanelOpen, setSimPanelOpen] = useState(false);
 const [selectedDrugId, setSelectedDrugId] = useState<DrugId>('paracetamol');
 const [selectedDoseMg, setSelectedDoseMg] = useState<number>(500);
 const [simRunning, setSimRunning] = useState(false);
 const [simPaused, setSimPaused] = useState(false);
 const [simSpeed, setSimSpeed] = useState<number>(60);
 const [simTimeHours, setSimTimeHours] = useState<number>(0);
 const [simResult, setSimResult] = useState<SimulationResult | null>(null);
 const [showCitations, setShowCitations] = useState(false);
 const chartRef = useRef<HTMLCanvasElement>(null);

 useEffect(()=>{
  const abort=new AbortController();setProgress(0);setError('');setAtlas(null);setChosen(null);setDetails(false);setState({...initial,visible:DEFAULT_VISIBLE});
  fetch('/models/atlas.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('The anatomy catalogue could not be loaded.');return r.json();}).then(data=>setAtlas(data as Atlas)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
  return()=>abort.abort();
 },[]);

 const reset=()=>{
  setState(s=>({...initial,cutaway:true,visible:DEFAULT_VISIBLE,patient:s.patient,simulation:{active:false,progress:0,stomachLevel:0,gutLevel:0,plasmaLevel:0,liverIntensity:0,kidneyIntensity:0,hepaticRateMgH:0,renalRateMgH:0,stomachMg:0,gutMg:0,plasmaMg:0},reset:s.reset+1}));
  setChosen(null);setDetails(false);setPanel(null);setPatientOpen(false);setSimRunning(false);setSimPaused(false);setSimTimeHours(0);setSimResult(null);
 };

 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){
    e.preventDefault();
    reset();
   }else if(e.key==='/'&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){
    e.preventDefault();
    setPanel('search');
    setDetails(false);
   }
  };
  window.addEventListener('keydown',key);
  return()=>window.removeEventListener('keydown',key);
 },[]);

 
 const patient = state.patient ?? DEFAULT_PATIENT_PROFILE;
 const scale = useMemo(() => computeAnatomicalScale(patient), [patient]);
 const updatePatient = (patch: Partial<PatientProfile>) => {
  setState(s => ({
   ...s,
   patient: { ...(s.patient ?? DEFAULT_PATIENT_PROFILE), ...patch },
  }));
 };
 const parts=useMemo(()=>new Map(atlas?.parts.map(p=>[p.id,p])),[atlas]);
 const counts=useMemo(()=>Object.fromEntries(SYSTEMS.map(s=>[s.id,atlas?.parts.filter(p=>p.system===s.id).length??0])),[atlas]);
 const activeSystems=SYSTEMS.filter(s=>counts[s.id]>0);
 const selectedParts=state.selected.map(id=>parts.get(id)).filter(p=>!!p),selected=selectedParts[0],system=SYSTEMS.find(s=>s.id===selected?.system);
 const visibleCount=atlas?.parts.filter(p=>state.isolate?state.selected.includes(p.id):state.visible.includes(p.system)||state.selected.includes(p.id)).length??0;
 const results=useMemo(()=>{
  if(!atlas)return[];
  const term=query.toLowerCase().trim();
  if(!term)return ['heart','brain','liver','stomach','spleen','pancreas','urinary bladder','trachea'].map(name=>atlas.concepts.find(c=>c.name.toLowerCase()===name)).filter((x):x is Concept=>!!x);
  return atlas.concepts.filter(c=>c.name.toLowerCase().includes(term)||c.id.toLowerCase().includes(term)).sort((a,b)=>a.name.length-b.name.length).slice(0,80);
 },[atlas,query]);

 const choose=(c:Concept)=>{
  setChosen(c);
  const firstPart=c.elements[0]?parts.get(c.elements[0]):null;
  const tier=firstPart?getSystemTier(firstPart.system):3;
  const organPeel=tier===3?.78:tier===2?.54:tier===1?.26:0;
  setState(s=>({...s,selected:c.elements,peel:Math.max(s.peel??0,organPeel),cutaway:true,isolate:false,rotate:false}));
  setDetails(true);setPanel(null);
 };

 useEffect(()=>{if(!atlas)return;return registerAtlasTools(atlas,c=>flushSync(()=>choose(c)));},[atlas]);

 const choosePart=(id:string)=>{
  const p=parts.get(id);if(!p)return;
  setChosen({id:p.conceptId,name:p.name,elements:[id]});
  const tier=getSystemTier(p.system);
  const organPeel=tier===3?.78:tier===2?.54:tier===1?.26:0;
  setState(s=>({...s,selected:[id],peel:Math.max(s.peel??0,organPeel),cutaway:true,isolate:false,rotate:false}));
  setDetails(true);setPanel(null);
 };

 const toggle=(id:SystemId)=>{setDetails(false);setState(s=>({...s,selected:[],isolate:false,visible:s.visible.includes(id)?s.visible.filter(x=>x!==id):[...s.visible,id]}));};
 const openPanel=(next:'layers'|'search')=>{setDetails(false);setPanel(p=>p===next?null:next);};

 const currentDrug = useMemo<DrugDefinition>(() => getDrugById(selectedDrugId) ?? DRUGS[0], [selectedDrugId]);

 const patientPkParams: PatientPkParams = useMemo(() => ({
  weightKg: patient.weightKg,
  heightCm: patient.heightCm,
  age: patient.age,
  sex: patient.sex,
  allergy: patient.allergy,
  eCrCl: scale.crClMlMin,
 }), [patient, scale.crClMlMin]);

 const safety = useMemo<SafetyCheckResult>(
  () => checkDrugSafety(currentDrug, selectedDoseMg, patientPkParams),
  [currentDrug, selectedDoseMg, patientPkParams]
 );

 const handleDrugChange = (id: DrugId) => {
  setSelectedDrugId(id);
  const drug = getDrugById(id) ?? DRUGS[0];
  setSelectedDoseMg(drug.standardDoseMg);
  setSimRunning(false);
  setSimPaused(false);
  setSimTimeHours(0);
  setSimResult(null);
  setState(s => ({
   ...s,
   simulation: {
    active: false,
    progress: 0,
    stomachLevel: 0,
    gutLevel: 0,
    plasmaLevel: 0,
    liverIntensity: 0,
    kidneyIntensity: 0,
    hepaticRateMgH: 0,
    renalRateMgH: 0,
    stomachMg: 0,
    gutMg: 0,
    plasmaMg: 0,
   },
  }));
 };

 const handleSwallow = () => {
  if (safety.isBlocked) return;
  const result = runSimulation({
   drugId: currentDrug.id,
   doseMg: selectedDoseMg,
   patient: patientPkParams,
   durationHours: 24,
   timeStepHours: 0.01,
  });
  setSimResult(result);
  setSimTimeHours(0);
  setSimRunning(true);
  setSimPaused(false);
  setState(s => ({
   ...s,
   peel: Math.max(s.peel ?? 0, 0.78),
   simulation: {
    active: true,
    progress: 0,
    stomachLevel: 1.0,
    gutLevel: 0,
    plasmaLevel: 0,
    liverIntensity: 0,
    kidneyIntensity: 0,
   },
  }));
 };

 const handleTogglePlayPause = () => {
  if (!simRunning && simResult) {
   setSimRunning(true);
   setSimPaused(false);
  } else {
   setSimPaused(p => !p);
  }
 };

 const handleResetSim = () => {
  setSimRunning(false);
  setSimPaused(false);
  setSimTimeHours(0);
  setSimResult(null);
  setState(s => ({
   ...s,
   simulation: {
    active: false,
    progress: 0,
    stomachLevel: 0,
    gutLevel: 0,
    plasmaLevel: 0,
    liverIntensity: 0,
    kidneyIntensity: 0,
   },
  }));
 };

 useEffect(() => {
  if (!simRunning || simPaused || !simResult) return;
  let lastTime = performance.now();
  let frameId: number;

  const tick = (now: number) => {
   const dtSec = (now - lastTime) / 1000;
   lastTime = now;
   // Time-speed: 1x means 1 sec = 1 min (60x real-time)
   // 60x means 1 sec = 1 hour (24 hours in 24 seconds)
   // 600x means 1 sec = 10 hours (24 hours in 2.4 seconds)
   const deltaSimHours = dtSec * (simSpeed / 60.0);
   setSimTimeHours(prev => {
    const next = prev + deltaSimHours;
    if (next >= 24) {
     setSimRunning(false);
     return 24;
    }
    return next;
   });
   frameId = requestAnimationFrame(tick);
  };

  frameId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frameId);
 }, [simRunning, simPaused, simResult, simSpeed]);

 const currentSample: PkCompartmentState = useMemo(() => {
  if (!simResult || simResult.samples.length === 0) {
   return {
    timeHours: simTimeHours,
    stomachMg: 0,
    gutMg: 0,
    plasmaMg: 0,
    plasmaConcentrationMgL: 0,
    liverMetabolizedMg: 0,
    kidneyExcretedMg: 0,
    unabsorbedMg: 0,
    totalAccountedMg: 0,
    massBalanceErrorPercent: 0,
   };
  }
  const ratio = Math.min(1, Math.max(0, simTimeHours / 24));
  const idx = Math.min(
   Math.floor(ratio * (simResult.samples.length - 1)),
   simResult.samples.length - 1
  );
  return simResult.samples[idx];
 }, [simResult, simTimeHours]);

 const weight = patient.weightKg;
 const cp = currentSample.plasmaConcentrationMgL;
 const mec = currentDrug.targetRangeMgL.min;
 const toxic = currentDrug.toxicThresholdMgL;

 // Instantaneous clearance rates (mg/hour) strictly driving liver and kidney glow
 const hepaticClLh = currentDrug.clPerKg * weight * currentDrug.hepaticFraction;
 const renalClLh = currentDrug.clPerKg * weight * currentDrug.renalFraction * (scale.crClMlMin / 100);
 const hepaticRateMgH = cp * hepaticClLh;
 const renalRateMgH = cp * renalClLh;

 const cmaxRef = Math.max(simResult?.cmaxMgL ?? 10, currentDrug.toxicThresholdMgL * 0.7);
 const maxHepaticRate = Math.max(0.001, cmaxRef * hepaticClLh);
 const maxRenalRate = Math.max(0.001, cmaxRef * renalClLh);

 const liverIntensity = (currentDrug.clearanceRoute === 'hepatic' || currentDrug.clearanceRoute === 'mixed')
  ? Math.min(1.0, hepaticRateMgH / maxHepaticRate)
  : 0;

 const kidneyIntensity = (currentDrug.clearanceRoute === 'renal' || currentDrug.clearanceRoute === 'mixed')
  ? Math.min(1.0, renalRateMgH / maxRenalRate)
  : 0;

 useEffect(() => {
  if (!simRunning && !simResult) return;
  const pillProgress = Math.min(1, simTimeHours / 0.65);
  const maxRef = Math.max(simResult?.cmaxMgL ?? 10, currentDrug.toxicThresholdMgL);
  const plasmaNorm = Math.min(1, currentSample.plasmaConcentrationMgL / (maxRef * 0.75));

  setState(s => ({
   ...s,
   simulation: {
    active: true,
    progress: pillProgress,
    stomachLevel: Math.min(1, currentSample.stomachMg / (selectedDoseMg || 1)),
    gutLevel: Math.min(1, currentSample.gutMg / (selectedDoseMg || 1)),
    plasmaLevel: plasmaNorm,
    liverIntensity,
    kidneyIntensity,
    hepaticRateMgH,
    renalRateMgH,
    stomachMg: currentSample.stomachMg,
    gutMg: currentSample.gutMg,
    plasmaMg: currentSample.plasmaMg,
   },
  }));
 }, [simTimeHours, currentSample, simRunning, simResult, selectedDoseMg, currentDrug, liverIntensity, kidneyIntensity, hepaticRateMgH, renalRateMgH]);

 let effectBadgeClass = 'subtherapeutic';
 let effectBadgeLabel = 'Subtherapeutic (Inactive)';
 let effectGradient = 'linear-gradient(90deg, #94a3b8, #64748b)';
 let efficacyPct = 0;

 if (cp < 0.01) {
  effectBadgeClass = 'inactive';
  effectBadgeLabel = 'Clear (Zero Plasma Level)';
  efficacyPct = 0;
 } else if (cp < mec) {
  effectBadgeClass = 'subtherapeutic';
  effectBadgeLabel = 'Subtherapeutic (< MEC)';
  efficacyPct = Math.min(50, (cp / mec) * 50);
  effectGradient = 'linear-gradient(90deg, #38bdf8, #0284c7)';
 } else if (cp <= toxic) {
  effectBadgeClass = 'therapeutic';
  effectBadgeLabel = 'Active Therapeutic Range';
  efficacyPct = 50 + Math.min(50, ((cp - mec) / Math.max(0.1, toxic - mec)) * 50);
  effectGradient = 'linear-gradient(90deg, #10b981, #059669)';
 } else {
  effectBadgeClass = 'toxic';
  effectBadgeLabel = 'Toxic Threshold Exceeded';
  efficacyPct = 100;
  effectGradient = 'linear-gradient(90deg, #f59e0b, #ef4444)';
 }

 useEffect(() => {
  const canvas = chartRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 340;
  const height = rect.height || 140;

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
   canvas.width = width * dpr;
   canvas.height = height * dpr;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const padLeft = 38;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 24;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, width, height);

  const yMax = Math.max(
   (simResult?.cmaxMgL ?? 10) * 1.25,
   currentDrug.toxicThresholdMgL * 1.15,
   1
  );

  const toX = (h: number) => padLeft + (h / 24) * plotW;
  const toY = (val: number) => padTop + plotH - (Math.min(val, yMax) / yMax) * plotH;

  const yMec = toY(currentDrug.targetRangeMgL.min);
  const yTox = toY(currentDrug.toxicThresholdMgL);
  const bandTop = Math.max(padTop, yTox);
  const bandBottom = Math.min(padTop + plotH, yMec);

  if (bandBottom > bandTop) {
   ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
   ctx.fillRect(padLeft, bandTop, plotW, bandBottom - bandTop);
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
   const y = padTop + (plotH / 4) * i;
   ctx.beginPath();
   ctx.moveTo(padLeft, y);
   ctx.lineTo(padLeft + plotW, y);
   ctx.stroke();

   const val = yMax * (1 - i / 4);
   ctx.fillStyle = '#64748b';
   ctx.font = '9px monospace';
   ctx.textAlign = 'right';
   ctx.fillText(val.toFixed(1), padLeft - 6, y + 3);
  }

  for (let h = 0; h <= 24; h += 6) {
   const x = toX(h);
   ctx.beginPath();
   ctx.moveTo(x, padTop);
   ctx.lineTo(x, padTop + plotH);
   ctx.stroke();

   ctx.fillStyle = '#64748b';
   ctx.font = '9px monospace';
   ctx.textAlign = 'center';
   ctx.fillText(`${h}h`, x, padTop + plotH + 14);
  }

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, yMec);
  ctx.lineTo(padLeft + plotW, yMec);
  ctx.stroke();
  ctx.fillStyle = '#10b981';
  ctx.font = '8px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('MEC', padLeft + plotW, yMec - 3);

  ctx.strokeStyle = '#f87171';
  ctx.beginPath();
  ctx.moveTo(padLeft, yTox);
  ctx.lineTo(padLeft + plotW, yTox);
  ctx.stroke();
  ctx.fillStyle = '#f87171';
  ctx.fillText('TOXIC', padLeft + plotW, yTox - 3);
  ctx.restore();

  if (simResult && simResult.samples.length > 0) {
   ctx.beginPath();
   ctx.strokeStyle = '#38bdf8';
   ctx.lineWidth = 2;
   simResult.samples.forEach((pt: PkCompartmentState, i: number) => {
    const x = toX(pt.timeHours);
    const y = toY(pt.plasmaConcentrationMgL);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
   });
   ctx.stroke();

   ctx.lineTo(toX(24), padTop + plotH);
   ctx.lineTo(toX(0), padTop + plotH);
   ctx.closePath();
   const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
   grad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
   grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
   ctx.fillStyle = grad;
   ctx.fill();

   const curX = toX(simTimeHours);
   ctx.strokeStyle = '#f59e0b';
   ctx.lineWidth = 1.5;
   ctx.beginPath();
   ctx.moveTo(curX, padTop);
   ctx.lineTo(curX, padTop + plotH);
   ctx.stroke();

   const curY = toY(currentSample.plasmaConcentrationMgL);
   ctx.fillStyle = '#f59e0b';
   ctx.beginPath();
   ctx.arc(curX, curY, 4, 0, Math.PI * 2);
   ctx.fill();
   ctx.strokeStyle = '#ffffff';
   ctx.lineWidth = 1;
   ctx.stroke();
  }

  ctx.restore();
 }, [simResult, simTimeHours, currentSample, currentDrug]);
 return <main className="studio">
  {atlas&&<AnatomyScene atlas={atlas} state={{...state,inspectorOpen:details&&selectedParts.length>0}} onSelect={choosePart} onPeelChange={peel=>setState(s=>({...s,peel}))} onProgress={n=>{setProgress(n);if(n===100)setError('');}} onError={setError}/>}
  <div className="vignette"/>
  <header className="identity"><div className="eyebrow"><span className="status-dot"/> 3D ANATOMY & DRUG LAB</div><h1>Body Twin<Badge variant="outline" className="edition">3D</Badge></h1><div className="identity-meta">Educational model <span>·</span> Not medical advice</div></header>
  <nav className="top-actions" aria-label="Explorer panels">
   <Button
    variant="ghost"
    className={`drug-lab-trigger ${simPanelOpen ? 'active' : ''}`}
    onClick={() => { setDetails(false); setPanel(null); setAbout(false); setPatientOpen(false); setSimPanelOpen(o => !o); }}
    aria-label="Open Drug Digestion Simulator"
    title="Pharmacokinetic Drug Simulation Lab"
   >
    <Pill size={18} />
    <span>Drug Lab</span>
    {simRunning && <span className="status-dot" style={{ background: '#0284c7' }} />}
   </Button>
   <Button
    variant="ghost"
    className={`patient-trigger ${patientOpen ? 'active' : ''}`}
    onClick={() => { setDetails(false); setPanel(null); setAbout(false); setPatientOpen(o => !o); }}
    aria-label="Open Patient Profile"
    title="Configure patient attributes & body scaling"
   >
    <User size={18} />
    <span className="patient-btn-label">{patient.sex === 'female' ? 'Female' : 'Male'}, {patient.age}y</span>
    <span className="patient-btn-stats desktop-only">· {patient.heightCm}cm · {patient.weightKg}kg</span>
    {patient.allergy !== 'none' && (
     <Badge variant="destructive" className="patient-allergy-dot" title={`Allergy: ${patient.allergy}`}>!</Badge>
    )}
   </Button>
   <Button variant="ghost" className={panel==='search'?'active':''} onClick={()=>openPanel('search')} aria-label="Search anatomy"><Search size={18}/><span>Find a structure</span><kbd>/</kbd></Button>
   <Button variant="ghost" className={`credits-trigger ${about ? "active" : ""}`} aria-label="Dataset Licensing, Credits and Pharmacology Sources" title="Credits, Literature Sources and CC BY 4.0 Attribution" onClick={()=>{setDetails(false);setPanel(null);setSimPanelOpen(false);setPatientOpen(false);setAbout(o => !o);}}><Info size={18}/><span>Credits</span></Button>
  </nav>
  <section className={`layers-panel glass ${panel==='layers'?'mobile-open':''}`} aria-label="Anatomical layers">
   <div className="panel-heading"><span>Systems</span><Button variant="ghost" className="mobile-only icon-button" onClick={()=>setPanel(null)} aria-label="Close systems"><X size={18}/></Button><Badge variant="secondary" className="desktop-only small-number">{activeSystems.length}</Badge></div>
   <div className="layer-presets"><Button variant="ghost" aria-pressed={activeSystems.every(x=>state.visible.includes(x.id))} onClick={()=>setState(s=>({...s,selected:[],isolate:false,visible:activeSystems.map(x=>x.id)}))}>All</Button><Button variant="ghost" aria-pressed={state.visible.length===1&&state.visible[0]==='skeletal'} onClick={()=>setState(s=>({...s,selected:[],isolate:false,visible:['skeletal']}))}>Skeleton</Button><Button variant="ghost" aria-pressed={state.visible.length===6&&['cardiac','respiratory','digestive','urinary','endocrine','reproductive'].every(id=>state.visible.includes(id as SystemId))} onClick={()=>setState(s=>({...s,selected:[],isolate:false,visible:['cardiac','respiratory','digestive','urinary','endocrine','reproductive']}))}>Organs</Button></div>
   <div className="system-list">{activeSystems.map(s=><div className={`system-row ${state.visible.includes(s.id)?'enabled':''}`} key={s.id}><Button variant="ghost" className="system-name" title={`Show only ${s.name.toLowerCase()}`} onClick={()=>setState(v=>({...v,visible:[s.id],isolate:false,selected:[]}))}><span className="system-dot" style={{background:s.color}}/>{s.name}<span className="system-count">{counts[s.id]}</span></Button><Switch checked={state.visible.includes(s.id)} onCheckedChange={()=>toggle(s.id)} aria-label={`Show ${s.name.toLowerCase()}`} /></div>)}</div>
   <div className="panel-foot"><span>{visibleCount.toLocaleString()} pieces visible</span><Button variant="ghost" onClick={()=>setState(s=>({...s,visible:[],selected:[],isolate:false}))}>Hide all</Button></div>
  </section>

  {simPanelOpen && (
   <section className="sim-dashboard" aria-label="Pharmacokinetic Drug Simulator">
    <div className="sim-header">
     <div className="sim-header-title">
      <Pill size={18} style={{ color: '#0284c7' }} />
      <h3>Drug Digestion Lab</h3>
      <Badge variant="outline" className="edition" style={{ fontSize: '10px' }}>PK Engine</Badge>
     </div>
     <Button variant="ghost" className="icon-button" onClick={() => setSimPanelOpen(false)} aria-label="Close drug lab">
      <X size={18} />
     </Button>
    </div>

    <div className="sim-scroll">
     {/* Drug selection tabs */}
     <div className="drug-tabs-grid">
      {DRUGS.map(d => (
       <button
        key={d.id}
        type="button"
        className={`drug-tab-btn ${selectedDrugId === d.id ? 'active' : ''}`}
        onClick={() => handleDrugChange(d.id)}
       >
        <span>{d.name}</span>
        <small>{d.therapeuticClass.split('&')[0]}</small>
       </button>
      ))}
     </div>

     {/* Dose selector */}
     <div className="dose-row">
      <span className="dose-label">Select Oral Dose:</span>
      <div className="dose-pill-group">
       {currentDrug.availableDosesMg.map(dose => (
        <button
         key={dose}
         type="button"
         className={`dose-pill-btn ${selectedDoseMg === dose ? 'active' : ''}`}
         onClick={() => {
          setSelectedDoseMg(dose);
          setSimRunning(false);
          setSimPaused(false);
          setSimTimeHours(0);
          setSimResult(null);
         }}
        >
         {dose} mg
        </button>
       ))}
      </div>
     </div>

     {/* Safety status card: Allergy Block & Dose Warning */}
     {safety.isBlocked ? (
      <div className="safety-status-box safety-blocked">
       <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
       <div>
        <strong>CONTRAINDICATION BLOCKED</strong>
        <p>{safety.blockReason}</p>
       </div>
      </div>
     ) : safety.hasWarning ? (
      <div className="safety-status-box safety-warning">
       <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
       <div>
        <strong>HIGH DOSE ALERT ({safety.weightDoseMgKg.toFixed(1)} mg/kg)</strong>
        <p>{safety.warningMessage}</p>
       </div>
      </div>
     ) : (
      <div className="safety-status-box safety-safe">
       <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
       <div>
        <strong>Safe Standard Dose ({safety.weightDoseMgKg.toFixed(1)} mg/kg)</strong>
        <p>No documented contraindications for current patient ({patient.sex}, {patient.weightKg} kg).</p>
       </div>
      </div>
     )}

     {/* Primary Swallow Action */}
     <button
      type="button"
      id="swallow-btn"
      className="swallow-btn"
      disabled={!safety.allowed || simRunning}
      onClick={handleSwallow}
     >
      <Pill size={18} />
      <span>{simRunning ? 'Digesting & Dissolving…' : `Swallow ${selectedDoseMg}mg ${currentDrug.name}`}</span>
     </button>

     {/* Simulation Playback & Time Controls */}
     <div className="sim-playback-bar">
      <div className="playback-controls-group">
       <button
        type="button"
        className="playback-btn"
        onClick={handleTogglePlayPause}
        disabled={!safety.allowed}
       >
        {simRunning && !simPaused ? <Pause size={14} /> : <Play size={14} />}
        <span>{simRunning && !simPaused ? 'Pause' : simPaused ? 'Resume' : 'Start'}</span>
       </button>
       <button
        type="button"
        className="playback-btn"
        onClick={handleResetSim}
        title="Reset simulation (Esc)"
       >
        <RotateCcw size={14} />
        <span>Reset</span>
       </button>
      </div>

      <div className="sim-clock-badge">
       T + {Math.floor(simTimeHours).toString().padStart(2, '0')}h {Math.round((simTimeHours % 1) * 60).toString().padStart(2, '0')}m
      </div>
     </div>

     <div className="playback-speed-section">
      <div className="speed-header">
       <span className="speed-title">Time Speed: <strong>{simSpeed}×</strong></span>
       <span className="speed-sub">
        {simSpeed === 1 ? '1s = 1min' : simSpeed === 60 ? '1s = 1hr' : simSpeed === 600 ? '1s = 10hr' : `${(simSpeed/60).toFixed(1)}h / sec`}
       </span>
      </div>
      <div className="playback-speed-group">
       {[1, 10, 60, 120, 300, 600].map(sp => (
        <button
         key={sp}
         type="button"
         className={`speed-btn ${simSpeed === sp ? 'active' : ''}`}
         onClick={() => setSimSpeed(sp)}
        >
         {sp}×
        </button>
       ))}
      </div>
      <div className="speed-slider-row">
       <input
        type="range"
        min="1"
        max="600"
        step="1"
        value={simSpeed}
        onChange={e => setSimSpeed(Number(e.target.value))}
        className="speed-range-slider"
        aria-label="Simulation speed 1x to 600x"
       />
      </div>
     </div>

     {/* Live Concentration Graph (#chart) */}
     <div className="chart-container">
      <div className="chart-header">
       <span>LIVE PLASMA CONCENTRATION (Cp)</span>
       <small>24-Hour Bateman RK4 Curve</small>
      </div>
      <canvas id="chart" ref={chartRef} />
     </div>

     {/* Live Therapeutic Effect Bar (#eb) */}
     <div id="eb">
      <div className="eb-header">
       <span>THERAPEUTIC EFFECTIVENESS</span>
       <span className={`eb-badge ${effectBadgeClass}`}>{effectBadgeLabel}</span>
      </div>
      <div className="eb-track">
       <div
        className="eb-fill"
        style={{
         width: `${efficacyPct}%`,
         background: effectGradient,
        }}
       />
      </div>
     </div>

     {/* Compartment Mass Distribution Readouts */}
     <div className="compartment-grid">
      <div className="compartment-card">
       <span className="comp-name">Stomach</span>
       <span className="comp-val">{currentSample.stomachMg.toFixed(1)} <small>mg</small></span>
       <span className="comp-sub">{((currentSample.stomachMg / (selectedDoseMg || 1)) * 100).toFixed(0)}% dose</span>
      </div>
      <div className="compartment-card">
       <span className="comp-name">Intestinal Gut</span>
       <span className="comp-val">{currentSample.gutMg.toFixed(1)} <small>mg</small></span>
       <span className="comp-sub">{((currentSample.gutMg / (selectedDoseMg || 1)) * 100).toFixed(0)}% dose</span>
      </div>
      <div className="compartment-card">
       <span className="comp-name">Plasma (Cp)</span>
       <span className="comp-val">{currentSample.plasmaConcentrationMgL.toFixed(2)} <small>mg/L</small></span>
       <span className="comp-sub">{currentSample.plasmaMg.toFixed(1)} mg in blood</span>
      </div>
      <div className="compartment-card liver">
       <span className="comp-name">Liver Clearance</span>
       <span className="comp-val">{hepaticRateMgH.toFixed(1)} <small>mg/h</small></span>
       <span className="comp-sub">{currentSample.liverMetabolizedMg.toFixed(1)} mg cleared</span>
      </div>
      <div className="compartment-card kidney">
       <span className="comp-name">Kidney Excretion</span>
       <span className="comp-val">{renalRateMgH.toFixed(1)} <small>mg/h</small></span>
       <span className="comp-sub">{currentSample.kidneyExcretedMg.toFixed(1)} mg cleared</span>
      </div>
      <div className="compartment-card">
       <span className="comp-name">Elimination Route</span>
       <span className="comp-val" style={{ textTransform: 'capitalize', fontSize: '11px' }}>{currentDrug.clearanceRoute}</span>
       <span className="comp-sub">{(currentDrug.hepaticFraction * 100).toFixed(0)}% Hep · {(currentDrug.renalFraction * 100).toFixed(0)}% Ren</span>
      </div>
     </div>

     {/* Sourced Pharmacokinetic Citations */}
     <div className="citations-accordion">
      <button
       type="button"
       className="citations-toggle"
       onClick={() => setShowCitations(v => !v)}
      >
       <Sparkles size={13} />
       <span>{showCitations ? 'Hide Parameter Citations' : 'View Pharmacokinetic Sources'}</span>
      </button>
      {showCitations && (
       <div className="citations-content">
        <p><strong>Bioavailability (F):</strong> {currentDrug.sources.bioavailability}</p>
        <p><strong>Absorption (ka):</strong> {currentDrug.sources.ka}</p>
        <p><strong>Volume of Dist (Vd):</strong> {currentDrug.sources.vdPerKg}</p>
        <p><strong>Total Clearance (CL):</strong> {currentDrug.sources.clPerKg}</p>
        <p><strong>Hepatic Fraction:</strong> {currentDrug.sources.hepaticFraction}</p>
        <p><strong>Renal Fraction:</strong> {currentDrug.sources.renalFraction}</p>
        <p><strong>Literature Peak:</strong> {currentDrug.sources.documentedPeak}</p>
        <p style={{ marginTop: '4px', color: '#0369a1', fontWeight: 600 }}>Educational demonstration only. Not clinical or medical advice.</p>
       </div>
      )}
     </div>
    </div>
   </section>
  )}

  {panel==='search'&&<section className="search-panel glass" aria-label="Find anatomy"><div className="panel-heading"><span>Find a structure</span><Button variant="ghost" className="icon-button" onClick={()=>setPanel(null)} aria-label="Close search"><X size={18}/></Button></div><Combobox<Concept> items={results} value={null} onValueChange={value=>{if(value)choose(value);}} inputValue={query} onInputValueChange={setQuery} itemToStringLabel={c=>c.name} filter={null} open onOpenChange={open=>{if(!open)setPanel(null);}}><ComboboxInput autoFocus placeholder="Heart, femur, cranial nerve…" aria-label="Search named anatomical structures" showTrigger={false}/><ComboboxContent className="anatomy-search-results"><ComboboxEmpty>No structures match your search.</ComboboxEmpty><ComboboxList>{(c:Concept)=><ComboboxItem key={c.id} value={c}><span className="search-result-name">{c.name}</span><span className="small-number">{c.elements.length} {c.elements.length===1?'piece':'pieces'}</span></ComboboxItem>}</ComboboxList></ComboboxContent></Combobox><p className="search-note">{query?'Showing up to 80 matches. Refine your search to find smaller structures.':'Start with a major organ, or search every named structure.'}</p></section>}
  <nav className="view-controls glass" aria-label="Camera controls">{(['three-quarter','front','side','back'] as View[]).map((v,i)=><Button variant="ghost" key={v} className={state.view===v?'active':''} aria-pressed={state.view===v} disabled={state.explode>.8&&v!=='front'} onClick={()=>setState(s=>({...s,view:v,reset:s.reset+1,rotate:false}))} title={`${v} view`} aria-label={`${v} view`}><span>{['¾','F','S','B'][i]}</span></Button>)}<i/><Button variant="ghost" disabled={state.explode>=.4} aria-label={state.rotate?'Pause rotation':'Rotate body'} title="Auto rotate" className={state.rotate?'active':''} onClick={()=>setState(s=>({...s,rotate:!s.rotate}))}>{state.rotate?<Pause size={17}/>:<RotateCw size={18}/>}</Button><Button variant="ghost" aria-label="Reset view and layers" title="Reset (Esc)" onClick={reset}><RotateCcw size={17}/></Button></nav>
  <div className="scene-caption"><span className="caption-line"/><span>{state.isolate?(chosen?.name??'SELECTED STRUCTURE'):state.explode>.95?'ANATOMICAL INVENTORY':state.explode>.05?'SEPARATED STRUCTURES':(state.peel??0)>.05?`PEEL: ${getPeelTierLabel(state.peel).toUpperCase()} LAYER`:`${patient.age}YO ${patient.sex.toUpperCase()} · ${patient.heightCm}CM · ${patient.weightKg}KG · APPROXIMATION`}</span><span className="caption-line"/></div>
  <div className="bottom-dock glass">
   <Button variant="ghost" className="mobile-only dock-layers" onClick={()=>openPanel('layers')} aria-label="Open system layers"><Layers3 size={20}/><span>Systems</span></Button>
   <div className="peel-control">
    <div className="explode-label"><label id="peel-label">Layer Peeling</label><output>{getPeelTierLabel(state.peel)}<span>{Math.round((state.peel??0)*100)}%</span></output></div>
    <Slider aria-labelledby="peel-label" min={0} max={100} step={1} value={[Math.round((state.peel??0)*100)]} onValueChange={v=>{const val=(Array.isArray(v)?v[0]:v)/100;setState(s=>({...s,peel:val}));}}/>
    <div className="slider-endpoints"><span>Skin</span><span>Muscles</span><span>Skeleton</span><span>Organs</span></div>
   </div>
   <div className="explode-control desktop-only">
    <div className="explode-label"><label id="explode-label">Explode</label><output>{Math.round(state.explode*100)}<span>%</span></output></div>
    <Slider aria-labelledby="explode-label" min={0} max={100} step={1} value={[state.explode*100]} onValueChange={v=>setState(s=>({...s,explode:(Array.isArray(v)?v[0]:v)/100,view:(Array.isArray(v)?v[0]:v)>80?'front':s.view,rotate:false}))}/>
    <div className="slider-endpoints"><span>Assembled</span><span>Every piece</span></div>
   </div>
   <Button variant="ghost" className="dock-reset" onClick={reset} aria-label="Assemble and reset" title="Reset view and layers (Esc)"><RotateCcw size={18}/><span>Reset</span></Button>
  </div>
  <footer className="studio-footer"><span>{state.explode>.8?'Drag to pan':'Drag to orbit 360°'} <b>·</b> Scroll over organ to peel & zoom <b>·</b> Tap to inspect <b>·</b> Esc to reset</span><Button variant="ghost" onClick={()=>{setDetails(false);setPanel(null);setSimPanelOpen(false);setPatientOpen(false);setAbout(true);}}>Source & credits <ArrowUpRight size={12}/></Button></footer>
  {progress<100&&!error&&<div className="loading glass" role="status"><Activity size={18}/><div><strong>Preparing the anatomy</strong><span>{progress}% · Loading {atlas?.parts.length.toLocaleString()??'2,234'} pieces</span><div className="loading-track"><i style={{width:`${progress}%`}}/></div></div></div>}
  {error&&<div className="loading glass error" role="alert"><p>{error}</p><Button variant="ghost" onClick={()=>location.reload()}>Reload viewer</Button></div>}
  <Sheet open={details&&selectedParts.length>0} modal={false} disablePointerDismissal onOpenChange={setDetails}>
   <SheetContent initialFocus={detailTitle} className={`detail-sheet glass ${state.isolate?'is-isolated':''}`} showCloseButton={true}>
    {(()=>{
     const dossier=chosen?getOrganDossier(chosen.name):null;
     return <>
      <div className="detail-header">
       <div className="detail-accent" style={{background:system?.color}}/>
       <div className="eyebrow">{system?.name??'ANATOMY'}</div>
       <SheetTitle ref={detailTitle} tabIndex={-1} className="structure-title">{chosen?.name}</SheetTitle>
      </div>
      <div className="detail-scroll" key={`${chosen?.id}-${state.isolate}`}>
       <div className="cutaway-toggle-card">
        <div className="cutaway-info">
         <strong>Cutaway Cross-Section</strong>
         <span>{state.cutaway?'Interior lumen with colored wall cap':'Full outer organ surface'}</span>
        </div>
        <Switch checked={state.cutaway} onCheckedChange={c=>setState(s=>({...s,cutaway:c}))} aria-label="Toggle organ cutaway cross-section" />
       </div>

       {dossier?.isSurfaceOnly?(
        <div className="geometry-badge surface-only">
         <span className="badge-bullet">ℹ</span>
         <p><strong>Surface-only reference mesh:</strong> Surface-only mesh in reference anatomy; cross-section generated via shader cutaway.</p>
        </div>
       ):dossier?.geometryNote?(
        <div className="geometry-badge internal-geometry">
         <span className="badge-bullet">✓</span>
         <p><strong>Internal sub-structures:</strong> {dossier.geometryNote}</p>
        </div>
       ):null}

       <div className="dossier-block">
        <span className="dossier-kicker">PHYSIOLOGICAL FUNCTION</span>
        <SheetDescription className="structure-description">{dossier?dossier.function:explanation(chosen?.name??'',selected?.system??'digestive')}</SheetDescription>
       </div>

       {dossier?.location&&(
        <div className="dossier-block">
         <span className="dossier-kicker">ANATOMICAL LOCATION</span>
         <p className="dossier-location">{dossier.location}</p>
        </div>
       )}

       {dossier?.facts&&dossier.facts.length>0&&(
        <div className="dossier-block">
         <span className="dossier-kicker">CLINICAL & PHARMACOLOGICAL FACTS</span>
         <ul className="dossier-fact-list">
          {dossier.facts.map((fact,idx)=>(
           <li key={idx}><span className="fact-index">0{idx+1}</span><span>{fact}</span></li>
          ))}
         </ul>
        </div>
       )}

       <div className="structure-meta">
        <span>Atlas reference<strong>{chosen?.id}</strong></span>
        <span>Selected pieces<strong>{state.selected.length.toLocaleString()}</strong></span>
       </div>

       {selectedParts.length>1&&<div className="member-list"><h3>Included structures</h3>{selectedParts.slice(0,50).map(p=><Button variant="ghost" key={p.id} onClick={()=>choosePart(p.id)}><span>{p.name}</span><ChevronRight size={14}/></Button>)}{selectedParts.length>50&&<p>And {selectedParts.length-50} more modeled pieces.</p>}</div>}
       <a className="source-link" href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">View anatomical source <ArrowUpRight size={14}/></a>
      </div>
      <div className="detail-actions">
       <Button className={`primary-action ${state.isolate?'active':''}`} onClick={()=>setState(s=>({...s,isolate:!s.isolate,explode:0}))}><Focus size={18}/>{state.isolate?'Show surrounding anatomy':'Isolate structure'}<ChevronRight size={16}/></Button>
       <Button variant="ghost" className="secondary-action" onClick={()=>{setState(s=>({...s,selected:[],isolate:false}));setDetails(false);}}>Clear selection</Button>
      </div>
     </>;
    })()}
   </SheetContent>
  </Sheet>
  <Sheet open={patientOpen} onOpenChange={setPatientOpen}>
   <SheetContent className="patient-sheet glass" showCloseButton={true}>
    <div className="detail-header">
     <div className="detail-accent" style={{ background: '#38bdf8' }} />
     <div className="eyebrow">DIGITAL PATIENT TWIN</div>
     <SheetTitle className="structure-title">Patient Profile</SheetTitle>
     <SheetDescription>Physiological parameters & morphological body scaling.</SheetDescription>
    </div>

    <div className="patient-scroll">
     <div className="approximation-banner">
      <span className="banner-icon">ℹ</span>
      <div>
       <strong>Educational Model Approximation</strong>
       <p>Base anatomy is an adult male reference model (175 cm, 70 kg, BodyParts3D CC BY 4.0). Height scales along Y, weight scales torso girth, with subtle adjustments for biological sex and age.</p>
      </div>
     </div>

     <div className="patient-field-group">
      <div className="patient-field-header">
       <label>Biological Sex</label>
       <span className="patient-field-value">{patient.sex === 'female' ? 'Female' : 'Male'}</span>
      </div>
      <div className="patient-pill-group">
       <button
        type="button"
        className={`patient-pill-btn ${patient.sex === 'male' ? 'active' : ''}`}
        onClick={() => updatePatient({ sex: 'male' })}
       >
        Male (Reference Base)
       </button>
       <button
        type="button"
        className={`patient-pill-btn ${patient.sex === 'female' ? 'active' : ''}`}
        onClick={() => updatePatient({ sex: 'female' })}
       >
        Female (Gracile Frame & Pelvis)
       </button>
      </div>
      <span className="patient-field-subtext">Adjusts pelvic-to-shoulder ratio, fat fraction, and Cockcroft-Gault renal clearance factor (0.85×).</span>
     </div>

     <div className="patient-field-group">
      <div className="patient-field-header">
       <label>Age</label>
       <span className="patient-field-value">{patient.age} years</span>
      </div>
      <Slider
       min={18}
       max={90}
       step={1}
       value={[patient.age]}
       onValueChange={v => updatePatient({ age: Array.isArray(v) ? v[0] : v })}
       aria-label="Patient age"
      />
      <div className="slider-endpoints"><span>18 yrs</span><span>54 yrs</span><span>90 yrs</span></div>
      <span className="patient-field-subtext">Subtle age-related disc thinning (~0.06%/yr after 40), midriff girth expansion, and declining GFR.</span>
     </div>

     <div className="patient-field-group">
      <div className="patient-field-header">
       <label>Height (Y-Axis Scaling)</label>
       <span className="patient-field-value">{patient.heightCm} cm <small>({Math.floor(patient.heightCm / 30.48)}&apos;{Math.round((patient.heightCm % 30.48) / 2.54)}&quot;)</small></span>
      </div>
      <Slider
       min={135}
       max={210}
       step={1}
       value={[patient.heightCm]}
       onValueChange={v => updatePatient({ heightCm: Array.isArray(v) ? v[0] : v })}
       aria-label="Patient height"
      />
      <div className="slider-endpoints"><span>135 cm (4&apos;5&quot;)</span><span>175 cm (Ref)</span><span>210 cm (6&apos;11&quot;)</span></div>
      <span className="patient-field-subtext">Scales the anatomy model vertically along the Y-axis (scale factor: {scale.scaleY.toFixed(2)}×).</span>
     </div>

     <div className="patient-field-group">
      <div className="patient-field-header">
       <label>Weight (Torso Girth Scaling)</label>
       <span className="patient-field-value">{patient.weightKg} kg <small>({Math.round(patient.weightKg * 2.20462)} lbs)</small></span>
      </div>
      <Slider
       min={40}
       max={140}
       step={1}
       value={[patient.weightKg]}
       onValueChange={v => updatePatient({ weightKg: Array.isArray(v) ? v[0] : v })}
       aria-label="Patient weight"
      />
      <div className="slider-endpoints"><span>40 kg</span><span>70 kg (Ref)</span><span>140 kg</span></div>
      <span className="patient-field-subtext">Scales torso girth along X and Z axes (girth factors: X {scale.scaleX.toFixed(2)}×, Z {scale.scaleZ.toFixed(2)}×).</span>
     </div>

     <div className="patient-field-group">
      <div className="patient-field-header">
       <label>ABO / Rh Blood Group</label>
       <span className="patient-field-value">{patient.bloodGroup}</span>
      </div>
      <div className="blood-group-grid">
       {(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as BloodGroup[]).map(bg => (
        <button
         key={bg}
         type="button"
         className={`blood-btn ${patient.bloodGroup === bg ? 'active' : ''}`}
         onClick={() => updatePatient({ bloodGroup: bg })}
        >
         {bg}
        </button>
       ))}
      </div>
     </div>

     <div className="patient-field-group">
      <div className="patient-field-header">
       <label>Documented Drug Allergy</label>
       <span className="patient-field-value">{patient.allergy === 'none' ? 'None (Tolerant)' : patient.allergy.toUpperCase()}</span>
      </div>
      <div className="patient-pill-group">
       <button
        type="button"
        className={`patient-pill-btn ${patient.allergy === 'none' ? 'active' : ''}`}
        onClick={() => updatePatient({ allergy: 'none' })}
       >
        No Known Allergies
       </button>
       <button
        type="button"
        className={`patient-pill-btn allergy ${patient.allergy === 'nsaids' ? 'active' : ''}`}
        onClick={() => updatePatient({ allergy: 'nsaids' })}
       >
        NSAIDs / Aspirin
       </button>
       <button
        type="button"
        className={`patient-pill-btn allergy ${patient.allergy === 'penicillin' ? 'active' : ''}`}
        onClick={() => updatePatient({ allergy: 'penicillin' })}
       >
        Penicillins
       </button>
       <button
        type="button"
        className={`patient-pill-btn allergy ${patient.allergy === 'sulfonamides' ? 'active' : ''}`}
        onClick={() => updatePatient({ allergy: 'sulfonamides' })}
       >
        Sulfonamides
       </button>
      </div>
      {patient.allergy !== 'none' && (
       <div className="allergy-alert-box">
        <span className="alert-icon">⚠</span>
        <div>
         <strong>Hypersensitivity Warning</strong>
         <p>Documented allergy to {patient.allergy === 'nsaids' ? 'NSAIDs (Aspirin, Ibuprofen)' : patient.allergy}. The drug digestion engine will block contraindicated simulation runs.</p>
        </div>
       </div>
      )}
     </div>

     <div className="patient-metrics-card">
      <div className="metrics-header">
       <span>DERIVED PHARMACOKINETIC METRICS</span>
       <Badge variant="outline" className={`bmi-badge ${scale.bmiCategory.toLowerCase()}`}>
        BMI: {scale.bmi.toFixed(1)} · {scale.bmiCategory}
       </Badge>
      </div>
      <div className="metrics-grid">
       <div className="metric-item">
        <span className="metric-label">Body Surface Area (BSA)</span>
        <span className="metric-value">{scale.bsa.toFixed(2)} <small>m²</small></span>
        <span className="metric-sub">Mosteller equation</span>
       </div>
       <div className="metric-item">
        <span className="metric-label">Total Body Water (TBW)</span>
        <span className="metric-value">{scale.tbwLiters.toFixed(1)} <small>L</small></span>
        <span className="metric-sub">Vd volume scalar</span>
       </div>
       <div className="metric-item">
        <span className="metric-label">Renal Clearance (eCrCl)</span>
        <span className="metric-value">{Math.round(scale.crClMlMin)} <small>mL/min</small></span>
        <span className="metric-sub">Cockcroft-Gault rate proxy</span>
       </div>
       <div className="metric-item">
        <span className="metric-label">3D Scale Vector</span>
        <span className="metric-value">{scale.scaleX.toFixed(2)} × {scale.scaleY.toFixed(2)} × {scale.scaleZ.toFixed(2)}</span>
        <span className="metric-sub">X (girth) · Y (height) · Z (AP)</span>
       </div>
      </div>
     </div>

     <div className="patient-actions">
      <Button
       variant="ghost"
       className="patient-reset-btn"
       onClick={() => updatePatient(DEFAULT_PATIENT_PROFILE)}
      >
       <RotateCcw size={16} /> Reset to Reference Male (175cm / 70kg)
      </Button>
      <Button
       className="patient-apply-btn"
       onClick={() => setPatientOpen(false)}
      >
       Done & View Twin
      </Button>
     </div>
    </div>
   </SheetContent>
  </Sheet>
    <Sheet open={about} onOpenChange={setAbout}>
   <SheetContent className="about-sheet glass" showCloseButton={true}>
    <div className="detail-header">
     <div className="detail-accent" style={{ background: '#0284c7' }} />
     <div className="eyebrow">ATTRIBUTION & DATASET LICENSING</div>
     <SheetTitle className="structure-title">Credits & Sources</SheetTitle>
     <SheetDescription>Open-source 3D anatomy, physiological rendering, and clinical pharmacokinetics.</SheetDescription>
    </div>

    <div className="credits-scroll">
     <div className="credits-disclaimer-card">
      <div className="credits-disclaimer-header">
       <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
       <span className="credits-disclaimer-title">CLINICAL & EDUCATIONAL DISCLAIMER</span>
      </div>
      <p className="credits-disclaimer-text">
       Body Twin is an educational demonstration and computational simulation platform. Stylized anatomical geometry and the 5-compartment Runge-Kutta pharmacokinetic model are intended strictly for educational insight. <strong>Not intended for clinical medical advice, dosage calculation, diagnosis, or patient management.</strong> Always consult a licensed healthcare professional for medical concerns.
      </p>
     </div>

     <div className="credits-card">
      <div className="credits-card-header">
       <span className="credits-kicker">3D ANATOMICAL GEOMETRY</span>
       <Badge variant="outline" className="credits-badge-cc">CC BY 4.0</Badge>
      </div>
      <h3 className="credits-card-title">BodyParts3D Anatomy Reference</h3>
      <p className="credits-card-body">
       <strong>BodyParts3D</strong>, © <em>The Database Center for Life Science (DBCLS)</em>, Research Organization of Information and Systems (ROIS), Japan.
      </p>
      <p className="credits-card-body">
       Constructed from an adult male reference anatomy (TARO MRI scan and anatomical illustration refinement). The digital model contains 2,234 individual high-resolution OBJ meshes representing 3,432 named anatomical concepts indexed in the Foundational Model of Anatomy (FMA) ontology.
      </p>
      <div className="credits-citation-box">
       <span className="credits-citation-label">PRIMARY PUBLICATION</span>
       <p className="credits-citation-text">
        Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. <em>BodyParts3D: 3D structure database for anatomical concepts.</em> Nucleic Acids Res. 2009 Jan;37(Database issue):D782-5. doi: 10.1093/nar/gkn613.
       </p>
      </div>
      <div className="credits-links-grid">
       <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="credits-link-btn">
        <span>Creative Commons CC BY 4.0 License</span>
        <ArrowUpRight size={13} />
       </a>
       <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noreferrer" className="credits-link-btn">
        <span>Official DBCLS License Statement</span>
        <ArrowUpRight size={13} />
       </a>
       <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html" target="_blank" rel="noreferrer" className="credits-link-btn">
        <span>BodyParts3D Geometry & Metadata Archive</span>
        <ArrowUpRight size={13} />
       </a>
       <a href="https://doi.org/10.1093/nar/gkn613" target="_blank" rel="noreferrer" className="credits-link-btn">
        <span>Read NAR Publication (PubMed / OUP)</span>
        <ArrowUpRight size={13} />
       </a>
      </div>
     </div>

     <div className="credits-card">
      <div className="credits-card-header">
       <span className="credits-kicker">SOFTWARE ARCHITECTURE & ENGINE</span>
       <Badge variant="outline" className="credits-badge-mit">MIT License</Badge>
      </div>
      <h3 className="credits-card-title">Human Atlas & Three.js</h3>
      <p className="credits-card-body">
       Built upon the open-source <strong>Human Atlas</strong> architecture created by <em>Ashish Shekar</em> (<a href="https://github.com/ashemag/human-atlas" target="_blank" rel="noreferrer" className="underline font-medium">ashemag/human-atlas</a>, MIT License).
      </p>
      <ul className="credits-list">
       <li><strong>Three.js (r159)</strong>: High-performance WebGL 3D graphics library (MIT License, Ricardo Cabello & Three.js authors).</li>
       <li><strong>meshoptimizer</strong>: Fast GPU mesh compression, indexing, and quantized coordinate decompression (MIT License, Arseny Kapoulkine).</li>
       <li><strong>React 19 & Vite</strong>: Modern declarative component UI and lightning-fast Rolldown ESM bundler.</li>
       <li><strong>Tailwind CSS & Lucide</strong>: Clinical design language and iconography.</li>
      </ul>
     </div>

     <div className="credits-card">
      <div className="credits-card-header">
       <span className="credits-kicker">PHARMACOKINETICS & CLINICAL CITATIONS</span>
       <Badge variant="secondary" className="credits-badge-pk">Peer-Reviewed</Badge>
      </div>
      <h3 className="credits-card-title">Pharmacokinetic Literature References</h3>
      <p className="credits-card-body">
       Every drug parameter implemented in <code className="credits-code">src/pk/drugs.json</code> is derived directly from peer-reviewed pharmacokinetic studies or marked with an explicit assumption tag for the 5-compartment Runge-Kutta ODE solver.
      </p>
      <div className="credits-drug-table-wrap">
       <table className="credits-drug-table">
        <thead>
         <tr>
          <th>Drug</th>
          <th>Bioavail. (F)</th>
          <th>Abs. Rate (k<sub>a</sub>)</th>
          <th>V<sub>d</sub></th>
          <th>Hepatic CL<sub>h</sub></th>
          <th>Renal CL<sub>r</sub></th>
         </tr>
        </thead>
        <tbody>
         <tr>
          <td><strong>Paracetamol</strong></td>
          <td>88%</td>
          <td>1.80 h⁻¹</td>
          <td>0.95 L/kg</td>
          <td>0.280 L/(h·kg)</td>
          <td>0.020 L/(h·kg)</td>
         </tr>
         <tr>
          <td colSpan={6} className="credits-table-cite">
           <strong>Citation:</strong> Prescott LF. <em>Kinetics and metabolism of paracetamol and phenacetin.</em> Br J Clin Pharmacol. 1980;10 Suppl 2:291S-298S.
          </td>
         </tr>
         <tr>
          <td><strong>Ibuprofen</strong></td>
          <td>95%</td>
          <td>1.20 h⁻¹</td>
          <td>0.15 L/kg</td>
          <td>0.055 L/(h·kg)</td>
          <td>0.005 L/(h·kg)</td>
         </tr>
         <tr>
          <td colSpan={6} className="credits-table-cite">
           <strong>Citation:</strong> Davies NM. <em>Clinical pharmacokinetics of ibuprofen: The first 30 years.</em> Clin Pharmacokinet. 1998;34(2):101-154.
          </td>
         </tr>
         <tr>
          <td><strong>Aspirin</strong></td>
          <td>68%</td>
          <td>2.50 h⁻¹</td>
          <td>0.17 L/kg</td>
          <td>0.550 L/(h·kg)</td>
          <td>0.050 L/(h·kg)</td>
         </tr>
         <tr>
          <td colSpan={6} className="credits-table-cite">
           <strong>Citation:</strong> Rowland M, Riegelman S. <em>Pharmacokinetics of acetylsalicylic acid and salicylic acid after oral administration in man.</em> J Pharm Sci. 1968;57(8):1313-1319.
          </td>
         </tr>
         <tr>
          <td><strong>Amoxicillin</strong></td>
          <td>80%</td>
          <td>1.10 h⁻¹</td>
          <td>0.30 L/kg</td>
          <td>0.040 L/(h·kg)</td>
          <td>0.220 L/(h·kg)</td>
         </tr>
         <tr>
          <td colSpan={6} className="credits-table-cite">
           <strong>Citation:</strong> Sjövall J, et al. <em>Dose-dependent absorption of amoxicillin and bacampicillin.</em> Clin Pharmacol Ther. 1985;38(3):241-250.
          </td>
         </tr>
        </tbody>
       </table>
      </div>
      <div className="credits-textbook-citations">
       <span className="credits-citation-label">STANDARD TEXTBOOK & REGULATORY REFERENCES</span>
       <ul className="credits-list-small">
        <li>Brunton LL, Hilal-Dandan R, Knollmann BC. <em>Goodman & Gilman's The Pharmacological Basis of Therapeutics (14th Ed).</em> McGraw-Hill, 2023.</li>
        <li>Rowland M, Tozer TN. <em>Clinical Pharmacokinetics and Pharmacodynamics: Concepts and Applications (5th Ed).</em> Wolters Kluwer, 2019.</li>
        <li>U.S. Food and Drug Administration (FDA) Center for Drug Evaluation and Research (CDER) Clinical Pharmacology and Biopharmaceutics Reviews.</li>
       </ul>
      </div>
     </div>

     <div className="credits-card">
      <div className="credits-card-header">
       <span className="credits-kicker">MODEL ADAPTATIONS & PIPELINE</span>
      </div>
      <h3 className="credits-card-title">Geometric & Numerical Pipeline</h3>
      <p className="credits-card-body">
       The source BodyParts3D geometry underwent coordinate transformation from millimeters/Z-up to meters/Y-up and stage alignment. Vertex positions and quantized 16-bit normal vectors were partitioned into 15 binary chunks. Progressive organ group lazy loading streams the critical external capsule and digestive landmarks first (&lt;400ms time to interactive), while deeper skeletal and vascular structures load asynchronously in the background.
      </p>
     </div>
    </div>
   </SheetContent>
  </Sheet>
 </main>;
}
