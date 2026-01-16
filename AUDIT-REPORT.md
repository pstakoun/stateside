# Stateside Immigration Application - Comprehensive Audit Report

**Date:** January 16, 2026  
**Auditor:** Claude AI (Deep Research Mode)  
**Branch:** cursor/application-data-rules-audit-a374

---

## Executive Summary

This report documents a comprehensive review of the Stateside immigration path visualization application. The audit examined:
- Fee data accuracy against current USCIS/DOS fee schedules
- Processing time accuracy against official DOL/USCIS sources
- Visa bulletin / priority date data
- Immigration rule accuracy
- Code quality and consistency
- Business logic correctness

**Overall Assessment:** The application is well-structured with solid business logic. Tests pass (23/23 immigration rules, 2658 paths validated). However, several data accuracy issues and potential inconsistencies were identified that should be addressed.

---

## Critical Issues (Severity: HIGH)

### 1. O-1 Evidence Criteria Misstatement

**Location:** `data/visa-paths.json` (lines 192, 230) and `components/PathDetail.tsx` (lines 174, 361)

**Issue:** The application states O-1 requires "3 of 8" evidence criteria. This is **incorrect**.

**Actual Rule:**
- **O-1A (Sciences, Business, Education, Athletics):** Must satisfy 3 of 8 criteria OR show comparable evidence
- **O-1B (Arts):** Must show sustained national/international acclaim and distinction (different standard)

**The O-1A criteria are 8 categories, but the regulation actually lists them as 10 total items** (some are combined). The more accurate statement is "3 of 8 evidentiary criteria" for O-1A.

**Recommendation:** Update to clarify the distinction between O-1A and O-1B standards.

---

### 2. Processing Time Dates Are in the Future

**Location:** `lib/processing-times.ts` (lines 107-141) and `lib/dynamic-data.ts` (lines 113-144)

**Issue:** Default processing dates reference "July 2025" and "2025-12-01" as "currently processing" dates, but:
- If the current date is **January 2026**, these dates would mean DOL is processing cases from the future
- The dates should represent what DOL is **currently processing** (past dates)

**Code snippets with issues:**
```typescript
// lib/processing-times.ts line 128-130
pwd: {
  currentlyProcessing: "July 2025",  // Should be a date DOL is CURRENTLY processing
  estimatedMonths: 6,
  asOf: "2025-12-01",  // Should be today's-ish date
},
```

**Recommendation:** 
- Update "currentlyProcessing" to reflect actual DOL FLAG data
- As of typical processing times: PWD ~6 months, PERM ~16-17 months backlog
- These should be dates in the PAST (e.g., "June 2025" if today is Jan 2026)

---

### 3. H-1B $100,000 Proclamation Fee Uncertainty

**Location:** `data/visa-paths.json` (lines 162-168)

**Issue:** The application includes a $100,000 "Proclamation Fee" for H-1B petitions filed from outside the US. This fee was proposed in Executive Order but its implementation status is uncertain.

**Current Code:**
```json
{
  "form": "Proclamation Fee",
  "name": "$100k fee (from outside US only - most are EXEMPT)",
  "fee": 0,  // Set to 0 but references $100k
  "note": "Only applies if filing from outside US without existing H-1B..."
}
```

**Issue:** The note references a $100k fee but the fee field is $0. This creates confusion.

**Recommendation:**
- Verify whether this fee is currently in effect
- If not implemented, remove or clearly mark as "Proposed" 
- If implemented, update fee field to actual amount and clarify who pays

---

## Data Accuracy Issues (Severity: MEDIUM)

### 4. TN Visa Requirements Missing Mexican Citizens

**Location:** `data/visa-paths.json` line 84

**Issue:** TN requirements list only "Canadian or Mexican citizenship" correctly, but earlier text says "63 specific occupations" when the actual count varies by profession list interpretation.

**Actual:** The USMCA Appendix 2 lists professions in categories; the commonly cited number is 63 but some professions have sub-categories.

**Recommendation:** Update to "specific USMCA-listed occupations" or verify the exact count.

---

### 5. I-765 Fee Inconsistency

**Location:** `data/visa-paths.json` (I-485 node)

**Issue:** The I-485 tips previously stated "File I-765 (EAD) and I-131 (AP) with I-485 - no extra fee" but this is outdated.

