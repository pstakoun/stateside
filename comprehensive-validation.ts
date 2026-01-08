// Comprehensive validation of all path configurations
// This script tests all combinations and finds problems

import { generatePaths, computeGCCategory, GC_METHODS, STATUS_PATHS, ComposedPath } from './lib/path-composer';
import {
  calculateWaitForExistingPD,
  getPriorityDateForPath,
  calculatePriorityDateWait
} from './lib/processing-times';
import {
  FilterState,
  CountryOfBirth,
  Education,
  Experience,
  CurrentStatus,
  EBCategory,
  isTNEligible
} from './lib/filter-paths';

// Visa bulletin data
const finalActionDates = {
  eb1: { allOther: 'Current', china: 'Feb 2023', india: 'Feb 2023' },
  eb2: { allOther: 'Apr 2024', china: 'Sep 2021', india: 'Jul 2013' },
  eb3: { allOther: 'Apr 2023', china: 'May 2021', india: 'Nov 2013' },
};

const datesForFiling = {
  eb1: { allOther: 'Current', china: 'Aug 2023', india: 'Aug 2023' },
  eb2: { allOther: 'Oct 2024', china: 'Jan 2022', india: 'Dec 2013' },
  eb3: { allOther: 'Jul 2023', china: 'Jan 2022', india: 'Aug 2014' },
};

interface Issue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  details?: string;
}

const issues: Issue[] = [];

function addIssue(severity: Issue['severity'], category: string, message: string, details?: string) {
  issues.push({ severity, category, message, details });
}

// Base filter state
const baseFilters: FilterState = {
  education: 'bachelors',
  experience: '2to5',
  currentStatus: 'h1b',
  countryOfBirth: 'other',
  hasExtraordinaryAbility: false,
  isOutstandingResearcher: false,
  isExecutive: false,
  isStem: false,
  isMarriedToUSCitizen: false,
  hasInvestmentCapital: false,
  isCanadianOrMexicanCitizen: false,
  hasApprovedI140: false,
  existingPriorityDate: null,
  existingPriorityDateCategory: null,
};

console.log('='.repeat(80));
console.log('COMPREHENSIVE PATH VALIDATION');
console.log('='.repeat(80));

// ============================================================================
// TEST 1: All Country + Education + Experience Combinations
// ============================================================================
console.log('\n--- TEST 1: Country + Education + Experience Matrix ---\n');

const countries: CountryOfBirth[] = ['canada', 'mexico', 'india', 'china', 'other'];
const educations: Education[] = ['highschool', 'bachelors', 'masters', 'phd'];
const experiences: Experience[] = ['lt2', '2to5', 'gt5'];
const statuses: CurrentStatus[] = ['canada', 'f1', 'opt', 'tn', 'h1b', 'other'];

let totalCombinations = 0;
let combinationsWithPaths = 0;
let combinationsWithoutPaths = 0;

console.log('Testing path generation for all basic combinations...');

for (const country of countries) {
  for (const edu of educations) {
    for (const exp of experiences) {
      for (const status of statuses) {
        totalCombinations++;
        const filters: FilterState = {
          ...baseFilters,
          countryOfBirth: country,
          education: edu,
          experience: exp,
          currentStatus: status,
        };

        const paths = generatePaths(filters, finalActionDates, datesForFiling);

        if (paths.length === 0) {
          combinationsWithoutPaths++;
          // Check if this is expected
          if (edu === 'highschool' && status !== 'canada') {
            // Expected: high school + non-Canada status usually has no paths
          } else if (status === 'tn' && !isTNEligible(filters)) {
            // Expected: TN status but not TN eligible
          } else {
            addIssue('warning', 'No Paths',
              `No paths for ${country}/${edu}/${exp}/${status}`,
              'This combination might need review'
            );
          }
        } else {
          combinationsWithPaths++;
        }
      }
    }
  }
}

console.log(`Total combinations tested: ${totalCombinations}`);
console.log(`Combinations with paths: ${combinationsWithPaths}`);
console.log(`Combinations without paths: ${combinationsWithoutPaths}`);

