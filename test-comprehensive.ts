// Comprehensive permutation tests for path generation
// Covers all 72 base permutations + boolean flag combinations
import { generatePaths, ComposedPath, STATUS_PATHS, GC_METHODS } from "./lib/path-composer";
import { FilterState, defaultFilters, Education, Experience, CurrentStatus } from "./lib/filter-paths";

// All possible filter values
const ALL_STATUSES: CurrentStatus[] = ["canada", "f1", "opt", "tn", "h1b", "other"];
const ALL_EDUCATIONS: Education[] = ["highschool", "bachelors", "masters", "phd"];
const ALL_EXPERIENCES: Experience[] = ["lt2", "2to5", "gt5"];

interface TestResult {
  filters: Partial<FilterState>;
  pathCount: number;
  paths: string[];
  issues: string[];
}

interface ValidationStats {
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  results: TestResult[];
}

function formatFilters(f: Partial<FilterState>): string {
  const parts: string[] = [];
  if (f.currentStatus) parts.push(f.currentStatus);
  if (f.education) parts.push(f.education);
  if (f.experience) parts.push(f.experience);
  if (f.hasExtraordinaryAbility) parts.push("extraordinary");
  if (f.isOutstandingResearcher) parts.push("researcher");
  if (f.isExecutive) parts.push("executive");
  if (f.isStem) parts.push("STEM");
  if (f.isMarriedToUSCitizen) parts.push("married");
  if (f.hasInvestmentCapital) parts.push("investor");
  return parts.join("/");
}

// ============== VALIDATION RULES ==============

function validatePath(path: ComposedPath, filters: FilterState): string[] {
  const issues: string[] = [];

  // Rule 1: Path must have at least one stage
  if (path.stages.length === 0) {
    issues.push(`Path ${path.id} has no stages`);
  }

  // Rule 2: Total years must be positive and reasonable
  if (path.totalYears.min < 0 || path.totalYears.max < 0) {
    issues.push(`Path ${path.id} has negative duration`);
  }
  if (path.totalYears.min > path.totalYears.max) {
    issues.push(`Path ${path.id} min > max duration`);
  }
  if (path.totalYears.max > 15) {
    issues.push(`Path ${path.id} has unreasonably long duration (${path.totalYears.max} years)`);
  }

  // Rule 3: Estimated cost must be non-negative
  if (path.estimatedCost < 0) {
    issues.push(`Path ${path.id} has negative cost`);
  }

  // Rule 4: GC category must be valid
  const validCategories = ["EB-1A", "EB-1B", "EB-1C", "EB-2", "EB-2 NIW", "EB-3", "Marriage-based", "EB-5"];
  if (!validCategories.includes(path.gcCategory)) {
    issues.push(`Path ${path.id} has invalid category: ${path.gcCategory}`);
  }

  // Rule 5: H-1B paths should have lottery flag
  const hasH1BStage = path.stages.some(s => s.nodeId === "h1b");
  if (hasH1BStage && !path.hasLottery) {
    issues.push(`Path ${path.id} has H-1B but lottery flag is false`);
  }
  if (!hasH1BStage && path.hasLottery) {
    issues.push(`Path ${path.id} has no H-1B but lottery flag is true`);
  }

  // Rule 6: Self-petition categories must have isSelfPetition flag
  const selfPetitionCategories = ["EB-1A", "EB-2 NIW", "Marriage-based", "EB-5"];
  if (selfPetitionCategories.includes(path.gcCategory) && !path.isSelfPetition) {
    issues.push(`Path ${path.id} is ${path.gcCategory} but not marked as self-petition`);
  }

  // Rule 7: STEM OPT should show 3 years if isStem is true
  if (filters.isStem) {
    const optStage = path.stages.find(s => s.nodeId === "opt");
    if (optStage && optStage.durationYears.max < 3) {
      issues.push(`Path ${path.id} should show 3yr STEM OPT, shows ${optStage.durationYears.max}`);
    }
  }

  // Rule 8: Non-STEM OPT should show 1 year max
  if (!filters.isStem) {
    const optStage = path.stages.find(s => s.nodeId === "opt");
    if (optStage && optStage.durationYears.max > 1.5) {
      // Allow some tolerance
      issues.push(`Path ${path.id} should show 1yr non-STEM OPT, shows ${optStage.durationYears.max}`);
    }
  }

  return issues;
}

