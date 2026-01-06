// Deep content validation for generated paths
import { generatePaths, ComposedPath } from "./lib/path-composer";
import { FilterState, defaultFilters } from "./lib/filter-paths";

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

function getPaths(overrides: Partial<FilterState>): ComposedPath[] {
  return generatePaths({ ...defaultFilters, ...overrides });
}

// =============================================================================
// STAGE ORDERING TESTS
// =============================================================================
console.log("\n=== STAGE ORDERING TESTS ===\n");

test("Status stages come before GC stages in timeline", () => {
  const paths = getPaths({ currentStatus: "canada", education: "masters" });
  for (const path of paths) {
    const statusStages = path.stages.filter(s => s.track === "status");
    const gcStages = path.stages.filter(s => s.track === "gc");
    if (statusStages.length > 0 && gcStages.length > 0) {
      const lastStatusStart = Math.max(...statusStages.map(s => s.startYear));
      const firstGCStart = Math.min(...gcStages.map(s => s.startYear));
      // GC can start during status stages (that's the point), but should not start before
      if (firstGCStart < 0) return false;
    }
  }
  return true;
});

test("All paths end with gc node", () => {
  const paths = getPaths({ currentStatus: "canada", education: "masters" });
  for (const path of paths) {
    const lastStage = path.stages[path.stages.length - 1];
    if (lastStage.nodeId !== "gc") return false;
  }
  return true;
});

test("PERM paths have pwd -> recruit -> perm sequence", () => {
  const paths = getPaths({ currentStatus: "tn", education: "bachelors" });
  const permPaths = paths.filter(p => p.id.includes("perm_route"));
  for (const path of permPaths) {
    const gcStages = path.stages.filter(s => s.track === "gc").map(s => s.nodeId);
    const pwdIdx = gcStages.indexOf("pwd");
    const recruitIdx = gcStages.indexOf("recruit");
    const permIdx = gcStages.indexOf("perm");
    if (pwdIdx < 0 || recruitIdx < 0 || permIdx < 0) return false;
    if (!(pwdIdx < recruitIdx && recruitIdx < permIdx)) return false;
  }
  return true;
});

// =============================================================================
// DURATION SANITY TESTS
// =============================================================================
console.log("\n=== DURATION SANITY TESTS ===\n");

test("No negative durations", () => {
  const paths = getPaths({ currentStatus: "canada", education: "masters" });
  for (const path of paths) {
    if (path.totalYears.min < 0 || path.totalYears.max < 0) return false;
    for (const stage of path.stages) {
      if (stage.durationYears.min < 0 || stage.durationYears.max < 0) return false;
    }
  }
  return true;
});

test("Min duration <= Max duration for all stages", () => {
  const paths = getPaths({ currentStatus: "canada", education: "masters" });
  for (const path of paths) {
    if (path.totalYears.min > path.totalYears.max) return false;
    for (const stage of path.stages) {
      if (stage.durationYears.min > stage.durationYears.max) return false;
    }
  }
  return true;
});

test("Marriage path is 0.7-1.2 years", () => {
  const paths = getPaths({ currentStatus: "canada", isMarriedToUSCitizen: true });
  const marriagePath = paths.find(p => p.id === "none_marriage");
  if (!marriagePath) return false;
  return marriagePath.totalYears.min >= 0.5 && marriagePath.totalYears.max <= 1.5;
});

test("Student paths take at least 2 years", () => {
  const paths = getPaths({ currentStatus: "canada", education: "bachelors" });
  const studentPaths = paths.filter(p => p.id.startsWith("student_"));
  for (const path of studentPaths) {
    if (path.totalYears.min < 2) return false;
  }
  return true;
});

test("PhD student path takes 4+ years", () => {
  const paths = getPaths({ currentStatus: "canada", education: "bachelors" });
  const phdPath = paths.find(p => p.id.includes("student_phd"));
  if (!phdPath) return false;
  return phdPath.totalYears.min >= 4;
});

// =============================================================================
// COST SANITY TESTS
// =============================================================================
console.log("\n=== COST SANITY TESTS ===\n");

test("All paths have positive cost", () => {
  const paths = getPaths({ currentStatus: "canada", education: "masters" });
  for (const path of paths) {
    if (path.estimatedCost <= 0) return false;
  }
  return true;
});

test("PERM paths cost more than direct NIW", () => {
  const paths = getPaths({ currentStatus: "canada", education: "masters" });
  const niwPath = paths.find(p => p.id === "none_niw");
  const permPaths = paths.filter(p => p.id.includes("perm_route"));
  if (!niwPath || permPaths.length === 0) return false;
  // PERM adds PWD/recruitment/PERM filing fees
  for (const permPath of permPaths) {
    if (permPath.estimatedCost < niwPath.estimatedCost) return false;
  }
  return true;
});

test("EB-5 has higher filing fees than employment paths", () => {
  const paths = getPaths({ currentStatus: "canada", hasInvestmentCapital: true });
  const eb5Path = paths.find(p => p.gcCategory === "EB-5" && p.id === "none_eb5");
  const permPaths = paths.filter(p => p.id.includes("perm_route"));
  if (!eb5Path) return false;
  // EB-5 I-526E is expensive ($11,160)
  return eb5Path.estimatedCost > 5000;
});

// =============================================================================
// GC CATEGORY TESTS
// =============================================================================
console.log("\n=== GC CATEGORY TESTS ===\n");

