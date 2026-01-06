// Comprehensive path generation tests
import { generatePaths, ComposedPath } from "./lib/path-composer";
import { FilterState, defaultFilters } from "./lib/filter-paths";

interface TestCase {
  name: string;
  filters: Partial<FilterState>;
  expectedPaths: string[]; // Path IDs or partial names that SHOULD appear
  unexpectedPaths: string[]; // Path IDs or partial names that should NOT appear
  minPaths?: number;
  maxPaths?: number;
}

const testCases: TestCase[] = [
  // === SCENARIO 1: Canadian in Canada, Bachelor's, <2yr experience ===
  {
    name: "Canadian, Bachelor's, <2yr exp - Basic worker",
    filters: {
      currentStatus: "canada",
      education: "bachelors",
      experience: "lt2",
    },
    expectedPaths: [
      "tn_direct_perm", // TN -> EB-3
      "student_masters", // Can get Master's -> EB-2
    ],
    unexpectedPaths: [
      "eb1a", // No extraordinary ability
      "eb1c", // Not executive
      "marriage", // Not married
      "eb5", // No investment
    ],
    minPaths: 3,
  },

  // === SCENARIO 2: F-1 student with high school only ===
  {
    name: "F-1 student, High School only",
    filters: {
      currentStatus: "f1",
      education: "highschool",
      experience: "lt2",
    },
    expectedPaths: [
      "student_bachelors", // Can get Bachelor's then do PERM
    ],
    unexpectedPaths: [
      "tn_direct_perm", // Needs existing Bachelor's for direct TN
      "h1b_direct", // Needs existing Bachelor's
      "none_perm", // Can't do direct PERM without degree
    ],
    minPaths: 1,
  },

  // === SCENARIO 3: OPT holder with Master's, STEM ===
  {
    name: "OPT, Master's, STEM - Should see 3yr OPT",
    filters: {
      currentStatus: "opt",
      education: "masters",
      experience: "lt2",
      isStem: true,
    },
    expectedPaths: [
      "opt_h1b_perm", // OPT -> H-1B -> EB-2
      "niw", // EB-2 NIW (has Master's)
    ],
    unexpectedPaths: [
      "student_bachelors", // Already has Master's
      "l1a", // Can't start L-1A from OPT
    ],
    minPaths: 2,
  },

  // === SCENARIO 4: TN holder with Bachelor's + 5yr experience ===
  {
    name: "TN, Bachelor's + 5yr exp - Should qualify for EB-2",
    filters: {
      currentStatus: "tn",
      education: "bachelors",
      experience: "gt5",
    },
    expectedPaths: [
      "tn_direct_perm", // TN -> EB-2 (Bachelor's + 5yr = Master's equivalent)
      "niw", // NIW allowed with Bachelor's + 5yr
    ],
    unexpectedPaths: [
      "student_bachelors", // Already has Bachelor's
      "l1a", // Can't start L-1A from TN
    ],
    minPaths: 2,
  },

  // === SCENARIO 5: Married to US citizen ===
  {
    name: "Canadian, married to US citizen",
    filters: {
      currentStatus: "canada",
      education: "bachelors",
      experience: "lt2",
      isMarriedToUSCitizen: true,
    },
    expectedPaths: [
      "marriage", // Marriage-based GC
      "none_marriage", // Direct marriage filing
    ],
    unexpectedPaths: [],
    minPaths: 1, // At least marriage path
  },

  // === SCENARIO 6: Extraordinary ability ===
  {
    name: "Canadian with extraordinary ability",
    filters: {
      currentStatus: "canada",
      education: "masters",
      experience: "gt5",
      hasExtraordinaryAbility: true,
    },
    expectedPaths: [
      "eb1a", // EB-1A self-petition
      "o1", // O-1 visa path
    ],
    unexpectedPaths: [],
    minPaths: 2,
  },

  // === SCENARIO 7: Executive/Manager ===
  {
    name: "Canadian executive at multinational",
    filters: {
      currentStatus: "canada",
      education: "bachelors",
      experience: "gt5",
      isExecutive: true,
    },
    expectedPaths: [
      "l1a", // L-1A transfer
      "eb1c", // EB-1C
    ],
    unexpectedPaths: [],
    minPaths: 1,
  },

  // === SCENARIO 8: EB-5 Investor ===
  {
    name: "Canadian with $800k+ investment capital",
    filters: {
      currentStatus: "canada",
      education: "highschool",
      experience: "lt2",
      hasInvestmentCapital: true,
    },
    expectedPaths: [
      "eb5", // EB-5 investor path
    ],
    unexpectedPaths: [],
    minPaths: 1,
  },

  // === SCENARIO 9: H-1B holder ===
  {
    name: "H-1B holder with Master's",
    filters: {
      currentStatus: "h1b",
      education: "masters",
      experience: "2to5",
    },
    expectedPaths: [
      "h1b_direct_perm", // Continue H-1B -> EB-2
      "niw", // EB-2 NIW
    ],
    unexpectedPaths: [
      "opt", // Can't go back to OPT
      "f1", // Can't go back to F-1
    ],
    minPaths: 2,
  },

  // === SCENARIO 10: Outstanding researcher ===
  {
    name: "Outstanding researcher with PhD",
    filters: {
      currentStatus: "canada",
      education: "phd",
      experience: "gt5",
      isOutstandingResearcher: true,
    },
    expectedPaths: [
      "eb1b", // EB-1B outstanding researcher
      "niw", // NIW (has PhD)
    ],
    unexpectedPaths: [],
    minPaths: 2,
  },

  // === EDGE CASE: F-1 to TN (should be allowed) ===
  {
    name: "F-1 student - should see TN path option",
    filters: {
      currentStatus: "f1",
      education: "bachelors",
      experience: "lt2",
    },
    expectedPaths: [
      "tn", // F-1 can change to TN
    ],
    unexpectedPaths: [],
    minPaths: 1,
  },

  // === EDGE CASE: Non-STEM OPT should show 1yr only ===
  {
    name: "OPT, non-STEM - should show 1yr OPT",
    filters: {
      currentStatus: "opt",
      education: "bachelors",
      experience: "lt2",
      isStem: false,
    },
    expectedPaths: [],
    unexpectedPaths: [],
    minPaths: 1,
  },
];

