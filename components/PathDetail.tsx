"use client";

import visaData from "@/data/visa-paths.json";

interface PathDetailProps {
  nodeId: string | null;
  onClose: () => void;
}

export default function PathDetail({ nodeId, onClose }: PathDetailProps) {
  if (!nodeId) return null;

  const node = visaData.nodes[nodeId as keyof typeof visaData.nodes];
  if (!node) return null;

  const categoryColors: Record<string, string> = {
    origin: "bg-gray-500",
    entry: "bg-blue-500",
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

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white shadow-2xl z-50 overflow-y-auto">
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
                  <div className="text-2xl font-bold text-blue-600">
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
                <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-sm font-bold text-blue-800">{filing.form}</span>
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
                    <p className="mt-1 text-xs text-blue-700">{filing.note}</p>
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
              Evidence Categories (need 3 of 8)
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