// ============================================================================
// TEST 2: TN Eligibility Logic
// ============================================================================
console.log('\n--- TEST 2: TN Visa Eligibility ---\n');

const tnTestCases = [
  { country: 'canada' as CountryOfBirth, citizen: false, expected: true, desc: 'Born in Canada' },
  { country: 'mexico' as CountryOfBirth, citizen: false, expected: true, desc: 'Born in Mexico' },
  { country: 'india' as CountryOfBirth, citizen: false, expected: false, desc: 'Born in India, not CA/MX citizen' },
  { country: 'india' as CountryOfBirth, citizen: true, expected: true, desc: 'Born in India, CA/MX citizen' },
  { country: 'china' as CountryOfBirth, citizen: false, expected: false, desc: 'Born in China, not CA/MX citizen' },
  { country: 'china' as CountryOfBirth, citizen: true, expected: true, desc: 'Born in China, CA/MX citizen' },
  { country: 'other' as CountryOfBirth, citizen: false, expected: false, desc: 'Born elsewhere, not CA/MX citizen' },
  { country: 'other' as CountryOfBirth, citizen: true, expected: true, desc: 'Born elsewhere, CA/MX citizen' },
];

for (const tc of tnTestCases) {
  const filters: FilterState = {
    ...baseFilters,
    countryOfBirth: tc.country,
    isCanadianOrMexicanCitizen: tc.citizen,
  };
  const eligible = isTNEligible(filters);
  const status = eligible === tc.expected ? '✓' : '✗';
  console.log(`  ${status} ${tc.desc}: ${eligible ? 'Eligible' : 'Not eligible'}`);

  if (eligible !== tc.expected) {
    addIssue('error', 'TN Eligibility',
      `TN eligibility wrong for ${tc.desc}`,
      `Expected ${tc.expected}, got ${eligible}`
    );
  }
}

// Verify TN paths only appear for eligible users
console.log('\n  Checking TN paths appear only for eligible users...');
const tnPathIds = ['tn_direct', 'opt_to_tn', 'tn_to_h1b'];

for (const country of countries) {
  for (const citizen of [false, true]) {
    const filters: FilterState = {
      ...baseFilters,
      education: 'bachelors',
      currentStatus: 'opt',
      countryOfBirth: country,
      isCanadianOrMexicanCitizen: citizen,
    };

    const paths = generatePaths(filters, finalActionDates, datesForFiling);
    const hasTNPaths = paths.some(p => tnPathIds.some(id => p.id.includes(id)));
    const shouldHaveTN = isTNEligible(filters);

    if (hasTNPaths !== shouldHaveTN) {
      addIssue('error', 'TN Paths',
        `TN path mismatch for ${country}, citizen=${citizen}`,
        `Has TN paths: ${hasTNPaths}, Should have: ${shouldHaveTN}`
      );
    }
  }
}
console.log('  Done.');

// ============================================================================
// TEST 3: GC Category Computation
// ============================================================================
console.log('\n--- TEST 3: GC Category Computation ---\n');

const categoryTestCases = [
  { edu: 'highschool' as Education, exp: 'lt2' as Experience, expected: 'EB-3' },
  { edu: 'highschool' as Education, exp: 'gt5' as Experience, expected: 'EB-3' },
  { edu: 'bachelors' as Education, exp: 'lt2' as Experience, expected: 'EB-3' },
  { edu: 'bachelors' as Education, exp: '2to5' as Experience, expected: 'EB-3' },
  { edu: 'bachelors' as Education, exp: 'gt5' as Experience, expected: 'EB-2' },
  { edu: 'masters' as Education, exp: 'lt2' as Experience, expected: 'EB-2' },
  { edu: 'masters' as Education, exp: 'gt5' as Experience, expected: 'EB-2' },
  { edu: 'phd' as Education, exp: 'lt2' as Experience, expected: 'EB-2' },
];

