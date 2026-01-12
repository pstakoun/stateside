"use client";

import { useEffect, useMemo, useState } from "react";
import { CaseProfile, TrackedCase, newTrackedCase, CaseRoute, USCISFormType } from "@/lib/case-types";
import { CountryOfBirth, countryLabels, ebCategoryLabels } from "@/lib/filter-paths";
import { saveCaseProfile } from "@/lib/storage";

type StepState = "todo" | "in_progress" | "done";

function stepState(done?: string, started?: string): StepState {
  if (done) return "done";
  if (started) return "in_progress";
  return "todo";
}

function daysSince(dateIso?: string): number | null {
  if (!dateIso) return null;
  const d = new Date(dateIso);
  if (!Number.isFinite(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeReceipt(receipt: string): string {
  return receipt.trim().toUpperCase().replace(/\s+/g, "");
}

function receiptForForm(c: TrackedCase, form: USCISFormType) {
  return c.receipts.find((r) => r.form === form);
}

function upsertReceipt(c: TrackedCase, form: USCISFormType, receiptNumber: string): TrackedCase {
  const normalized = normalizeReceipt(receiptNumber);
  const existing = c.receipts.filter((r) => r.form !== form);
  if (!normalized) return { ...c, receipts: existing };
  return { ...c, receipts: [{ form, receiptNumber: normalized }, ...existing] };
}

interface CaseTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseProfile: CaseProfile;
  defaultCountryOfBirth: CountryOfBirth;
  onCaseProfileChange: (next: CaseProfile) => void;
}

export default function CaseTrackerModal({
  isOpen,
  onClose,
  caseProfile,
  defaultCountryOfBirth,
  onCaseProfileChange,
}: CaseTrackerModalProps) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(caseProfile.selectedCaseId);
  const selectedCase = useMemo(
    () => caseProfile.cases.find((c) => c.id === selectedCaseId) ?? null,
    [caseProfile.cases, selectedCaseId]
  );

  const [draft, setDraft] = useState<TrackedCase | null>(selectedCase);
  const [isSaving, setIsSaving] = useState(false);
  const [statusLoading, setStatusLoading] = useState<USCISFormType | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Sync draft when selection changes
  useEffect(() => {
    setSelectedCaseId(caseProfile.selectedCaseId);
  }, [caseProfile.selectedCaseId]);

  useEffect(() => {
    setDraft(selectedCase);
    setStatusError(null);
    setStatusLoading(null);
  }, [selectedCase]);

  if (!isOpen) return null;

  const route: CaseRoute = draft?.route ?? "perm";

  const checklist = draft
    ? [
        ...(route === "perm"
          ? [
              { id: "pwd", label: "PWD", state: stepState(draft.pwdIssuedDate, draft.pwdFiledDate) as StepState },
              { id: "recruit", label: "Recruitment", state: stepState(draft.permFiledDate, draft.recruitmentStartDate) as StepState },
              { id: "perm", label: "PERM", state: stepState(draft.permApprovedDate, draft.permFiledDate) as StepState },
            ]
          : []),
        { id: "i140", label: route === "niw" ? "NIW I-140" : "I-140", state: stepState(draft.i140ApprovedDate, draft.i140FiledDate) as StepState },
        { id: "i485", label: "I-485", state: stepState(draft.i485ApprovedDate, draft.i485FiledDate) as StepState },
      ]
    : [];

  const i485Days = daysSince(draft?.i485FiledDate);
  const ac21Eligible = i485Days !== null && i485Days >= 180;

  const canChangeEmployerNote = draft?.planningToChangeEmployerSoon
    ? ac21Eligible
      ? "Likely portable (AC21): your I-485 has been pending ~180+ days, so you may be able to change employers without a new PERM in many cases."
      : "If you change employers before I-485 has been pending 180 days, you often need a new PERM + I-140 (even if you keep your old priority date)."
    : null;

  function setField<K extends keyof TrackedCase>(key: K, value: TrackedCase[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value, updatedAt: new Date().toISOString() } : prev));
  }

  async function saveDraft() {
    if (!draft) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const normalized: TrackedCase = {
        ...draft,
        updatedAt: now,
        ebCategory: draft.route === "eb1" ? "eb1" : draft.ebCategory,
      };
      const cases = caseProfile.cases.some((c) => c.id === normalized.id)
        ? caseProfile.cases.map((c) => (c.id === normalized.id ? normalized : c))
        : [normalized, ...caseProfile.cases];
      const next: CaseProfile = {
        cases,
        selectedCaseId: normalized.id,
      };
      saveCaseProfile(next);
      onCaseProfileChange(next);
      setSelectedCaseId(normalized.id);
    } finally {
      setIsSaving(false);
    }
  }

  function createNewCase() {
    const c = newTrackedCase({
      name: `My case (${caseProfile.cases.length + 1})`,
      countryOfBirth: defaultCountryOfBirth,
      route: "perm",
      ebCategory: "eb2",
    });
    const next: CaseProfile = { cases: [c, ...caseProfile.cases], selectedCaseId: c.id };
    saveCaseProfile(next);
    onCaseProfileChange(next);
    setSelectedCaseId(c.id);
  }

  function deleteCurrentCase() {
    if (!draft) return;
    const cases = caseProfile.cases.filter((c) => c.id !== draft.id);
    const selected = caseProfile.selectedCaseId === draft.id ? (cases[0]?.id ?? null) : caseProfile.selectedCaseId;
    const next: CaseProfile = { cases, selectedCaseId: selected };
    saveCaseProfile(next);
    onCaseProfileChange(next);
    setSelectedCaseId(selected);
  }

  async function fetchReceiptStatus(form: USCISFormType) {
    if (!draft) return;
    const r = receiptForForm(draft, form);
    const receipt = r?.receiptNumber ?? "";
    if (!receipt) return;

    setStatusError(null);
    setStatusLoading(form);
    try {
      const res = await fetch(`/api/uscis-case-status?receipt=${encodeURIComponent(receipt)}`);
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setStatusError(data?.error || "Failed to fetch status.");
        return;
      }

      const updatedReceipts = draft.receipts.map((x) =>
        x.form === form
          ? {
              ...x,
              lastFetchedAt: data.fetchedAt,
              lastStatusTitle: data.statusTitle,
              lastStatusDetails: data.statusDetails,
            }
          : x
      );
      setDraft({ ...draft, receipts: updatedReceipts, updatedAt: new Date().toISOString() });
    } catch {
      setStatusError("Failed to fetch status.");
    } finally {
      setStatusLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-gray-900">Case tracker</div>
            <div className="text-sm text-gray-500">
              Fill what you’ve already filed and when. The main timeline will update based on your case.
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex h-[calc(90vh-72px)]">
          {/* Left: case list */}
          <div className="w-64 border-r border-gray-100 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-900">Cases</div>
              <button
                onClick={createNewCase}
                className="text-xs font-medium text-brand-700 hover:text-brand-800"
              >
                + New
              </button>
            </div>

            {caseProfile.cases.length === 0 ? (
              <div className="text-sm text-gray-500">No cases yet.</div>
            ) : (
              <div className="space-y-1">
                {caseProfile.cases.map((c) => {
                  const isSelected = c.id === selectedCaseId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCaseId(c.id);
                        const next: CaseProfile = { cases: caseProfile.cases, selectedCaseId: c.id };
                        saveCaseProfile(next);
                        onCaseProfileChange(next);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                        isSelected ? "border-brand-300 bg-brand-50" : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                      <div className="text-[11px] text-gray-500">
                        {c.route.toUpperCase()} · {ebCategoryLabels[c.ebCategory]}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: editor */}
          <div className="flex-1 overflow-y-auto p-6">
            {!draft ? (
              <div className="text-gray-600">Select a case or create a new one.</div>
            ) : (
              <div className="space-y-8">
                {/* Top fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-900 mb-1">Case name</label>
                    <input
                      value={draft.name}
                      onChange={(e) => setField("name", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-brand-500 focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">Route</label>
                    <select
                      value={draft.route}
                      onChange={(e) => setField("route", e.target.value as CaseRoute)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-brand-500 focus:border-brand-500"
                    >
                      <option value="perm">PERM (EB-2/EB-3)</option>
                      <option value="niw">EB-2 NIW</option>
                      <option value="eb1">EB-1</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">Country of birth</label>
                    <select
                      value={draft.countryOfBirth}
                      onChange={(e) => setField("countryOfBirth", e.target.value as CountryOfBirth)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-brand-500 focus:border-brand-500"
                    >
                      {(["canada", "mexico", "india", "china", "other"] as CountryOfBirth[]).map((c) => (
                        <option key={c} value={c}>
                          {countryLabels[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">EB category</label>
                    <select
                      value={draft.route === "eb1" ? "eb1" : draft.ebCategory}
                      onChange={(e) => setField("ebCategory", e.target.value as TrackedCase["ebCategory"])}
                      disabled={draft.route === "eb1"}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-brand-500 focus:border-brand-500 disabled:bg-gray-50"
                    >
                      {(["eb1", "eb2", "eb3"] as TrackedCase["ebCategory"][]).map((c) => (
                        <option key={c} value={c}>
                          {ebCategoryLabels[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Checklist */}
                <div>
                  <div className="text-sm font-semibold text-gray-900 mb-2">Checklist</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {checklist.map((item) => {
                      const color =
                        item.state === "done"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : item.state === "in_progress"
                            ? "bg-amber-50 border-amber-200 text-amber-800"
                            : "bg-gray-50 border-gray-200 text-gray-700";
                      const label =
                        item.state === "done" ? "Done" : item.state === "in_progress" ? "In progress" : "Not started";
                      return (
                        <div key={item.id} className={`px-3 py-2 rounded-lg border ${color}`}>
                          <div className="text-sm font-medium">{item.label}</div>
                          <div className="text-xs opacity-90">{label}</div>
                        </div>
                      );
                    })}
                  </div>
                  {canChangeEmployerNote && (
                    <div className="mt-3 text-xs text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
                      {canChangeEmployerNote}
                    </div>
                  )}
                </div>

                {/* Milestones */}
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-gray-900">Key dates</div>

                  {route === "perm" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-1">PWD filed</label>
                        <input
                          type="date"
                          value={draft.pwdFiledDate || ""}
                          onChange={(e) => setField("pwdFiledDate", e.target.value || undefined)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-1">PWD issued</label>
                        <input
                          type="date"
                          value={draft.pwdIssuedDate || ""}
                          onChange={(e) => setField("pwdIssuedDate", e.target.value || undefined)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-1">Recruitment started</label>
                        <input
                          type="date"
                          value={draft.recruitmentStartDate || ""}
                          onChange={(e) => setField("recruitmentStartDate", e.target.value || undefined)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-1">PERM filed (Priority Date)</label>
                        <input
                          type="date"
                          value={draft.permFiledDate || ""}
                          onChange={(e) => setField("permFiledDate", e.target.value || undefined)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-1">PERM approved</label>
                        <input
                          type="date"
                          value={draft.permApprovedDate || ""}
                          onChange={(e) => setField("permApprovedDate", e.target.value || undefined)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors w-full">
                          <input
                            type="checkbox"
                            checked={!!draft.permLikelyAudited}
                            onChange={(e) => setField("permLikelyAudited", e.target.checked)}
                            className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                          />
                          <div>
                            <div className="font-medium text-sm text-gray-900">PERM audit risk</div>
                            <div className="text-xs text-gray-500">Use audit timeline estimates</div>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">I-140 filed</label>
                      <input
                        type="date"
                        value={draft.i140FiledDate || ""}
                        onChange={(e) => setField("i140FiledDate", e.target.value || undefined)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">I-140 approved</label>
                      <input
                        type="date"
                        value={draft.i140ApprovedDate || ""}
                        onChange={(e) => setField("i140ApprovedDate", e.target.value || undefined)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors w-full">
                        <input
                          type="checkbox"
                          checked={!!draft.i140Premium}
                          onChange={(e) => setField("i140Premium", e.target.checked)}
                          className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                        />
                        <div>
                          <div className="font-medium text-sm text-gray-900">Premium processing</div>
                          <div className="text-xs text-gray-500">Use premium time estimate</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">I-485 filed</label>
                      <input
                        type="date"
                        value={draft.i485FiledDate || ""}
                        onChange={(e) => setField("i485FiledDate", e.target.value || undefined)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">I-485 approved</label>
                      <input
                        type="date"
                        value={draft.i485ApprovedDate || ""}
                        onChange={(e) => setField("i485ApprovedDate", e.target.value || undefined)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors w-full">
                        <input
                          type="checkbox"
                          checked={!!draft.planningToChangeEmployerSoon}
                          onChange={(e) => setField("planningToChangeEmployerSoon", e.target.checked)}
                          className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                        />
                        <div>
                          <div className="font-medium text-sm text-gray-900">Planning to change employers</div>
                          <div className="text-xs text-gray-500">Show portability notes</div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Receipts */}
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-gray-900">Receipt numbers (optional)</div>
                  {(["I-140", "I-485", "I-765"] as USCISFormType[]).map((form) => {
                    const r = receiptForForm(draft, form);
                    return (
                      <div key={form} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                          <div className="w-20 text-sm font-semibold text-gray-900">{form}</div>
                          <input
                            value={r?.receiptNumber ?? ""}
                            onChange={(e) => setDraft((prev) => (prev ? upsertReceipt(prev, form, e.target.value) : prev))}
                            placeholder="e.g. IOE1234567890"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => fetchReceiptStatus(form)}
                            disabled={statusLoading !== null}
                            className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
                          >
                            {statusLoading === form ? "Checking..." : "Check status"}
                          </button>
                        </div>
                        {r?.lastStatusTitle && (
                          <div className="mt-2 text-sm text-gray-800">
                            <div className="font-semibold">{r.lastStatusTitle}</div>
                            {r.lastStatusDetails && <div className="text-xs text-gray-600 mt-0.5">{r.lastStatusDetails}</div>}
                            {r.lastFetchedAt && (
                              <div className="text-[11px] text-gray-400 mt-1">Last checked: {new Date(r.lastFetchedAt).toLocaleString()}</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {statusError && <div className="text-sm text-red-600">{statusError}</div>}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <button
                    onClick={deleteCurrentCase}
                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    Delete case
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Close
                    </button>
                    <button
                      onClick={saveDraft}
                      disabled={isSaving}
                      className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

