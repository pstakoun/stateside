import { TrackedCase } from "@/lib/case-types";
import { ComposedPath, ComposedStage, Duration } from "@/lib/path-composer";
import { ProcessingTimes, formatMonths, getPriorityDateForPath, calculateWaitForExistingPDWithVelocity } from "@/lib/processing-times";
import { CountryOfBirth, EBCategory } from "@/lib/filter-paths";
import { DynamicData } from "@/lib/dynamic-data";

type IsoDate = string; // YYYY-MM-DD

function parseIsoDate(dateStr?: IsoDate): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  // Guard against invalid dates (NaN time) and timezone oddities
  return Number.isFinite(d.getTime()) ? d : null;
}

function monthsSince(date: Date, now = new Date()): number {
  const diffMs = now.getTime() - date.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 30));
}

function toPriorityDateFromIso(dateStr?: IsoDate): { month: number; year: number } | null {
  const d = parseIsoDate(dateStr);
  if (!d) return null;
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Math.round(months));
  return d;
}

function normalizeEbCategoryForBulletin(caseEb: EBCategory, route: TrackedCase["route"]): string {
  // Visa bulletin backlogs are driven by EB-1/2/3. NIW shares EB-2.
  if (route === "eb1") return "EB-1";
  if (caseEb === "eb1") return "EB-1";
  if (caseEb === "eb3") return "EB-3";
  return "EB-2";
}

function getI140Months(times: ProcessingTimes, usePremium: boolean): { min: number; max: number; display: string } {
  const i140Data = times.uscis["I-140"] ?? [];
  const regular = i140Data.find((t) => t.serviceCenter !== "Premium");
  const premium = i140Data.find((t) => t.serviceCenter === "Premium");

  if (usePremium && premium) {
    const m = premium.processingTime.min;
    return { min: m, max: m, display: premium.processingTime.min < 1 ? `${Math.round(m * 30)}d` : formatMonths(m, m) };
  }

  if (regular) {
    return { min: regular.processingTime.min, max: regular.processingTime.max, display: formatMonths(regular.processingTime.min, regular.processingTime.max) };
  }

  // fallback
  return { min: 6, max: 9, display: "6-9 mo" };
}

function getI485Months(times: ProcessingTimes): { min: number; max: number; display: string } {
  const i485Data = times.uscis["I-485"] ?? [];
  if (i485Data.length === 0) return { min: 10, max: 18, display: "10-18 mo" };
  const avgMin = i485Data.reduce((sum, t) => sum + t.processingTime.min, 0) / i485Data.length;
  const avgMax = i485Data.reduce((sum, t) => sum + t.processingTime.max, 0) / i485Data.length;
  return { min: avgMin, max: avgMax, display: formatMonths(avgMin, avgMax) };
}

function getPwdMonths(times: ProcessingTimes): { min: number; max: number; display: string } {
  const m = times.dol.pwd.estimatedMonths;
  return { min: Math.max(0.5, m * 0.8), max: m + 1, display: `${Math.round(Math.max(0.5, m * 0.8))}-${Math.round(m + 1)} mo` };
}

function getPermMonths(times: ProcessingTimes, audited: boolean): { min: number; max: number; display: string } {
  const base = audited ? times.dol.perm.auditReview.estimatedMonths : times.dol.perm.analystReview.estimatedMonths;
  const min = Math.max(6, base - 2);
  const max = base + 2;
  return { min, max, display: `${Math.round(min)}-${Math.round(max)} mo` };
}

function remainingRangeFromStart(
  estimated: { min: number; max: number },
  startedAt?: IsoDate,
  completedAt?: IsoDate
): { min: number; max: number } {
  if (completedAt) return { min: 0, max: 0 };
  const start = parseIsoDate(startedAt);
  if (!start) return { min: estimated.min, max: estimated.max };
  const elapsed = monthsSince(start);
  return {
    min: Math.max(0, estimated.min - elapsed),
    max: Math.max(0, estimated.max - elapsed),
  };
}

function monthsToYearsRange(m: { min: number; max: number }): Duration {
  return {
    min: m.min / 12,
    max: m.max / 12,
    display: formatMonths(m.min, m.max),
  };
}

/**
 * Build a single "Your case" timeline. This intentionally models overlaps:
 * - Visa bulletin movement happens while PERM/I-140 are pending.
 * - I-485 pending time is limited by BOTH: USCIS processing + Final Action availability + I-140 approval.
 */
