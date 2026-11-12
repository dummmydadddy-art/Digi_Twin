export type SystemId = 'skeletal'|'muscular'|'arterial'|'venous'|'nervous'|'digestive'|'respiratory'|'urinary'|'reproductive'|'lymphatic'|'endocrine'|'integumentary'|'connective'|'sensory'|'cardiac';
export const SYSTEMS: {id:SystemId;name:string;color:string;description:string}[] = [
 {id:'skeletal',name:'Skeleton',color:'#e2d9ba',description:'Bones form the supporting framework of the body, protect organs, and provide attachment points for muscles. Their internal tissue also stores minerals and produces blood cells.'},
 {id:'muscular',name:'Muscles',color:'#a85b50',description:'Skeletal muscles generate movement by pulling on their attachments. Together with tendons, they move joints, stabilize posture, and produce heat.'},
 {id:'cardiac',name:'Heart',color:'#b96760',description:'The heart is a muscular pump with four chambers. Its valves direct blood forward through the pulmonary and systemic circuits.'},
 {id:'sensory',name:'Sensory organs',color:'#b0c8ce',description:'These structures contribute to special senses, including sight, hearing, and balance. Their specialized tissues detect stimuli and work with the nervous system to convey information.'},
 {id:'arterial',name:'Arteries',color:'#c05245',description:'The heart drives blood through the circulation. Arteries carry blood away from the heart to supply tissues or, in the pulmonary circuit, to the lungs.'},
 {id:'venous',name:'Veins',color:'#527c9f',description:'Veins return blood toward the heart. Superficial and deep networks collect blood from the tissues; the pulmonary veins bring oxygenated blood back from the lungs.'},
 {id:'nervous',name:'Nervous system',color:'#d8b565',description:'The brain, spinal cord, and peripheral nerves carry and process signals. They support sensation, movement, coordination, and automatic regulation of body functions.'},
 {id:'respiratory',name:'Respiratory',color:'#b98991',description:'The airways conduct air to the lungs, where oxygen and carbon dioxide move between air and blood. Breathing depends on pressure changes produced by respiratory muscles.'},
 {id:'digestive',name:'Digestive',color:'#b8916b',description:'The digestive tract breaks down food, absorbs nutrients and water, and moves waste onward. Accessory organs contribute bile and digestive enzymes.'},
 {id:'urinary',name:'Urinary',color:'#b47961',description:'The kidneys filter blood and regulate fluid, electrolyte, and acid–base balance. Urine travels through the ureters to the bladder and exits through the urethra.'},
 {id:'lymphatic',name:'Lymphatic',color:'#879f7c',description:'Lymphatic vessels return excess tissue fluid to the circulation. Lymph nodes and other lymphoid organs support immune surveillance and responses.'},
 {id:'endocrine',name:'Endocrine',color:'#c5a09a',description:'Endocrine organs release hormones into the blood to coordinate processes such as metabolism, growth, stress responses, and reproduction.'},
 {id:'reproductive',name:'Reproductive',color:'#bda098',description:'The male reproductive structures represented here contribute to sperm production, maturation, transport, and the production of sex hormones.'},
 {id:'integumentary',name:'Body surface',color:'#ba9b7d',description:'The body surface provides an outer anatomical reference. The integumentary system forms a protective barrier and contributes to sensation and temperature regulation.'},
 {id:'connective',name:'Connective tissue',color:'#aec3bb',description:'Cartilage, ligaments, and other connective tissues support, connect, and separate structures. Their roles include stabilizing joints and distributing mechanical loads.'},
];

export interface Part {id:string;name:string;conceptId:string;system:SystemId;chunk:number;positions:number;normals:number;indices:number;vertexCount:number;indexCount:number;bounds:[number[],number[]]}
export interface Concept {id:string;name:string;elements:string[]}
export interface Atlas {version:string;sex?:'male';source?:string;scope?:string;parts:Part[];concepts:Concept[];chunks:{url:string;bytes:number;gzip?:string;gzipBytes?:number}[];triangles:number}
export type View = 'three-quarter'|'front'|'back'|'side';
export type PeelTier = 0 | 1 | 2 | 3;

