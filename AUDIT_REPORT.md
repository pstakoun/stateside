# Stateside Immigration Path Planner - Comprehensive Audit Report

**Audit Date:** January 16, 2026  
**Auditor:** Claude AI (Deep Code & Data Analysis)  
**Application Version:** Current (branch: cursor/application-problems-audit-11f6)

---

## Executive Summary

This audit reviews the Stateside immigration path planning application for accuracy, bugs, and inconsistencies against official US immigration rules and live data sources. The application helps users visualize their paths to US green cards based on current visa status, education, experience, and country of birth.

### Overall Assessment

| Category | Status | Issues Found |
|----------|--------|--------------|
| Critical Bugs | ⚠️ Issues Found | 4 |
| Data Accuracy | ⚠️ Issues Found | 12 |
| Logic Issues | ⚠️ Issues Found | 3 |
| UI/UX Issues | ℹ️ Minor | 2 |
| Code Quality | ✅ Good | 0 |

---

## 1. CRITICAL BUGS (Must Fix)

### 1.1 Priority Date Wait Calculation Bug - India/China
**Severity:** Critical  
**Location:** `lib/processing-times.ts` → `calculateWaitForExistingPD()` and `perm-velocity.ts`

**Problem:** The velocity-based wait calculation produces incorrect results for India and China backlogs. The comprehensive validation found:

| Test Case | Expected Wait | Actual Wait | Error |
|-----------|---------------|-------------|-------|
| India EB-2 PD Dec 2013 | 60 months | 7 months | -88% |
| India EB-2 PD Jan 2020 | 936 months (~78 years) | 104 months (~8.7 years) | -89% |
| China EB-2 PD Jan 2022 | 24 months | 4 months | -83% |

**Root Cause Analysis:**
The `calculateVelocityBasedWait()` function in `perm-velocity.ts` uses historical advancement rates but the calculation appears to be applying the velocity ratio incorrectly. The wait calculation should multiply months behind by the wait multiplier, but there may be an issue with how the months behind the cutoff are being calculated.

```typescript
// Line 584-587 in perm-velocity.ts
const monthsBehind =
  (userDate.getFullYear() - bulletinDate.getFullYear()) * 12 +
  (userDate.getMonth() - bulletinDate.getMonth());
```

The calculation only considers months behind the cutoff, but India EB-2 has a ~12-year backlog. A user with a Jan 2020 priority date is about 78 months ahead of the Jul 2013 cutoff, meaning they need to wait for the bulletin to advance 78 months. At India's advancement rate of ~12 months/year, that's approximately 78 * 12 = 936 months (78 years).

**Fix Required:** Review and correct the velocity-based wait time calculation to account for:
1. Proper wait multiplier application
2. Handling of extreme backlogs (India EB-2/EB-3)

---

### 1.2 Missing Priority Date Wait Stage for India EB-2 New Filers
**Severity:** Critical  
**Location:** `lib/path-composer.ts` → `composePath()`

**Problem:** When a user from India with an EB-2 priority date of Jan 2023 views their path, there is no blocking PD wait stage shown, even though:
- Current EB-2 India "Dates for Filing" cutoff is Dec 2013
- User's PD (Jan 2023) is ~10 years ahead of the cutoff
- User CANNOT file I-485 until their date becomes current

**Evidence from Validation:**
```
India EB-2 with PD Jan 2023:
  Path: Direct I-485 (EB-2)
  Total years: 13.5-1.5 yr
  ✗ Missing PD wait stage!
```

**Impact:** Users from backlogged countries will see misleadingly short timelines that don't reflect the actual decade+ wait.

---

### 1.3 Total Years Display Bug
**Severity:** High  
**Location:** `lib/path-composer.ts`

**Problem:** The validation output shows "Total years: 13.5-1.5 yr" which has min > max - an impossible range. This suggests a calculation error in the `composePath()` function when computing `totalMin` and `totalMax`.

**Evidence:**
```
Total years: 13.5-1.5 yr
```

This should be something like "1.5-13.5 yr" or the individual calculations are incorrect.

---

### 1.4 Approved I-140 Direct Filing Path Logic Issue
**Severity:** High  
**Location:** `lib/path-composer.ts` → `generatePaths()`

