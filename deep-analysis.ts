#!/usr/bin/env npx ts-node
/**
 * Deep Analysis of Immigration Path Data Accuracy
 *
 * This script performs a thorough review of:
 * 1. Fee data accuracy (against current USCIS fee schedule)
 * 2. Processing time accuracy
 * 3. Path logic edge cases
 * 4. Data inconsistencies
 * 5. Immigration law accuracy
 */

import visaData from "./data/visa-paths.json";
import { STATUS_PATHS, GC_METHODS, generatePaths, computeGCCategory } from "./lib/path-composer";
import { FilterState, defaultFilters, isTNEligible } from "./lib/filter-paths";

interface Issue {
  severity: "critical" | "warning" | "info" | "suggestion";
  category: string;
  title: string;
  details: string;
  recommendation?: string;
}

const issues: Issue[] = [];

function addIssue(
  severity: Issue["severity"],
  category: string,
  title: string,
  details: string,
  recommendation?: string
) {
  issues.push({ severity, category, title, details, recommendation });
}

// ============== 1. FEE ACCURACY ANALYSIS ==============
console.log("\n🔍 Analyzing fee data accuracy...\n");

// Current USCIS fees as of December 2025
const CURRENT_FEES = {
  "I-140": 715,
  "I-485": 1440,
  "I-765": 260,  // As of April 2024, separate filing is $260
  "I-131": 630,  // Re-entry permit
  "I-130": 625,
  "I-907": 2805, // Premium processing
  "I-129_H1B_BASE": 780,  // Just the base I-129 fee
  "I-129_H1B_ACWIA": 1500, // ACWIA fee (companies 26+ employees)
  "I-129_H1B_FRAUD": 500,  // Fraud prevention fee (H-1B, L-1)
  "I-129_H1B_ASYLUM": 600, // Asylum program fee
  "I-129_O1": 1055, // O-1 base fee
  "I-129_L1": 1385, // L-1 base fee
  "Biometrics": 0,  // ELIMINATED as of April 2024 for most forms
  "DS-160": 185,
  "I-901_SEVIS": 350,
};

// Check I-485 biometrics fee
const i485Node = visaData.nodes.i485 as { filings: Array<{ form: string; fee: number }> };
const biometricsFiling = i485Node.filings.find(f => f.form === "Biometrics");
if (biometricsFiling && biometricsFiling.fee > 0) {
  addIssue(
    "warning",
    "fees",
    "Biometrics fee may be outdated",
    `I-485 shows $${biometricsFiling.fee} biometrics fee. As of April 2024, USCIS eliminated the separate biometrics fee for most applications.`,
    "Verify current USCIS fee schedule. The biometrics fee was folded into the main application fee."
  );
}

// Check I-765 tip inconsistency
const i485Tips = (visaData.nodes.i485 as { tips?: string[] }).tips || [];
const noExtraFeeTip = i485Tips.find(t => t.includes("no extra fee"));
const i765Filing = i485Node.filings.find(f => f.form === "I-765");
if (noExtraFeeTip && i765Filing && i765Filing.fee > 0) {
  addIssue(
    "critical",
    "consistency",
    "Conflicting I-765 fee information",
    `Tip says "File I-765 (EAD) and I-131 (AP) with I-485 - no extra fee" but I-765 shows $${i765Filing.fee} fee.`,
    "Update the tip. As of April 2024, I-765 filed with I-485 costs $260 separately."
  );
}

// Check H-1B $100k fee
const h1bNode = visaData.nodes.h1b as { filings: Array<{ form: string; fee: number; name: string }> };
const proclamationFiling = h1bNode.filings.find(f => f.fee === 100000);
if (proclamationFiling) {
  addIssue(
    "critical",
    "fees",
    "H-1B $100k fee needs verification",
    "The $100,000 'Proclamation Fee' for H-1B petitions from outside the US was proposed but status uncertain.",
    "Verify if this fee is actually in effect. If not implemented, remove it or mark as 'proposed'."
  );
}

// ============== 2. PATH LOGIC ANALYSIS ==============
console.log("🔍 Analyzing path logic and eligibility...\n");