**Actual:** As of April 1, 2024 USCIS fee rule:
- I-765 filed with I-485: **$260** (separate fee)
- I-131 filed with I-485: **$0** (still included)
- Biometrics: **$0** (eliminated as separate fee)

The code correctly shows $260 for I-765 and $0 for biometrics, but verify any conflicting text.

---

### 6. OPT Validity Duration in Constants

**Location:** `lib/constants.ts` line 15

**Issue:**
```typescript
STATUS_VISA_VALIDITY_MONTHS: {
  opt: 36,  // OPT valid for 1-3 years (STEM extension)
}
```

**Problem:** Regular OPT is only 12 months. Only STEM OPT is 36 months total. The constant shows 36 which could mislead non-STEM users.

**Recommendation:** The code handles STEM vs non-STEM in `path-composer.ts` correctly, but the constant comment should clarify this is the STEM maximum.

---

### 7. Priority Date Portability Not Validated

**Location:** `lib/filter-paths.ts` and `components/OnboardingQuiz.tsx`

**Issue:** Users can input any existing priority date category without validation of portability rules.

**Immigration Rule:** Priority dates can only be ported to the SAME or LOWER preference category:
- EB-3 → EB-2: ✅ Allowed (common)
- EB-2 → EB-3: ✅ Allowed (downgrade)
- EB-2 → EB-1: ❌ **NOT allowed**
- EB-1 → EB-2: ✅ Allowed (downgrade)

**Recommendation:** Add validation that warns users if they try to port a priority date to a higher preference category.

---

## Immigration Rule Concerns (Severity: MEDIUM)

### 8. TN to F-1 Status Change Complexity

**Location:** `lib/path-composer.ts` (STATUS_PATHS)

**Issue:** Student paths (student_masters, student_phd) show TN as a valid starting status, but:
- TN is a non-immigrant visa requiring non-immigrant intent
- Changing from TN to F-1 while in the US is complex
- Most people need to leave the US and re-enter on F-1 visa

**Recommendation:** Add a note/warning that TN → F-1 typically requires leaving and re-entering the US.

---

### 9. Dual Intent Warning for TN → PERM

**Location:** `lib/path-composer.ts` (tn_direct path has permStartOffset: 0)

**Issue:** TN visa holders can legally start PERM, but this creates "dual intent" complications:
- TN requires non-immigrant intent
- Starting PERM signals immigrant intent
- While legal, this can complicate TN renewals and re-entry

**Recommendation:** The visa-paths.json does mention this in tips, but consider making it more prominent.

---

### 10. EB-1B Outstanding Researcher Requirement

**Location:** Quiz and GC_METHODS

**Issue:** EB-1B requires the applicant to demonstrate:
1. International recognition as outstanding in their academic field
2. At least 3 years of research experience
3. Permanent research position or tenure-track at university or comparable

The quiz asks about "Outstanding researcher" but doesn't verify the 3-year requirement or employer type.

**Recommendation:** Add clarification that EB-1B requires employer sponsorship (unlike EB-1A) and specific research position requirements.

---

## Code Quality Issues (Severity: LOW)

### 11. Unused/Redundant Date Functions

**Location:** `components/TimelineChart.tsx` lines 47-76

**Issue:** Two nearly identical functions exist:
- `formatDateForDisplay()` 
- `formatDateShort()`

Both produce the same output format.

**Recommendation:** Consolidate into a single function.

---

### 12. Magic Numbers in Timeline Rendering

**Location:** `components/TimelineChart.tsx`

**Issue:** Several magic numbers without explanation:
- `PIXELS_PER_YEAR = 160`
- `MAX_YEARS = 8`
- `TRACK_HEIGHT = 32`
- `CONCURRENT_OFFSET = 36`

These are declared as constants (good), but `MAX_YEARS = 8` may truncate very long paths (India EB-2 can exceed 50 years).

**Recommendation:** Consider dynamic scaling or scrolling for extremely long wait times.

---

## Missing Features (Severity: INFO)

### 13. Cross-Chargeability Not Supported

**Issue:** Visa bulletin chargeability can sometimes use spouse's country of birth if advantageous (cross-chargeability). This is not implemented.

**Recommendation:** Consider adding optional "Spouse's country of birth" field.

---

### 14. Consular Processing Option Not Shown

**Issue:** All paths assume Adjustment of Status (I-485). Some users may need/prefer Consular Processing.

**Recommendation:** Consider adding consular processing as an alternative final step.