**Problem:** The "Direct I-485" path for users with approved I-140 may not properly account for:
1. Whether the I-140 was filed in the same or different EB category
2. Whether the user's priority date is actually current for filing
3. The distinction between "staying with same employer" vs "porting priority date to new employer"

The current logic conflates "has approved I-140" with "doesn't need PERM", but:
- If switching employers, user needs new PERM even with approved I-140
- The priority date can be ported, but a new PERM/I-140 is still required

---

## 2. DATA ACCURACY ISSUES

### 2.1 Filing Fee Discrepancies

| Form | App Value | Correct Value | Status |
|------|-----------|---------------|--------|
| **I-129 H-1B Total** | $3,380 | $3,380 (large) / $2,630 (small) | ⚠️ Missing small employer fee |
| **I-140 (self-filed)** | $715 | $715 | ✅ Correct |
| **I-140 (employer-filed)** | $715 | $1,315 (includes $600 asylum) | ⚠️ Missing asylum fee |
| **I-765** | $260 | $260 | ✅ Correct |
| **I-485** | $1,440 | $1,440 | ✅ Correct |
| **I-907** | $2,805 | $2,805 | ✅ Correct |
| **SEVIS I-901** | $350 | $350 | ✅ Correct |
| **DS-160** | $185 | $185 | ✅ Correct |

**Location:** `data/visa-paths.json`

**Issues:**
1. Line 148: H-1B filing shows $3,380 but doesn't distinguish large vs small employer
2. Line 200, 249: O-1 and L-1 I-140 fees don't include asylum fee for employer-filed petitions

---

### 2.2 TN Visa Professions List Incomplete
**Severity:** Medium  
**Location:** `data/visa-paths.json` lines 104-114

**Problem:** The `tnProfessions` array only lists 9 professions, but there are **63 TN-eligible professions** under USMCA.

**Current List (9):**
```json
"tnProfessions": [
  "Accountant", "Architect", "Computer Systems Analyst", "Engineer",
  "Management Consultant", "Scientific Technician", "Technical Publications Writer",
  "Graphic Designer", "Economist"
]
```

**Missing Key Professions:**
- Lawyer
- Dentist, Physician, Pharmacist, Veterinarian
- Mathematician/Statistician
- Urban Planner/Geographer
- Librarian
- Social Worker
- Hotel Manager
- Industrial Designer
- Interior Designer
- Land Surveyor
- Forester/Sylviculturist
- Medical/Allied Professionals
- Research Assistant (university)
- And 40+ more...

**Impact:** Users in TN-eligible professions not listed may think they don't qualify.

---

### 2.3 OPT Application Timeline Inaccuracy
**Severity:** Medium  
**Location:** `data/visa-paths.json` line 54

**Problem:** The OPT requirement states "Apply within 60 days of graduation" but this is incomplete.

**Current:**
```json
"Apply within 60 days of graduation"
```

**Correct:** 
- Earliest application: **90 days before program end date**
- Latest application: **60 days after program end date**
- Must file within **30 days of DSO recommendation** in SEVIS

---

### 2.4 H-1B 6-Year Limit Description Incomplete
**Severity:** Medium  
**Location:** `data/visa-paths.json` line 179

**Problem:** The H-1B tip mentions extensions but doesn't fully explain the rules.

**Current:**
```json
"6-year limit, but extendable if I-140 approved or PERM pending >365 days"
```

**Should clarify:**
- With approved I-140: Unlimited 1-year extensions if priority date not current
- With PERM pending >365 days: Extensions in 1-year increments
- Extensions continue until green card approved or case denied

---

### 2.5 L-1B Maximum Stay Incorrect
**Severity:** Medium  
**Location:** `data/visa-paths.json` line 317-318

**Problem:** The L-1B tip says "5-year maximum stay (vs 7 for L-1A)" - this is correct but the stages show a duration of "1-5 yr" which could confuse users.

The maximum stay is 5 years total, not a duration per filing.

---

### 2.6 EB-2 NIW Premium Processing Duration
**Severity:** Low  
**Location:** `data/visa-paths.json` line 636-637

**Current:**
```json
"processing": "45 business days (~9 weeks)"
```