// TN visa description inconsistency
const tnNode = visaData.nodes.tn as { requirements: string[]; description: string };
if (tnNode.requirements.includes("Canadian citizenship") && !tnNode.requirements.some(r => r.includes("Mexican"))) {
  addIssue(
    "warning",
    "consistency",
    "TN visa requirements incomplete",
    "TN visa requirements list only 'Canadian citizenship' but TN is also available to Mexican citizens under USMCA.",
    "Update to 'Canadian or Mexican citizenship'"
  );
}

// Check if TN paths properly check citizenship
const tnPaths = STATUS_PATHS.filter(p => p.id.includes("tn"));
console.log(`Found ${tnPaths.length} TN-related paths`);

// Test TN eligibility for various countries
const tnEligibilityTests = [
  { countryOfBirth: "canada" as const, isCitizen: false, expected: true },
  { countryOfBirth: "mexico" as const, isCitizen: false, expected: true },
  { countryOfBirth: "india" as const, isCitizen: false, expected: false },
  { countryOfBirth: "india" as const, isCitizen: true, expected: true }, // Indian-born Canadian citizen
];

for (const test of tnEligibilityTests) {
  const filters: FilterState = {
    ...defaultFilters,
    countryOfBirth: test.countryOfBirth,
    isCanadianOrMexicanCitizen: test.isCitizen,
  };
  const result = isTNEligible(filters);
  if (result !== test.expected) {
    addIssue(
      "critical",
      "logic",
      "TN eligibility logic error",
      `For ${test.countryOfBirth}-born, citizen=${test.isCitizen}: expected ${test.expected}, got ${result}`,
      "Fix isTNEligible function"
    );
  }
}

// ============== 3. VISA BULLETIN CHARGEABILITY ANALYSIS ==============
console.log("🔍 Analyzing visa bulletin chargeability logic...\n");

// Chargeability is based on COUNTRY OF BIRTH, not citizenship
// But the code uses countryOfBirth which is correct
// However, there are edge cases:
// - Born in India but parents were diplomats = may charge to different country
// - Spouse cross-chargeability (can use spouse's country if advantageous)

addIssue(
  "info",
  "features",
  "Cross-chargeability not supported",
  "Visa bulletin chargeability can sometimes be claimed based on spouse's country of birth. This feature is not implemented.",
  "Consider adding optional 'spouse country of birth' field for cross-chargeability scenarios"
);

// ============== 4. PROCESSING TIME ACCURACY ==============
console.log("🔍 Analyzing processing time accuracy...\n");

// Check PERM timing description
const permNode = visaData.nodes.perm as { description: string };
if (permNode.description.includes("August 2024")) {
  addIssue(
    "warning",
    "data",
    "PERM description may be outdated",
    `PERM description mentions 'currently processing August 2024 cases' - this should be dynamically updated.`,
    "Remove hardcoded date from description, rely on dynamic data"
  );
}

// ============== 5. PRIORITY DATE PORTABILITY ==============
console.log("🔍 Analyzing priority date portability logic...\n");

// Priority date can be ported from EB-3 to EB-2 (downgrade), but NOT from EB-2 to EB-1
// The code doesn't validate this rule
addIssue(
  "warning",
  "logic",
  "Priority date portability not validated",
  "Users can input any existing priority date category, but the system doesn't validate that they can only port to SAME or LOWER preference category (EB-3 → EB-2 OK, EB-2 → EB-1 NOT OK).",
  "Add validation that existingPriorityDateCategory can only be used for same or lower preference"
);

// ============== 6. STUDENT PATH EDGE CASES ==============
console.log("🔍 Analyzing student path edge cases...\n");

// Student paths show TN as a valid start status
// But going from TN to F-1 requires a status change which has implications
const studentMasters = STATUS_PATHS.find(p => p.id === "student_masters");
if (studentMasters && studentMasters.validFromStatuses.includes("tn")) {
  addIssue(
    "info",
    "ux",
    "TN to Student path needs clarification",
    "Student paths show TN as valid start status, but switching from TN to F-1 requires leaving the US (TN holders typically can't change to F-1 in-US easily).",
    "Add note that TN → F-1 typically requires leaving US and re-entering on F-1 visa"
  );
}

