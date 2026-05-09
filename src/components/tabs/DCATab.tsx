"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Zap, TrendingUp, AlertTriangle, Loader2, Mail, CheckCircle2, Bell, BellOff, Clock, Calendar, DollarSign, Settings, Save } from "lucide-react";
import type { TransactionType } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { useLivePrices } from "@/lib/use-live-prices";

interface TransactionRow { id: string; date: string; type: TransactionType; asset_ticker: string; quantity: number; price: number; }
interface TargetAllocation { asset_ticker: string; target_percentage: number; }

function formatUSD(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n); }

export default function DCATab({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [targets, setTargets] = useState<TargetAllocation[]>([]);
  const [dcaBudget, setDcaBudget] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [budgetSaved, setBudgetSaved] = useState(false);
  // Alert settings
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertDay, setAlertDay] = useState(1);
  const [alertTime, setAlertTime] = useState("09:00");
  const [alertSaving, setAlertSaving] = useState(false);

  // Load data from Supabase
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [txRes, targetRes, userRes] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("portfolio_targets").select("*").eq("user_id", userId),
      supabase.from("users").select("*").eq("id", userId).single(),
    ]);
    if (txRes.error) setError(txRes.error.message);
    if (txRes.data) setTransactions(txRes.data.map((d) => ({ id: d.id, date: d.date, type: d.type as TransactionType, asset_ticker: d.asset_ticker || "", quantity: Number(d.quantity) || 0, price: Number(d.price) || 0 })));
    if (targetRes.data) setTargets(targetRes.data.map((d) => ({ asset_ticker: d.asset_ticker, target_percentage: Number(d.target_percentage) })));
    if (userRes.data) {
      setDcaBudget(Number(userRes.data.monthly_dca_budget) || 1000);
      setAlertEnabled(userRes.data.alert_enabled ?? false);
      setAlertDay(userRes.data.alert_day ?? 1);
      setAlertTime(userRes.data.alert_time ?? "09:00");
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Holdings computed from transactions
  const holdings = useMemo(() => {
    const h: Record<string, { qty: number; totalCost: number }> = {};
    let cash = 0;
    const chronologicalTxs = [...transactions].reverse();
    for (const tx of chronologicalTxs) {
      switch (tx.type) {
        case "Deposit": cash += tx.price; break;
        case "Withdrawal": cash -= tx.price; break;
        case "Dividend": cash += tx.price; break;
        case "Buy":
          if (!h[tx.asset_ticker]) h[tx.asset_ticker] = { qty: 0, totalCost: 0 };
          h[tx.asset_ticker].qty += tx.quantity;
          h[tx.asset_ticker].totalCost += tx.quantity * tx.price;
          const cost = tx.quantity * tx.price;
          if (cash >= cost) {
            cash -= cost;
          } else {
            cash = 0;
          }
          break;
        case "Sell":
          if (h[tx.asset_ticker]) {
            const avg = h[tx.asset_ticker].totalCost / h[tx.asset_ticker].qty;
            h[tx.asset_ticker].qty -= tx.quantity;
            h[tx.asset_ticker].totalCost = h[tx.asset_ticker].qty * avg;
          }
          cash += tx.quantity * tx.price;
          break;
      }
    }
    return { assets: h, cash };
  }, [transactions]);

  // Live prices from Yahoo Finance
  const allTickers = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => { if (tx.asset_ticker) set.add(tx.asset_ticker); });
    targets.forEach((t) => set.add(t.asset_ticker));
    return Array.from(set);
  }, [transactions, targets]);
  const { prices: livePrices } = useLivePrices(allTickers);

  // Current vs Target
  const portfolioAnalysis = useMemo(() => {
    let totalAssetValue = 0;
    const assetValues: Record<string, number> = {};
    for (const [ticker, data] of Object.entries(holdings.assets)) {
      const val = data.qty * (livePrices[ticker] || 0);
      assetValues[ticker] = val;
      totalAssetValue += val;
    }
    return targets.map((t) => {
      const currentValue = assetValues[t.asset_ticker] || 0;
      const currentPct = totalAssetValue > 0 ? (currentValue / totalAssetValue) * 100 : 0;
      return { ticker: t.asset_ticker, targetPct: t.target_percentage, currentPct, gap: currentPct - t.target_percentage, livePrice: livePrices[t.asset_ticker] || 0, currentValue };
    });
  }, [holdings, targets, livePrices]);

  const totalAssetValue = useMemo(() => {
    let v = 0;
    for (const [ticker, data] of Object.entries(holdings.assets)) v += data.qty * (livePrices[ticker] || 0);
    return v;
  }, [holdings, livePrices]);

  const totalPortfolioValue = totalAssetValue + holdings.cash;

  // Smart DCA
  const dcaRecommendation = useMemo(() => {
    const underweight = portfolioAnalysis.filter((a) => a.gap < 0).sort((a, b) => a.gap - b.gap);
    if (underweight.length === 0) return { assets: [], message: "All assets are at or above target." };
    const top = underweight.slice(0, 2);
    const totalGap = top.reduce((s, a) => s + Math.abs(a.gap), 0);
    return {
      assets: top.map((a) => {
        const w = Math.abs(a.gap) / totalGap;
        return { ticker: a.ticker, gapPct: a.gap, allocation: dcaBudget * w, shares: a.livePrice > 0 ? (dcaBudget * w) / a.livePrice : 0, price: a.livePrice };
      }),
      message: "",
    };
  }, [portfolioAnalysis, dcaBudget]);

  // Save alert settings
  const saveAlertSettings = async (enabled: boolean, day: number, time: string) => {
    setAlertSaving(true);
    await supabase.from("users").update({ alert_enabled: enabled, alert_day: day, alert_time: time }).eq("id", userId);
    setAlertSaving(false);
  };

  // Save budget
  const saveBudget = async () => {
    await supabase.from("users").update({ monthly_dca_budget: dcaBudget }).eq("id", userId);
    setBudgetSaved(true);
    setTimeout(() => setBudgetSaved(false), 2000);
  };

  // Send DCA email via Resend
  const sendDCAEmail = async () => {
    if (dcaRecommendation.assets.length === 0) return;
    setEmailSending(true);
    const actionLines = dcaRecommendation.assets.map((r) =>
      `<tr><td style="padding:16px 20px;border-bottom:1px solid #1e293b"><span style="color:#34d399;font-size:18px;font-weight:800">►</span> <strong style="color:#f0f0f5;font-size:15px">BUY ${formatUSD(r.allocation)} of ${r.ticker}</strong><br/><span style="color:#8b8ba7;font-size:12px">≈ ${r.shares.toFixed(4)} shares @ ${formatUSD(r.price)} · Gap: ${r.gapPct.toFixed(1)}%</span></td></tr>`
    ).join("");
    const strategyNote = dcaRecommendation.assets.length === 1
      ? `${dcaRecommendation.assets[0].ticker} is currently the furthest from your target allocation. Concentrating your entire monthly budget into this single asset is the most cost-effective way to close your portfolio gap without triggering multiple transaction fees.`
      : `These ${dcaRecommendation.assets.length} assets are the furthest below target. Splitting across only 2 assets minimizes commission fees while efficiently closing the largest gaps.`;
    const html = `<div style="background:#0a0a0f;padding:40px 0;font-family:'Inter',system-ui,sans-serif"><div style="max-width:560px;margin:0 auto;background:#12121a;border-radius:16px;border:1px solid #1e293b;overflow:hidden"><div style="padding:32px 32px 24px;border-bottom:1px solid #1e293b;text-align:center"><div style="display:inline-block;background:rgba(52,211,153,0.1);border-radius:12px;padding:10px;margin-bottom:16px"><span style="color:#34d399;font-size:24px">📊</span></div><h1 style="color:#f0f0f5;font-size:22px;font-weight:800;margin:0 0 4px">Obsidian Portfoliyzer</h1><p style="color:#8b8ba7;font-size:13px;margin:0">Monthly DCA Action Plan</p></div><div style="padding:28px 32px"><p style="color:#c8c8d8;font-size:14px;line-height:1.6;margin:0 0 24px">Hello,<br/><br/>You have <strong style="color:#34d399;font-size:18px">${formatUSD(holdings.cash)}</strong> available to deploy. Your monthly budget is <strong style="color:#34d399">${formatUSD(dcaBudget)}</strong>.<br/><br/>Here is what we recommend:</p><div style="background:#0a0a0f;border-radius:12px;border:1px solid #1e293b;overflow:hidden;margin-bottom:24px"><div style="padding:12px 20px;border-bottom:1px solid #1e293b"><span style="color:#8b8ba7;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Action Plan</span></div><table style="width:100%;border-collapse:collapse">${actionLines}</table></div><div style="background:rgba(251,191,36,0.08);border-radius:10px;padding:16px 20px;margin-bottom:24px;border-left:3px solid #fbbf24"><p style="color:#fbbf24;font-size:12px;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.03em">Strategy Note</p><p style="color:#c8c8d8;font-size:13px;line-height:1.5;margin:0">${strategyNote}</p></div><div style="background:#0a0a0f;border-radius:10px;padding:16px 20px;margin-bottom:24px"><span style="color:#8b8ba7;font-size:11px;text-transform:uppercase;letter-spacing:0.05em">Portfolio Snapshot</span><p style="color:#f0f0f5;font-size:22px;font-weight:800;margin:8px 0 0">${formatUSD(totalPortfolioValue)}</p></div><p style="color:#5a5a72;font-size:12px;text-align:center;margin:0">Once executed, log in to Obsidian Portfoliyzer to record this transaction.</p></div></div></div>`;
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: userEmail, subject: "Obsidian Portfoliyzer: Your Monthly DCA Action Plan", html }),
      });
      if (res.ok) { setEmailSent(true); setTimeout(() => setEmailSent(false), 3000); }
      else { const d = await res.json(); setError(d.error || "Email failed"); }
    } catch { setError("Failed to send email"); }
    setEmailSending(false);
  };

  if (loading) return (
    <div className="tab-content-enter" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <Loader2 size={32} style={{ color: "var(--accent-green)", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div className="tab-content-enter" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <h2 style={{ color: "var(--text-primary)", fontSize: 24, fontWeight: 700 }}>Smart DCA</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>Configure your monthly investment strategy and deploy smart recommendations.</p>
      </div>

      {error && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "var(--accent-rose-dim)", borderRadius: 10, color: "var(--accent-rose)", fontSize: 13 }}><AlertTriangle size={16} />{error}<button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--accent-rose)", cursor: "pointer" }}>✕</button></div>}

      <div className="grid-two-col-dca">
        {/* Left column: Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Portfolio Snapshot */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Portfolio Snapshot</h3>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1, padding: 16, background: "var(--bg-secondary)", borderRadius: 12, borderLeft: "3px solid var(--accent-green)" }}>
                <div style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Total Value</div>
                <div style={{ color: "var(--text-primary)", fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{formatUSD(totalPortfolioValue)}</div>
              </div>
              <div style={{ flex: 1, padding: 16, background: "var(--bg-secondary)", borderRadius: 12, borderLeft: `3px solid ${holdings.cash >= 0 ? "var(--accent-blue)" : "var(--accent-rose)"}` }}>
                <div style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Cash Available</div>
                <div style={{ color: holdings.cash >= 0 ? "var(--accent-blue)" : "var(--accent-rose)", fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{formatUSD(holdings.cash)}</div>
              </div>
            </div>
          </div>

          {/* DCA Settings Box */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center" }}><Settings size={18} style={{ color: "var(--text-secondary)" }} /></div>
              <div><h3 style={{ color: "var(--text-primary)", fontSize: 15, fontWeight: 700 }}>DCA Strategy Settings</h3><p style={{ color: "var(--text-muted)", fontSize: 11 }}>Set your monthly investment</p></div>
            </div>
            
            <label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Monthly Budget ($)</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14 }}>$</span>
                <input type="number" value={dcaBudget} min={0} step={100} onChange={(e) => setDcaBudget(parseFloat(e.target.value) || 0)} style={{ width: "100%", paddingLeft: 28 }} />
              </div>
              <button 
                className="btn-primary" 
                onClick={saveBudget}
                style={{ height: 42, display: "flex", alignItems: "center", gap: 6, padding: "0 16px" }}
              >
                {budgetSaved ? <><CheckCircle2 size={16} /> Saved!</> : <><Save size={16} /> Save</>}
              </button>
            </div>

            {/* Alert Schedule Settings */}
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {alertEnabled ? <Bell size={14} style={{ color: "var(--accent-green)" }} /> : <BellOff size={14} style={{ color: "var(--text-muted)" }} />}
                  <span style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: 600 }}>Monthly Alert</span>
                </div>
                <button onClick={() => { const v = !alertEnabled; setAlertEnabled(v); saveAlertSettings(v, alertDay, alertTime); }}
                  style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", background: alertEnabled ? "var(--accent-green)" : "var(--bg-secondary)" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 3, transition: "left 0.2s", left: alertEnabled ? 23 : 3 }} />
                </button>
              </div>
              {alertEnabled && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-muted)", fontSize: 10, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}><Calendar size={10} />Day</label>
                    <select value={alertDay} onChange={(e) => { const d = parseInt(e.target.value); setAlertDay(d); saveAlertSettings(alertEnabled, d, alertTime); }}
                      style={{ width: "100%", background: "var(--bg-secondary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-sans)", outline: "none", appearance: "auto" as const }}>
                      {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-muted)", fontSize: 10, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}><Clock size={10} />Time</label>
                    <input type="time" value={alertTime} onChange={(e) => { setAlertTime(e.target.value); saveAlertSettings(alertEnabled, alertDay, e.target.value); }}
                      style={{ width: "100%", background: "var(--bg-secondary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-sans)", outline: "none", colorScheme: "dark" }} />
                  </div>
                  {alertSaving && <Loader2 size={14} style={{ color: "var(--accent-green)", animation: "spin 0.6s linear infinite", marginBottom: 10 }} />}
                </div>
              )}
              {alertEnabled && <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 8 }}>Email will be sent to <strong style={{ color: "var(--text-secondary)" }}>{userEmail}</strong> on day {alertDay} at {alertTime}</p>}
            </div>
          </div>
        </div>

        {/* Right column: Smart DCA Card */}
        <div className="card glow-green" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-green-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}><Zap size={18} style={{ color: "var(--accent-green)" }} /></div>
            <div><h3 style={{ color: "var(--text-primary)", fontSize: 15, fontWeight: 700 }}>Smart DCA Deploy</h3><p style={{ color: "var(--text-muted)", fontSize: 11 }}>Fee-optimized recommendation</p></div>
          </div>

          <div style={{ marginBottom: 20, padding: 16, background: "var(--bg-secondary)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: 600 }}>Monthly Budget:</span>
            <span style={{ color: "var(--accent-green)", fontSize: 18, fontWeight: 800 }}>{formatUSD(dcaBudget)}</span>
          </div>

          {dcaRecommendation.message ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 16, background: "var(--accent-green-dim)", borderRadius: 10 }}>
              <TrendingUp size={16} style={{ color: "var(--accent-green)" }} /><span style={{ color: "var(--accent-green)", fontSize: 13, fontWeight: 500 }}>{dcaRecommendation.message}</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "var(--accent-amber-dim)", borderRadius: 10 }}>
                <AlertTriangle size={14} style={{ color: "var(--accent-amber)" }} />
                <span style={{ color: "var(--accent-amber)", fontSize: 12, fontWeight: 500 }}>Concentrate into {dcaRecommendation.assets.length === 1 ? "1 asset" : "2 assets"} to minimize fees</span>
              </div>
              {dcaRecommendation.assets.map((rec) => (
                <div key={rec.ticker} className="card-elevated" style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ color: "var(--text-primary)", fontSize: 16, fontWeight: 700 }}>{rec.ticker}</span>
                    <span style={{ color: "var(--accent-green)", fontSize: 18, fontWeight: 800 }}>{formatUSD(rec.allocation)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)" }}>
                    <span>Gap: <span style={{ color: "var(--accent-rose)", fontWeight: 600 }}>{rec.gapPct.toFixed(1)}%</span></span>
                    <span>≈ {rec.shares.toFixed(4)} shares @ {formatUSD(rec.price)}</span>
                  </div>
                </div>
              ))}
              {/* Email DCA button */}
              <button onClick={sendDCAEmail} disabled={emailSending} className="btn-ghost" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
                {emailSending ? <Loader2 size={14} style={{ animation: "spin 0.6s linear infinite" }} /> : emailSent ? <CheckCircle2 size={14} style={{ color: "var(--accent-green)" }} /> : <Mail size={14} />}
                {emailSent ? "Email Sent!" : "Email DCA Summary"}
              </button>
            </div>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  );
}