function validateFiltersConstraints(paths: ComposedPath[], filters: FilterState): string[] {
  const issues: string[] = [];

  // Rule 1: High school only should not have direct PERM paths
  if (filters.education === "highschool") {
    const directPermPaths = paths.filter(p =>
      p.id.includes("perm_route") &&
      !p.id.includes("student")
    );
    if (directPermPaths.length > 0) {
      issues.push(`High school should not have direct PERM: ${directPermPaths.map(p => p.id).join(", ")}`);
    }
  }

  // Rule 2: Bachelor's + 5yr should see EB-2 options
  if (filters.education === "bachelors" && filters.experience === "gt5") {
    const eb2Paths = paths.filter(p => p.gcCategory === "EB-2" || p.gcCategory === "EB-2 NIW");
    if (eb2Paths.length === 0) {
      issues.push("Bachelor's + 5yr should qualify for EB-2");
    }
  }

  // Rule 3: Marriage should be available if married flag is set
  if (filters.isMarriedToUSCitizen) {
    const marriagePaths = paths.filter(p => p.gcCategory === "Marriage-based");
    if (marriagePaths.length === 0) {
      issues.push("Married to US citizen should have marriage path");
    }
  }

  // Rule 4: Extraordinary ability should see EB-1A
  if (filters.hasExtraordinaryAbility) {
    const eb1aPaths = paths.filter(p => p.gcCategory === "EB-1A");
    if (eb1aPaths.length === 0) {
      issues.push("Extraordinary ability should have EB-1A path");
    }
  }

  // Rule 5: Executive should see EB-1C or L-1A
  if (filters.isExecutive) {
    const eb1cPaths = paths.filter(p =>
      p.gcCategory === "EB-1C" ||
      p.id.includes("l1a")
    );
    if (eb1cPaths.length === 0 && ["canada", "other"].includes(filters.currentStatus)) {
      issues.push("Executive should have EB-1C/L-1A path");
    }
  }

  // Rule 6: Investment capital should see EB-5
  if (filters.hasInvestmentCapital) {
    const eb5Paths = paths.filter(p => p.gcCategory === "EB-5");
    if (eb5Paths.length === 0) {
      issues.push("Investment capital should have EB-5 path");
    }
  }

  // Rule 7: Outstanding researcher should see EB-1B
  if (filters.isOutstandingResearcher && ["masters", "phd"].includes(filters.education)) {
    const eb1bPaths = paths.filter(p => p.gcCategory === "EB-1B");
    if (eb1bPaths.length === 0) {
      issues.push("Outstanding researcher with advanced degree should have EB-1B path");
    }
  }

  // Rule 8: F-1 student should be able to get TN (if bachelor's+)
  if (filters.currentStatus === "f1" && filters.education !== "highschool") {
    const tnPaths = paths.filter(p => p.stages.some(s => s.nodeId === "tn"));
    if (tnPaths.length === 0) {
      issues.push("F-1 with degree should be able to transition to TN");
    }
  }

  // Rule 9: Canada start should have TN option (if bachelor's+)
  if (filters.currentStatus === "canada" && filters.education !== "highschool") {
    const tnPaths = paths.filter(p => p.stages.some(s => s.nodeId === "tn"));
    if (tnPaths.length === 0) {
      issues.push("Canadian with degree should have TN path option");
    }
  }

  // Rule 10: Should always have at least 1 path for most combinations
  if (paths.length === 0) {
    // Some combinations legitimately have no paths
    const hasSpecialQualification =
      filters.hasExtraordinaryAbility ||
      filters.isOutstandingResearcher ||
      filters.isExecutive ||
      filters.isMarriedToUSCitizen ||
      filters.hasInvestmentCapital;

    if (hasSpecialQualification || filters.education !== "highschool") {
      issues.push("No paths generated - possible bug");
    }
  }

  return issues;
}

// ============== TEST RUNNERS ==============