// ============== 7. CONCURRENT FILING EDGE CASES ==============
console.log("🔍 Analyzing concurrent filing scenarios...\n");

// When user has existing PD that's current for filing, they should be able to skip I-140 wait
// for new I-140 + I-485 concurrent filing (priority date portability)
const testFilters: FilterState = {
  ...defaultFilters,
  countryOfBirth: "canada",
  education: "masters",
  experience: "gt5",
  hasApprovedI140: true,
  existingPriorityDate: { month: 6, year: 2020 }, // Old PD that should be current
  existingPriorityDateCategory: "eb2",
};

const paths = generatePaths(testFilters, undefined, undefined);
const niwPath = paths.find(p => p.id.includes("niw"));
if (niwPath) {
  const i485Stage = niwPath.stages.find(s => s.nodeId === "i485");
  if (i485Stage && !i485Stage.isConcurrent) {
    addIssue(
      "warning",
      "logic",
      "Concurrent filing with existing PD",
      "User with existing approved I-140 and current priority date should be able to file I-485 concurrently with new I-140.",
      "Verify concurrent filing logic for users with existing priority dates"
    );
  }
}

// ============== 8. COST CALCULATION ACCURACY ==============
console.log("🔍 Analyzing cost calculation accuracy...\n");

// Check if H-1B costs include the $100k fee inappropriately
const h1bPaths = generatePaths({ ...defaultFilters, currentStatus: "opt" });
const h1bPath = h1bPaths.find(p => p.name.includes("H-1B") && !p.name.includes("TN"));
if (h1bPath && h1bPath.estimatedCost > 50000) {
  addIssue(
    "critical",
    "cost",
    "H-1B cost may include unverified $100k fee",
    `H-1B path shows $${h1bPath.estimatedCost.toLocaleString()} estimated cost. If this includes the $100k proclamation fee, it may be inaccurate.`,
    "Verify which fees are actually applicable and clearly label uncertain fees"
  );
}

// ============== 9. L-1A to EB-1C RESTRICTION ==============
console.log("🔍 Analyzing L-1A/EB-1C path restrictions...\n");

// EB-1C should ONLY be available with L-1A path (already enforced in isCompatible)
// Verify this is working
const l1aPath = STATUS_PATHS.find(p => p.id === "l1a");
const eb1cMethod = GC_METHODS.find(m => m.id === "eb1c");
if (l1aPath && eb1cMethod) {
  const testFilters: FilterState = {
    ...defaultFilters,
    isExecutive: true,
    currentStatus: "canada",
  };
  const paths = generatePaths(testFilters);
  const eb1cPaths = paths.filter(p => p.gcCategory === "EB-1C");
  const nonL1aEb1c = eb1cPaths.filter(p => !p.id.startsWith("l1a_"));
  if (nonL1aEb1c.length > 0) {
    addIssue(
      "critical",
      "logic",
      "EB-1C available without L-1A",
      `Found ${nonL1aEb1c.length} EB-1C paths not using L-1A: ${nonL1aEb1c.map(p => p.id).join(", ")}`,
      "EB-1C requires L-1A status path"
    );
  }
}

// ============== 10. DUAL INTENT WARNINGS ==============
console.log("🔍 Checking for dual intent considerations...\n");

// TN visa is non-immigrant intent, but people start PERM on TN
// This is legal but risky - should have warnings
const tnDirectPath = STATUS_PATHS.find(p => p.id === "tn_direct");
if (tnDirectPath && tnDirectPath.permStartOffset === 0) {
  const hasDualIntentWarning = visaData.nodes.tn &&
    JSON.stringify(visaData.nodes.tn).toLowerCase().includes("intent");
  if (!hasDualIntentWarning) {
    addIssue(
      "info",
      "ux",
      "TN dual intent warning missing",
      "TN visa requires non-immigrant intent, but the app shows starting PERM immediately on TN. While legal, this creates dual intent complications.",
      "Add prominent warning about dual intent when showing TN → PERM paths"
    );
  }
}

// ============== 11. EB-1B PATH ACCESSIBILITY ==============
console.log("🔍 Checking EB-1B accessibility...\n");

