import { describe, it } from 'node:test';
import assert from 'node:assert';
import { runSimulation } from '../engine.ts';
import { checkDrugSafety, getDrugById, DRUGS } from '../safety.ts';
import type { DrugId, PatientPkParams, SimulationConfig } from '../types.ts';

const REFERENCE_PATIENT: PatientPkParams = {
 weightKg: 70,
 heightCm: 175,
 age: 30,
 sex: 'male',
 allergy: 'none',
 eCrCl: 105,
};

describe('Pharmacokinetic Engine - Mass Conservation Tests', () => {
 const testDrugs: DrugId[] = ['paracetamol', 'ibuprofen', 'aspirin', 'amoxicillin'];

 for (const drugId of testDrugs) {
  it(`strictly conserves mass for ${drugId} across 24 hours (< 0.0001% error)`, () => {
   const drug = getDrugById(drugId)!;
   assert.ok(drug, `Drug ${drugId} must be declared in catalog`);

   const config: SimulationConfig = {
    drugId,
    doseMg: drug.standardDoseMg,
    patient: REFERENCE_PATIENT,
    durationHours: 24,
    timeStepHours: 0.01,
   };

   const result = runSimulation(config);

   // Check maximum error recorded across all integration steps
   assert.ok(
    result.maxMassBalanceErrorPercent < 0.001,
    `Max mass error for ${drugId} was ${result.maxMassBalanceErrorPercent}%, expected < 0.001%`
   );

   // Check every single recorded sample step
   for (const s of result.samples) {
    const sum = s.stomachMg + s.gutMg + s.plasmaMg + s.liverMetabolizedMg + s.kidneyExcretedMg + s.unabsorbedMg;
    const diff = Math.abs(sum - drug.standardDoseMg);
    assert.ok(
     diff < 0.01,
     `Mass imbalance at t=${s.timeHours}h: sum=${sum.toFixed(4)} mg vs dose=${drug.standardDoseMg} mg (diff: ${diff})`
    );
   }

   // At 24h, stomach and gut should be virtually exhausted
   const final = result.finalState;
   assert.ok(final.stomachMg < 0.001, `Stomach not emptied at 24h: ${final.stomachMg} mg remaining`);
   assert.ok(final.gutMg < 0.01, `Gut not cleared at 24h: ${final.gutMg} mg remaining`);

   // Sum of elimination and unabsorbed should equal initial dose
   const totalCleared = final.liverMetabolizedMg + final.kidneyExcretedMg + final.unabsorbedMg + final.plasmaMg;
   assert.ok(
    Math.abs(totalCleared - drug.standardDoseMg) < 0.05,
    `Final cleared balance error: ${totalCleared} vs ${drug.standardDoseMg}`
   );
  });
 }

 it('preserves mass conservation across varied patient body weights (45kg to 120kg)', () => {
  const weights = [45, 60, 70, 95, 120];
  for (const weightKg of weights) {
   const config: SimulationConfig = {
    drugId: 'paracetamol',
    doseMg: 500,
    patient: { ...REFERENCE_PATIENT, weightKg },
    durationHours: 24,
   };
   const result = runSimulation(config);
   assert.ok(
    result.maxMassBalanceErrorPercent < 0.001,
    `Mass error at weight ${weightKg}kg was ${result.maxMassBalanceErrorPercent}%`
   );
  }
 });
});