function runBasePermutations(): ValidationStats {
  console.log("\n" + "=".repeat(70));
  console.log("BASE PERMUTATIONS TEST (72 combinations)");
  console.log("=".repeat(70) + "\n");

  const stats: ValidationStats = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    results: [],
  };

  for (const status of ALL_STATUSES) {
    for (const education of ALL_EDUCATIONS) {
      for (const experience of ALL_EXPERIENCES) {
        stats.totalTests++;

        const filterOverrides: Partial<FilterState> = {
          currentStatus: status,
          education,
          experience,
        };

        const filters: FilterState = { ...defaultFilters, ...filterOverrides };
        const paths = generatePaths(filters);

        const issues: string[] = [];

        // Validate each path
        for (const path of paths) {
          const pathIssues = validatePath(path, filters);
          issues.push(...pathIssues);
        }

        // Validate filter constraints
        const constraintIssues = validateFiltersConstraints(paths, filters);
        issues.push(...constraintIssues);

        const result: TestResult = {
          filters: filterOverrides,
          pathCount: paths.length,
          paths: paths.map(p => p.id),
          issues,
        };

        stats.results.push(result);

        if (issues.length === 0) {
          console.log(`\x1b[32m✓\x1b[0m ${formatFilters(filterOverrides)} → ${paths.length} paths`);
          stats.passed++;
        } else {
          console.log(`\x1b[31m✗\x1b[0m ${formatFilters(filterOverrides)} → ${paths.length} paths`);
          for (const issue of issues) {
            console.log(`  \x1b[33m⚠ ${issue}\x1b[0m`);
          }
          stats.failed++;
        }
      }
    }
  }

  return stats;
}