// EB-1B requires isOutstandingResearcher, but is this exposed in the quiz?
const eb1bMethod = GC_METHODS.find(m => m.id === "eb1b");
if (eb1bMethod && eb1bMethod.requirements.isOutstandingResearcher) {
  addIssue(
    "info",
    "features",
    "EB-1B qualification not in quiz",
    "EB-1B requires 'outstanding researcher' qualification but this toggle may not be in the onboarding quiz.",
    "Verify quiz includes outstanding researcher qualification question"
  );
}

// ============== 12. INDIA/CHINA WAIT TIME ESTIMATES ==============
console.log("🔍 Analyzing India/China backlog estimates...\n");

// The wait time multipliers (12x for India, 6x for China) are rough estimates
addIssue(
  "warning",
  "accuracy",
  "India/China wait time estimates are rough",
  "Wait time calculation uses fixed multipliers (India: 12x months behind, China: 6x). Actual wait depends on visa bulletin movement which varies significantly year to year.",
  "Consider showing a range or adding disclaimer about estimate uncertainty"
);

// ============== 13. O-1 to EB-1A CRITERIA DIFFERENCES ==============
console.log("🔍 Checking O-1 to EB-1A path...\n");

// O-1 and EB-1A have similar but different criteria
const o1Node = visaData.nodes.o1 as { evidenceCategories?: string[] };
const eb1Node = visaData.nodes.eb1 as { requirements?: string[] };
addIssue(
  "info",
  "accuracy",
  "O-1 to EB-1A criteria note",
  "O-1 and EB-1A have similar but not identical criteria. O-1 requires 'extraordinary ability', EB-1A requires 'sustained national/international acclaim'. Some O-1 holders may not qualify for EB-1A.",
  "Add note that EB-1A approval is not guaranteed for O-1 holders"
);

// ============== SUMMARY ==============
console.log("\n" + "=".repeat(80));
console.log("DEEP ANALYSIS SUMMARY");
console.log("=".repeat(80) + "\n");

const criticalIssues = issues.filter(i => i.severity === "critical");
const warnings = issues.filter(i => i.severity === "warning");
const infoIssues = issues.filter(i => i.severity === "info");
const suggestions = issues.filter(i => i.severity === "suggestion");

console.log(`Total issues found: ${issues.length}`);
console.log(`  🔴 Critical: ${criticalIssues.length}`);
console.log(`  🟡 Warnings: ${warnings.length}`);
console.log(`  🔵 Info: ${infoIssues.length}`);
console.log(`  💡 Suggestions: ${suggestions.length}`);
console.log();

// Print critical issues
if (criticalIssues.length > 0) {
  console.log("🔴 CRITICAL ISSUES (Should fix before shipping)");
  console.log("-".repeat(60));
  for (const issue of criticalIssues) {
    console.log(`\n[${issue.category.toUpperCase()}] ${issue.title}`);
    console.log(`  ${issue.details}`);
    if (issue.recommendation) {
      console.log(`  → Recommendation: ${issue.recommendation}`);
    }
  }
  console.log();
}

// Print warnings
if (warnings.length > 0) {
  console.log("🟡 WARNINGS (Should review)");
  console.log("-".repeat(60));
  for (const issue of warnings) {
    console.log(`\n[${issue.category.toUpperCase()}] ${issue.title}`);
    console.log(`  ${issue.details}`);
    if (issue.recommendation) {
      console.log(`  → Recommendation: ${issue.recommendation}`);
    }
  }
  console.log();
}

// Print info
if (infoIssues.length > 0) {
  console.log("🔵 INFORMATIONAL");
  console.log("-".repeat(60));
  for (const issue of infoIssues) {
    console.log(`\n[${issue.category.toUpperCase()}] ${issue.title}`);
    console.log(`  ${issue.details}`);
    if (issue.recommendation) {
      console.log(`  → Recommendation: ${issue.recommendation}`);
    }
  }
  console.log();
}

// Exit with error if critical issues
if (criticalIssues.length > 0) {
  console.log("\n❌ Critical issues found that should be addressed.\n");
  process.exit(1);
} else {
  console.log("\n✅ No critical issues found. Review warnings and info items.\n");
}
