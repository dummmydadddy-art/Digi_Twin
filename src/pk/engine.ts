import type {
 DrugDefinition,
 PatientPkParams,
 PkCompartmentState,
 SimulationConfig,
 SimulationResult,
} from './types.ts';
import { DRUGS, checkDrugSafety, getDrugById } from './safety.ts';

export interface PkModelParameters {
 doseMg: number;
 kEmpty: number;       // h^-1
 ka: number;           // h^-1
 bioavailability: number; // F (0-1)
 vd: number;           // Liters
 kh: number;           // h^-1 (hepatic rate)
 kr: number;           // h^-1 (renal rate)
 ke: number;           // h^-1 (total elimination rate)
}

/**
 * Resolves patient-specific physiological pharmacokinetic parameters.
 */
export function resolvePkParameters(
 drug: DrugDefinition,
 doseMg: number,
 patient: PatientPkParams
): PkModelParameters {
 const weight = Math.max(30, patient.weightKg);

 // Volume of distribution scaled to patient weight (Liters)
 const vd = drug.vdPerKg * weight;

 // Reference total clearance for patient weight (L/h)
 const refTotalCl = drug.clPerKg * weight;

 // Hepatic clearance: scaled allometrically or directly from weight
 const clHepatic = refTotalCl * drug.hepaticFraction;

 // Renal clearance: modulated by Cockcroft-Gault estimated GFR (reference: 100 mL/min)
 const crClFactor = Math.max(0.2, Math.min(2.0, (patient.eCrCl || 100) / 100.0));
 const clRenal = refTotalCl * drug.renalFraction * crClFactor;

 // Elimination rate constants (h^-1)
 const kh = clHepatic / vd;
 const kr = clRenal / vd;
 const ke = kh + kr;

 return {
  doseMg,
  kEmpty: drug.kEmpty,
  ka: drug.ka,
  bioavailability: drug.bioavailability,
  vd,
  kh,
  kr,
  ke,
 };
}

/**
 * Evaluates the system of ordinary differential equations (ODEs)
 * State vector y indices:
 * 0: Stomach (mg)
 * 1: Gut / Intestinal lumen (mg)
 * 2: Systemic Plasma (mg)
 * 3: Liver Metabolized (mg)
 * 4: Kidney Excreted (mg)
 * 5: Unabsorbed Lumen Residue (mg)
 */
export function evaluateDerivatives(y: readonly number[], p: PkModelParameters): number[] {
 const stomach = Math.max(0, y[0]);
 const gut = Math.max(0, y[1]);
 const plasma = Math.max(0, y[2]);

 // Stomach emptying flux
 const emptyingFlux = p.kEmpty * stomach;

 // Intestinal absorption fluxes
 const totalAbsorptionOutflow = p.ka * gut;
 const systemicAbsorptionFlux = p.bioavailability * totalAbsorptionOutflow;
 const unabsorbedTransitFlux = (1.0 - p.bioavailability) * totalAbsorptionOutflow;

 // Systemic elimination fluxes
 const hepaticElimFlux = p.kh * plasma;
 const renalElimFlux = p.kr * plasma;

 const dStomach = -emptyingFlux;
 const dGut = emptyingFlux - totalAbsorptionOutflow;
 const dPlasma = systemicAbsorptionFlux - (hepaticElimFlux + renalElimFlux);
 const dLiver = hepaticElimFlux;
 const dKidney = renalElimFlux;
 const dUnabsorbed = unabsorbedTransitFlux;

 return [dStomach, dGut, dPlasma, dLiver, dKidney, dUnabsorbed];
}

/**
 * Fourth-Order Runge-Kutta (RK4) numerical integration step.
 * Guarantees exact mass conservation (sum of dy/dt = 0).
 */