function runTests() {
  console.log("=".repeat(60));
  console.log("PATH GENERATION TEST SUITE");
  console.log("=".repeat(60));
  console.log("");

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const testCase of testCases) {
    const filters: FilterState = { ...defaultFilters, ...testCase.filters };
    const paths = generatePaths(filters);

    const issues: string[] = [];

    // Check minimum paths
    if (testCase.minPaths !== undefined && paths.length < testCase.minPaths) {
      issues.push(`Expected at least ${testCase.minPaths} paths, got ${paths.length}`);
    }

    // Check maximum paths
    if (testCase.maxPaths !== undefined && paths.length > testCase.maxPaths) {
      issues.push(`Expected at most ${testCase.maxPaths} paths, got ${paths.length}`);
    }

    // Check expected paths exist
    for (const expected of testCase.expectedPaths) {
      const found = paths.some(
        (p) => p.id.includes(expected) || p.name.toLowerCase().includes(expected.toLowerCase())
      );
      if (!found) {
        issues.push(`Missing expected path: ${expected}`);
      }
    }

    // Check unexpected paths don't exist
    for (const unexpected of testCase.unexpectedPaths) {
      const found = paths.some(
        (p) => p.id.includes(unexpected) || p.name.toLowerCase().includes(unexpected.toLowerCase())
      );
      if (found) {
        issues.push(`Found unexpected path: ${unexpected}`);
      }
    }

    // Report results
    if (issues.length === 0) {
      console.log(`✓ ${testCase.name}`);
      console.log(`  → ${paths.length} paths generated`);
      passed++;
    } else {
      console.log(`✗ ${testCase.name}`);
      console.log(`  → ${paths.length} paths: ${paths.map((p) => p.id).join(", ")}`);
      for (const issue of issues) {
        console.log(`  ⚠ ${issue}`);
      }
      failed++;
      failures.push(testCase.name);
    }
    console.log("");
  }

  console.log("=".repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`\nFailed tests:`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log("=".repeat(60));

  // Return exit code
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