**Status:** ✅ Correct - Premium processing for NIW is 45 business days.

---

### 2.7 Visa Bulletin Default Data - Minor Discrepancies
**Severity:** Low  
**Location:** `lib/dynamic-data.ts` lines 158-169

The default priority dates are close but not exact:

| Category/Country | App Default | Verified Jan 2026 | Difference |
|------------------|-------------|-------------------|------------|
| EB-1 ROW | Current | Current | ✅ Match |
| EB-1 China | Feb 2023 | Feb 1, 2023 | ✅ Match |
| EB-1 India | Feb 2023 | Feb 1, 2023 | ✅ Match |
| EB-2 ROW | Apr 2024 | Apr 1, 2024 | ✅ Match |
| EB-2 China | Sep 2021 | Sep 1, 2021 | ✅ Match |
| EB-2 India | Jul 2013 | Jul 15, 2013 | ⚠️ Day missing |
| EB-3 ROW | Apr 2023 | Apr 22, 2023 | ⚠️ Day missing |
| EB-3 China | May 2021 | May 1, 2021 | ✅ Match |
| EB-3 India | Nov 2013 | Nov 15, 2013 | ⚠️ Day missing |

**Impact:** The day precision may affect edge case calculations.

---

### 2.8 Processing Times Data Source
**Severity:** Medium  
**Location:** `lib/dynamic-data.ts` lines 279-317

**Problem:** The `fetchUSCISFromGitHub()` function claims to fetch from the jzebedee/uscis GitHub repo but actually just returns hardcoded fallback values. The actual SQLite database download and parsing is commented out.

```typescript
// For now, return conservative estimates based on USCIS published data
// In production, we would download and parse the SQLite database
return {
  i140: { min: 6, max: 9, premiumDays: 15 },
  // ... hardcoded values
};
```

**Impact:** Processing times are never actually live from USCIS data.

---

### 2.9 PWD Processing Time Default Discrepancy
**Severity:** Low  
**Location:** `lib/dynamic-data.ts` lines 142-145

**Current Default:** "July 2025" (6 months)  
**Verified Current:** "August 2025" (5 months for OEWS)

The fallback date is one month off from current data.

---

### 2.10 PERM Velocity Historical Data May Be Outdated
**Severity:** Medium  
**Location:** `lib/perm-velocity.ts` lines 97-113

The `PERM_HISTORICAL_DATA` shows:
```typescript
lastUpdated: "2025-01-01",
dataSource: "DOL PERM Disclosure Data FY2025 Q4",
```

This data should be verified quarterly against actual DOL disclosure files. The quarterly certification counts (32,500-42,000 per quarter) should be validated.

---

### 2.11 Per-Country Cap Calculation
**Severity:** Low  
**Location:** `lib/perm-velocity.ts` line 81

**Current:**
```typescript
export const COUNTRY_CAP_PERCENTAGE = 0.07;
```

**Status:** ✅ Correct - The per-country limit is 7%.

However, the calculation of effective visas per country is simplified and doesn't fully account for spillover mechanics from undersubscribed countries.

---

### 2.12 Average Dependents Assumption
**Severity:** Low  
**Location:** `lib/perm-velocity.ts` line 84

```typescript
export const AVG_DEPENDENTS = 2.5;
```

This assumes 2.5 people per case (principal + 1.5 dependents). This should be cited or validated against actual USCIS data.

---

## 3. LOGIC ISSUES

### 3.1 Concurrent Filing Logic with PD Wait
**Severity:** High  
**Location:** `lib/path-composer.ts` lines 900-1015

**Problem:** The concurrent filing logic is complex and may have edge cases where:
1. I-485 is marked as concurrent even when there's a PD wait
2. The PD wait stage insertion doesn't properly adjust subsequent stage positions
3. The total path duration calculation doesn't account for PD wait correctly

The code attempts to handle two scenarios:
- Filing wait (Dates for Filing)
- Approval wait (Final Action Dates)

But the logic for inserting wait stages and adjusting I-485 position is intricate and the validation found cases where it fails.

---

### 3.2 Student Path Education Upgrade Logic
**Severity:** Medium  
**Location:** `lib/path-composer.ts` lines 615-625