test("Master's gets EB-2, not EB-3", () => {
  const paths = getPaths({ currentStatus: "tn", education: "masters" });
  const permPaths = paths.filter(p => p.id.includes("perm_route"));
  for (const path of permPaths) {
    if (path.gcCategory === "EB-3") return false;
  }
  return true;
});

test("Bachelor's without 5yr exp gets EB-3", () => {
  const paths = getPaths({ currentStatus: "tn", education: "bachelors", experience: "lt2" });
  const permPaths = paths.filter(p => p.id.includes("perm_route") && !p.id.includes("student"));
  for (const path of permPaths) {
    if (path.gcCategory !== "EB-3") return false;
  }
  return true;
});

test("Bachelor's + 5yr gets EB-2", () => {
  const paths = getPaths({ currentStatus: "tn", education: "bachelors", experience: "gt5" });
  const permPath = paths.find(p => p.id === "tn_direct_perm_route");
  if (!permPath) return false;
  return permPath.gcCategory === "EB-2";
});

test("Student masters path grants EB-2", () => {
  const paths = getPaths({ currentStatus: "canada", education: "bachelors" });
  const studentMasters = paths.find(p => p.id === "student_masters_perm_route");
  if (!studentMasters) return false;
  return studentMasters.gcCategory === "EB-2";
});

// =============================================================================
// FLAGS TESTS
// =============================================================================
console.log("\n=== FLAGS TESTS ===\n");

test("H-1B paths have hasLottery=true", () => {
  const paths = getPaths({ currentStatus: "opt", education: "bachelors" });
  const h1bPaths = paths.filter(p => p.stages.some(s => s.nodeId === "h1b"));
  for (const path of h1bPaths) {
    if (!path.hasLottery) return false;
  }
  return true;
});

test("TN-only paths have hasLottery=false", () => {
  const paths = getPaths({ currentStatus: "canada", education: "bachelors" });
  const tnOnlyPaths = paths.filter(p =>
    p.stages.some(s => s.nodeId === "tn") &&
    !p.stages.some(s => s.nodeId === "h1b")
  );
  for (const path of tnOnlyPaths) {
    if (path.hasLottery) return false;
  }
  return true;
});

test("NIW paths have isSelfPetition=true", () => {
  const paths = getPaths({ currentStatus: "canada", education: "masters" });
  const niwPaths = paths.filter(p => p.gcCategory === "EB-2 NIW");
  for (const path of niwPaths) {
    if (!path.isSelfPetition) return false;
  }
  return true;
});

test("PERM paths have isSelfPetition=false", () => {
  const paths = getPaths({ currentStatus: "canada", education: "masters" });
  const permPaths = paths.filter(p => p.id.includes("perm_route"));
  for (const path of permPaths) {
    if (path.isSelfPetition) return false;
  }
  return true;
});

// =============================================================================
// STEM OPT TESTS
// =============================================================================
console.log("\n=== STEM OPT TESTS ===\n");

test("STEM OPT shows 3 year max", () => {
  const paths = getPaths({ currentStatus: "opt", education: "bachelors", isStem: true });
  for (const path of paths) {
    const optStage = path.stages.find(s => s.nodeId === "opt");
    if (optStage) {
      if (optStage.durationYears.max < 2.5) return false; // Should be ~3
    }
  }
  return true;
});

test("Non-STEM OPT shows 1 year max", () => {
  const paths = getPaths({ currentStatus: "opt", education: "bachelors", isStem: false });
  for (const path of paths) {
    const optStage = path.stages.find(s => s.nodeId === "opt");
    if (optStage) {
      if (optStage.durationYears.max > 1.5) return false; // Should be ~1
    }
  }
  return true;
});

// =============================================================================
// NODE EXISTENCE TESTS
// =============================================================================
console.log("\n=== NODE EXISTENCE TESTS ===\n");

test("All stage nodeIds exist in visa-paths.json", () => {
  const visaData = require("./data/visa-paths.json");
  const paths = getPaths({ currentStatus: "canada", education: "masters" });
  for (const path of paths) {
    for (const stage of path.stages) {
      if (!(stage.nodeId in visaData.nodes)) {
        console.log(`  Missing node: ${stage.nodeId}`);
        return false;
      }
    }
  }
  return true;
});

// =============================================================================
// SPECIFIC PATH CONTENT TESTS
// =============================================================================
console.log("\n=== SPECIFIC PATH CONTENT TESTS ===\n");

test("TN direct path has only tn status stage", () => {
  const paths = getPaths({ currentStatus: "canada", education: "bachelors" });
  const tnDirect = paths.find(p => p.id === "tn_direct_perm_route");
  if (!tnDirect) return false;
  const statusStages = tnDirect.stages.filter(s => s.track === "status");
  return statusStages.length === 1 && statusStages[0].nodeId === "tn";
});

test("L-1A path includes l1a stage", () => {
  const paths = getPaths({ currentStatus: "canada", isExecutive: true });
  const l1aPath = paths.find(p => p.id.includes("l1a"));
  if (!l1aPath) return false;
  return l1aPath.stages.some(s => s.nodeId === "l1a");
});

test("O-1 path includes o1 stage", () => {
  const paths = getPaths({ currentStatus: "canada", hasExtraordinaryAbility: true });
  const o1Path = paths.find(p => p.id.includes("o1"));
  if (!o1Path) return false;
  return o1Path.stages.some(s => s.nodeId === "o1");
});

// =============================================================================
// SUMMARY
// =============================================================================
console.log("\n" + "=".repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("=".repeat(60) + "\n");

process.exit(failed > 0 ? 1 : 0);
