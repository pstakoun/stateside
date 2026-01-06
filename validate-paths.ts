// Detailed path validation - show actual paths for each scenario
import { generatePaths, ComposedPath } from "./lib/path-composer";
import { FilterState, defaultFilters } from "./lib/filter-paths";

interface Scenario {
  name: string;
  filters: Partial<FilterState>;
}

const scenarios: Scenario[] = [
  {
    name: "Canadian, Bachelor's, <2yr exp (default)",
    filters: { currentStatus: "canada", education: "bachelors", experience: "lt2" },
  },
  {
    name: "F-1 student, High School only",
    filters: { currentStatus: "f1", education: "highschool", experience: "lt2" },
  },
  {
    name: "OPT, Master's, STEM",
    filters: { currentStatus: "opt", education: "masters", experience: "lt2", isStem: true },
  },
  {
    name: "OPT, Bachelor's, NON-STEM",
    filters: { currentStatus: "opt", education: "bachelors", experience: "lt2", isStem: false },
  },
  {
    name: "TN, Bachelor's + 5yr (should qualify EB-2)",
    filters: { currentStatus: "tn", education: "bachelors", experience: "gt5" },
  },
  {
    name: "Canadian, married to US citizen",
    filters: { currentStatus: "canada", education: "bachelors", isMarriedToUSCitizen: true },
  },
  {
    name: "Canadian, extraordinary ability",
    filters: { currentStatus: "canada", education: "masters", hasExtraordinaryAbility: true },
  },
  {
    name: "Canadian, executive/manager",
    filters: { currentStatus: "canada", education: "bachelors", isExecutive: true },
  },
  {
    name: "Canadian, $800k+ investment",
    filters: { currentStatus: "canada", education: "highschool", hasInvestmentCapital: true },
  },
  {
    name: "H-1B holder, Master's",
    filters: { currentStatus: "h1b", education: "masters", experience: "2to5" },
  },
];

function formatDuration(d: { min: number; max: number; display?: string }): string {
  if (d.display) return d.display;
  return `${d.min.toFixed(1)}-${d.max.toFixed(1)} yr`;
}

function validateScenario(scenario: Scenario) {
  const filters: FilterState = { ...defaultFilters, ...scenario.filters };
  const paths = generatePaths(filters);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`SCENARIO: ${scenario.name}`);
  console.log(`Filters: ${JSON.stringify(scenario.filters)}`);
  console.log(`${"=".repeat(70)}`);
  console.log(`Generated ${paths.length} paths:\n`);

  for (const path of paths) {
    console.log(`📍 ${path.name} (${path.gcCategory})`);
    console.log(`   Duration: ${formatDuration(path.totalYears)} | Cost: $${path.estimatedCost.toLocaleString()}`);
    console.log(`   ${path.hasLottery ? "⚠️ Requires lottery" : "✓ No lottery"} | ${path.isSelfPetition ? "✓ Self-petition" : "⚠️ Needs employer"}`);

    // Show stages
    const statusStages = path.stages.filter(s => s.track === "status").map(s => s.nodeId);
    const gcStages = path.stages.filter(s => s.track === "gc").map(s => s.nodeId);

    if (statusStages.length > 0) {
      console.log(`   Status: ${statusStages.join(" → ")}`);
    }
    if (gcStages.length > 0) {
      console.log(`   GC: ${gcStages.join(" → ")}`);
    }

    // Check for STEM OPT
    const optStage = path.stages.find(s => s.nodeId === "opt");
    if (optStage) {
      console.log(`   OPT Duration: ${formatDuration(optStage.durationYears)} ${optStage.note ? `(${optStage.note})` : ""}`);
    }

    console.log("");
  }
}

