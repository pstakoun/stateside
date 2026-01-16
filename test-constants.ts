// Test consistency between centralized constants and their usage across components
// This test file was created to catch bugs like:
// - Hardcoded lists that should use centralized constants
// - Variable shadowing of imported functions
// - Inconsistencies between components

import { 
  PRIORITY_DATE_STAGES, 
  STATUS_VISA_NODES,
  STATUS_VISA_VALIDITY_MONTHS,
  STATUS_VISA_PROCESSING_MONTHS,
  isStatusVisa,
  canEstablishPriorityDate,
} from "./lib/constants";
import visaData from "./data/visa-paths.json";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) {
      console.log(`✓ ${name}`);
      passed++;
    } else {
      console.log(`✗ ${name}`);
      failed++;
    }
  } catch (e) {
    console.log(`✗ ${name} - Error: ${e}`);
    failed++;
  }
}

function describe(section: string) {
  console.log(`\n--- ${section} ---\n`);
}

console.log("\n" + "=".repeat(70));
console.log("CONSTANTS CONSISTENCY VALIDATION");
console.log("Ensuring centralized constants are correct and used consistently");
console.log("=".repeat(70));

// =============================================================================
// PRIORITY_DATE_STAGES VALIDATION
// =============================================================================
describe("PRIORITY_DATE_STAGES Validation");

test("All PRIORITY_DATE_STAGES are valid node IDs in visa-paths.json", () => {
  const validNodeIds = new Set(Object.keys(visaData.nodes));
  for (const nodeId of Array.from(PRIORITY_DATE_STAGES)) {
    if (!validNodeIds.has(nodeId)) {
      console.log(`    Invalid nodeId in PRIORITY_DATE_STAGES: ${nodeId}`);
      return false;
    }
  }
  return true;
});

test("PRIORITY_DATE_STAGES includes all I-140 related node IDs", () => {
  // These are the actual node IDs (from visa-paths.json) that establish priority dates
  // NOTE: eb1a, eb1b, eb1c are GC method IDs, not node IDs - the actual node ID is 'eb1'
  const expectedStages = ['i140', 'perm', 'eb2niw', 'eb1'];
  for (const stage of expectedStages) {
    if (!PRIORITY_DATE_STAGES.has(stage)) {
      console.log(`    Missing expected stage: ${stage}`);
      return false;
    }
  }
  return true;
});

test("canEstablishPriorityDate function matches PRIORITY_DATE_STAGES Set", () => {
  // The function should return true for all items in the set
  for (const nodeId of Array.from(PRIORITY_DATE_STAGES)) {
    if (!canEstablishPriorityDate(nodeId)) {
      console.log(`    Function returned false for: ${nodeId}`);
      return false;
    }
  }
  // And false for non-priority-date stages
  const nonPDStages = ['pwd', 'recruit', 'i485', 'gc', 'tn', 'h1b'];
  for (const nodeId of nonPDStages) {
    if (canEstablishPriorityDate(nodeId)) {
      console.log(`    Function incorrectly returned true for: ${nodeId}`);
      return false;
    }
  }
  return true;
});

// =============================================================================
// BUG DEMONSTRATION: Old hardcoded list was incorrect
// =============================================================================
describe("Bug Demonstration: Incorrect canHavePriorityDate list");

test("Old hardcoded list ['perm', 'i140', 'i140_niw'] had invalid nodeId 'i140_niw'", () => {
  // The old code used "i140_niw" which doesn't exist - it should be "eb2niw"
  const oldList = ["perm", "i140", "i140_niw"];
  const validNodeIds = new Set(Object.keys(visaData.nodes));
  
  const invalidIds = oldList.filter(id => !validNodeIds.has(id));
  if (invalidIds.length === 0) {
    console.log(`    Expected 'i140_niw' to be invalid, but all IDs were valid`);
    return false;
  }
  
  // Verify "i140_niw" is specifically the invalid one
  if (!invalidIds.includes("i140_niw")) {
    console.log(`    Expected 'i140_niw' to be invalid, got: ${invalidIds}`);
    return false;
  }
  
  return true;
});

