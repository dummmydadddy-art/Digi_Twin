/**
 * Pharmacokinetic Compartment Types & Drug Model Contracts
 * Strictly sourced clinical pharmacology for Body Twin educational simulator.
 */

export type DrugId = 'paracetamol' | 'ibuprofen' | 'aspirin' | 'amoxicillin';
export type AllergyType = 'none' | 'penicillin' | 'nsaids' | 'sulfonamides';
export type ClearanceRoute = 'hepatic' | 'renal' | 'mixed';

export interface DocumentedPeakRange {
 tmaxHours: { min: number; max: number };
 cmaxRangeForStandardDoseMgL: { min: number; max: number };
}

export interface DrugDefinition {
 id: DrugId;
 name: string;
 genericName: string;
 therapeuticClass: string;
 standardDoseMg: number;
 availableDosesMg: number[];
 maxSingleDoseMg: number;
 maxDailyDoseMg: number;
 maxSingleDosePerKg: number; // safe threshold (mg/kg)
 contraindicatedAllergy: AllergyType;
 clearanceRoute: ClearanceRoute;

 // Kinetic parameters
 bioavailability: number;   // F (fraction 0-1)
 kEmpty: number;            // stomach emptying rate constant (h^-1)
 ka: number;                // absorption rate constant (h^-1)
 vdPerKg: number;           // volume of distribution (L/kg)
 clPerKg: number;           // total clearance in reference adult (L/h/kg)
 hepaticFraction: number;   // fraction of clearance via liver (0-1)
 renalFraction: number;     // fraction of clearance via kidney (0-1)
 halfLifeHours: number;     // elimination half-life in reference adult (h)

 // Clinical therapeutic & toxic windows (mg/L = mcg/mL)
 targetRangeMgL: { min: number; max: number };
 toxicThresholdMgL: number;

 // Validated literature peak windows for 70kg adult standard dose
 documentedPeak: DocumentedPeakRange;

 // Explicit source citations or "assumption: ..." tags for every parameter
 sources: {
  bioavailability: string;
  kEmpty: string;
  ka: string;
  vdPerKg: string;
  clPerKg: string;
  hepaticFraction: string;
  renalFraction: string;
  halfLifeHours: string;
  targetRangeMgL: string;
  toxicThresholdMgL: string;
  documentedPeak: string;
 };
}

export interface PatientPkParams {
 weightKg: number;
 heightCm: number;
 age: number;
 sex: 'male' | 'female';
 allergy: AllergyType;
 eCrCl: number; // Cockcroft-Gault estimated clearance (mL/min)
}

export interface PkCompartmentState {
 timeHours: number;
 stomachMg: number;
 gutMg: number;
 plasmaMg: number;
 plasmaConcentrationMgL: number;
 liverMetabolizedMg: number;
 kidneyExcretedMg: number;
 unabsorbedMg: number;
 totalAccountedMg: number;
 massBalanceErrorPercent: number;
}

export interface SafetyCheckResult {
 allowed: boolean;
 isBlocked: boolean;
 blockReason?: string;
 hasWarning: boolean;
 warningMessage?: string;
 weightDoseMgKg: number;
 maxSafeDoseMgKg: number;
}

export interface SimulationConfig {
 drugId: DrugId;
 doseMg: number;
 patient: PatientPkParams;
 durationHours?: number;   // default 12 or 24 hours
 timeStepHours?: number;   // default 0.01 h (36 s)
}

export interface SimulationResult {
 config: SimulationConfig;
 drug: DrugDefinition;
 safety: SafetyCheckResult;
 samples: PkCompartmentState[];
 tmaxHours: number;
 cmaxMgL: number;
 aucMgLh: number; // Area under curve (trapezoidal)
 finalState: PkCompartmentState;
 maxMassBalanceErrorPercent: number;
}

// Worker message contracts
export type WorkerInMessage =
 | { type: 'RUN_SIMULATION'; payload: SimulationConfig }
 | { type: 'CHECK_SAFETY'; payload: { drugId: DrugId; doseMg: number; patient: PatientPkParams } };

export type WorkerOutMessage =
 | { type: 'SIMULATION_RESULT'; payload: SimulationResult }
 | { type: 'SAFETY_RESULT'; payload: SafetyCheckResult }
 | { type: 'SIMULATION_ERROR'; payload: { message: string } };