const permMethod = GC_METHODS.find(m => m.id === 'perm_route')!;
const noneStatus = STATUS_PATHS.find(p => p.id === 'none')!;

for (const tc of categoryTestCases) {
  const filters: FilterState = { ...baseFilters, education: tc.edu, experience: tc.exp };
  const category = computeGCCategory(filters, permMethod, noneStatus);
  const status = category === tc.expected ? '✓' : '✗';
  console.log(`  ${status} ${tc.edu} + ${tc.exp} → ${category} (expected ${tc.expected})`);

  if (category !== tc.expected) {
    addIssue('error', 'GC Category',
      `Wrong category for ${tc.edu} + ${tc.exp}`,
      `Expected ${tc.expected}, got ${category}`
    );
  }
}

// ============================================================================
// TEST 4: Priority Date Calculations
// ============================================================================
console.log('\n--- TEST 4: Priority Date Calculations ---\n');

// Test various PD scenarios
const pdTestCases = [
  // ROW scenarios
  { pd: { month: 1, year: 2024 }, cat: 'EB-2', country: 'canada' as CountryOfBirth, filing: 'Oct 2024', final: 'Apr 2024', expectFile: true, expectWait: 0 },
  { pd: { month: 6, year: 2023 }, cat: 'EB-3', country: 'canada' as CountryOfBirth, filing: 'Jul 2023', final: 'Apr 2023', expectFile: true, expectWait: 2 },
  { pd: { month: 8, year: 2023 }, cat: 'EB-3', country: 'canada' as CountryOfBirth, filing: 'Jul 2023', final: 'Apr 2023', expectFile: false, expectWait: 4 },

  // India scenarios
  { pd: { month: 7, year: 2013 }, cat: 'EB-2', country: 'india' as CountryOfBirth, filing: 'Dec 2013', final: 'Jul 2013', expectFile: true, expectWait: 0 },
  { pd: { month: 12, year: 2013 }, cat: 'EB-2', country: 'india' as CountryOfBirth, filing: 'Dec 2013', final: 'Jul 2013', expectFile: true, expectWait: 60 },
  { pd: { month: 1, year: 2020 }, cat: 'EB-2', country: 'india' as CountryOfBirth, filing: 'Dec 2013', final: 'Jul 2013', expectFile: false, expectWait: 936 },

  // China scenarios
  { pd: { month: 9, year: 2021 }, cat: 'EB-2', country: 'china' as CountryOfBirth, filing: 'Jan 2022', final: 'Sep 2021', expectFile: true, expectWait: 0 },
  { pd: { month: 1, year: 2022 }, cat: 'EB-2', country: 'china' as CountryOfBirth, filing: 'Jan 2022', final: 'Sep 2021', expectFile: true, expectWait: 24 },
];

console.log('Testing priority date calculations...');
for (const tc of pdTestCases) {
  const filingWait = calculateWaitForExistingPD(tc.pd, tc.filing, tc.country);
  const approvalWait = calculateWaitForExistingPD(tc.pd, tc.final, tc.country);
  const canFile = filingWait === 0;

  const fileStatus = canFile === tc.expectFile ? '✓' : '✗';
  const waitStatus = approvalWait === tc.expectWait ? '✓' : '✗';

  console.log(`  ${tc.country} ${tc.cat} PD ${tc.pd.month}/${tc.pd.year}: File=${canFile}${fileStatus} Wait=${approvalWait}mo${waitStatus}`);

  if (canFile !== tc.expectFile) {
    addIssue('error', 'PD Filing',
      `Filing eligibility wrong for ${tc.country} ${tc.cat} PD ${tc.pd.month}/${tc.pd.year}`,
      `Expected canFile=${tc.expectFile}, got ${canFile}`
    );
  }
  if (approvalWait !== tc.expectWait) {
    addIssue('error', 'PD Wait',
      `Wait calculation wrong for ${tc.country} ${tc.cat} PD ${tc.pd.month}/${tc.pd.year}`,
      `Expected ${tc.expectWait}mo, got ${approvalWait}mo`
    );
  }
}