test("Old hardcoded list was missing eb2niw and eb1 node IDs", () => {
  const oldList = new Set(["perm", "i140", "i140_niw"]);
  // These are the actual valid node IDs that were missing from the old list
  // NOTE: eb1a, eb1b, eb1c are GC method IDs, not node IDs - they share the 'eb1' node
  const missingValidStages = ['eb2niw', 'eb1'];
  
  for (const stage of missingValidStages) {
    if (oldList.has(stage)) {
      console.log(`    Expected '${stage}' to be missing from old list`);
      return false;
    }
    // But it should be in PRIORITY_DATE_STAGES
    if (!PRIORITY_DATE_STAGES.has(stage)) {
      console.log(`    '${stage}' should be in PRIORITY_DATE_STAGES`);
      return false;
    }
  }
  return true;
});

test("PRIORITY_DATE_STAGES correctly includes eb2niw instead of non-existent i140_niw", () => {
  // eb2niw is the correct nodeId for EB-2 NIW
  const hasEb2niw = PRIORITY_DATE_STAGES.has('eb2niw');
  const hasInvalidId = PRIORITY_DATE_STAGES.has('i140_niw');
  
  if (!hasEb2niw) {
    console.log(`    PRIORITY_DATE_STAGES missing 'eb2niw'`);
    return false;
  }
  if (hasInvalidId) {
    console.log(`    PRIORITY_DATE_STAGES contains invalid 'i140_niw'`);
    return false;
  }
  return true;
});

// =============================================================================
// STATUS_VISA_NODES VALIDATION
// =============================================================================
describe("STATUS_VISA_NODES Validation");

test("All STATUS_VISA_NODES are valid node IDs in visa-paths.json", () => {
  const validNodeIds = new Set(Object.keys(visaData.nodes));
  for (const nodeId of Array.from(STATUS_VISA_NODES)) {
    if (!validNodeIds.has(nodeId)) {
      console.log(`    Invalid nodeId in STATUS_VISA_NODES: ${nodeId}`);
      return false;
    }
  }
  return true;
});

test("isStatusVisa function matches STATUS_VISA_NODES Set", () => {
  // The function should return true for all items in the set
  for (const nodeId of Array.from(STATUS_VISA_NODES)) {
    if (!isStatusVisa(nodeId)) {
      console.log(`    isStatusVisa returned false for: ${nodeId}`);
      return false;
    }
  }
  // And false for non-status-visa nodes
  const nonStatusNodes = ['pwd', 'recruit', 'perm', 'i140', 'i485', 'gc', 'eb2niw'];
  for (const nodeId of nonStatusNodes) {
    if (isStatusVisa(nodeId)) {
      console.log(`    isStatusVisa incorrectly returned true for: ${nodeId}`);
      return false;
    }
  }
  return true;
});

test("All STATUS_VISA_NODES have validity months defined", () => {
  for (const nodeId of Array.from(STATUS_VISA_NODES)) {
    if (STATUS_VISA_VALIDITY_MONTHS[nodeId] === undefined) {
      console.log(`    Missing validity months for: ${nodeId}`);
      return false;
    }
  }
  return true;
});

test("All STATUS_VISA_NODES have processing months defined", () => {
  for (const nodeId of Array.from(STATUS_VISA_NODES)) {
    if (STATUS_VISA_PROCESSING_MONTHS[nodeId] === undefined) {
      console.log(`    Missing processing months for: ${nodeId}`);
      return false;
    }
  }
  return true;
});

// =============================================================================
// VISA-PATHS.JSON NODE COVERAGE
// =============================================================================
describe("Visa Paths JSON Coverage");