export function getSystemTier(system: SystemId): PeelTier {
 if (system === 'integumentary') return 0;
 if (system === 'muscular' || system === 'connective') return 1;
 if (system === 'skeletal') return 2;
 return 3;
}

export interface OrganDossier {
 name: string;
 system: SystemId;
 location: string;
 function: string;
 facts: string[];
 isSurfaceOnly: boolean;
 geometryNote?: string;
}

export const ORGAN_DOSSIERS: Record<string, OrganDossier> = {
 'heart': {
  name: 'Heart',
  system: 'cardiac',
  location: 'Middle mediastinum of the thorax, between both lungs and posterior to the sternal body.',
  function: 'Four-chambered muscular pump circulating deoxygenated blood to the lungs and oxygenated blood through the systemic arterial tree.',
  facts: [
   'Pumps approximately 7,200 liters of blood each day, contracting ~100,000 times in 24 hours.',
   'Intrinsic rhythm generated by the sinoatrial (SA) pacemaker node, modulated by autonomic sympathetic and parasympathetic inputs.',
   'Left ventricular myocardium is roughly 3 times thicker than the right to overcome systemic vascular resistance (~120 mmHg vs ~25 mmHg).'
  ],
  isSurfaceOnly: false,
  geometryNote: 'Compound anatomical structure with 83 distinct meshes (atria, ventricles, septum, valves, and aortic root).'
 },
 'stomach': {
  name: 'Stomach',
  system: 'digestive',
  location: 'Upper left abdominal quadrant (epigastric and left hypochondriac regions), inferior to the left hemidiaphragm.',
  function: 'Stores ingested food, breaks down peptide bonds with hydrochloric acid and pepsin, and releases acidified chyme incrementally into the duodenum.',
  facts: [
   'Parietal cells secrete gastric acid maintaining a pH of 1.5–2.0, which denatures dietary proteins and sterilizes ingested contents.',
   'Protected by an adherent mucus-bicarbonate barrier that shields epithelial cells from peptic erosion and self-digestion.',
   'Primary dissolution site for oral tablets and capsules; weakly acidic molecules (e.g. aspirin) undergo partial non-ionized lipid diffusion here.'
  ],
  isSurfaceOnly: true,
  geometryNote: 'Surface-only mesh in reference anatomy; cross-section generated via shader cutaway.'
 },
 'liver': {
  name: 'Liver',
  system: 'digestive',
  location: 'Right upper quadrant of the abdominal cavity, sheltered by the thoracic ribcage directly below the diaphragm.',
  function: 'Central biochemical laboratory performing carbohydrate storage, bile synthesis, plasma albumin production, and xenobiotic biotransformation.',
  facts: [
   'Receives ~75% of blood flow from the portal vein (nutrient-rich from the gut) and ~25% from the hepatic artery (oxygen-rich).',
   'Cytochrome P450 enzymes (CYP3A4, CYP2C9, CYP2D6) catalyze Phase I oxidative drug clearance, mediating oral first-pass bioavailability.',
   'Hepatocytes possess remarkable mitotic regenerative capability, able to rebuild normal architecture following substantial parenchymal resection.'
  ],
  isSurfaceOnly: false,
  geometryNote: 'Compound anatomical concept with 60 meshes modeling functional parenchymal segments and intrahepatic vasculature.'
 },
 'lungs': {
  name: 'Lungs',
  system: 'respiratory',
  location: 'Thoracic cavity flanking the mediastinum, bounded anterolaterally by the ribcage and inferiorly by the diaphragmatic domes.',
  function: 'Alveolocapillary gas exchange—passively diffusing atmospheric oxygen into venous blood and releasing metabolic carbon dioxide.',
  facts: [
   'Right lung comprises 3 lobes (superior, middle, inferior); left lung comprises 2 lobes to accommodate the cardiac notch.',
   'Contains ~300 million alveoli creating an aggregate epithelial surface area of 70–100 m² for rapid gas diffusion.',
   'Pulmonary capillary transit time for red blood cells is approximately 0.75 seconds, dropping to ~0.25 seconds under peak cardiac output.'
  ],
  isSurfaceOnly: false,
  geometryNote: 'Reference model captures complete bronchial and pulmonary vascular trees; outer pleural envelope is omitted to expose internal airways.'
 },
 'kidneys': {
  name: 'Kidneys',
  system: 'urinary',
  location: 'Retroperitoneal space against the posterior abdominal wall flanking T12–L3 vertebrae, cushioned by perirenal adipose tissue.',
  function: 'Ultrafilters blood plasma, clears nitrogenous wastes (urea, creatinine), and balances extracellular fluid osmolarity and acid-base status.',
  facts: [
   'Filter ~180 liters of glomerular plasma daily through 2 million nephrons, reabsorbing 99% of filtrate to excrete ~1.5 liters of urine.',
   'Primary excretion gateway for water-soluble polar drugs and drug metabolites via glomerular filtration and active tubular secretion.',
   'Endocrine role: synthesizes erythropoietin (stimulating bone marrow red cell production) and renin (regulating arterial blood pressure).'
  ],
  isSurfaceOnly: true,
  geometryNote: 'Surface-only mesh in reference anatomy; cross-section generated via shader cutaway.'
 },
 'brain': {
  name: 'Brain',
  system: 'nervous',
  location: 'Cranial cavity within the neurocranium, enveloped by three meningeal layers and cushioned by cerebrospinal fluid.',
  function: 'Central nervous system master regulator integrating sensory inputs, consciousness, executive reasoning, memory, and autonomic tone.',
  facts: [
   'Accounts for ~2% of total adult body mass (~1.4 kg) while consuming ~20% of resting oxygen and ~25% of systemic glucose.',
   'Endothelial tight junctions form the blood-brain barrier (BBB), strictly limiting entry of polar molecules, proteins, and water-soluble medications.',
   'BodyParts3D reference includes 59 sub-structures including cerebral hemispheres, thalamus, brainstem, ventricles, and cerebellum.'
  ],
  isSurfaceOnly: false,
  geometryNote: 'Compound anatomical concept with 59 sub-structures including cerebral hemispheres, brainstem, ventricles, and cerebellum.'
 },
 'small intestine': {
  name: 'Small Intestine',
  system: 'digestive',
  location: 'Central and lower abdominal cavity, framed by the ascending, transverse, and descending segments of the large intestine.',
  function: 'Enzymatic nutrient cleavage and primary absorption site for water, electrolytes, amino acids, monosaccharides, and therapeutic drugs.',
  facts: [
   'Circular plicae, microscopic villi, and apical microvilli expand the functional luminal surface area to over 30 m².',
   'Enterocytes express efflux transporters (P-glycoprotein/ABCB1) and CYP3A4 enzymes, conducting intestinal first-pass pre-systemic metabolism.',
   'Coordinated migratory motor complexes and segmenting peristalsis propel luminal chyme at approximately 1–2 cm/s.'
  ],
  isSurfaceOnly: false,
  geometryNote: 'Segmental sub-structures: duodenum (FJ2573), 23 jejunum loops, and 32 ileum loops.'
 },
 'urinary bladder': {
  name: 'Urinary Bladder',
  system: 'urinary',
  location: 'Pelvic cavity floor, directly posterior to the pubic symphysis and anterior to the rectum in the adult male.',
  function: 'Distensible hollow muscular reservoir storing urine continuously delivered by the ureters until conscious micturition.',
  facts: [
   'Urothelium transitional epithelium reversibly thins from 6–8 cell layers when collapsed to 2–3 layers when filled.',
   'Detrusor smooth muscle coat contracts under parasympathetic pelvic nerve control to evacuate urine through the urethra.',
   'Typical physiological storage capacity is 400–600 mL; initial sensory urge to void triggers at approximately 150–200 mL.'
  ],
  isSurfaceOnly: true,
  geometryNote: 'Surface-only mesh in reference anatomy; cross-section generated via shader cutaway.'
 },
 'esophagus': {
  name: 'Esophagus',
  system: 'digestive',
  location: 'Posterior mediastinum of the thorax, descending posterior to the trachea and pericardium to pierce the diaphragm at T10.',
  function: 'Muscular transit conduit moving swallowed food boluses and medication tablets from pharynx to gastric cardia via coordinated peristalsis.',
  facts: [
   'Measures ~25 cm in length; muscularis externa transitions from striated muscle in upper third, to mixed middle, to smooth muscle in lower third.',
   'High-pressure tonic contraction of the lower esophageal sphincter (LES) prevents acidic gastric reflux back into the esophageal lumen.',
   'Mean transit time for a swallowed solid tablet with 50 mL of water is approximately 5 to 10 seconds under gravity and peristalsis.'
  ],
  isSurfaceOnly: true,
  geometryNote: 'Surface-only mesh in reference anatomy; cross-section generated via shader cutaway.'
 },
 'pancreas': {
  name: 'Pancreas',
  system: 'endocrine',
  location: 'Retroperitoneal space across the posterior abdominal wall; head is embraced by the duodenal C-loop, tail reaches splenic hilum.',
  function: 'Dual exocrine gland (secreting alkaline digestive enzymes into duodenum) and endocrine gland (releasing insulin and glucagon into blood).',
  facts: [
   'Acinar cells produce ~1.5 liters per day of alkaline fluid packed with trypsinogen, chymotrypsinogen, amylase, and pancreatic lipase.',
   'Islets of Langerhans beta cells secrete insulin in response to glycemic rises, while alpha cells secrete glucagon to mobilize hepatic glycogen.',
   'Reference model includes main parenchyma and pancreatic ductal branches.'
  ],
  isSurfaceOnly: false,
  geometryNote: 'Compound anatomical structure with 4 meshes modeling main parenchyma and ductal branches.'
 },
};