export function rk4Step(
 y: readonly number[],
 h: number,
 p: PkModelParameters
): number[] {
 const k1 = evaluateDerivatives(y, p);

 const y2 = y.map((v, i) => Math.max(0, v + 0.5 * h * k1[i]));
 const k2 = evaluateDerivatives(y2, p);

 const y3 = y.map((v, i) => Math.max(0, v + 0.5 * h * k2[i]));
 const k3 = evaluateDerivatives(y3, p);

 const y4 = y.map((v, i) => Math.max(0, v + h * k3[i]));
 const k4 = evaluateDerivatives(y4, p);

 return y.map((v, i) => Math.max(0, v + (h / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i])));
}

/**
 * Runs a complete deterministic pharmacokinetic simulation.
 */
export function runSimulation(config: SimulationConfig): SimulationResult {
 const drug = getDrugById(config.drugId);
 if (!drug) {
  throw new Error(`Unknown drug ID: ${config.drugId}`);
 }

 const safety = checkDrugSafety(drug, config.doseMg, config.patient);
 const p = resolvePkParameters(drug, config.doseMg, config.patient);

 const duration = config.durationHours ?? 24.0;
 const h = config.timeStepHours ?? 0.01; // 36 seconds per step

 // Initial state: whole dose ingested in stomach
 let y: number[] = [config.doseMg, 0, 0, 0, 0, 0];
 let t = 0;

 let cmaxMgL = 0;
 let tmaxHours = 0;
 let aucMgLh = 0;
 let maxMassBalanceErrorPercent = 0;

 const sampleIntervalHours = 0.05; // sample every 3 minutes for smooth charts
 let nextSampleTime = 0;

 const samples: PkCompartmentState[] = [];

 function recordSample(currentTime: number, state: number[]): PkCompartmentState {
  const plasmaMg = state[2];
  const cp = plasmaMg / p.vd;
  const totalAccounted = state[0] + state[1] + state[2] + state[3] + state[4] + state[5];
  const massErrorPct = Math.abs((totalAccounted - config.doseMg) / config.doseMg) * 100.0;

  if (massErrorPct > maxMassBalanceErrorPercent) {
   maxMassBalanceErrorPercent = massErrorPct;
  }

  return {
   timeHours: Number(currentTime.toFixed(4)),
   stomachMg: Number(state[0].toFixed(4)),
   gutMg: Number(state[1].toFixed(4)),
   plasmaMg: Number(plasmaMg.toFixed(4)),
   plasmaConcentrationMgL: Number(cp.toFixed(4)),
   liverMetabolizedMg: Number(state[3].toFixed(4)),
   kidneyExcretedMg: Number(state[4].toFixed(4)),
   unabsorbedMg: Number(state[5].toFixed(4)),
   totalAccountedMg: Number(totalAccounted.toFixed(4)),
   massBalanceErrorPercent: Number(massErrorPct.toExponential(4)),
  };
 }

 // Initial sample at t=0
 const initialSample = recordSample(0, y);
 samples.push(initialSample);

 let prevCp = 0;

 while (t < duration) {
  const stepH = Math.min(h, duration - t);
  y = rk4Step(y, stepH, p);
  t += stepH;

  const currentCp = y[2] / p.vd;
  aucMgLh += 0.5 * (prevCp + currentCp) * stepH;
  prevCp = currentCp;

  if (currentCp > cmaxMgL) {
   cmaxMgL = currentCp;
   tmaxHours = t;
  }

  if (t >= nextSampleTime || t >= duration) {
   samples.push(recordSample(t, y));
   nextSampleTime = t + sampleIntervalHours;
  }
 }

 const finalState = samples[samples.length - 1];

 return {
  config,
  drug,
  safety,
  samples,
  tmaxHours: Number(tmaxHours.toFixed(3)),
  cmaxMgL: Number(cmaxMgL.toFixed(3)),
  aucMgLh: Number(aucMgLh.toFixed(3)),
  finalState,
  maxMassBalanceErrorPercent,
 };
}