test("All work category nodes are covered by STATUS_VISA_NODES", () => {
  const workNodes = Object.entries(visaData.nodes)
    .filter(([_, node]) => (node as { category: string }).category === "work")
    .map(([id]) => id);
  
  // All work-category nodes should be status visas (except we allow some exceptions)
  const exceptions = new Set(['e2']); // E-2 is work but not tracked the same way
  
  for (const nodeId of workNodes) {
    if (!STATUS_VISA_NODES.has(nodeId) && !exceptions.has(nodeId)) {
      console.log(`    Work node '${nodeId}' not in STATUS_VISA_NODES`);
      return false;
    }
  }
  return true;
});

test("All greencard category nodes that establish PD are in PRIORITY_DATE_STAGES", () => {
  // Nodes that establish priority dates should be in PRIORITY_DATE_STAGES
  const pdEstablishingNodes = ['i140', 'perm', 'eb2niw', 'eb1'];
  
  for (const nodeId of pdEstablishingNodes) {
    if (!PRIORITY_DATE_STAGES.has(nodeId)) {
      console.log(`    PD-establishing node '${nodeId}' not in PRIORITY_DATE_STAGES`);
      return false;
    }
  }
  return true;
});

// =============================================================================
// CONSISTENCY CHECKS ACROSS CODEBASE
// =============================================================================
describe("Cross-Component Consistency");

test("TrackerPanel and MobileTimelineView should use same PD stages set", () => {
  // Both components should use PRIORITY_DATE_STAGES for consistency
  // This test verifies the Set contains what both components need
  
  // Stages that can have a priority date entered in the editor
  // These are actual node IDs from visa-paths.json
  const stagesWithPDInput = ['perm', 'i140', 'eb2niw', 'eb1'];
  
  for (const stage of stagesWithPDInput) {
    if (!PRIORITY_DATE_STAGES.has(stage)) {
      console.log(`    Stage '${stage}' should allow PD input but not in PRIORITY_DATE_STAGES`);
      return false;
    }
  }
  return true;
});

test("Status visa handling should use isStatusVisa function consistently", () => {
  // Verify the function works correctly for expected use cases
  const statusVisas = ['tn', 'h1b', 'opt', 'f1', 'l1a', 'l1b', 'o1'];
  const nonStatusVisas = ['pwd', 'recruit', 'perm', 'i140', 'i485', 'gc', 'marriage'];
  
  for (const nodeId of statusVisas) {
    if (!isStatusVisa(nodeId)) {
      console.log(`    '${nodeId}' should be recognized as status visa`);
      return false;
    }
  }
  
  for (const nodeId of nonStatusVisas) {
    if (isStatusVisa(nodeId)) {
      console.log(`    '${nodeId}' should NOT be recognized as status visa`);
      return false;
    }
  }
  return true;
});

// =============================================================================
// EDGE CASES
// =============================================================================
describe("Edge Cases");

test("Empty string returns false for isStatusVisa", () => {
  return !isStatusVisa("");
});

test("Empty string returns false for canEstablishPriorityDate", () => {
  return !canEstablishPriorityDate("");
});

test("Non-existent nodeId returns false for isStatusVisa", () => {
  return !isStatusVisa("nonexistent_node_id");
});

test("Non-existent nodeId returns false for canEstablishPriorityDate", () => {
  return !canEstablishPriorityDate("some_invalid_id");
});

test("Old invalid 'i140_niw' returns false for canEstablishPriorityDate", () => {
  // This is the bug that was fixed - the old code would have matched this
  // but it's not a valid nodeId
  return !canEstablishPriorityDate("i140_niw");
});

// =============================================================================
// SUMMARY
// =============================================================================
console.log("\n" + "=".repeat(70));
console.log(`CONSTANTS CONSISTENCY: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70) + "\n");

if (failed > 0) {
  console.log("❌ FAILURES DETECTED - Constants are inconsistent or incorrect\n");
  process.exit(1);
} else {
  console.log("✅ All constants are consistent and valid\n");
  process.exit(0);
}
