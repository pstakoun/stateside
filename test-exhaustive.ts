// EXHAUSTIVE validation - check every single path that can be generated
import { generatePaths, ComposedPath, STATUS_PATHS, GC_METHODS } from "./lib/path-composer";
import { FilterState, defaultFilters, Education, Experience, CurrentStatus } from "./lib/filter-paths";
import visaData from "./data/visa-paths.json";

const ALL_STATUSES: CurrentStatus[] = ["canada", "f1", "opt", "tn", "h1b", "other"];
const ALL_EDUCATIONS: Education[] = ["highschool", "bachelors", "masters", "phd"];
const ALL_EXPERIENCES: Experience[] = ["lt2", "2to5", "gt5"];

interface Issue {
  path: string;
  filters: string;
  problem: string;
}

const issues: Issue[] = [];
let totalPaths = 0;
let uniquePathIds = new Set<string>();

function addIssue(path: ComposedPath, filters: Partial<FilterState>, problem: string) {
  issues.push({
    path: path.id,
    filters: JSON.stringify(filters),
    problem,
  });
}

function validatePath(path: ComposedPath, filters: FilterState) {
  totalPaths++;
  uniquePathIds.add(path.id);

  // 1. Check all nodeIds exist in visa-paths.json
  for (const stage of path.stages) {
    if (!(stage.nodeId in visaData.nodes)) {
      addIssue(path, filters, `Unknown nodeId: ${stage.nodeId}`);
    }
  }

  // 2. Check duration math
  if (path.totalYears.min < 0) {
    addIssue(path, filters, `Negative min duration: ${path.totalYears.min}`);
  }
  if (path.totalYears.max < 0) {
    addIssue(path, filters, `Negative max duration: ${path.totalYears.max}`);
  }
  if (path.totalYears.min > path.totalYears.max) {
    addIssue(path, filters, `Min > Max: ${path.totalYears.min} > ${path.totalYears.max}`);
  }
  if (path.totalYears.max > 20) {
    addIssue(path, filters, `Unreasonable duration: ${path.totalYears.max} years`);
  }

  // 3. Check each stage duration
  for (const stage of path.stages) {
    if (stage.durationYears.min < 0 || stage.durationYears.max < 0) {
      addIssue(path, filters, `Negative stage duration: ${stage.nodeId}`);
    }
    if (stage.durationYears.min > stage.durationYears.max) {
      addIssue(path, filters, `Stage min > max: ${stage.nodeId}`);
    }
  }

  // 4. Check cost
  if (path.estimatedCost < 0) {
    addIssue(path, filters, `Negative cost: ${path.estimatedCost}`);
  }
  if (path.estimatedCost === 0) {
    addIssue(path, filters, `Zero cost - likely missing filings`);
  }

  // 5. Check GC category is valid
  const validCategories = ["EB-1A", "EB-1B", "EB-1C", "EB-2", "EB-2 NIW", "EB-3", "Marriage-based", "EB-5"];
  if (!validCategories.includes(path.gcCategory)) {
    addIssue(path, filters, `Invalid GC category: ${path.gcCategory}`);
  }

  // 6. Check path ends with gc node
  const lastStage = path.stages[path.stages.length - 1];
  if (lastStage?.nodeId !== "gc") {
    addIssue(path, filters, `Path doesn't end with gc node, ends with: ${lastStage?.nodeId}`);
  }

  // 7. Check H-1B lottery flag consistency
  const hasH1B = path.stages.some(s => s.nodeId === "h1b");
  if (hasH1B !== path.hasLottery) {
    addIssue(path, filters, `H-1B/lottery mismatch: hasH1B=${hasH1B}, hasLottery=${path.hasLottery}`);
  }

  // 8. Check self-petition flag consistency
  const selfPetitionCategories = ["EB-1A", "EB-2 NIW", "Marriage-based", "EB-5"];
  const shouldBeSelfPetition = selfPetitionCategories.includes(path.gcCategory);
  if (shouldBeSelfPetition !== path.isSelfPetition) {
    addIssue(path, filters, `Self-petition mismatch: category=${path.gcCategory}, isSelfPetition=${path.isSelfPetition}`);
  }

  // 9. Check STEM OPT duration
  if (filters.isStem) {
    const optStage = path.stages.find(s => s.nodeId === "opt");
    if (optStage && optStage.durationYears.max < 2) {
      addIssue(path, filters, `STEM OPT should be ~3yr, got ${optStage.durationYears.max}`);
    }
  }

  // 10. Check non-STEM OPT duration
  if (!filters.isStem) {
    const optStage = path.stages.find(s => s.nodeId === "opt");
    if (optStage && optStage.durationYears.max > 1.5) {
      addIssue(path, filters, `Non-STEM OPT should be ~1yr, got ${optStage.durationYears.max}`);
    }
  }

  // 11. Check PERM paths have correct stages
  if (path.id.includes("perm_route")) {
    const gcStages = path.stages.filter(s => s.track === "gc").map(s => s.nodeId);
    if (!gcStages.includes("pwd")) {
      addIssue(path, filters, `PERM path missing PWD stage`);
    }
    if (!gcStages.includes("perm")) {
      addIssue(path, filters, `PERM path missing PERM stage`);
    }
    if (!gcStages.includes("i140")) {
      addIssue(path, filters, `PERM path missing I-140 stage`);
    }
  }

  // 12. Check NIW paths don't have PERM
  if (path.gcCategory === "EB-2 NIW") {
    const hasPerm = path.stages.some(s => s.nodeId === "perm");
    if (hasPerm) {
      addIssue(path, filters, `NIW path should not have PERM stage`);
    }
  }

  // 13. Check EB-1C has L-1A
  if (path.gcCategory === "EB-1C") {
    const hasL1A = path.stages.some(s => s.nodeId === "l1a");
    if (!hasL1A) {
      addIssue(path, filters, `EB-1C path should have L-1A stage`);
    }
  }

  // 14. Check stage startYear is non-negative and sequential
  for (const stage of path.stages) {
    if (stage.startYear < 0) {
      addIssue(path, filters, `Negative startYear: ${stage.nodeId} at ${stage.startYear}`);
    }
  }

  // 15. Check name and description exist
  if (!path.name || path.name.length === 0) {
    addIssue(path, filters, `Missing path name`);
  }
  if (!path.description || path.description.length === 0) {
    addIssue(path, filters, `Missing path description`);
  }
}