export function getOrganDossier(name: string): OrganDossier | null {
 const term = name.toLowerCase();
 for (const [key, dossier] of Object.entries(ORGAN_DOSSIERS)) {
  if (term.includes(key) || key.includes(term)) return dossier;
 }
 if (term.includes('kidney')) return ORGAN_DOSSIERS['kidneys'];
 if (term.includes('lung')) return ORGAN_DOSSIERS['lungs'];
 if (term.includes('intestine') || term.includes('duodenum') || term.includes('jejunum') || term.includes('ileum')) return ORGAN_DOSSIERS['small intestine'];
 if (term.includes('oesophagus')) return ORGAN_DOSSIERS['esophagus'];
 if (term.includes('bladder')) return ORGAN_DOSSIERS['urinary bladder'];
 return null;
}

export interface SceneState {
 inspectorOpen?: boolean;
 explode: number;
 peel: number;
 cutaway: boolean;
 visible: SystemId[];
 selected: string[];
 isolate: boolean;
 view: View;
 rotate: boolean;
 reset: number;
 patient?: PatientProfile;
}

export type Sex = 'male' | 'female';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type DrugAllergy = 'none' | 'penicillin' | 'nsaids' | 'sulfonamides';

export interface PatientProfile {
 sex: Sex;
 age: number;       // 18 - 90
 heightCm: number;  // 135 - 210
 weightKg: number;  // 40 - 140
 bloodGroup: BloodGroup;
 allergy: DrugAllergy;
}

