import { runSimulation } from './engine.ts';
import { checkDrugSafety, getDrugById } from './safety.ts';
import type {
 DrugId,
 PatientPkParams,
 SafetyCheckResult,
 SimulationConfig,
 SimulationResult,
 WorkerInMessage,
 WorkerOutMessage,
} from './types.ts';

/**
 * Client wrapper that coordinates PK simulations via a Web Worker off the main thread,
 * with automatic fallback to direct engine execution in non-DOM / test environments.
 */
export class PkSimulationClient {
 private worker: Worker | null = null;
 private pendingResolvers = new Map<number, {
  resolve: (res: SimulationResult) => void;
  reject: (err: Error) => void;
 }>();
 private messageSeq = 0;

 constructor() {
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
   try {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
     type: 'module',
    });
    this.worker.addEventListener('message', (event: MessageEvent<WorkerOutMessage>) => {
     const data = event.data;
     if (data.type === 'SIMULATION_RESULT') {
      const resolver = this.pendingResolvers.values().next().value;
      if (resolver) {
       resolver.resolve(data.payload);
       this.pendingResolvers.clear();
      }
     } else if (data.type === 'SIMULATION_ERROR') {
      const resolver = this.pendingResolvers.values().next().value;
      if (resolver) {
       resolver.reject(new Error(data.payload.message));
       this.pendingResolvers.clear();
      }
     }
    });
    this.worker.addEventListener('error', (err) => {
     for (const resolver of this.pendingResolvers.values()) {
      resolver.reject(new Error(err.message || 'Worker execution error'));
     }
     this.pendingResolvers.clear();
    });
   } catch {
    this.worker = null;
   }
  }
 }

 /**
  * Runs a PK simulation via Web Worker if available, or directly on the thread.
  */
 public async simulate(config: SimulationConfig): Promise<SimulationResult> {
  if (!this.worker) {
   // Synchronous fallback (test environment or unsupported worker)
   return Promise.resolve(runSimulation(config));
  }

  return new Promise<SimulationResult>((resolve, reject) => {
   const seq = ++this.messageSeq;
   this.pendingResolvers.set(seq, { resolve, reject });
   const msg: WorkerInMessage = {
    type: 'RUN_SIMULATION',
    payload: config,
   };
   this.worker!.postMessage(msg);
  });
 }

 /**
  * Synchronously checks allergy and per-kg dose safety.
  */
 public checkSafety(drugId: DrugId, doseMg: number, patient: PatientPkParams): SafetyCheckResult {
  const drug = getDrugById(drugId);
  if (!drug) {
   throw new Error(`Unknown drug ID: ${drugId}`);
  }
  return checkDrugSafety(drug, doseMg, patient);
 }

 public dispose(): void {
  if (this.worker) {
   this.worker.terminate();
   this.worker = null;
  }
  this.pendingResolvers.clear();
 }
}
