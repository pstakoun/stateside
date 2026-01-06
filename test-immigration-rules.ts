// Verify path logic matches real immigration rules
import { generatePaths } from "./lib/path-composer";
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

function getPaths(overrides: Partial<FilterState>) {
  return generatePaths({ ...defaultFilters, ...overrides });
}

console.log("\n=== IMMIGRATION RULE VALIDATION ===\n");

// =============================================================================
// TN VISA RULES
// =============================================================================
console.log("--- TN Visa Rules ---\n");

test("TN requires bachelor's degree (USMCA rule)", () => {
  const hsOnly = getPaths({ currentStatus: "canada", education: "highschool" });
  const withBachelors = getPaths({ currentStatus: "canada", education: "bachelors" });

  const hsHasTN = hsOnly.some(p => p.stages.some(s => s.nodeId === "tn"));
  const bachHasTN = withBachelors.some(p => p.stages.some(s => s.nodeId === "tn"));

  return !hsHasTN && bachHasTN;
});

test("TN is only for Canadians (and Mexicans) - not 'other'", () => {
  const canada = getPaths({ currentStatus: "canada", education: "bachelors" });
  const other = getPaths({ currentStatus: "other", education: "bachelors" });

  const canadaHasTN = canada.some(p => p.stages.some(s => s.nodeId === "tn"));
  const otherHasTN = other.some(p => p.stages.some(s => s.nodeId === "tn"));

  return canadaHasTN && !otherHasTN;
});

test("TN can transition to H-1B for dual intent", () => {
  const paths = getPaths({ currentStatus: "tn", education: "bachelors" });
  const tnToH1b = paths.find(p => p.id.includes("tn_to_h1b"));
  return tnToH1b !== undefined;
});

// =============================================================================
// EB-2 EDUCATION RULES
// =============================================================================
console.log("\n--- EB-2 Education Rules ---\n");

test("EB-2 requires Master's OR Bachelor's + 5yr experience", () => {
  // Master's should get EB-2
  const masters = getPaths({ currentStatus: "tn", education: "masters" });
  const mastersEB2 = masters.some(p => p.gcCategory === "EB-2" || p.gcCategory === "EB-2 NIW");

  // Bachelor's + 5yr should get EB-2
  const bach5yr = getPaths({ currentStatus: "tn", education: "bachelors", experience: "gt5" });
  const bach5yrEB2 = bach5yr.some(p => p.gcCategory === "EB-2" || p.gcCategory === "EB-2 NIW");

  // Bachelor's + 2yr should NOT get EB-2 (only EB-3)
  const bach2yr = getPaths({ currentStatus: "tn", education: "bachelors", experience: "lt2" });
  const bach2yrPerm = bach2yr.filter(p => p.id.includes("perm_route") && !p.id.includes("student"));
  const bach2yrOnlyEB3 = bach2yrPerm.every(p => p.gcCategory === "EB-3");

  return mastersEB2 && bach5yrEB2 && bach2yrOnlyEB3;
});

test("NIW requires advanced degree (Master's or equivalent)", () => {
  const bachelors = getPaths({ currentStatus: "canada", education: "bachelors", experience: "lt2" });
  const masters = getPaths({ currentStatus: "canada", education: "masters" });

  // Bachelor's without experience should NOT have direct NIW
  const bachNIW = bachelors.find(p => p.id === "none_niw");

  // Master's should have NIW
  const mastersNIW = masters.find(p => p.id === "none_niw");

  return bachNIW === undefined && mastersNIW !== undefined;
});

test("Bachelor's + 5yr qualifies for NIW (Master's equivalent)", () => {
  const bach5yr = getPaths({ currentStatus: "canada", education: "bachelors", experience: "gt5" });
  const niwPath = bach5yr.find(p => p.gcCategory === "EB-2 NIW");
  return niwPath !== undefined;
});

// =============================================================================
// EB-1 RULES
// =============================================================================
console.log("\n--- EB-1 Rules ---\n");

test("EB-1A requires extraordinary ability claim", () => {
  const normal = getPaths({ currentStatus: "canada", education: "phd" });
  const extraordinary = getPaths({ currentStatus: "canada", education: "phd", hasExtraordinaryAbility: true });

  const normalEB1A = normal.some(p => p.gcCategory === "EB-1A");
  const extraEB1A = extraordinary.some(p => p.gcCategory === "EB-1A");

  return !normalEB1A && extraEB1A;
});