// ============================================================================
// TEST 5: Path Stage Validation
// ============================================================================
console.log('\n--- TEST 5: Path Stage Validation ---\n');

// Check that all paths have valid stages
const allPaths: ComposedPath[] = [];
for (const country of countries) {
  for (const edu of educations) {
    for (const status of statuses) {
      const filters: FilterState = {
        ...baseFilters,
        countryOfBirth: country,
        education: edu,
        currentStatus: status,
      };
      allPaths.push(...generatePaths(filters, finalActionDates, datesForFiling));
    }
  }
}

// Remove duplicates
const uniquePaths = new Map<string, ComposedPath>();
for (const path of allPaths) {
  uniquePaths.set(path.id, path);
}

console.log(`Validating ${uniquePaths.size} unique paths...`);

let pathIssues = 0;
for (const [pathId, path] of Array.from(uniquePaths.entries())) {
  // Check stages are in order
  let lastEndYear = 0;
  let hasI485 = false;
  let hasGC = false;

  for (let i = 0; i < path.stages.length; i++) {
    const stage = path.stages[i];

    // Check for required stages in GC paths
    if (stage.nodeId === 'i485') hasI485 = true;
    if (stage.nodeId === 'gc') hasGC = true;

    // Check for negative durations
    if (stage.durationYears.min < 0 || stage.durationYears.max < 0) {
      addIssue('error', 'Stage Duration', `Negative duration in ${pathId}`, `Stage ${stage.nodeId}`);
      pathIssues++;
    }

    // Check for NaN values
    if (isNaN(stage.startYear) || isNaN(stage.durationYears.min) || isNaN(stage.durationYears.max)) {
      addIssue('error', 'Stage NaN', `NaN value in ${pathId}`, `Stage ${stage.nodeId}`);
      pathIssues++;
    }

    // Check concurrent stages don't come first
    if (i === 0 && stage.isConcurrent) {
      addIssue('error', 'Concurrent First', `First stage is concurrent in ${pathId}`, `Stage ${stage.nodeId}`);
      pathIssues++;
    }
  }

  // Check GC paths have required stages
  if (path.stages.some(s => s.track === 'gc')) {
    if (!hasGC) {
      addIssue('warning', 'Missing GC', `Path ${pathId} has GC track but no GC stage`);
      pathIssues++;
    }
  }

  // Check total years are reasonable
  if (path.totalYears.max > 50) {
    addIssue('warning', 'Long Path', `Path ${pathId} has ${path.totalYears.max.toFixed(1)} year max`, 'May be unrealistic');
    pathIssues++;
  }

  if (path.totalYears.min > path.totalYears.max) {
    addIssue('error', 'Duration Order', `Path ${pathId} has min > max`, `${path.totalYears.min} > ${path.totalYears.max}`);
    pathIssues++;
  }
}

console.log(`Found ${pathIssues} stage issues.`);

// ============================================================================
// TEST 6: Self-Petition Path Requirements
// ============================================================================
console.log('\n--- TEST 6: Self-Petition Path Requirements ---\n');

// NIW requires master's OR bachelor's + 5yr
// BUT: Student paths can grant a degree, so bachelors users CAN do NIW via student_masters
// We test for DIRECT NIW (none_niw path) which requires current qualifications
const niwTestCases = [
  { edu: 'bachelors' as Education, exp: 'lt2' as Experience, expectDirectNIW: false, expectStudentNIW: true },
  { edu: 'bachelors' as Education, exp: '2to5' as Experience, expectDirectNIW: false, expectStudentNIW: true },
  { edu: 'bachelors' as Education, exp: 'gt5' as Experience, expectDirectNIW: true, expectStudentNIW: true },
  { edu: 'masters' as Education, exp: 'lt2' as Experience, expectDirectNIW: true, expectStudentNIW: true },
  { edu: 'phd' as Education, exp: 'lt2' as Experience, expectDirectNIW: true, expectStudentNIW: true },
];