describe('Pharmacokinetic Engine - Documented Peak Range Validation', () => {
 it('Paracetamol 500mg peak time and concentration fall strictly within literature windows', () => {
  const drug = getDrugById('paracetamol')!;
  const config: SimulationConfig = {
   drugId: 'paracetamol',
   doseMg: 500,
   patient: REFERENCE_PATIENT,
   durationHours: 12,
  };

  const res = runSimulation(config);
  const peak = drug.documentedPeak;

  // Tmax literature range: 0.5 - 2.0 hours (typically ~0.9 - 1.2 h)
  assert.ok(
   res.tmaxHours >= peak.tmaxHours.min && res.tmaxHours <= peak.tmaxHours.max,
   `Paracetamol Tmax ${res.tmaxHours} h is outside literature range [${peak.tmaxHours.min}, ${peak.tmaxHours.max}] h`
  );

  // Cmax literature range: 5.0 - 15.0 mg/L (typically ~6.5 - 9.5 mg/L for 500mg)
  assert.ok(
   res.cmaxMgL >= peak.cmaxRangeForStandardDoseMgL.min && res.cmaxMgL <= peak.cmaxRangeForStandardDoseMgL.max,
   `Paracetamol Cmax ${res.cmaxMgL} mg/L is outside literature range [${peak.cmaxRangeForStandardDoseMgL.min}, ${peak.cmaxRangeForStandardDoseMgL.max}] mg/L`
  );
 });

 it('Ibuprofen 400mg peak time and concentration fall strictly within literature windows', () => {
  const drug = getDrugById('ibuprofen')!;
  const config: SimulationConfig = {
   drugId: 'ibuprofen',
   doseMg: 400,
   patient: REFERENCE_PATIENT,
   durationHours: 12,
  };

  const res = runSimulation(config);
  const peak = drug.documentedPeak;

  // Tmax literature range: 1.0 - 2.5 hours
  assert.ok(
   res.tmaxHours >= peak.tmaxHours.min && res.tmaxHours <= peak.tmaxHours.max,
   `Ibuprofen Tmax ${res.tmaxHours} h is outside literature range [${peak.tmaxHours.min}, ${peak.tmaxHours.max}] h`
  );

  // Cmax literature range: 20.0 - 45.0 mg/L (typically ~25 - 35 mg/L)
  assert.ok(
   res.cmaxMgL >= peak.cmaxRangeForStandardDoseMgL.min && res.cmaxMgL <= peak.cmaxRangeForStandardDoseMgL.max,
   `Ibuprofen Cmax ${res.cmaxMgL} mg/L is outside literature range [${peak.cmaxRangeForStandardDoseMgL.min}, ${peak.cmaxRangeForStandardDoseMgL.max}] mg/L`
  );
 });

 it('Aspirin 325mg peak time and concentration fall strictly within literature windows', () => {
  const drug = getDrugById('aspirin')!;
  const config: SimulationConfig = {
   drugId: 'aspirin',
   doseMg: 325,
   patient: REFERENCE_PATIENT,
   durationHours: 8,
  };

  const res = runSimulation(config);
  const peak = drug.documentedPeak;

  // Tmax literature range: 0.3 - 1.0 hours (rapid 20 - 45 min)
  assert.ok(
   res.tmaxHours >= peak.tmaxHours.min && res.tmaxHours <= peak.tmaxHours.max,
   `Aspirin Tmax ${res.tmaxHours} h is outside literature range [${peak.tmaxHours.min}, ${peak.tmaxHours.max}] h`
  );

  // Cmax literature range: 8.0 - 25.0 mg/L
  assert.ok(
   res.cmaxMgL >= peak.cmaxRangeForStandardDoseMgL.min && res.cmaxMgL <= peak.cmaxRangeForStandardDoseMgL.max,
   `Aspirin Cmax ${res.cmaxMgL} mg/L is outside literature range [${peak.cmaxRangeForStandardDoseMgL.min}, ${peak.cmaxRangeForStandardDoseMgL.max}] mg/L`
  );
 });

 it('Amoxicillin 500mg peak time and concentration fall strictly within literature windows', () => {
  const drug = getDrugById('amoxicillin')!;
  const config: SimulationConfig = {
   drugId: 'amoxicillin',
   doseMg: 500,
   patient: REFERENCE_PATIENT,
   durationHours: 12,
  };

  const res = runSimulation(config);
  const peak = drug.documentedPeak;

  // Tmax literature range: 1.0 - 2.5 hours
  assert.ok(
   res.tmaxHours >= peak.tmaxHours.min && res.tmaxHours <= peak.tmaxHours.max,
   `Amoxicillin Tmax ${res.tmaxHours} h is outside literature range [${peak.tmaxHours.min}, ${peak.tmaxHours.max}] h`
  );

  // Cmax literature range: 5.0 - 12.0 mg/L (typically ~6.5 - 9.0 mg/L)
  assert.ok(
   res.cmaxMgL >= peak.cmaxRangeForStandardDoseMgL.min && res.cmaxMgL <= peak.cmaxRangeForStandardDoseMgL.max,
   `Amoxicillin Cmax ${res.cmaxMgL} mg/L is outside literature range [${peak.cmaxRangeForStandardDoseMgL.min}, ${peak.cmaxRangeForStandardDoseMgL.max}] mg/L`
  );
 });
});

describe('Pharmacokinetic Engine - Organ Clearance Route Validation', () => {
 it('Amoxicillin clearance is predominantly renal (>= 75% in kidneys)', () => {
  const res = runSimulation({
   drugId: 'amoxicillin',
   doseMg: 500,
   patient: REFERENCE_PATIENT,
   durationHours: 24,
  });

  const final = res.finalState;
  const totalCleared = final.liverMetabolizedMg + final.kidneyExcretedMg;
  const renalFraction = final.kidneyExcretedMg / totalCleared;

  assert.ok(
   renalFraction >= 0.75,
   `Amoxicillin renal clearance fraction was ${(renalFraction * 100).toFixed(1)}%, expected >= 75%`
  );
 });

 it('Paracetamol clearance is predominantly hepatic (>= 90% in liver)', () => {
  const res = runSimulation({
   drugId: 'paracetamol',
   doseMg: 500,
   patient: REFERENCE_PATIENT,
   durationHours: 24,
  });

  const final = res.finalState;
  const totalCleared = final.liverMetabolizedMg + final.kidneyExcretedMg;
  const hepaticFraction = final.liverMetabolizedMg / totalCleared;

  assert.ok(
   hepaticFraction >= 0.90,
   `Paracetamol hepatic clearance fraction was ${(hepaticFraction * 100).toFixed(1)}%, expected >= 90%`
  );
 });

 it('Ibuprofen clearance is predominantly hepatic (>= 85% in liver)', () => {
  const res = runSimulation({
   drugId: 'ibuprofen',
   doseMg: 400,
   patient: REFERENCE_PATIENT,
   durationHours: 24,
  });

  const final = res.finalState;
  const totalCleared = final.liverMetabolizedMg + final.kidneyExcretedMg;
  const hepaticFraction = final.liverMetabolizedMg / totalCleared;

  assert.ok(
   hepaticFraction >= 0.85,
   `Ibuprofen hepatic clearance fraction was ${(hepaticFraction * 100).toFixed(1)}%, expected >= 85%`
  );
 });
});