test("EB-1B requires outstanding researcher claim + advanced degree", () => {
  const researcher = getPaths({ currentStatus: "canada", education: "phd", isOutstandingResearcher: true });
  const researcherBach = getPaths({ currentStatus: "canada", education: "bachelors", isOutstandingResearcher: true });

  const phdEB1B = researcher.some(p => p.gcCategory === "EB-1B");

  // Bachelor's holder can get EB-1B ONLY through student_masters path (getting a master's first)
  // Direct EB-1B without student path should not be available
  const bachDirectEB1B = researcherBach.some(p =>
    p.gcCategory === "EB-1B" && !p.id.includes("student_masters") && !p.id.includes("student_phd")
  );

  return phdEB1B && !bachDirectEB1B;
});

test("EB-1C requires executive role + L-1A path", () => {
  const executive = getPaths({ currentStatus: "canada", isExecutive: true });
  const eb1cPath = executive.find(p => p.gcCategory === "EB-1C");

  if (!eb1cPath) return false;
  return eb1cPath.stages.some(s => s.nodeId === "l1a");
});

// =============================================================================
// H-1B RULES
// =============================================================================
console.log("\n--- H-1B Rules ---\n");

test("H-1B requires bachelor's degree in specialty occupation", () => {
  const hsOnly = getPaths({ currentStatus: "opt", education: "highschool" });
  const withBachelors = getPaths({ currentStatus: "opt", education: "bachelors" });

  const hsHasH1B = hsOnly.some(p => p.stages.some(s => s.nodeId === "h1b"));
  const bachHasH1B = withBachelors.some(p => p.stages.some(s => s.nodeId === "h1b"));

  return !hsHasH1B && bachHasH1B;
});

test("H-1B has lottery flag set", () => {
  const paths = getPaths({ currentStatus: "opt", education: "masters" });
  const h1bPaths = paths.filter(p => p.stages.some(s => s.nodeId === "h1b"));

  return h1bPaths.every(p => p.hasLottery === true);
});

// =============================================================================
// OPT/STEM RULES
// =============================================================================
console.log("\n--- OPT/STEM Rules ---\n");

test("STEM OPT extension gives 3 years total (vs 1 year non-STEM)", () => {
  const stem = getPaths({ currentStatus: "opt", education: "masters", isStem: true });
  const nonStem = getPaths({ currentStatus: "opt", education: "masters", isStem: false });

  // Find OPT stages
  const stemOpt = stem.flatMap(p => p.stages.filter(s => s.nodeId === "opt"));
  const nonStemOpt = nonStem.flatMap(p => p.stages.filter(s => s.nodeId === "opt"));

  const stemMaxYears = Math.max(...stemOpt.map(s => s.durationYears.max));
  const nonStemMaxYears = Math.max(...nonStemOpt.map(s => s.durationYears.max));

  // STEM should be ~3 years, non-STEM ~1 year
  return stemMaxYears >= 2.5 && nonStemMaxYears <= 1.5;
});

// =============================================================================
// MARRIAGE RULES
// =============================================================================
console.log("\n--- Marriage-based Rules ---\n");

test("Marriage to US citizen = immediate relative (no quota)", () => {
  const married = getPaths({ currentStatus: "canada", isMarriedToUSCitizen: true });
  const marriagePath = married.find(p => p.gcCategory === "Marriage-based");

  if (!marriagePath) return false;

  // Marriage-based should be fastest (immediate relative, no waiting)
  const sorted = [...married].sort((a, b) => a.totalYears.min - b.totalYears.min);
  return sorted[0].gcCategory === "Marriage-based";
});

test("Marriage path doesn't require education", () => {
  const hsMarried = getPaths({ currentStatus: "canada", education: "highschool", isMarriedToUSCitizen: true });
  const phdMarried = getPaths({ currentStatus: "canada", education: "phd", isMarriedToUSCitizen: true });

  const hsHasMarriage = hsMarried.some(p => p.gcCategory === "Marriage-based");
  const phdHasMarriage = phdMarried.some(p => p.gcCategory === "Marriage-based");

  return hsHasMarriage && phdHasMarriage;
});

// =============================================================================
// EB-5 RULES
// =============================================================================
console.log("\n--- EB-5 Investment Rules ---\n");

