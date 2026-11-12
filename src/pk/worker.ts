import { runSimulation } from './engine.ts';
import { checkDrugSafety, getDrugById } from './safety.ts';
import type { WorkerInMessage, WorkerOutMessage } from './types.ts';

// Self-contained Web Worker execution context
self.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
 const msg = event.data;
 if (!msg) return;

 try {
  if (msg.type === 'RUN_SIMULATION') {
   const result = runSimulation(msg.payload);
   const response: WorkerOutMessage = {
    type: 'SIMULATION_RESULT',
    payload: result,
   };
   self.postMessage(response);
  } else if (msg.type === 'CHECK_SAFETY') {
   const drug = getDrugById(msg.payload.drugId);
   if (!drug) {
    throw new Error(`Unknown drug ID: ${msg.payload.drugId}`);
   }
   const safety = checkDrugSafety(drug, msg.payload.doseMg, msg.payload.patient);
   const response: WorkerOutMessage = {
    type: 'SAFETY_RESULT',
    payload: safety,
   };
   self.postMessage(response);
  }
 } catch (error) {
  const errResponse: WorkerOutMessage = {
   type: 'SIMULATION_ERROR',
   payload: {
    message: error instanceof Error ? error.message : String(error),
   },
  };
  self.postMessage(errResponse);
 }
});
