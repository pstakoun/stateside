"use client";

import { useEffect, useState } from "react";
import visaData from "@/data/visa-paths.json";

interface PathDetailProps {
  nodeId: string | null;
  onClose: () => void;
}

export default function PathDetail({ nodeId, onClose }: PathDetailProps) {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  if (!nodeId) return null;

  const node = visaData.nodes[nodeId as keyof typeof visaData.nodes];
  if (!node) return null;

  const categoryColors: Record<string, string> = {
    origin: "bg-gray-500",
    entry: "bg-brand-600",
    work: "bg-emerald-500",
    greencard: "bg-amber-500",
    citizenship: "bg-purple-500",
  };

  const categoryLabels: Record<string, string> = {
    origin: "Starting Point",
    entry: "Entry Visa",
    work: "Work Authorization",
    greencard: "Green Card Path",
    citizenship: "Citizenship",
  };

  // Mobile: bottom sheet style
  if (isMobile) {
    return (
      <div className="fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-xl z-50 max-h-[85vh] overflow-y-auto animate-slide-up safe-bottom">
        {/* Drag handle */}
        <div className="sticky top-0 bg-white pt-3 pb-2 border-b border-gray-100 z-10">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto" />
        </div>
        
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span
                className={`inline-block px-2 py-0.5 text-[10px] font-medium text-white rounded ${
                  categoryColors[node.category]
                } mb-1.5`}
              >
                {categoryLabels[node.category]}
              </span>
              <h2 className="text-xl font-bold text-gray-900">{node.name}</h2>
              {"fullName" in node && node.fullName && (
                <p className="text-sm text-gray-500">{node.fullName as string}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 -m-2 text-gray-400"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-5">
          {/* Description */}
          <p className="text-gray-700 text-sm leading-relaxed">{node.description}</p>

          {/* Stats */}
          {"stats" in node && node.stats && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">Statistics</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <div className="text-lg font-bold text-emerald-600">
                    {Math.round((node.stats as { approvalRate: number }).approvalRate * 100)}%
                  </div>
                  <div className="text-[10px] text-gray-500">Approval</div>
                </div>
                {"rfeRate" in (node.stats as Record<string, unknown>) && (
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-amber-600">
                      {Math.round(((node.stats as { rfeRate: number }).rfeRate || 0) * 100)}%
                    </div>
                    <div className="text-[10px] text-gray-500">RFE Rate</div>
                  </div>
                )}
                {"annualVolume" in (node.stats as Record<string, unknown>) && (
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-brand-700">
                      {((node.stats as { annualVolume: number }).annualVolume / 1000).toFixed(0)}k
                    </div>
                    <div className="text-[10px] text-gray-500">Annual</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Requirements */}
          {"requirements" in node && (node.requirements as string[])?.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">Requirements</h3>
              <ul className="space-y-2">
                {(node.requirements as string[]).map((req, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700 text-sm">
                    <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Forms & Filings */}
          {"filings" in node && (node.filings as Array<{form: string; name: string; fee: number | string; filed_by: string; processing?: string; note?: string}>)?.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">Forms & Filings</h3>
              <div className="space-y-2">
                {(node.filings as Array<{form: string; name: string; fee: number | string; filed_by: string; processing?: string; note?: string}>).map((filing, i) => (
                  <div key={i} className="bg-brand-50 border border-brand-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-bold text-brand-800">{filing.form}</span>
                        <p className="text-xs text-gray-700 mt-0.5">{filing.name}</p>
                      </div>
                      <span className="text-sm font-medium text-gray-900 flex-shrink-0">
                        {typeof filing.fee === "number"
                          ? filing.fee === 0 ? "Free" : `$${filing.fee.toLocaleString()}`
                          : `$${filing.fee}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TN Professions */}
          {"tnProfessions" in node && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">TN-Eligible Professions</h3>
              <div className="flex flex-wrap gap-1.5">
                {(node.tnProfessions as string[]).slice(0, 8).map((prof, i) => (
                  <span key={i} className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs">
                    {prof}
                  </span>
                ))}
                {(node.tnProfessions as string[]).length > 8 && (
                  <span className="text-xs text-gray-500">+{(node.tnProfessions as string[]).length - 8} more</span>
                )}
              </div>
            </div>
          )}

          {/* Evidence Categories */}
          {"evidenceCategories" in node && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">O-1A Evidence (need 3 of 8)</h3>
              <ul className="space-y-1">
                {(node.evidenceCategories as string[]).map((cat, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                    <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px] flex-shrink-0">
                      {i + 1}
                    </span>
                    {cat}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        {/* Safe area padding */}
        <div className="h-6" />
      </div>
    );
  }

  // Desktop: side panel
  return (
    <div className="fixed inset-y-0 right-0 w-[450px] bg-white shadow-2xl z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <span
              className={`inline-block px-2 py-1 text-xs font-medium text-white rounded ${
                categoryColors[node.category]
              } mb-2`}
            >
              {categoryLabels[node.category]}
            </span>
            <h2 className="text-2xl font-bold text-gray-900">{node.name}</h2>
            {"fullName" in node && node.fullName && (
              <p className="text-gray-500">{node.fullName as string}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Description */}
        <p className="text-gray-700">{node.description}</p>

        {/* Stats */}
        {"stats" in node && node.stats && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Statistics</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-emerald-600">
                  {Math.round((node.stats as { approvalRate: number }).approvalRate * 100)}%
                </div>
                <div className="text-xs text-gray-500">Approval Rate</div>
              </div>
              {"rfeRate" in (node.stats as Record<string, unknown>) && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-amber-600">
                    {Math.round(
                      ((node.stats as { rfeRate: number }).rfeRate || 0) * 100
                    )}%
                  </div>
                  <div className="text-xs text-gray-500">RFE Rate</div>
                </div>
              )}
              {"annualVolume" in (node.stats as Record<string, unknown>) && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-brand-700">
                    {((node.stats as { annualVolume: number }).annualVolume / 1000).toFixed(0)}k
                  </div>
                  <div className="text-xs text-gray-500">Annual Volume</div>
                </div>
              )}
            </div>
            {"source" in (node.stats as Record<string, unknown>) && (
              <p className="text-xs text-gray-400 mt-2">
                Source: {(node.stats as { source: string }).source}
              </p>
            )}
          </div>
        )}

        
        {/* Requirements */}
        {"requirements" in node && (node.requirements as string[])?.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Requirements</h3>
            <ul className="space-y-2">
              {(node.requirements as string[]).map((req, i) => (
                <li key={i} className="flex items-start gap-2 text-gray-700">
                  <svg
                    className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {req}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Forms & Filings */}
        {"filings" in node && (node.filings as Array<{form: string; name: string; fee: number | string; filed_by: string; processing?: string; note?: string}>)?.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Forms & Filings</h3>
            <div className="space-y-3">
              {(node.filings as Array<{form: string; name: string; fee: number | string; filed_by: string; processing?: string; note?: string}>).map((filing, i) => (
                <div key={i} className="bg-brand-50 border border-brand-200 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-sm font-bold text-brand-800">{filing.form}</span>
                      <p className="text-sm text-gray-700">{filing.name}</p>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {typeof filing.fee === "number"
                        ? filing.fee === 0 ? "Free" : `$${filing.fee.toLocaleString()}`
                        : `$${filing.fee}`}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="bg-white px-2 py-0.5 rounded text-gray-600">
                      Filed by: {filing.filed_by}
                    </span>
                    {filing.processing && (
                      <span className="bg-white px-2 py-0.5 rounded text-gray-600">
                        {filing.processing}
                      </span>
                    )}
                  </div>
                  {filing.note && (
                    <p className="mt-1 text-xs text-brand-700">{filing.note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TN Professions (for TN visa) */}
        {"tnProfessions" in node && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">TN-Eligible Professions (sample)</h3>
            <div className="flex flex-wrap gap-2">
              {(node.tnProfessions as string[]).map((prof, i) => (
                <span key={i} className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-xs">
                  {prof}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">See USCIS.gov for complete list of 63 professions</p>
          </div>
        )}

        {/* Evidence Categories (for O-1) */}
        {"evidenceCategories" in node && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">
              O-1A Evidence Categories (need 3 of 8)
            </h3>
            <ul className="space-y-1 text-sm text-gray-700">
              {(node.evidenceCategories as string[]).map((cat, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs">
                    {i + 1}
                  </span>
                  {cat}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

    </div>
  );
}