export const DEFAULT_PATIENT_PROFILE: PatientProfile = {
 sex: 'male',
 age: 30,
 heightCm: 175,
 weightKg: 70,
 bloodGroup: 'O+',
 allergy: 'none',
};

export interface AnatomicalScale {
 scaleX: number; // Lateral girth (width)
 scaleY: number; // Vertical height
 scaleZ: number; // Anteroposterior girth (depth)
 bmi: number;
 bmiCategory: 'Underweight' | 'Normal' | 'Overweight' | 'Obese';
 bsa: number; // Mosteller formula: sqrt(H * W / 3600)
 tbwLiters: number; // Total body water estimate for Vd
 crClMlMin: number; // Cockcroft-Gault creatinine clearance proxy
}

export function computeAnatomicalScale(p: PatientProfile = DEFAULT_PATIENT_PROFILE): AnatomicalScale {
 const heightM = Math.max(1.2, Math.min(2.2, p.heightCm / 100));
 const weight = Math.max(35, Math.min(160, p.weightKg));
 const age = Math.max(18, Math.min(95, p.age));

 // Height scaling along Y
 const baseScaleY = p.heightCm / 175.0;
 const ageHeightFactor = 1.0 - Math.max(0, age - 40) * 0.0006;
 const sexHeightFactor = p.sex === 'female' ? 0.985 : 1.0;
 const scaleY = Math.max(0.75, Math.min(1.25, baseScaleY * ageHeightFactor * sexHeightFactor));

 // Girth scaling from BMI and Weight
 const bmi = weight / (heightM * heightM);
 const refBmi = 22.857; // standard male 70kg / (1.75m)^2
 const baseGirth = Math.sqrt(Math.max(0.5, Math.min(2.5, bmi / refBmi)));

 // Age & Sex adjustments to girth proportions
 const ageGirthFactor = 1.0 + Math.min(0.08, Math.max(0, age - 30) * 0.0012);
 const sexXFactor = p.sex === 'female' ? 0.96 : 1.0;
 const sexZFactor = p.sex === 'female' ? 1.04 : 1.0;

 const scaleX = Math.max(0.70, Math.min(1.45, baseGirth * ageGirthFactor * sexXFactor));
 const scaleZ = Math.max(0.70, Math.min(1.45, baseGirth * ageGirthFactor * sexZFactor));

 const bmiCategory: AnatomicalScale['bmiCategory'] =
  bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';

 const bsa = Math.sqrt((p.heightCm * weight) / 3600.0);
 const tbwFraction = (p.sex === 'female' ? 0.50 : 0.60) * (1.0 - (age - 20) * 0.0015);
 const tbwLiters = weight * Math.max(0.40, tbwFraction);

 const rawCrCl = ((140 - age) * weight) / (72 * 1.0);
 const crClMlMin = p.sex === 'female' ? rawCrCl * 0.85 : rawCrCl;

 return {
  scaleX,
  scaleY,
  scaleZ,
  bmi,
  bmiCategory,
  bsa,
  tbwLiters,
  crClMlMin,
 };
}