function runBooleanFlagTests(): ValidationStats {
  console.log("\n" + "=".repeat(70));
  console.log("BOOLEAN FLAG TESTS");
  console.log("=".repeat(70) + "\n");

  const stats: ValidationStats = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    results: [],
  };

  // Test each boolean flag with various base combinations
  const booleanTestCases: { name: string; filters: Partial<FilterState> }[] = [
    // STEM flag tests
    { name: "STEM OPT (f1)", filters: { currentStatus: "f1", education: "bachelors", isStem: true } },
    { name: "STEM OPT (opt)", filters: { currentStatus: "opt", education: "masters", isStem: true } },
    { name: "Non-STEM OPT", filters: { currentStatus: "opt", education: "bachelors", isStem: false } },

    // Extraordinary ability tests
    { name: "Extraordinary (canada)", filters: { currentStatus: "canada", education: "masters", hasExtraordinaryAbility: true } },
    { name: "Extraordinary (h1b)", filters: { currentStatus: "h1b", education: "phd", hasExtraordinaryAbility: true } },
    { name: "Extraordinary (opt)", filters: { currentStatus: "opt", education: "masters", hasExtraordinaryAbility: true } },

    // Outstanding researcher tests
    { name: "Researcher (masters)", filters: { currentStatus: "canada", education: "masters", isOutstandingResearcher: true } },
    { name: "Researcher (phd)", filters: { currentStatus: "canada", education: "phd", isOutstandingResearcher: true, experience: "gt5" } },

    // Executive tests
    { name: "Executive (canada)", filters: { currentStatus: "canada", education: "bachelors", isExecutive: true, experience: "gt5" } },
    { name: "Executive (other)", filters: { currentStatus: "other", education: "masters", isExecutive: true } },

    // Marriage tests
    { name: "Marriage (canada)", filters: { currentStatus: "canada", education: "highschool", isMarriedToUSCitizen: true } },
    { name: "Marriage (f1)", filters: { currentStatus: "f1", education: "bachelors", isMarriedToUSCitizen: true } },
    { name: "Marriage (tn)", filters: { currentStatus: "tn", education: "masters", isMarriedToUSCitizen: true } },
    { name: "Marriage (h1b)", filters: { currentStatus: "h1b", education: "phd", isMarriedToUSCitizen: true } },

    // Investment tests
    { name: "Investor (canada/hs)", filters: { currentStatus: "canada", education: "highschool", hasInvestmentCapital: true } },
    { name: "Investor (canada/ms)", filters: { currentStatus: "canada", education: "masters", hasInvestmentCapital: true } },
    { name: "Investor (other)", filters: { currentStatus: "other", education: "bachelors", hasInvestmentCapital: true } },

    // Combined flags
    { name: "STEM + Extraordinary", filters: { currentStatus: "opt", education: "phd", isStem: true, hasExtraordinaryAbility: true } },
    { name: "Executive + Married", filters: { currentStatus: "canada", education: "masters", isExecutive: true, isMarriedToUSCitizen: true } },
    { name: "Researcher + Investor", filters: { currentStatus: "canada", education: "phd", isOutstandingResearcher: true, hasInvestmentCapital: true } },
    { name: "All flags except marriage", filters: {
      currentStatus: "canada",
      education: "phd",
      experience: "gt5",
      hasExtraordinaryAbility: true,
      isOutstandingResearcher: true,
      isExecutive: true,
      isStem: true,
      hasInvestmentCapital: true
    }},
  ];

  for (const testCase of booleanTestCases) {
    stats.totalTests++;

    const filters: FilterState = { ...defaultFilters, ...testCase.filters };
    const paths = generatePaths(filters);

    const issues: string[] = [];

    // Validate each path
    for (const path of paths) {
      const pathIssues = validatePath(path, filters);
      issues.push(...pathIssues);
    }

    // Validate filter constraints
    const constraintIssues = validateFiltersConstraints(paths, filters);
    issues.push(...constraintIssues);

    const result: TestResult = {
      filters: testCase.filters,
      pathCount: paths.length,
      paths: paths.map(p => p.id),
      issues,
    };

    stats.results.push(result);

    if (issues.length === 0) {
      console.log(`\x1b[32m✓\x1b[0m ${testCase.name} → ${paths.length} paths`);
      if (paths.length > 0) {
        console.log(`  Paths: ${paths.slice(0, 5).map(p => p.gcCategory).join(", ")}${paths.length > 5 ? "..." : ""}`);
      }
      stats.passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m ${testCase.name} → ${paths.length} paths`);
      for (const issue of issues) {
        console.log(`  \x1b[33m⚠ ${issue}\x1b[0m`);
      }
      stats.failed++;
    }
  }

  return stats;
}

function runTimelineValidation(): ValidationStats {
  console.log("\n" + "=".repeat(70));
  console.log("TIMELINE VALIDATION");
  console.log("=".repeat(70) + "\n");

  const stats: ValidationStats = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    results: [],
  };

  // Expected timeline ranges for common paths
  // Note: min times can be very fast (0.04yr = ~15 days) for premium processing paths
  const timelineExpectations: { filters: Partial<FilterState>; expectedMinYears: number; expectedMaxYears: number }[] = [
    // Marriage-based paths (but filters also show other options which are slower)
    { filters: { currentStatus: "canada", isMarriedToUSCitizen: true }, expectedMinYears: 0, expectedMaxYears: 10 },

    // EB-1A/NIW can be very fast with premium (15 days = 0.04yr)
    { filters: { currentStatus: "canada", education: "phd", hasExtraordinaryAbility: true }, expectedMinYears: 0, expectedMaxYears: 6 },
    { filters: { currentStatus: "canada", education: "masters" }, expectedMinYears: 0, expectedMaxYears: 10 },

    // PERM routes take longer
    { filters: { currentStatus: "tn", education: "bachelors" }, expectedMinYears: 2, expectedMaxYears: 10 },

    // Student paths are longest
    { filters: { currentStatus: "canada", education: "highschool" }, expectedMinYears: 4, expectedMaxYears: 12 },
  ];

  for (const expectation of timelineExpectations) {
    stats.totalTests++;

    const filters: FilterState = { ...defaultFilters, ...expectation.filters };
    const paths = generatePaths(filters);

    const issues: string[] = [];

    if (paths.length > 0) {
      const fastestPath = paths[0]; // Already sorted by min duration
      const slowestPath = paths[paths.length - 1];

      if (fastestPath.totalYears.min < expectation.expectedMinYears * 0.5) {
        issues.push(`Fastest path (${fastestPath.totalYears.min}yr) seems too fast, expected ~${expectation.expectedMinYears}yr`);
      }

      if (slowestPath.totalYears.max > expectation.expectedMaxYears * 1.5) {
        issues.push(`Slowest path (${slowestPath.totalYears.max}yr) seems too slow, expected ~${expectation.expectedMaxYears}yr`);
      }
    }

    const result: TestResult = {
      filters: expectation.filters,
      pathCount: paths.length,
      paths: paths.map(p => `${p.id}:${p.totalYears.min}-${p.totalYears.max}yr`),
      issues,
    };

    stats.results.push(result);

    if (issues.length === 0) {
      const rangeStr = paths.length > 0
        ? `${paths[0].totalYears.min.toFixed(1)}-${paths[paths.length-1].totalYears.max.toFixed(1)} yr`
        : "N/A";
      console.log(`\x1b[32m✓\x1b[0m ${formatFilters(expectation.filters)} → ${rangeStr}`);
      stats.passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m ${formatFilters(expectation.filters)}`);
      for (const issue of issues) {
        console.log(`  \x1b[33m⚠ ${issue}\x1b[0m`);
      }
      stats.failed++;
    }
  }

  return stats;
}

function runCostValidation(): ValidationStats {
  console.log("\n" + "=".repeat(70));
  console.log("COST VALIDATION");
  console.log("=".repeat(70) + "\n");

  const stats: ValidationStats = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    results: [],
  };

  // Sample some paths and validate costs are reasonable
  const sampleFilters: Partial<FilterState>[] = [
    { currentStatus: "canada", education: "masters" },
    { currentStatus: "tn", education: "bachelors" },
    { currentStatus: "h1b", education: "masters" },
    { currentStatus: "canada", education: "highschool", hasInvestmentCapital: true },
    { currentStatus: "canada", isMarriedToUSCitizen: true },
  ];

  for (const filterOverrides of sampleFilters) {
    stats.totalTests++;

    const filters: FilterState = { ...defaultFilters, ...filterOverrides };
    const paths = generatePaths(filters);

    const issues: string[] = [];

    for (const path of paths) {
      // EB-5 paths should have high cost (investment fees, but not the $800k investment itself)
      if (path.gcCategory === "EB-5" && path.estimatedCost < 1000) {
        issues.push(`EB-5 path has suspiciously low cost: $${path.estimatedCost}`);
      }

      // Marriage-based direct paths (none_marriage) should have moderate cost
      // Other marriage paths (e.g., student_masters_marriage) include additional fees
      if (path.id === "none_marriage" && (path.estimatedCost < 500 || path.estimatedCost > 10000)) {
        issues.push(`Direct marriage path cost seems off: $${path.estimatedCost}`);
      }

      // PERM routes should have substantial costs
      if (path.id.includes("perm_route") && path.estimatedCost < 2000) {
        issues.push(`PERM route cost seems low: $${path.estimatedCost}`);
      }

      // All paths should have some cost
      if (path.estimatedCost === 0) {
        issues.push(`Path ${path.id} has zero cost`);
      }
    }

    const result: TestResult = {
      filters: filterOverrides,
      pathCount: paths.length,
      paths: paths.map(p => `${p.gcCategory}:$${p.estimatedCost}`),
      issues,
    };

    stats.results.push(result);

    if (issues.length === 0) {
      const costs = paths.map(p => p.estimatedCost);
      const costRange = costs.length > 0
        ? `$${Math.min(...costs).toLocaleString()}-$${Math.max(...costs).toLocaleString()}`
        : "N/A";
      console.log(`\x1b[32m✓\x1b[0m ${formatFilters(filterOverrides)} → ${costRange}`);
      stats.passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m ${formatFilters(filterOverrides)}`);
      for (const issue of issues) {
        console.log(`  \x1b[33m⚠ ${issue}\x1b[0m`);
      }
      stats.failed++;
    }
  }

  return stats;
}

function runEdgeCaseTests(): ValidationStats {
  console.log("\n" + "=".repeat(70));
  console.log("EDGE CASE TESTS");
  console.log("=".repeat(70) + "\n");

  const stats: ValidationStats = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    results: [],
  };

  const edgeCases: { name: string; filters: Partial<FilterState>; validate: (paths: ComposedPath[]) => string[] }[] = [
    {
      name: "Bachelor's + 5yr should get EB-2 NIW",
      filters: { currentStatus: "canada", education: "bachelors", experience: "gt5" },
      validate: (paths) => {
        const niwPath = paths.find(p => p.gcCategory === "EB-2 NIW");
        return niwPath ? [] : ["Bachelor's + 5yr should qualify for EB-2 NIW"];
      },
    },
    {
      name: "PhD should get NIW without PERM",
      filters: { currentStatus: "canada", education: "phd" },
      validate: (paths) => {
        const niwPath = paths.find(p => p.gcCategory === "EB-2 NIW");
        if (!niwPath) return ["PhD should have NIW path"];
        const hasPerm = niwPath.stages.some(s => s.nodeId === "perm");
        return hasPerm ? ["NIW should not require PERM"] : [];
      },
    },
    {
      name: "F-1 high school can get bachelor's then work",
      filters: { currentStatus: "f1", education: "highschool" },
      validate: (paths) => {
        const studentPath = paths.find(p => p.id.includes("student_bachelors"));
        return studentPath ? [] : ["F-1 high school should have student_bachelors path"];
      },
    },
    {
      name: "OPT can transition to TN",
      filters: { currentStatus: "opt", education: "bachelors" },
      validate: (paths) => {
        const tnPath = paths.find(p => p.stages.some(s => s.nodeId === "tn"));
        return tnPath ? [] : ["OPT should be able to transition to TN"];
      },
    },
    {
      name: "H-1B shouldn't go back to F-1/OPT",
      filters: { currentStatus: "h1b", education: "masters" },
      validate: (paths) => {
        const issues: string[] = [];
        for (const path of paths) {
          // H-1B shouldn't have initial F-1 or OPT stages
          const firstStage = path.stages.find(s => s.track === "status");
          if (firstStage && (firstStage.nodeId === "f1" || firstStage.nodeId === "opt")) {
            // Exception: student paths are okay (going back to school)
            if (!path.id.includes("student")) {
              issues.push(`H-1B path ${path.id} starts with ${firstStage.nodeId}`);
            }
          }
        }
        return issues;
      },
    },
    {
      name: "Marriage should be fastest path",
      filters: { currentStatus: "canada", education: "masters", isMarriedToUSCitizen: true },
      validate: (paths) => {
        const sorted = [...paths].sort((a, b) => a.totalYears.min - b.totalYears.min);
        if (sorted[0]?.gcCategory === "Marriage-based") return [];
        // Check if marriage is at least among the top 2
        const marriagePath = sorted.find(p => p.gcCategory === "Marriage-based");
        if (!marriagePath) return ["No marriage path found"];
        const idx = sorted.indexOf(marriagePath);
        if (idx > 1) return [`Marriage path is #${idx + 1}, should be faster`];
        return [];
      },
    },
    {
      name: "EB-5 available regardless of education",
      filters: { currentStatus: "canada", education: "highschool", hasInvestmentCapital: true },
      validate: (paths) => {
        const eb5Path = paths.find(p => p.gcCategory === "EB-5");
        return eb5Path ? [] : ["EB-5 should be available without education requirement"];
      },
    },
    {
      name: "EB-1C requires L-1A path",
      filters: { currentStatus: "canada", education: "bachelors", isExecutive: true, experience: "gt5" },
      validate: (paths) => {
        const eb1cPath = paths.find(p => p.gcCategory === "EB-1C");
        if (!eb1cPath) return ["Executive should have EB-1C path"];
        const hasL1a = eb1cPath.stages.some(s => s.nodeId === "l1a");
        return hasL1a ? [] : ["EB-1C should require L-1A status"];
      },
    },
    {
      name: "STEM OPT shows 3 years",
      filters: { currentStatus: "opt", education: "bachelors", isStem: true },
      validate: (paths) => {
        for (const path of paths) {
          const optStage = path.stages.find(s => s.nodeId === "opt");
          if (optStage && optStage.durationYears.max < 2.5) {
            return [`STEM OPT should show ~3yr max, got ${optStage.durationYears.max}`];
          }
        }
        return [];
      },
    },
    {
      name: "Non-STEM OPT shows 1 year",
      filters: { currentStatus: "opt", education: "bachelors", isStem: false },
      validate: (paths) => {
        for (const path of paths) {
          const optStage = path.stages.find(s => s.nodeId === "opt");
          if (optStage && optStage.durationYears.max > 1.5) {
            return [`Non-STEM OPT should show ~1yr max, got ${optStage.durationYears.max}`];
          }
        }
        return [];
      },
    },
    {
      name: "L-1B requires bachelor's",
      filters: { currentStatus: "canada", education: "highschool" },
      validate: (paths) => {
        const l1bPath = paths.find(p => p.id.includes("l1b"));
        if (l1bPath) return ["L-1B should require bachelor's degree"];
        return [];
      },
    },
    {
      name: "Canada with PhD has many options",
      filters: { currentStatus: "canada", education: "phd", experience: "gt5" },
      validate: (paths) => {
        if (paths.length < 3) return [`PhD with experience should have many paths, got ${paths.length}`];
        const categories = new Set(paths.map(p => p.gcCategory));
        if (categories.size < 2) return ["Should have multiple GC category options"];
        return [];
      },
    },
  ];

  for (const edgeCase of edgeCases) {
    stats.totalTests++;

    const filters: FilterState = { ...defaultFilters, ...edgeCase.filters };
    const paths = generatePaths(filters);

    const issues = edgeCase.validate(paths);

    const result: TestResult = {
      filters: edgeCase.filters,
      pathCount: paths.length,
      paths: paths.map(p => p.id),
      issues,
    };

    stats.results.push(result);

    if (issues.length === 0) {
      console.log(`\x1b[32m✓\x1b[0m ${edgeCase.name}`);
      stats.passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m ${edgeCase.name}`);
      for (const issue of issues) {
        console.log(`  \x1b[33m⚠ ${issue}\x1b[0m`);
      }
      stats.failed++;
    }
  }

  return stats;
}

function runStatusConsistencyTests(): ValidationStats {
  console.log("\n" + "=".repeat(70));
  console.log("STATUS PATH CONSISTENCY TESTS");
  console.log("=".repeat(70) + "\n");

  const stats: ValidationStats = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    results: [],
  };

  // For each current status, verify valid paths are generated
  for (const status of ALL_STATUSES) {
    stats.totalTests++;

    const filters: FilterState = { ...defaultFilters, currentStatus: status, education: "masters" };
    const paths = generatePaths(filters);

    const issues: string[] = [];

    // Verify paths don't include invalid starting statuses
    for (const path of paths) {
      const statusStages = path.stages.filter(s => s.track === "status");

      // The first status stage should be reachable from current status
      if (statusStages.length > 0) {
        const firstStatusNode = statusStages[0].nodeId;

        // Check if this transition is valid
        const statusPath = STATUS_PATHS.find(sp =>
          sp.stages.length > 0 && sp.stages[0].nodeId === firstStatusNode
        );

        if (statusPath && !statusPath.validFromStatuses.includes(status)) {
          issues.push(`Path ${path.id} starts with ${firstStatusNode} which isn't valid from ${status}`);
        }
      }
    }

    const result: TestResult = {
      filters: { currentStatus: status, education: "masters" },
      pathCount: paths.length,
      paths: paths.map(p => p.id),
      issues,
    };

    stats.results.push(result);

    if (issues.length === 0) {
      console.log(`\x1b[32m✓\x1b[0m ${status} → ${paths.length} valid paths`);
      stats.passed++;
    } else {
      console.log(`\x1b[31m✗\x1b[0m ${status}`);
      for (const issue of issues) {
        console.log(`  \x1b[33m⚠ ${issue}\x1b[0m`);
      }
      stats.failed++;
    }
  }

  return stats;
}

// ============== MAIN ==============

function main() {
  console.log("\n" + "█".repeat(70));
  console.log("COMPREHENSIVE PATH GENERATION TEST SUITE");
  console.log("█".repeat(70));

  const allStats: ValidationStats[] = [];

  // Run all test suites
  allStats.push(runBasePermutations());
  allStats.push(runBooleanFlagTests());
  allStats.push(runEdgeCaseTests());
  allStats.push(runTimelineValidation());
  allStats.push(runCostValidation());
  allStats.push(runStatusConsistencyTests());

  // Aggregate results
  const totalTests = allStats.reduce((sum, s) => sum + s.totalTests, 0);
  const totalPassed = allStats.reduce((sum, s) => sum + s.passed, 0);
  const totalFailed = allStats.reduce((sum, s) => sum + s.failed, 0);

  console.log("\n" + "█".repeat(70));
  console.log("FINAL RESULTS");
  console.log("█".repeat(70));
  console.log(`\nTotal Tests: ${totalTests}`);
  console.log(`\x1b[32mPassed: ${totalPassed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${totalFailed}\x1b[0m`);
  console.log(`Pass Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
  console.log("█".repeat(70) + "\n");

  // Exit with appropriate code
  process.exit(totalFailed > 0 ? 1 : 0);
}

main();