test("EB-5 requires investment capital, not education", () => {
  const hsInvestor = getPaths({ currentStatus: "canada", education: "highschool", hasInvestmentCapital: true });
  const phdNoInvest = getPaths({ currentStatus: "canada", education: "phd", hasInvestmentCapital: false });

  const hsHasEB5 = hsInvestor.some(p => p.gcCategory === "EB-5");
  const phdHasEB5 = phdNoInvest.some(p => p.gcCategory === "EB-5");

  return hsHasEB5 && !phdHasEB5;
});

// =============================================================================
// PERM RULES
// =============================================================================
console.log("\n--- PERM Labor Certification Rules ---\n");

test("PERM requires employer sponsorship (not self-petition)", () => {
  const paths = getPaths({ currentStatus: "tn", education: "masters" });
  const permPaths = paths.filter(p => p.id.includes("perm_route"));

  return permPaths.every(p => p.isSelfPetition === false);
});

test("PERM requires bachelor's minimum", () => {
  const hsOnly = getPaths({ currentStatus: "canada", education: "highschool" });
  const hsPermPaths = hsOnly.filter(p => p.id.includes("perm_route") && !p.id.includes("student"));

  // High school only should NOT have direct PERM paths
  return hsPermPaths.length === 0;
});

// =============================================================================
// L-1 RULES
// =============================================================================
console.log("\n--- L-1 Intracompany Transfer Rules ---\n");

test("L-1A for executives leads to EB-1C (no PERM)", () => {
  const executive = getPaths({ currentStatus: "canada", isExecutive: true });
  const l1aPath = executive.find(p => p.id.includes("l1a") && p.gcCategory === "EB-1C");

  if (!l1aPath) return false;

  // Should NOT have PERM stages
  return !l1aPath.stages.some(s => s.nodeId === "perm");
});

test("L-1A only available from canada/other (multinational transfer)", () => {
  const canada = getPaths({ currentStatus: "canada", education: "bachelors", isExecutive: true });
  const h1b = getPaths({ currentStatus: "h1b", education: "bachelors", isExecutive: true });

  const canadaHasL1A = canada.some(p => p.stages.some(s => s.nodeId === "l1a"));
  const h1bHasL1A = h1b.some(p => p.stages.some(s => s.nodeId === "l1a"));

  return canadaHasL1A && !h1bHasL1A;
});

// =============================================================================
// O-1 RULES
// =============================================================================
console.log("\n--- O-1 Extraordinary Ability Rules ---\n");

test("O-1 requires extraordinary ability claim", () => {
  const normal = getPaths({ currentStatus: "canada", education: "masters" });
  const extraordinary = getPaths({ currentStatus: "canada", education: "masters", hasExtraordinaryAbility: true });

  const normalO1 = normal.some(p => p.stages.some(s => s.nodeId === "o1"));
  const extraO1 = extraordinary.some(p => p.stages.some(s => s.nodeId === "o1"));

  return !normalO1 && extraO1;
});

// =============================================================================
// STATUS TRANSITION RULES
// =============================================================================
console.log("\n--- Status Transition Rules ---\n");

test("F-1 can transition to OPT (post-graduation)", () => {
  const f1Paths = getPaths({ currentStatus: "f1", education: "bachelors" });
  return f1Paths.some(p => p.stages.some(s => s.nodeId === "opt"));
});

test("OPT can transition to TN (for Canadians with right profession)", () => {
  const optPaths = getPaths({ currentStatus: "opt", education: "bachelors" });
  return optPaths.some(p => p.stages.some(s => s.nodeId === "tn"));
});

test("H-1B holder should not go back to F-1/OPT (except for school)", () => {
  const h1bPaths = getPaths({ currentStatus: "h1b", education: "masters" });

  // Filter out student paths (going back to school is valid)
  const nonStudentPaths = h1bPaths.filter(p => !p.id.includes("student"));

  // Non-student paths should not start with F-1 or OPT
  for (const path of nonStudentPaths) {
    const statusStages = path.stages.filter(s => s.track === "status");
    if (statusStages.length > 0 && (statusStages[0].nodeId === "f1" || statusStages[0].nodeId === "opt")) {
      return false;
    }
  }
  return true;
});

// =============================================================================
// SUMMARY
// =============================================================================
console.log("\n" + "=".repeat(60));
console.log(`IMMIGRATION RULES: ${passed} passed, ${failed} failed`);
console.log("=".repeat(60) + "\n");

process.exit(failed > 0 ? 1 : 0);