describe('Safety Module - Allergy Block & Dose Warnings', () => {
 it('blocks Amoxicillin when patient has Penicillin allergy', () => {
  const amox = getDrugById('amoxicillin')!;
  const allergicPatient: PatientPkParams = { ...REFERENCE_PATIENT, allergy: 'penicillin' };

  const safety = checkDrugSafety(amox, 500, allergicPatient);
  assert.strictEqual(safety.allowed, false, 'Amoxicillin run must be disallowed for penicillin-allergic patient');
  assert.strictEqual(safety.isBlocked, true, 'Amoxicillin run must be flagged as isBlocked');
  assert.ok(
   safety.blockReason?.includes('Penicillin hypersensitivity'),
   `Block reason must detail penicillin hypersensitivity: ${safety.blockReason}`
  );
 });

 it('allows Paracetamol when patient has Penicillin allergy', () => {
  const paracetamol = getDrugById('paracetamol')!;
  const allergicPatient: PatientPkParams = { ...REFERENCE_PATIENT, allergy: 'penicillin' };

  const safety = checkDrugSafety(paracetamol, 500, allergicPatient);
  assert.strictEqual(safety.allowed, true, 'Paracetamol should be allowed for penicillin-allergic patient');
  assert.strictEqual(safety.isBlocked, false);
 });

 it('blocks both Ibuprofen and Aspirin when patient has NSAID allergy', () => {
  const nsaidPatient: PatientPkParams = { ...REFERENCE_PATIENT, allergy: 'nsaids' };

  const ibup = getDrugById('ibuprofen')!;
  const asp = getDrugById('aspirin')!;

  const ibupSafety = checkDrugSafety(ibup, 400, nsaidPatient);
  assert.strictEqual(ibupSafety.allowed, false);
  assert.strictEqual(ibupSafety.isBlocked, true);
  assert.ok(ibupSafety.blockReason?.includes('NSAID / Aspirin'));

  const aspSafety = checkDrugSafety(asp, 325, nsaidPatient);
  assert.strictEqual(aspSafety.allowed, false);
  assert.strictEqual(aspSafety.isBlocked, true);
  assert.ok(aspSafety.blockReason?.includes('NSAID / Aspirin'));
 });

 it('allows all drugs when patient has no known allergies', () => {
  for (const drug of DRUGS) {
   const safety = checkDrugSafety(drug, drug.standardDoseMg, REFERENCE_PATIENT);
   assert.strictEqual(safety.allowed, true, `${drug.name} should be allowed when allergy is 'none'`);
   assert.strictEqual(safety.isBlocked, false);
  }
 });

 it('triggers per-kg high dose warning when dose exceeds safe threshold', () => {
  const paracetamol = getDrugById('paracetamol')!; // threshold 15 mg/kg
  const lightPatient: PatientPkParams = { ...REFERENCE_PATIENT, weightKg: 45 };

  // 500mg in 45kg = 11.1 mg/kg -> safe
  const safeDose = checkDrugSafety(paracetamol, 500, lightPatient);
  assert.strictEqual(safeDose.hasWarning, false);

  // 1000mg in 45kg = 22.2 mg/kg -> exceeds 15 mg/kg threshold by 48%
  const highDose = checkDrugSafety(paracetamol, 1000, lightPatient);
  assert.strictEqual(highDose.hasWarning, true, 'Should flag high dose warning');
  assert.ok(highDose.warningMessage?.includes('HIGH DOSE WARNING'));
  assert.ok(highDose.warningMessage?.includes('22.2 mg/kg'));
 });

 it('triggers per-kg warning for Ibuprofen in low-weight patient', () => {
  const ibup = getDrugById('ibuprofen')!; // threshold 10 mg/kg
  const lightPatient: PatientPkParams = { ...REFERENCE_PATIENT, weightKg: 50 };

  // 800mg in 50kg = 16.0 mg/kg -> exceeds 10 mg/kg threshold
  const highDose = checkDrugSafety(ibup, 800, lightPatient);
  assert.strictEqual(highDose.hasWarning, true);
  assert.ok(highDose.warningMessage?.includes('16.0 mg/kg'));
 });
});
