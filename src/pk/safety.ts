import type { DrugDefinition, PatientPkParams, SafetyCheckResult } from './types.ts';
import drugsData from './drugs.json' with { type: 'json' };

export const DRUGS: DrugDefinition[] = drugsData as DrugDefinition[];

export function getDrugById(id: string): DrugDefinition | undefined {
 return DRUGS.find(d => d.id === id);
}

/**
 * Evaluates patient allergy contraindications and weight-adjusted dose safety.
 */
export function checkDrugSafety(
 drug: DrugDefinition,
 doseMg: number,
 patient: PatientPkParams
): SafetyCheckResult {
 const weight = Math.max(30, patient.weightKg);
 const weightDoseMgKg = doseMg / weight;
 const maxSafeDoseMgKg = drug.maxSingleDosePerKg;

 // 1. Strict Allergy Contraindication Check
 let isBlocked = false;
 let blockReason: string | undefined;

 if (patient.allergy !== 'none' && drug.contraindicatedAllergy === patient.allergy) {
  isBlocked = true;
  if (patient.allergy === 'penicillin') {
   blockReason = `CONTRAINDICATION: Patient has a documented Penicillin hypersensitivity. ${drug.name} (${drug.genericName}) is a beta-lactam aminopenicillin and carries severe risk of type I IgE-mediated anaphylaxis. Simulation execution is locked.`;
  } else if (patient.allergy === 'nsaids') {
   blockReason = `CONTRAINDICATION: Patient has documented NSAID / Aspirin hypersensitivity. ${drug.name} inhibits cyclooxygenase (COX-1/COX-2) and may trigger severe cross-reactive bronchospasm, urticaria, or anaphylactoid collapse. Simulation execution is locked.`;
  } else {
   blockReason = `CONTRAINDICATION: Patient has documented allergy to ${patient.allergy}. ${drug.name} is contraindicated in this patient. Simulation execution is locked.`;
  }
 }

 // 2. Per-Kg Dose Warning Check
 let hasWarning = false;
 let warningMessage: string | undefined;

 if (weightDoseMgKg > maxSafeDoseMgKg) {
  hasWarning = true;
  const excessPercent = Math.round(((weightDoseMgKg - maxSafeDoseMgKg) / maxSafeDoseMgKg) * 100);
  warningMessage = `HIGH DOSE WARNING: Selected dose of ${doseMg} mg corresponds to ${weightDoseMgKg.toFixed(1)} mg/kg for this ${patient.weightKg} kg patient, exceeding the standard safe single threshold of ${maxSafeDoseMgKg.toFixed(1)} mg/kg by ${excessPercent}%. Risk of elevated plasma peak and adverse organ load.`;
 } else if (doseMg > drug.maxSingleDoseMg) {
  hasWarning = true;
  warningMessage = `HIGH DOSE WARNING: Selected dose of ${doseMg} mg exceeds standard single adult maximum dose (${drug.maxSingleDoseMg} mg).`;
 }

 return {
  allowed: !isBlocked,
  isBlocked,
  blockReason,
  hasWarning,
  warningMessage,
  weightDoseMgKg,
  maxSafeDoseMgKg,
 };
}