export const DEFAULT_VISIBLE: SystemId[] = ['integumentary','cardiac','sensory','skeletal','muscular','arterial','venous','nervous','respiratory','digestive','urinary','lymphatic','endocrine','reproductive','connective'];

export const EXPLANATIONS: Record<string, string> = {
 'heart':'A muscular pump in the chest. Its right side sends blood to the lungs; its left side sends blood through the systemic circulation.',
 'liver':'A large organ beneath the right side of the diaphragm. It processes absorbed nutrients, produces bile, and synthesizes many proteins carried in the blood.',
 'brain':'The central organ of the nervous system. Its interconnected regions support perception, movement, memory, language, and the regulation of bodily functions.',
 'stomach':'A muscular chamber between the esophagus and small intestine. It stores and mixes food with acid and enzymes before releasing it into the duodenum.',
 'spleen':'A lymphoid organ in the upper left abdomen. It filters blood, removes aging blood cells, and participates in immune responses.',
 'pancreas':'An abdominal organ with digestive and endocrine roles. It supplies enzymes to the small intestine and releases hormones including insulin and glucagon.',
 'urinary bladder':'A muscular reservoir in the pelvis that stores urine arriving from the kidneys through the ureters.',
 'trachea':'The main airway connecting the larynx to the bronchi. Its cartilage supports keep the airway open during breathing.',
 'diaphragm':'A broad muscle separating the chest and abdomen. When it contracts, it increases chest volume and helps draw air into the lungs.',
};

export function explanation(name:string,system:SystemId){
 const dossier = getOrganDossier(name);
 if (dossier) return dossier.function;
 return EXPLANATIONS[name.toLowerCase()] ?? SYSTEMS.find(s=>s.id===system)?.description ?? '';
}