console.log("=".repeat(70));
console.log("EXHAUSTIVE PATH VALIDATION");
console.log("Testing every possible filter combination...");
console.log("=".repeat(70) + "\n");

// Test ALL base combinations (72)
let baseTestedCount = 0;
for (const status of ALL_STATUSES) {
  for (const education of ALL_EDUCATIONS) {
    for (const experience of ALL_EXPERIENCES) {
      baseTestedCount++;
      const filters: FilterState = { ...defaultFilters, currentStatus: status, education, experience };
      const paths = generatePaths(filters);
      for (const path of paths) {
        validatePath(path, filters);
      }
    }
  }
}
console.log(`✓ Tested ${baseTestedCount} base combinations`);

// Test all boolean flag combinations with representative base
const booleanFlags = [
  "hasExtraordinaryAbility",
  "isOutstandingResearcher",
  "isExecutive",
  "isStem",
  "isMarriedToUSCitizen",
  "hasInvestmentCapital"
] as const;

// Test each flag individually
let flagTestedCount = 0;
for (const flag of booleanFlags) {
  for (const status of ALL_STATUSES) {
    for (const education of ALL_EDUCATIONS) {
      flagTestedCount++;
      const filters: FilterState = {
        ...defaultFilters,
        currentStatus: status,
        education,
        [flag]: true
      };
      const paths = generatePaths(filters);
      for (const path of paths) {
        validatePath(path, filters);
      }
    }
  }
}
console.log(`✓ Tested ${flagTestedCount} flag combinations`);

// Test some multi-flag combinations
const multiFlags = [
  { isStem: true, hasExtraordinaryAbility: true },
  { isExecutive: true, isMarriedToUSCitizen: true },
  { hasExtraordinaryAbility: true, isOutstandingResearcher: true },
  { isStem: true, isMarriedToUSCitizen: true },
  { hasInvestmentCapital: true, isExecutive: true },
];

let multiTestedCount = 0;
for (const flagCombo of multiFlags) {
  for (const status of ALL_STATUSES) {
    for (const education of ALL_EDUCATIONS) {
      multiTestedCount++;
      const filters: FilterState = { ...defaultFilters, currentStatus: status, education, ...flagCombo };
      const paths = generatePaths(filters);
      for (const path of paths) {
        validatePath(path, filters);
      }
    }
  }
}
console.log(`✓ Tested ${multiTestedCount} multi-flag combinations`);

// Summary
console.log("\n" + "=".repeat(70));
console.log("RESULTS");
console.log("=".repeat(70));
console.log(`Total filter combinations tested: ${baseTestedCount + flagTestedCount + multiTestedCount}`);
console.log(`Total paths validated: ${totalPaths}`);
console.log(`Unique path IDs: ${uniquePathIds.size}`);
console.log(`Issues found: ${issues.length}`);

if (issues.length > 0) {
  console.log("\nISSUES:");
  // Group by problem type
  const byProblem = new Map<string, Issue[]>();
  for (const issue of issues) {
    const existing = byProblem.get(issue.problem) || [];
    existing.push(issue);
    byProblem.set(issue.problem, existing);
  }

  for (const [problem, issueList] of Array.from(byProblem.entries())) {
    console.log(`\n❌ ${problem} (${issueList.length} occurrences)`);
    // Show first 3 examples
    for (const issue of issueList.slice(0, 3)) {
      console.log(`   Path: ${issue.path}`);
    }
    if (issueList.length > 3) {
      console.log(`   ... and ${issueList.length - 3} more`);
    }
  }
  process.exit(1);
} else {
  console.log("\n✅ ALL PATHS VALIDATED SUCCESSFULLY");

  // Print all unique path IDs
  console.log("\nAll unique paths generated:");
  const sortedIds = Array.from(uniquePathIds).sort();
  for (const id of sortedIds) {
    console.log(`  - ${id}`);
  }
}

console.log("\n" + "=".repeat(70));
process.exit(issues.length > 0 ? 1 : 0);