console.log('Testing NIW eligibility...');
for (const tc of niwTestCases) {
  const filters: FilterState = {
    ...baseFilters,
    education: tc.edu,
    experience: tc.exp,
    currentStatus: 'h1b',
  };

  const paths = generatePaths(filters, finalActionDates, datesForFiling);
  const hasDirectNIW = paths.some(p => p.id === 'none_niw' || p.id === 'h1b_direct_niw');
  const hasStudentNIW = paths.some(p => p.id.includes('student') && p.id.includes('niw'));

  const directStatus = hasDirectNIW === tc.expectDirectNIW ? '✓' : '✗';
  const studentStatus = hasStudentNIW === tc.expectStudentNIW ? '✓' : '✗';

  console.log(`  ${directStatus} ${tc.edu} + ${tc.exp}: Direct NIW=${hasDirectNIW} (expected ${tc.expectDirectNIW})`);

  if (hasDirectNIW !== tc.expectDirectNIW) {
    addIssue('error', 'NIW Eligibility',
      `Direct NIW eligibility wrong for ${tc.edu} + ${tc.exp}`,
      `Expected ${tc.expectDirectNIW}, got ${hasDirectNIW}`
    );
  }
}

// EB-1A requires extraordinary ability
console.log('\nTesting EB-1A eligibility...');
const eb1aWithout = generatePaths({ ...baseFilters, hasExtraordinaryAbility: false }, finalActionDates, datesForFiling);
const eb1aWith = generatePaths({ ...baseFilters, hasExtraordinaryAbility: true }, finalActionDates, datesForFiling);

const hasEB1AWithout = eb1aWithout.some(p => p.id.includes('eb1a'));
const hasEB1AWith = eb1aWith.some(p => p.id.includes('eb1a'));

console.log(`  ${!hasEB1AWithout ? '✓' : '✗'} Without extraordinary ability: ${hasEB1AWithout ? 'Has EB-1A (wrong!)' : 'No EB-1A'}`);
console.log(`  ${hasEB1AWith ? '✓' : '✗'} With extraordinary ability: ${hasEB1AWith ? 'Has EB-1A' : 'No EB-1A (wrong!)'}`);

if (hasEB1AWithout) {
  addIssue('error', 'EB-1A Eligibility', 'EB-1A showing without extraordinary ability');
}
if (!hasEB1AWith) {
  addIssue('error', 'EB-1A Eligibility', 'EB-1A not showing with extraordinary ability');
}

// Marriage requires being married to US citizen
console.log('\nTesting Marriage-based eligibility...');
const marriageWithout = generatePaths({ ...baseFilters, isMarriedToUSCitizen: false }, finalActionDates, datesForFiling);
const marriageWith = generatePaths({ ...baseFilters, isMarriedToUSCitizen: true }, finalActionDates, datesForFiling);

const hasMarriageWithout = marriageWithout.some(p => p.gcCategory === 'Marriage-based');
const hasMarriageWith = marriageWith.some(p => p.gcCategory === 'Marriage-based');

console.log(`  ${!hasMarriageWithout ? '✓' : '✗'} Not married to USC: ${hasMarriageWithout ? 'Has Marriage path (wrong!)' : 'No Marriage path'}`);
console.log(`  ${hasMarriageWith ? '✓' : '✗'} Married to USC: ${hasMarriageWith ? 'Has Marriage path' : 'No Marriage path (wrong!)'}`);

if (hasMarriageWithout) {
  addIssue('error', 'Marriage Eligibility', 'Marriage path showing without being married to USC');
}
if (!hasMarriageWith) {
  addIssue('error', 'Marriage Eligibility', 'Marriage path not showing when married to USC');
}

// ============================================================================
// TEST 7: Concurrent Filing Consistency
// ============================================================================
console.log('\n--- TEST 7: Concurrent Filing Consistency ---\n');