---

### 15. Cap-Exempt H-1B Employers Not Differentiated

**Issue:** Cap-exempt employers (universities, nonprofits, government research) don't face the H-1B lottery. The application marks all H-1B paths with "lottery" flag.

**Recommendation:** Consider adding a filter for cap-exempt employer.

---

## Data Verification Summary

### Fees Verified as Correct:
| Form | Listed Fee | Current Fee | Status |
|------|-----------|-------------|--------|
| I-140 | $715 | $715 | ✅ Correct |
| I-485 | $1,440 | $1,440 | ✅ Correct |
| I-765 | $260 | $260 | ✅ Correct |
| I-907 | $2,805 | $2,805 | ✅ Correct |
| I-130 | $625 | $625 | ✅ Correct |
| DS-160 | $185 | $185 | ✅ Correct |
| I-901 SEVIS | $350 | $350 | ✅ Correct |
| TN Border | $50 | $50 | ✅ Correct |
| Biometrics | $0 | $0 | ✅ Correct (eliminated April 2024) |

### H-1B Fee Breakdown:
| Component | Listed | Correct |
|-----------|--------|---------|
| Base I-129 | $780 | ✅ $780 |
| ACWIA (26+ employees) | $1,500 | ✅ $1,500 |
| Fraud Prevention | $500 | ✅ $500 |
| Asylum Fee | $600 | ✅ $600 |
| **Total** | **$3,380** | ✅ Correct for large employers |

**Note:** Small employers (1-25 employees) pay $750 ACWIA instead of $1,500. The app shows the higher amount.

---

## Visa Bulletin Data (January 2026 Defaults)

### Final Action Dates:
| Category | India | China | All Other |
|----------|-------|-------|-----------|
| EB-1 | Feb 2023 | Feb 2023 | Current |
| EB-2 | Jul 2013 | Sep 2021 | Apr 2024 |
| EB-3 | Nov 2013 | May 2021 | Apr 2023 |

**Verification Needed:** These default values should be verified against the actual January 2026 Visa Bulletin when available.

---

## Test Results

### Exhaustive Path Validation:
- ✅ 336 filter combinations tested
- ✅ 2,658 paths validated
- ✅ 65 unique path IDs generated
- ✅ 0 issues found

### Immigration Rule Tests:
- ✅ 23 tests passed
- ✅ 0 tests failed

**Tests Cover:**
- TN visa rules (citizenship, education requirements)
- EB-2 education rules (Master's OR Bachelor's + 5yr)
- EB-1 rules (extraordinary ability, outstanding researcher, executive)
- H-1B rules (bachelor's requirement, lottery flag)
- OPT/STEM rules (3-year vs 1-year duration)
- Marriage rules (immediate relative, no education requirement)
- EB-5 rules (investment capital, no education)
- PERM rules (employer sponsorship, bachelor's minimum)
- L-1 rules (executive/manager, multinational transfer)
- O-1 rules (extraordinary ability)
- Status transitions (F-1→OPT→H-1B, OPT→TN, etc.)

---

## Recommendations Summary

### High Priority:
1. Fix processing time default dates (should be past dates, not future)
2. Clarify O-1 evidence criteria (3 of 8 for O-1A specifically)
3. Verify H-1B $100k proclamation fee status and clarify in UI

### Medium Priority:
4. Add priority date portability validation
5. Add TN → F-1 status change warning
6. Clarify STEM vs non-STEM OPT duration in constants
7. Add dual intent warning prominence for TN → PERM

### Low Priority:
8. Consolidate duplicate date formatting functions
9. Consider cross-chargeability feature
10. Consider cap-exempt employer option
11. Add consular processing alternative

---

## Conclusion

The Stateside application demonstrates solid engineering with comprehensive test coverage and generally accurate immigration data. The identified issues are primarily data accuracy concerns rather than fundamental logic errors. The priority date wait time calculations use a sophisticated velocity-based approach that accounts for historical visa bulletin movement.

Key strengths:
- Well-structured path composition system
- Comprehensive test coverage
- Dynamic data fetching from official sources
- Accurate fee data (verified against USCIS April 2024 fee schedule)

Areas for improvement:
- Default fallback dates need updating
- Some immigration nuances could be better explained (TN dual intent, O-1A vs O-1B)
- Priority date portability rules should be validated

**Report prepared by:** Claude AI  
**Review requested by:** Human operator