export function buildTrackedCasePath(params: {
  trackedCase: TrackedCase;
  processingTimes: ProcessingTimes;
  finalActionDates?: DynamicData["priorityDates"];
  datesForFiling?: DynamicData["datesForFiling"];
}): ComposedPath {
  const { trackedCase, processingTimes, finalActionDates, datesForFiling } = params;

  const now = new Date();

  // If already approved
  if (trackedCase.i485ApprovedDate) {
    const stages: ComposedStage[] = [
      {
        nodeId: "gc",
        durationYears: { min: 0, max: 0, display: "Done!" },
        track: "gc",
        startYear: 0,
        note: "Green card approved",
      },
    ];
    return {
      id: `tracked_${trackedCase.id}`,
      name: trackedCase.name,
      description: "Your tracked case (approved).",
      gcCategory: trackedCase.route === "eb1" ? "EB-1" : trackedCase.route === "niw" ? "EB-2 NIW" : trackedCase.ebCategory === "eb3" ? "EB-3" : "EB-2",
      totalYears: { min: 0, max: 0, display: "Done!" },
      stages,
      estimatedCost: 0,
      hasLottery: false,
      isSelfPetition: trackedCase.route === "niw" || trackedCase.route === "eb1",
    };
  }

  const stages: ComposedStage[] = [];

  // ----- Establish (or estimate) PD -----
  let pd = toPriorityDateFromIso(trackedCase.permFiledDate) ?? toPriorityDateFromIso(trackedCase.i140FiledDate);

  // Estimate PERM filing date if missing for PERM route
  const pwdEst = getPwdMonths(processingTimes);
  const recruitEst = { min: 2, max: 3 }; // simplified

  const pwdRemaining = remainingRangeFromStart(
    pwdEst,
    trackedCase.pwdFiledDate,
    trackedCase.pwdIssuedDate
  );

  const recruitRemaining = remainingRangeFromStart(
    recruitEst,
    trackedCase.recruitmentStartDate,
    trackedCase.permFiledDate // assume recruitment complete by PERM filing
  );

  let monthsToPermFile: { min: number; max: number } = { min: 0, max: 0 };
  if (trackedCase.route === "perm" && !trackedCase.permFiledDate) {
    monthsToPermFile = { min: pwdRemaining.min + recruitRemaining.min, max: pwdRemaining.max + recruitRemaining.max };
    const estimatedPermFiled = addMonths(now, monthsToPermFile.max);
    pd = { month: estimatedPermFiled.getMonth() + 1, year: estimatedPermFiled.getFullYear() };
  }

  // If we still can't determine PD (should be rare), assume "today" PD for planning purposes.
  if (!pd) pd = { month: now.getMonth() + 1, year: now.getFullYear() };

  // ----- Visa bulletin waits from NOW (these run in parallel with other steps) -----
  const bulletinCategory = normalizeEbCategoryForBulletin(trackedCase.ebCategory, trackedCase.route) as "EB-1" | "EB-2" | "EB-3";
  const ebCat: EBCategory = bulletinCategory === "EB-1" ? "eb1" : bulletinCategory === "EB-3" ? "eb3" : "eb2";

  const filingCutoffStr =
    datesForFiling ? getPriorityDateForPath(datesForFiling, bulletinCategory, trackedCase.countryOfBirth) : "Current";
  const finalActionCutoffStr =
    finalActionDates ? getPriorityDateForPath(finalActionDates, bulletinCategory, trackedCase.countryOfBirth) : "Current";

  const filingWaitFromNow = datesForFiling
    ? calculateWaitForExistingPDWithVelocity(pd, filingCutoffStr, trackedCase.countryOfBirth, ebCat)
    : { estimatedMonths: 0, rangeMin: 0, rangeMax: 0, confidence: 1, velocityData: { bulletinAdvancementMonthsPerYear: 12, velocityRatio: 0, waitMultiplier: 1, confidence: 1, explanation: "No filing chart data available." } };

  const finalActionWaitFromNow = finalActionDates
    ? calculateWaitForExistingPDWithVelocity(pd, finalActionCutoffStr, trackedCase.countryOfBirth, ebCat)
    : { estimatedMonths: 0, rangeMin: 0, rangeMax: 0, confidence: 1, velocityData: { bulletinAdvancementMonthsPerYear: 12, velocityRatio: 0, waitMultiplier: 1, confidence: 1, explanation: "No final action chart data available." } };

  // ----- PERM route remaining -----
  const permEst = getPermMonths(processingTimes, !!trackedCase.permLikelyAudited);
  const permRemaining = remainingRangeFromStart(
    permEst,
    trackedCase.permFiledDate,
    trackedCase.permApprovedDate
  );

  // ----- I-140 remaining -----
  const i140Est = getI140Months(processingTimes, !!trackedCase.i140Premium);
  const i140Remaining = remainingRangeFromStart(
    i140Est,
    trackedCase.i140FiledDate,
    trackedCase.i140ApprovedDate
  );

  // ----- I-485 remaining (USCIS processing component only) -----
  const i485Est = getI485Months(processingTimes);
  const i485Remaining = remainingRangeFromStart(
    i485Est,
    trackedCase.i485FiledDate,
    trackedCase.i485ApprovedDate
  );

  // ----- Build schedule (in months from now) -----
  // tPermFile: when PERM will be filed (if not already)
  const tPermFile = trackedCase.permFiledDate ? 0 : monthsToPermFile.max;

  // tPermApproved: when PERM will be approved (if needed)
  let tPermApproved = 0;
  if (trackedCase.route === "perm") {
    if (trackedCase.permApprovedDate) {
      tPermApproved = 0;
    } else if (trackedCase.permFiledDate) {
      tPermApproved = permRemaining.max;
    } else {
      tPermApproved = monthsToPermFile.max + permRemaining.max;
    }
  }

  // tI140Filed: when I-140 can be filed (or is already filed)
  let tI140Filed = 0;
  if (trackedCase.i140FiledDate) {
    tI140Filed = 0;
  } else if (trackedCase.route === "perm") {
    tI140Filed = tPermApproved;
  } else {
    // NIW/EB-1 can file immediately
    tI140Filed = 0;
  }

  // time to I-140 approval (cannot approve before filing + its processing)
  const tI140Approved = trackedCase.i140ApprovedDate ? 0 : (tI140Filed + i140Remaining.max);

  // tI485Filed: earliest time you can submit I-485 (Chart B + I-140 filed)
  let tI485Filed = 0;
  if (trackedCase.i485FiledDate) {
    tI485Filed = 0;
  } else {
    tI485Filed = Math.max(tI140Filed, filingWaitFromNow.estimatedMonths);
  }

  // total time until "Final Action current" from now (Chart A)
  const tFinalActionCurrent = finalActionWaitFromNow.estimatedMonths;

  // I-485 approval requires: I-485 filed + USCIS AOS processing, AND Final Action current, AND I-140 approved.
  // Model as the max of those three clocks.
  const tI485ProcessingComplete = trackedCase.i485FiledDate ? i485Remaining.max : (tI485Filed + i485Remaining.max);
  const tGreenCard = Math.max(tI485ProcessingComplete, tFinalActionCurrent, tI140Approved);

  // ----- Emit stages (only what remains) -----
  let cursorMonths = 0;

  // If PERM route and PERM not filed yet, include PWD + recruitment + PERM processing.
  if (trackedCase.route === "perm" && !trackedCase.permApprovedDate && !trackedCase.i140FiledDate) {
    if (!trackedCase.pwdIssuedDate && pwdRemaining.max > 0) {
      stages.push({
        nodeId: "pwd",
        durationYears: monthsToYearsRange(pwdRemaining),
        track: "gc",
        startYear: cursorMonths / 12,
        note: `DOL currently processing: ${processingTimes.dol.pwd.currentlyProcessing}`,
      });
      cursorMonths += pwdRemaining.max;
    }

    if (!trackedCase.permFiledDate && recruitRemaining.max > 0) {
      stages.push({
        nodeId: "recruit",
        durationYears: monthsToYearsRange(recruitRemaining),
        track: "gc",
        startYear: cursorMonths / 12,
        note: "Recruitment / quiet period before PERM filing",
      });
      cursorMonths += recruitRemaining.max;
    }

    // PERM processing once filed
    if (!trackedCase.permApprovedDate && permRemaining.max > 0) {
      stages.push({
        nodeId: "perm",
        durationYears: monthsToYearsRange(permRemaining),
        track: "gc",
        startYear: (trackedCase.permFiledDate ? 0 : (monthsToPermFile.max)) / 12,
        note: `DOL currently processing: ${trackedCase.permLikelyAudited ? processingTimes.dol.perm.auditReview.currentlyProcessing : processingTimes.dol.perm.analystReview.currentlyProcessing}`,
      });
    }
  } else if (trackedCase.route === "perm" && !trackedCase.permApprovedDate && trackedCase.permFiledDate) {
    // PERM already filed (most common in-progress scenario)
    if (permRemaining.max > 0) {
      stages.push({
        nodeId: "perm",
        durationYears: monthsToYearsRange(permRemaining),
        track: "gc",
        startYear: 0,
        note: `PERM filed. Visa bulletin movement continues while DOL adjudicates.`,
      });
    }
  }

  // I-140 stage if not approved
  if (!trackedCase.i140ApprovedDate) {
    const i140StartYear = tI140Filed / 12;
    const i140Dur = monthsToYearsRange(i140Remaining);
    if (i140Remaining.max > 0) {
      stages.push({
        nodeId: trackedCase.route === "eb1" ? "eb1" : trackedCase.route === "niw" ? "eb2niw" : "i140",
        durationYears: i140Dur,
        track: "gc",
        startYear: i140StartYear,
        note: trackedCase.i140Premium ? "Premium processing selected (estimate)" : "Regular processing (estimate)",
      });
    }
  }

  // Extra wait to FILE I-485 (only if Chart B is still not current by the time I-140 can be filed)
  if (!trackedCase.i485FiledDate) {
    const filingDelay = Math.max(0, filingWaitFromNow.estimatedMonths - tI140Filed);
    if (filingDelay > 0) {
      stages.push({
        nodeId: "priority_wait",
        durationYears: monthsToYearsRange({ min: filingDelay, max: filingDelay }),
        track: "gc",
        startYear: tI140Filed / 12,
        note: `Wait until you can file I-485 (Dates for Filing). Current cutoff: ${filingCutoffStr}.`,
        isPriorityWait: true,
        priorityDateStr: filingCutoffStr,
        velocityInfo: {
          bulletinAdvancementMonthsPerYear: filingWaitFromNow.velocityData.bulletinAdvancementMonthsPerYear,
          velocityRatio: filingWaitFromNow.velocityData.velocityRatio,
          explanation: filingWaitFromNow.velocityData.explanation,
          rangeMin: filingWaitFromNow.rangeMin,
          rangeMax: filingWaitFromNow.rangeMax,
          confidence: filingWaitFromNow.confidence,
        },
      });
    }
  }

  // I-485 pending stage (includes any additional Final Action wait beyond normal USCIS processing)
  if (!trackedCase.i485ApprovedDate) {
    const i485Start = tI485Filed;
    const additionalFinalActionAfterFiling = Math.max(0, tFinalActionCurrent - i485Start);
    const i485PendingMonths = Math.max(i485Remaining.max, additionalFinalActionAfterFiling);
    const pendingMinMonths = Math.max(i485Remaining.min, Math.max(0, (finalActionWaitFromNow.rangeMin - i485Start)));
    const pendingMaxMonths = Math.max(i485Remaining.max, Math.max(0, (finalActionWaitFromNow.rangeMax - i485Start)));

    if (i485PendingMonths > 0) {
      stages.push({
        nodeId: "i485",
        durationYears: monthsToYearsRange({ min: pendingMinMonths, max: pendingMaxMonths }),
        track: "gc",
        startYear: i485Start / 12,
        note:
          additionalFinalActionAfterFiling > i485Remaining.max
            ? `I-485 pending while waiting for Final Action (${finalActionCutoffStr}). EAD/AP typically available while pending.`
            : trackedCase.i485FiledDate
              ? "I-485 pending. EAD/AP typically available while pending."
              : "I-485 processing (estimate).",
      });
    }
  }

  stages.push({
    nodeId: "gc",
    durationYears: { min: 0, max: 0, display: "" },
    track: "gc",
    startYear: tGreenCard / 12,
    note: "Estimated green card approval",
  });

  const total: Duration = {
    min: tGreenCard / 12,
    max: tGreenCard / 12,
    display: tGreenCard === 0 ? "Done!" : `${(tGreenCard / 12).toFixed(1)} yr`,
  };

  const gcCategory =
    trackedCase.route === "eb1"
      ? "EB-1"
      : trackedCase.route === "niw"
        ? "EB-2 NIW"
        : trackedCase.ebCategory === "eb3"
          ? "EB-3"
          : "EB-2";

  return {
    id: `tracked_${trackedCase.id}`,
    name: trackedCase.name,
    description:
      "Your tracked case timeline. Visa bulletin wait overlaps with PERM/I-140 when applicable.",
    gcCategory,
    totalYears: total,
    stages,
    estimatedCost: 0,
    hasLottery: false,
    isSelfPetition: trackedCase.route === "niw" || trackedCase.route === "eb1",
  };
}

