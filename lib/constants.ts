// Centralized constants for processing times and visa validity
// All components should import from this file to ensure consistency

// ============== STATUS VISAS ==============
// These have a VALIDITY PERIOD after approval (approved date = start of validity)

export const STATUS_VISA_NODES = new Set([
  'tn', 'h1b', 'opt', 'f1', 'l1a', 'l1b', 'o1'
]);

// Validity duration in months for status visas (how long the visa is valid after approval)
// NOTE: These represent MAXIMUM typical validity for timeline display purposes
export const STATUS_VISA_VALIDITY_MONTHS: Record<string, number> = {
  tn: 36,   // TN valid for 3 years (renewable)
  h1b: 36,  // H1B valid for 3 years (initial, can extend to 6)
  opt: 36,  // OPT: 12 months standard, up to 36 months with STEM extension
            // The path-composer.ts handles STEM vs non-STEM distinction
  f1: 48,   // Student status for duration of studies
  l1a: 36,  // L1A valid for 3 years (initial)
  l1b: 36,  // L1B valid for 3 years (initial)
  o1: 36,   // O1 valid for 3 years (renewable)
};

// Processing time to GET a status visa approved (in months)
export const STATUS_VISA_PROCESSING_MONTHS: Record<string, number> = {
  tn: 0.5,  // TN at border: same day to a few weeks
  h1b: 3,   // H1B: 2-4 months (or 15 days premium)
  opt: 3,   // OPT: 2-4 months
  f1: 2,    // F1: 1-3 months
  l1a: 3,   // L1: 2-4 months
  l1b: 3,
  o1: 3,    // O1: 2-4 months (or 15 days premium)
};

// ============== PROCESSING STEPS ==============
// These are one-time processing steps (filed → approved = done)
// Values are typical processing times in months

export interface ProcessingTimeRange {
  min: number;  // Minimum months (or premium processing)
  max: number;  // Maximum months (regular processing)
  typical: number; // Typical/average months
}

export const PROCESSING_STEP_TIMES: Record<string, ProcessingTimeRange> = {
  // DOL Steps (PERM process)
  pwd: { min: 5, max: 8, typical: 7 },           // Prevailing Wage Determination
  recruit: { min: 2, max: 3, typical: 2.5 },     // Recruitment period
  perm: { min: 12, max: 20, typical: 16 },       // PERM Labor Certification
  
  // USCIS Steps
  i140: { min: 0.5, max: 12, typical: 9 },       // I-140 (15 days premium to 9-12 mo regular)
  i485: { min: 8, max: 24, typical: 14 },        // I-485 AOS
  
  // Self-petition (EB-1/NIW)
  eb1a: { min: 0.5, max: 12, typical: 9 },       // EB-1A Extraordinary Ability
  eb1b: { min: 0.5, max: 12, typical: 9 },       // EB-1B Outstanding Researcher
  eb1c: { min: 0.5, max: 12, typical: 9 },       // EB-1C Multinational Executive
  eb2niw: { min: 1.5, max: 15, typical: 12 },    // EB-2 NIW (45 bus days premium)
  
  // Other
  marriage: { min: 8, max: 14, typical: 10 },    // Marriage-based I-130 + I-485
  eb5: { min: 24, max: 48, typical: 36 },        // EB-5 I-526E
};

// Helper to get typical processing months for a stage
export function getTypicalProcessingMonths(nodeId: string): number {
  // Check status visas first
  if (STATUS_VISA_VALIDITY_MONTHS[nodeId]) {
    return STATUS_VISA_VALIDITY_MONTHS[nodeId];
  }
  // Check processing steps
  if (PROCESSING_STEP_TIMES[nodeId]) {
    return PROCESSING_STEP_TIMES[nodeId].typical;
  }
  // Default fallback
  return 6;
}

// Helper to check if a node is a status visa
export function isStatusVisa(nodeId: string): boolean {
  return STATUS_VISA_NODES.has(nodeId);
}

// ============== PRIORITY DATE STAGES ==============
// Stages that can establish or use a priority date

export const PRIORITY_DATE_STAGES = new Set([
  'i140', 'perm', 'eb2niw', 'eb1a', 'eb1b', 'eb1c', 'eb1'
]);

export function canEstablishPriorityDate(nodeId: string): boolean {
  return PRIORITY_DATE_STAGES.has(nodeId);
}
