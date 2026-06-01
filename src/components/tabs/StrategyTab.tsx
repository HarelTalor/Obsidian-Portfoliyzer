"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, Trash2, Save, AlertCircle, CheckCircle2, Loader2, FolderPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface TargetRow {
  id: string;
  category: string;
  asset_ticker: string;
  target_percentage: number;
}

const CATEGORY_PALETTES = [
  ["#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe"], // Blue
  ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5"], // Emerald
  ["#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe"], // Violet
  ["#f59e0b", "#fbbf24", "#fcd34d", "#fde68a", "#fef3c7"], // Amber
  ["#f43f5e", "#fb7185", "#fda4af", "#fecdd3", "#ffe4e6"], // Rose
  ["#06b6d4", "#22d3ee", "#67e8f9", "#a5f3fc", "#cffafe"], // Cyan
];

const UNALLOCATED_COLOR = "#1c1c28";

export default function StrategyTab({ userId }: { userId: string }) {
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load from Supabase on mount
  const loadTargets = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("portfolio_targets")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (err) {
      setError(err.message);
      setTargets([{ id: crypto.randomUUID(), category: "Core", asset_ticker: "", target_percentage: 0 }]);
    } else if (data && data.length > 0) {
      setTargets(data.map((d) => ({ 
        id: d.id, 
        category: d.category || "Core", 
        asset_ticker: d.asset_ticker, 
        target_percentage: Number(d.target_percentage) 
      })));
    } else {
      setTargets([{ id: crypto.randomUUID(), category: "Core", asset_ticker: "", target_percentage: 0 }]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadTargets(); }, [loadTargets]);

  // Derived
  const totalPercentage = useMemo(() => targets.reduce((s, t) => s + (t.target_percentage || 0), 0), [targets]);
  const hasDuplicates = useMemo(() => {
    const tickers = targets.map(t => t.asset_ticker.trim().toUpperCase()).filter(t => t !== "");
    return new Set(tickers).size !== tickers.length;
  }, [targets]);
  const isValid = totalPercentage === 100 && targets.every((t) => t.asset_ticker.trim() !== "") && !hasDuplicates;
  const isOver = totalPercentage > 100;
  const remaining = 100 - totalPercentage;
  const barColor = isOver ? "var(--accent-rose)" : totalPercentage === 100 ? "var(--accent-green)" : "var(--accent-amber)";

  const chartData = useMemo(() => {
    const uniqueCategories = Array.from(new Set(targets.map(t => t.category || "Uncategorized"))).sort();
    const catCounts: Record<string, number> = {};
    
    const items = targets
      .filter((t) => t.target_percentage > 0 && t.asset_ticker.trim() !== "")
      .map((t) => {
        const cat = t.category || "Uncategorized";
        const catIdx = uniqueCategories.indexOf(cat);
        const palette = CATEGORY_PALETTES[catIdx % CATEGORY_PALETTES.length];
        
        if (!catCounts[cat]) catCounts[cat] = 0;
        const color = palette[catCounts[cat] % palette.length];
        catCounts[cat]++;
        
        return { 
          name: t.asset_ticker.toUpperCase(), 
          value: t.target_percentage, 
          category: cat,
          color
        };
      });

    if (remaining > 0) items.push({ name: "Unallocated", value: remaining, category: "Unallocated", color: UNALLOCATED_COLOR });
    return items;
  }, [targets, remaining]);

  const groupedTargets = useMemo(() => {
    const groups: Record<string, TargetRow[]> = {};
    targets.forEach(t => {
      const cat = t.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return groups;
  }, [targets]);

  // Handlers
  const addRow = (category: string) => { 
    setTargets((p) => [...p, { id: crypto.randomUUID(), category, asset_ticker: "", target_percentage: 0 }]); 
    setSaved(false); 
  };
  
  const addCategory = () => {
    const newCat = `Category ${Object.keys(groupedTargets).length + 1}`;
    setTargets((p) => [...p, { id: crypto.randomUUID(), category: newCat, asset_ticker: "", target_percentage: 0 }]);
    setSaved(false);
  };

  const removeRow = (id: string) => { 
    setTargets((p) => p.filter((t) => t.id !== id)); 
    setSaved(false); 
  };

  const updateRow = (id: string, field: keyof TargetRow, value: string | number) => { 
    setTargets((p) => p.map((t) => (t.id === id ? { ...t, [field]: value } : t))); 
    setSaved(false); 
  };

  const updateCategoryName = (oldName: string, newName: string) => {
    if (oldName === newName || newName.trim() === "") return;
    setTargets((p) => p.map((t) => (t.category === oldName ? { ...t, category: newName } : t)));
    setSaved(false);
  };

  // Save to Supabase
  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);

    // Delete existing targets for this user, then insert fresh
    const { error: delErr } = await supabase.from("portfolio_targets").delete().eq("user_id", userId);
    if (delErr) { setError(delErr.message); setSaving(false); return; }

    const rows = targets.map((t) => ({
      user_id: userId,
      category: t.category,
      asset_ticker: t.asset_ticker.toUpperCase(),
      target_percentage: t.target_percentage,
    }));

    const { error: insErr } = await supabase.from("portfolio_targets").insert(rows);
    if (insErr) { setError(insErr.message); setSaving(false); return; }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadTargets(); // reload with DB-assigned IDs
  };

  if (loading) {
    return (
      <div className="tab-content-enter" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <Loader2 size={32} style={{ color: "var(--accent-green)", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Dynamic classes for the chart card UI
  const chartCardClass = `card p-6 lg:p-7 h-fit sticky top-6 transition-all duration-500 ${
    isOver ? 'border-[var(--accent-rose)] glow-rose' : isValid ? 'border-[var(--accent-green)] glow-green' : 'border-[var(--border-subtle)]'
  }`;

  return (
    <div className="tab-content-enter">
      <div className="hidden sm:flex mb-8 sm:mb-10 flex-col gap-1.5">
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/50">
          The Strategy
        </h2>
        <p className="text-[var(--text-secondary)] text-sm sm:text-base max-w-2xl">
          Define your portfolio recipe. Organize by categories and set target allocations.
        </p>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "var(--accent-rose-dim)", borderRadius: 10, marginBottom: 20, color: "var(--accent-rose)", fontSize: 13 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        
        {/* =========================================
            Donut Chart (Now First!)
            ========================================= */}
        <div className="w-full lg:w-[380px] shrink-0 z-10">
          <div className={chartCardClass}>
            <div className="flex justify-between items-center mb-5">
              <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Target Allocation</h3>
            </div>
            
            <div style={{ position: "relative", width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={90} outerRadius={130} paddingAngle={2} dataKey="value" strokeWidth={0} isAnimationActive={true}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} style={{ outline: "none", cursor: "pointer", transition: "opacity 0.2s" }} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 10, color: "var(--text-primary)", fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }} 
                    formatter={(value, name, props) => [`${value}%`, props.payload.category ? `${props.payload.category} - ${name}` : name]} 
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: barColor, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{totalPercentage.toFixed(0)}%</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Allocated</div>
              </div>
            </div>
            
            {/* Validation Badges */}
            {isOver && (
              <div className="mt-5 flex items-center justify-center gap-2 text-[var(--accent-rose)] text-xs font-semibold bg-[var(--accent-rose-dim)] py-2.5 px-4 rounded-lg animate-pulse">
                <AlertCircle size={15} /> Total exceeds 100% by {(totalPercentage - 100).toFixed(1)}%
              </div>
            )}
            {hasDuplicates && (
              <div className="mt-2 flex items-center justify-center gap-2 text-[var(--accent-rose)] text-xs font-semibold bg-[var(--accent-rose-dim)] py-2.5 px-4 rounded-lg">
                <AlertCircle size={15} /> Duplicate tickers found
              </div>
            )}

            {/* Legend */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 gap-3 max-h-[140px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
              {chartData.filter((d) => d.name !== "Unallocated").map((entry) => (
                <div key={`${entry.category}-${entry.name}`} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: entry.color, flexShrink: 0 }} />
                    <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{entry.name}</span>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] pl-4 truncate">{entry.value}% ({entry.category})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* =========================================
            Grouped Tables
            ========================================= */}
        <div className="flex-1 w-full flex flex-col gap-5">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {Object.entries(groupedTargets).map(([category, items]) => {
              const catTotal = items.reduce((s, t) => s + (t.target_percentage || 0), 0);
              const groupKey = items.length > 0 ? items[0].id : category;
              return (
                <div key={groupKey} className="card" style={{ overflow: "hidden", border: "1px solid var(--border-subtle)", transition: "transform 0.2s, box-shadow 0.2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; e.currentTarget.style.borderColor = "var(--border-default)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--border-subtle)"; }}
                >
                  {/* Category Header */}
                  <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 bg-gradient-to-r from-[var(--bg-secondary)] to-transparent border-b border-[var(--border-subtle)]">
                    <input 
                      type="text" 
                      value={category} 
                      onChange={(e) => updateCategoryName(category, e.target.value)} 
                      onBlur={(e) => updateCategoryName(category, e.target.value.trim() || "Unnamed Category")}
                      style={{ background: "transparent", border: "none", color: "var(--text-primary)", fontSize: 16, fontWeight: 700, outline: "none", width: "100%", textOverflow: "ellipsis" }}
                    />
                    <span style={{ fontSize: 14, color: "var(--text-secondary)", fontWeight: 600, paddingLeft: 12, fontVariantNumeric: "tabular-nums" }}>
                      {catTotal.toFixed(1)}%
                    </span>
                  </div>

                  {/* Rows */}
                  <div className="flex flex-col pb-2">
                    {/* Header (Hidden on Mobile) */}
                    <div className="hidden sm:flex gap-3 px-5 py-2">
                      <span className="flex-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Asset Ticker</span>
                      <span className="w-[100px] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Target %</span>
                      <span className="w-9" />
                    </div>

                    {items.map((target) => (
                      <div key={target.id} className="flex flex-row items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2 transition-colors hover:bg-white/5 border-b border-white/5 last:border-none">
                        <input 
                          type="text" 
                          placeholder="e.g. VOO" 
                          value={target.asset_ticker}
                          onChange={(e) => updateRow(target.id, "asset_ticker", e.target.value.toUpperCase())}
                          style={{ flex: 1, minWidth: 0 }}
                          className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] sm:text-sm text-[var(--text-primary)] font-medium outline-none focus:border-[var(--accent-green)] transition-all placeholder-[var(--text-muted)]" 
                        />
                        
                        <div className="relative shrink-0 w-[80px] sm:w-[100px]">
                          <input 
                            type="number" 
                            min={0} max={100} step={0.1} 
                            placeholder="0" 
                            value={target.target_percentage || ""}
                            onChange={(e) => updateRow(target.id, "target_percentage", parseFloat(e.target.value) || 0)}
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg pl-3 pr-6 sm:pr-8 py-2 text-[13px] sm:text-sm text-[var(--text-primary)] font-medium outline-none focus:border-[var(--accent-green)] transition-all placeholder-[var(--text-muted)]" 
                          />
                          <span className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-[13px] pointer-events-none">%</span>
                        </div>

                        <button 
                          onClick={() => removeRow(target.id)} 
                          disabled={targets.length <= 1}
                          className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border-none bg-transparent text-[var(--text-muted)] cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--accent-rose-dim)] hover:text-[var(--accent-rose)]"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Asset to Category */}
                  <div className="px-3 sm:px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                    <button 
                      onClick={() => addRow(category)} 
                      className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition-colors cursor-pointer bg-transparent border-none p-1"
                    >
                      <Plus size={14} /> Add asset to {category}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 mt-2 mb-8 items-center justify-between">
            <button className="btn-ghost w-full sm:w-auto flex items-center justify-center gap-2" onClick={addCategory}>
              <FolderPlus size={16} />New Category
            </button>
            <button className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2" onClick={handleSave} disabled={!isValid || saving}>
              {saving ? (<><Loader2 size={16} className="animate-spin" />Saving...</>) : saved ? (<><CheckCircle2 size={16} />Saved!</>) : (<><Save size={16} />Save Strategy</>)}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
