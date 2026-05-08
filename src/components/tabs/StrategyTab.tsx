"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, Trash2, Save, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface TargetRow {
  id: string;
  asset_ticker: string;
  target_percentage: number;
}

const CHART_COLORS = [
  "#34d399", "#60a5fa", "#a78bfa", "#fbbf24", "#f87171",
  "#38bdf8", "#fb923c", "#e879f9", "#2dd4bf", "#facc15",
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
      setTargets([{ id: crypto.randomUUID(), asset_ticker: "", target_percentage: 0 }]);
    } else if (data && data.length > 0) {
      setTargets(data.map((d) => ({ id: d.id, asset_ticker: d.asset_ticker, target_percentage: Number(d.target_percentage) })));
    } else {
      setTargets([{ id: crypto.randomUUID(), asset_ticker: "", target_percentage: 0 }]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTargets(); }, [loadTargets]);

  // Derived
  const totalPercentage = useMemo(() => targets.reduce((s, t) => s + (t.target_percentage || 0), 0), [targets]);
  const isValid = totalPercentage === 100 && targets.every((t) => t.asset_ticker.trim() !== "");
  const isOver = totalPercentage > 100;
  const remaining = 100 - totalPercentage;
  const barColor = isOver ? "var(--accent-rose)" : totalPercentage === 100 ? "var(--accent-green)" : "var(--accent-amber)";

  const chartData = useMemo(() => {
    const items = targets
      .filter((t) => t.target_percentage > 0 && t.asset_ticker.trim() !== "")
      .map((t) => ({ name: t.asset_ticker.toUpperCase(), value: t.target_percentage }));
    if (remaining > 0) items.push({ name: "Unallocated", value: remaining });
    return items;
  }, [targets, remaining]);

  // Handlers
  const addRow = () => { setTargets((p) => [...p, { id: crypto.randomUUID(), asset_ticker: "", target_percentage: 0 }]); setSaved(false); };
  const removeRow = (id: string) => { setTargets((p) => p.filter((t) => t.id !== id)); setSaved(false); };
  const updateRow = (id: string, field: keyof TargetRow, value: string | number) => { setTargets((p) => p.map((t) => (t.id === id ? { ...t, [field]: value } : t))); setSaved(false); };

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

  return (
    <div className="tab-content-enter">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 style={{ color: "var(--text-primary)", fontSize: 24, fontWeight: 700 }}>The Strategy</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>Define your portfolio recipe. Set a target allocation for each asset.</p>
        </div>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "var(--accent-rose-dim)", borderRadius: 10, marginBottom: 20, color: "var(--accent-rose)", fontSize: 13 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 32, alignItems: "start" }}>
        <div>
          {/* Allocation Bar */}
          <div className="card-elevated" style={{ padding: "16px 20px", marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: 500 }}>Total Allocation</span>
              <span style={{ color: barColor, fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{totalPercentage.toFixed(1)}%</span>
            </div>
            <div style={{ width: "100%", height: 6, background: "var(--bg-secondary)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(totalPercentage, 100)}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.4s ease, background 0.3s ease" }} />
            </div>
            {isOver && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, color: "var(--accent-rose)", fontSize: 12 }}><AlertCircle size={14} />Total exceeds 100% by {(totalPercentage - 100).toFixed(1)}%</div>}
            {isValid && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, color: "var(--accent-green)", fontSize: 12 }}><CheckCircle2 size={14} />Perfect allocation — ready to save</div>}
          </div>

          {/* Table */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 56px", gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Asset Ticker</span>
              <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Target %</span>
              <span />
            </div>
            {targets.map((target, index) => (
              <div key={target.id} style={{ display: "grid", gridTemplateColumns: "1fr 140px 56px", gap: 12, padding: "12px 20px", alignItems: "center", borderBottom: index < targets.length - 1 ? "1px solid var(--border-subtle)" : "none", transition: "background 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <input type="text" placeholder="e.g. VOO, BTC-USD" value={target.asset_ticker}
                  onChange={(e) => updateRow(target.id, "asset_ticker", e.target.value.toUpperCase())}
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 14, fontWeight: 500, outline: "none", width: "100%" }} />
                <div style={{ position: "relative" }}>
                  <input type="number" min={0} max={100} step={0.1} placeholder="0" value={target.target_percentage || ""}
                    onChange={(e) => updateRow(target.id, "target_percentage", parseFloat(e.target.value) || 0)}
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 12px", paddingRight: 28, color: "var(--text-primary)", fontSize: 14, fontWeight: 500, outline: "none", width: "100%" }} />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13, pointerEvents: "none" }}>%</span>
                </div>
                <button onClick={() => removeRow(target.id)} disabled={targets.length <= 1}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", color: targets.length <= 1 ? "var(--text-muted)" : "var(--accent-rose)", cursor: targets.length <= 1 ? "not-allowed" : "pointer", transition: "background 0.15s", opacity: targets.length <= 1 ? 0.3 : 1 }}
                  onMouseEnter={(e) => { if (targets.length > 1) e.currentTarget.style.background = "var(--accent-rose-dim)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, marginTop: 20, alignItems: "center" }}>
            <button className="btn-ghost" onClick={addRow} style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={16} />Add Asset</button>
            <button className="btn-primary" onClick={handleSave} disabled={!isValid || saving} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {saving ? (<><Loader2 size={16} style={{ animation: "spin 0.6s linear infinite" }} />Saving...</>) : saved ? (<><CheckCircle2 size={16} />Saved!</>) : (<><Save size={16} />Save Strategy</>)}
            </button>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>

        {/* Donut Chart */}
        <div className="card" style={{ padding: 28 }}>
          <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 20 }}>Target Allocation</h3>
          <div style={{ position: "relative", width: "100%", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={2} dataKey="value" strokeWidth={0}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.name === "Unallocated" ? UNALLOCATED_COLOR : CHART_COLORS[index % CHART_COLORS.length]} style={{ outline: "none" }} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 10, color: "var(--text-primary)", fontSize: 13 }} formatter={(value) => [`${value}%`, "Allocation"]} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: barColor, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{totalPercentage.toFixed(0)}%</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Allocated</div>
            </div>
          </div>
          <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
            {chartData.filter((d) => d.name !== "Unallocated").map((entry, index) => (
              <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: CHART_COLORS[index % CHART_COLORS.length] }} />
                <span style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 500 }}>{entry.name}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{entry.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
