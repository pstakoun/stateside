"use client";

import { useState } from "react";
import {
  FilterState,
  UserCase,
  CaseType,
  CaseStatus,
  caseTypeLabels,
  caseStatusLabels,
  PriorityDate,
} from "@/lib/filter-paths";
import { v4 as uuidv4 } from "uuid";

interface CaseTrackerProps {
  filters: FilterState;
  onUpdate: (newFilters: FilterState) => void;
  onClose: () => void;
}

export default function CaseTracker({ filters, onUpdate, onClose }: CaseTrackerProps) {
  const [cases, setCases] = useState<UserCase[]>(filters.userCases || []);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<UserCase>>({});

  const handleSave = () => {
    if (!formData.type || !formData.status) return;

    const newCase: UserCase = {
      id: editingCaseId || uuidv4(),
      type: formData.type as CaseType,
      status: formData.status as CaseStatus,
      filedDate: formData.filedDate,
      receiptDate: formData.receiptDate,
      approvalDate: formData.approvalDate,
      priorityDate: formData.priorityDate,
      receiptNumber: formData.receiptNumber,
      notes: formData.notes,
    };

    let newCases;
    if (editingCaseId) {
      newCases = cases.map((c) => (c.id === editingCaseId ? newCase : c));
    } else {
      newCases = [...cases, newCase];
    }

    setCases(newCases);
    onUpdate({ ...filters, userCases: newCases });
    setEditingCaseId(null);
    setIsAdding(false);
    setFormData({});
  };

  const handleDelete = (id: string) => {
    const newCases = cases.filter((c) => c.id !== id);
    setCases(newCases);
    onUpdate({ ...filters, userCases: newCases });
  };

  const startEdit = (c: UserCase) => {
    setEditingCaseId(c.id);
    setFormData(c);
    setIsAdding(false);
  };

  const startAdd = () => {
    setEditingCaseId(null);
    setFormData({ 
        type: "perm", 
        status: "preparing",
        filedDate: new Date().toISOString().split('T')[0]
    });
    setIsAdding(true);
  };

  const renderForm = () => {
    const isPermOrI140 = formData.type === "perm" || formData.type === "i140";

    return (
      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as CaseType })}
              className="w-full text-sm border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500"
            >
              {Object.entries(caseTypeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as CaseStatus })}
              className="w-full text-sm border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500"
            >
              {Object.entries(caseStatusLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Filed Date</label>
            <input
              type="date"
              value={formData.filedDate || ""}
              onChange={(e) => setFormData({ ...formData, filedDate: e.target.value })}
              className="w-full text-sm border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Approval Date</label>
            <input
              type="date"
              value={formData.approvalDate || ""}
              onChange={(e) => setFormData({ ...formData, approvalDate: e.target.value })}
              className="w-full text-sm border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>

        {isPermOrI140 && (
          <div className="bg-white p-3 rounded-lg border border-gray-200">
             <label className="block text-xs font-medium text-gray-700 mb-2">Priority Date</label>
             <div className="flex gap-2">
                <select
                    value={formData.priorityDate?.month || ""}
                    onChange={(e) => {
                        const month = parseInt(e.target.value);
                        const year = formData.priorityDate?.year || new Date().getFullYear();
                        setFormData({ ...formData, priorityDate: month ? { month, year } : undefined });
                    }}
                    className="flex-1 text-sm border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500"
                >
                    <option value="">Month</option>
                    {[...Array(12)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>
                    ))}
                </select>
                <input
                    type="number"
                    placeholder="Year"
                    value={formData.priorityDate?.year || ""}
                    onChange={(e) => {
                        const year = parseInt(e.target.value);
                        const month = formData.priorityDate?.month || 1;
                        setFormData({ ...formData, priorityDate: year ? { month, year } : undefined });
                    }}
                    className="w-24 text-sm border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500"
                />
             </div>
             <p className="text-[10px] text-gray-500 mt-1">Found on form ETA-9089 or I-797 approval</p>
          </div>
        )}

        <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Receipt Number (Optional)</label>
            <input
                type="text"
                value={formData.receiptNumber || ""}
                onChange={(e) => setFormData({ ...formData, receiptNumber: e.target.value })}
                placeholder="e.g. LIN2390123456"
                className="w-full text-sm border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500"
            />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={() => {
              setEditingCaseId(null);
              setIsAdding(false);
              setFormData({});
            }}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
          >
            Save Case
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Your Case Tracker</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-sm text-gray-500 mb-4">
            Track your immigration cases to get precise timeline estimates. Add filed or pending cases below.
          </p>

          <div className="space-y-3 mb-6">
            {cases.length === 0 && !isAdding && (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                <p className="text-gray-400 text-sm">No cases tracked yet</p>
                <button
                  onClick={startAdd}
                  className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  Add your first case
                </button>
              </div>
            )}

            {cases.map((c) => (
              <div key={c.id}>
                {editingCaseId === c.id ? (
                  renderForm()
                ) : (
                  <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow group">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{caseTypeLabels[c.type]}</span>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                            c.status === "approved"
                              ? "bg-green-100 text-green-700"
                              : c.status === "denied"
                              ? "bg-red-100 text-red-700"
                              : c.status === "withdrawn"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {caseStatusLabels[c.status]}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex gap-3">
                         {c.filedDate && <span>Filed: {new Date(c.filedDate).toLocaleDateString()}</span>}
                         {c.priorityDate && <span>PD: {c.priorityDate.month}/{c.priorityDate.year}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(c)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isAdding && renderForm()}
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
            {!isAdding && (
                <button
                onClick={startAdd}
                className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Case
                </button>
            )}
            <button
                onClick={onClose}
                className="px-4 py-2 bg-white border border-gray-300 shadow-sm text-gray-700 font-medium text-sm rounded-lg hover:bg-gray-50 ml-auto"
            >
                Done
            </button>
        </div>
      </div>
    </div>
  );
}