// Test that concurrent filing follows the rules
const concurrentTestFilters: FilterState = {
  ...baseFilters,
  education: 'masters',
  hasApprovedI140: true,
  existingPriorityDate: { month: 6, year: 2023 },
  existingPriorityDateCategory: 'eb2',
};

for (const country of countries) {
  const filters = { ...concurrentTestFilters, countryOfBirth: country };
  const paths = generatePaths(filters, finalActionDates, datesForFiling);

  for (const path of paths) {
    const i485 = path.stages.find(s => s.nodeId === 'i485');
    const pdWait = path.stages.find(s => s.isPriorityWait);

    if (i485 && pdWait) {
      // If there's a PD wait stage, I-485 should NOT be concurrent
      if (i485.isConcurrent) {
        addIssue('error', 'Concurrent Conflict',
          `${path.name} (${country}) has both PD wait and concurrent I-485`,
          'These are mutually exclusive'
        );
      }
    }
  }
}
console.log('Concurrent filing consistency check complete.');

// ============================================================================
// TEST 8: Timeline Reasonableness
// ============================================================================
console.log('\n--- TEST 8: Timeline Reasonableness ---\n');

// Check for unreasonably short or long timelines
const timelineIssues: string[] = [];

for (const [pathId, path] of Array.from(uniquePaths.entries())) {
  // Marriage should be < 3 years
  if (path.gcCategory === 'Marriage-based' && path.totalYears.min > 3) {
    timelineIssues.push(`${pathId}: Marriage path min ${path.totalYears.min.toFixed(1)}yr seems long`);
  }

  // EB-1A/NIW direct should be < 5 years (without backlog)
  if (path.id.includes('none_') && (path.gcCategory === 'EB-1A' || path.gcCategory === 'EB-2 NIW')) {
    if (path.totalYears.min > 5 && !path.stages.some(s => s.isPriorityWait)) {
      timelineIssues.push(`${pathId}: Direct self-petition min ${path.totalYears.min.toFixed(1)}yr seems long`);
    }
  }

  // Student paths should be realistic
  if (path.name.includes('Student')) {
    if (path.totalYears.min < 2) {
      timelineIssues.push(`${pathId}: Student path min ${path.totalYears.min.toFixed(1)}yr seems too short`);
    }
  }
}

if (timelineIssues.length > 0) {
  console.log(`Found ${timelineIssues.length} timeline concerns:`);
  for (const issue of timelineIssues.slice(0, 10)) {
    console.log(`  - ${issue}`);
    addIssue('warning', 'Timeline', issue);
  }
  if (timelineIssues.length > 10) {
    console.log(`  ... and ${timelineIssues.length - 10} more`);
  }
} else {
  console.log('All timelines look reasonable.');
}

// ============================================================================
// TEST 9: India/China Backlog Handling
// ============================================================================
console.log('\n--- TEST 9: India/China Backlog Handling ---\n');

// India EB-2 should show massive backlog for new PDs
const indiaNewPDFilters: FilterState = {
  ...baseFilters,
  education: 'masters',
  countryOfBirth: 'india',
  hasApprovedI140: true,
  existingPriorityDate: { month: 1, year: 2023 },
  existingPriorityDateCategory: 'eb2',
};

const indiaPaths = generatePaths(indiaNewPDFilters, finalActionDates, datesForFiling);
const indiaEB2Path = indiaPaths.find(p => p.gcCategory === 'EB-2' && !p.name.includes('Student'));