// Validate specific edge cases
function validateEdgeCases() {
  console.log("\n" + "🔍".repeat(35));
  console.log("EDGE CASE VALIDATION");
  console.log("🔍".repeat(35));

  // 1. STEM vs non-STEM OPT duration
  console.log("\n--- STEM vs Non-STEM OPT Duration ---");
  const stemFilters: FilterState = { ...defaultFilters, currentStatus: "opt", education: "bachelors", isStem: true };
  const nonStemFilters: FilterState = { ...defaultFilters, currentStatus: "opt", education: "bachelors", isStem: false };

  const stemPaths = generatePaths(stemFilters);
  const nonStemPaths = generatePaths(nonStemFilters);

  const stemOpt = stemPaths[0]?.stages.find(s => s.nodeId === "opt");
  const nonStemOpt = nonStemPaths[0]?.stages.find(s => s.nodeId === "opt");

  console.log(`STEM OPT: ${stemOpt ? formatDuration(stemOpt.durationYears) : "N/A"} - ${stemOpt?.note || ""}`);
  console.log(`Non-STEM OPT: ${nonStemOpt ? formatDuration(nonStemOpt.durationYears) : "N/A"} - ${nonStemOpt?.note || ""}`);

  if (stemOpt && nonStemOpt) {
    if (stemOpt.durationYears.max > nonStemOpt.durationYears.max) {
      console.log("✓ STEM OPT correctly shows longer duration");
    } else {
      console.log("✗ ERROR: STEM OPT should be longer than non-STEM");
    }
  }

  // 2. Bachelor's + 5yr should qualify for EB-2 (not just EB-3)
  console.log("\n--- Bachelor's + 5yr Experience → EB-2 ---");
  const bach5yrFilters: FilterState = { ...defaultFilters, currentStatus: "tn", education: "bachelors", experience: "gt5" };
  const bach5yrPaths = generatePaths(bach5yrFilters);

  const eb2Paths = bach5yrPaths.filter(p => p.gcCategory === "EB-2" || p.gcCategory === "EB-2 NIW");
  const eb3Paths = bach5yrPaths.filter(p => p.gcCategory === "EB-3");

  console.log(`EB-2 paths: ${eb2Paths.length}`);
  console.log(`EB-3 paths: ${eb3Paths.length}`);

  if (eb2Paths.length > 0) {
    console.log("✓ Bachelor's + 5yr correctly qualifies for EB-2");
  } else {
    console.log("✗ ERROR: Bachelor's + 5yr should qualify for EB-2");
  }

  // 3. F-1 to TN should be allowed
  console.log("\n--- F-1 → TN Path Availability ---");
  const f1Filters: FilterState = { ...defaultFilters, currentStatus: "f1", education: "bachelors" };
  const f1Paths = generatePaths(f1Filters);

  const tnPaths = f1Paths.filter(p => p.stages.some(s => s.nodeId === "tn"));
  console.log(`F-1 paths that include TN: ${tnPaths.length}`);

  if (tnPaths.length > 0) {
    console.log("✓ F-1 can transition to TN");
    console.log(`  Paths: ${tnPaths.map(p => p.name).join(", ")}`);
  } else {
    console.log("✗ ERROR: F-1 should be able to get TN");
  }

  // 4. Marriage path should be fastest
  console.log("\n--- Marriage Path Should Be Fastest ---");
  const marriedFilters: FilterState = { ...defaultFilters, currentStatus: "canada", education: "bachelors", isMarriedToUSCitizen: true };
  const marriedPaths = generatePaths(marriedFilters);

  const sortedByTime = [...marriedPaths].sort((a, b) => a.totalYears.min - b.totalYears.min);
  const marriagePath = marriedPaths.find(p => p.gcCategory === "Marriage-based");

  console.log(`Fastest path: ${sortedByTime[0]?.name} (${formatDuration(sortedByTime[0]?.totalYears)})`);
  console.log(`Marriage path: ${marriagePath?.name} (${marriagePath ? formatDuration(marriagePath.totalYears) : "N/A"})`);

  if (sortedByTime[0]?.gcCategory === "Marriage-based") {
    console.log("✓ Marriage-based is correctly the fastest path");
  } else if (marriagePath && sortedByTime[0]?.totalYears.min <= marriagePath.totalYears.min + 0.5) {
    console.log("✓ Marriage-based is among the fastest paths");
  } else {
    console.log("⚠ Marriage might not be showing as fastest");
  }

  // 5. EB-5 should be available regardless of education
  console.log("\n--- EB-5 Available Without Education ---");
  const noEduInvestorFilters: FilterState = { ...defaultFilters, currentStatus: "canada", education: "highschool", hasInvestmentCapital: true };
  const investorPaths = generatePaths(noEduInvestorFilters);

  const eb5Paths = investorPaths.filter(p => p.gcCategory === "EB-5");
  console.log(`EB-5 paths for high school + investment: ${eb5Paths.length}`);

  if (eb5Paths.length > 0) {
    console.log("✓ EB-5 available regardless of education level");
  } else {
    console.log("✗ ERROR: EB-5 should not require education");
  }
}

// Run all validations
for (const scenario of scenarios) {
  validateScenario(scenario);
}

validateEdgeCases();

console.log("\n" + "=".repeat(70));
console.log("VALIDATION COMPLETE");
console.log("=".repeat(70));