The student paths grant education upgrades:
```typescript
grantsEducation: "masters",  // for student_masters
grantsEducation: "phd",      // for student_phd
grantsEducation: "bachelors", // for student_bachelors
```

**Potential Issue:** The GC category computation uses this granted education for EB-2/EB-3 determination, but this may not work correctly if:
1. User is already on a student path (F-1/OPT)
2. User's current education should be used instead of granted education

---

### 3.3 TN Visa Dual Intent Warning Missing
**Severity:** Medium  
**Location:** `data/visa-paths.json` lines 122-125

**Current Tip:**
```json
"Can file for green card while on TN (but be careful about intent)"
```

**Problem:** This is too vague. TN holders face real risks:
- CBP may deny entry if they suspect immigrant intent
- Filing I-140 can be seen as evidence of immigrant intent
- Travel outside US while green card process is pending is risky

**Should Add:** A more detailed warning about:
1. Risk of being denied entry at the border
2. Safer approach: file I-140, avoid travel, then file I-485
3. Consider switching to H-1B (dual intent allowed) before filing green card

---

## 4. UI/UX ISSUES

### 4.1 Mobile Timeline Truncation
**Severity:** Low  
**Location:** `components/MobileTimelineView.tsx`

Long path names and stage names may be truncated on mobile devices. The compact mode threshold of 50px may not be enough for complex stage names.

---

### 4.2 PD Wait Stage Tooltip Missing Key Info
**Severity:** Low  
**Location:** `components/TimelineChart.tsx` lines 800-855

The priority date wait stage tooltip shows velocity info but could be improved by showing:
1. Current visa bulletin cutoff date
2. User's priority date
3. How many months/years behind the cutoff they are
4. When they might become current (estimated date)

---

## 5. CODE QUALITY OBSERVATIONS

### 5.1 Good Practices Found
- ✅ TypeScript throughout with proper types
- ✅ No TypeScript errors
- ✅ No ESLint warnings
- ✅ Centralized constants in `lib/constants.ts`
- ✅ Comprehensive validation script exists
- ✅ Good separation of concerns (data, logic, UI)

### 5.2 Areas for Improvement
- The `composePath()` function is 500+ lines and should be refactored
- Processing times fallback values are scattered across multiple files
- No unit tests (only integration-style validation script)

---

## 6. RECOMMENDATIONS

### Priority 1 (Critical - Fix Immediately)
1. **Fix priority date wait calculation** - The velocity-based calculation is producing wait times that are ~90% too short for India/China
2. **Add blocking PD wait stages** for users with future priority dates in backlogged countries
3. **Fix totalYears min/max swap** where min > max

### Priority 2 (Important - Fix Soon)
4. **Update fee data** to include employer-filed I-140 asylum fee distinction
5. **Expand TN professions list** to all 63 eligible professions
6. **Add dual intent warning** for TN visa holders filing for green card
7. **Fix USCIS processing times fetch** to actually use live data (or document that it's hardcoded)

### Priority 3 (Enhancement)
8. **Add small employer H-1B fee option** ($2,630 vs $3,380)
9. **Improve OPT application timeline** with full 90-day before to 60-day after window
10. **Add specific day precision** to visa bulletin dates for edge cases
11. **Refactor composePath()** into smaller, testable functions
12. **Add unit tests** for critical calculations

---

## 7. APPENDIX: TEST RESULTS

### Comprehensive Validation Output
```
Total combinations tested: 360
Combinations with paths: 300
Combinations without paths: 60

Total issues found: 4
  Errors: 4
  Warnings: 0
  Info: 0
```

### Issues Found by Validation
1. PD Wait calculation wrong for India EB-2 PD 12/2013 (Expected 60mo, got 7mo)
2. PD Wait calculation wrong for India EB-2 PD 1/2020 (Expected 936mo, got 104mo)
3. PD Wait calculation wrong for China EB-2 PD 1/2022 (Expected 24mo, got 4mo)
4. India EB-2 Jan 2023 PD should have blocking wait stage

---

**End of Audit Report**

*This audit was conducted using code analysis, official immigration data research, and automated validation testing. All findings should be verified by a qualified immigration attorney before making changes that affect legal advice given to users.*