if (indiaEB2Path) {
  const pdWait = indiaEB2Path.stages.find(s => s.isPriorityWait);
  const i485 = indiaEB2Path.stages.find(s => s.nodeId === 'i485');

  console.log(`India EB-2 with PD Jan 2023:`);
  console.log(`  Path: ${indiaEB2Path.name}`);
  console.log(`  Total years: ${indiaEB2Path.totalYears.display}`);

  // For India EB-2 with Jan 2023 PD:
  // - Filing cutoff: Dec 2013 -> Jan 2023 > Dec 2013 -> CANNOT file
  // - Should have blocking PD wait stage
  if (!pdWait) {
    addIssue('error', 'India Backlog',
      'India EB-2 Jan 2023 PD should have blocking wait stage',
      'Cannot file until Dates for Filing catches up'
    );
    console.log(`  ✗ Missing PD wait stage!`);
  } else {
    console.log(`  ✓ Has PD wait stage: ${pdWait.durationYears.display}`);
  }

  if (i485?.isConcurrent) {
    addIssue('error', 'India Concurrent',
      'India EB-2 Jan 2023 PD should NOT be concurrent',
      'Not eligible for filing yet'
    );
    console.log(`  ✗ I-485 shown as concurrent (wrong!)`);
  } else {
    console.log(`  ✓ I-485 not concurrent (correct)`);
  }
}

// ============================================================================
// TEST 10: Edge Cases
// ============================================================================
console.log('\n--- TEST 10: Edge Cases ---\n');

// Test PD exactly at cutoff
console.log('Testing PD exactly at cutoff dates...');
const exactCutoffTests = [
  { pd: { month: 4, year: 2024 }, cat: 'EB-2', country: 'canada' as CountryOfBirth, desc: 'ROW EB-2 Final Action' },
  { pd: { month: 10, year: 2024 }, cat: 'EB-2', country: 'canada' as CountryOfBirth, desc: 'ROW EB-2 Filing' },
  { pd: { month: 7, year: 2013 }, cat: 'EB-2', country: 'india' as CountryOfBirth, desc: 'India EB-2 Final Action' },
];

for (const tc of exactCutoffTests) {
  const filingCutoff = getPriorityDateForPath(datesForFiling, tc.cat, tc.country);
  const finalCutoff = getPriorityDateForPath(finalActionDates, tc.cat, tc.country);

  const filingWait = calculateWaitForExistingPD(tc.pd, filingCutoff, tc.country);
  const approvalWait = calculateWaitForExistingPD(tc.pd, finalCutoff, tc.country);

  console.log(`  ${tc.desc}: PD ${tc.pd.month}/${tc.pd.year}`);
  console.log(`    Filing (${filingCutoff}): ${filingWait === 0 ? 'Current' : `${filingWait}mo wait`}`);
  console.log(`    Approval (${finalCutoff}): ${approvalWait === 0 ? 'Current' : `${approvalWait}mo wait`}`);
}

// Test "Current" handling
console.log('\nTesting "Current" status handling...');
const currentWait = calculateWaitForExistingPD({ month: 1, year: 2025 }, 'Current', 'canada');
console.log(`  PD Jan 2025 vs "Current": ${currentWait === 0 ? '✓ No wait' : `✗ ${currentWait}mo wait (should be 0)`}`);
if (currentWait !== 0) {
  addIssue('error', 'Current Handling', '"Current" cutoff should result in 0 wait');
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('VALIDATION SUMMARY');
console.log('='.repeat(80));

const errors = issues.filter(i => i.severity === 'error');
const warnings = issues.filter(i => i.severity === 'warning');
const infos = issues.filter(i => i.severity === 'info');

console.log(`\nTotal issues found: ${issues.length}`);
console.log(`  Errors: ${errors.length}`);
console.log(`  Warnings: ${warnings.length}`);
console.log(`  Info: ${infos.length}`);

if (errors.length > 0) {
  console.log('\n--- ERRORS (must fix) ---');
  for (const e of errors) {
    console.log(`  [${e.category}] ${e.message}`);
    if (e.details) console.log(`    → ${e.details}`);
  }
}

if (warnings.length > 0) {
  console.log('\n--- WARNINGS (should review) ---');
  for (const w of warnings.slice(0, 20)) {
    console.log(`  [${w.category}] ${w.message}`);
  }
  if (warnings.length > 20) {
    console.log(`  ... and ${warnings.length - 20} more warnings`);
  }
}

if (errors.length === 0) {
  console.log('\n✓ No critical errors found!');
} else {
  console.log(`\n✗ Found ${errors.length} critical error(s) that need fixing.`);
}

console.log('\n');
