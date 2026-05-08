"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Plus, ArrowUpCircle, ArrowDownCircle, Banknote, LogOut, Coins, Trash2, ChevronDown, Zap, TrendingUp, AlertTriangle, Loader2, Mail, CheckCircle2, Bell, BellOff, Clock, Calendar } from "lucide-react";
import type { TransactionType } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { useLivePrices } from "@/lib/use-live-prices";

interface TransactionRow { id: string; date: string; type: TransactionType; asset_ticker: string; quantity: number; price: number; }
interface TargetAllocation { asset_ticker: string; target_percentage: number; }

const TX_TYPES: { value: TransactionType; label: string; icon: typeof Plus; color: string }[] = [
  { value: "Buy", label: "Buy", icon: ArrowUpCircle, color: "var(--accent-green)" },
  { value: "Sell", label: "Sell", icon: ArrowDownCircle, color: "var(--accent-rose)" },
  { value: "Deposit", label: "Deposit", icon: Banknote, color: "var(--accent-blue)" },
  { value: "Withdrawal", label: "Withdrawal", icon: LogOut, color: "var(--accent-amber)" },
  { value: "Dividend", label: "Dividend", icon: Coins, color: "var(--accent-green)" },
];



function formatUSD(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n); }
function todayISO() { return new Date().toISOString().split("T")[0]; }

export default function LedgerTab({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [formType, setFormType] = useState<TransactionType>("Buy");
  const [formDate, setFormDate] = useState(todayISO());
  const [formTicker, setFormTicker] = useState("");
  const [formQty, setFormQty] = useState<number | "">("");
  const [formPrice, setFormPrice] = useState<number | "">("");
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [targets, setTargets] = useState<TargetAllocation[]>([]);
  const [dcaBudget, setDcaBudget] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
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
      supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }),
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
    for (const tx of transactions) {
      switch (tx.type) {
        case "Deposit": cash += tx.price; break;
        case "Withdrawal": cash -= tx.price; break;
        case "Dividend": cash += tx.price; break;
        case "Buy":
          if (!h[tx.asset_ticker]) h[tx.asset_ticker] = { qty: 0, totalCost: 0 };
          h[tx.asset_ticker].qty += tx.quantity;
          h[tx.asset_ticker].totalCost += tx.quantity * tx.price;
          cash -= tx.quantity * tx.price;
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
    let totalValue = holdings.cash;
    const assetValues: Record<string, number> = {};
    for (const [ticker, data] of Object.entries(holdings.assets)) {
      const val = data.qty * (livePrices[ticker] || 0);
      assetValues[ticker] = val;
      totalValue += val;
    }
    return targets.map((t) => {
      const currentValue = assetValues[t.asset_ticker] || 0;
      const currentPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
      return { ticker: t.asset_ticker, targetPct: t.target_percentage, currentPct, gap: currentPct - t.target_percentage, livePrice: livePrices[t.asset_ticker] || 0, currentValue };
    });
  }, [holdings, targets, livePrices]);

  const totalPortfolioValue = useMemo(() => {
    let v = holdings.cash;
    for (const [ticker, data] of Object.entries(holdings.assets)) v += data.qty * (livePrices[ticker] || 0);
    return v;
  }, [holdings, livePrices]);

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

  // Add transaction to Supabase
  const handleAddTransaction = async () => {
    const isCash = formType === "Deposit" || formType === "Withdrawal";
    if (!isCash && !formTicker.trim()) return;
    if (!isCash && (formQty === "" || formQty <= 0)) return;
    if (formPrice === "" || (typeof formPrice === "number" && formPrice <= 0)) return;

    const row = {
      user_id: userId,
      date: formDate,
      type: formType,
      asset_ticker: isCash ? null : formTicker.toUpperCase(),
      quantity: isCash ? null : formQty as number,
      price: formPrice as number,
    };

    const { error: err } = await supabase.from("transactions").insert([row]);
    if (err) { setError(err.message); return; }

    setFormTicker(""); setFormQty(""); setFormPrice("");
    await loadData();
  };

  const removeTransaction = async (id: string) => {
    const { error: err } = await supabase.from("transactions").delete().eq("id", id);
    if (err) { setError(err.message); return; }
    setTransactions((p) => p.filter((t) => t.id !== id));
  };

  // Save alert settings
  const saveAlertSettings = async (enabled: boolean, day: number, time: string) => {
    setAlertSaving(true);
    await supabase.from("users").update({ alert_enabled: enabled, alert_day: day, alert_time: time }).eq("id", userId);
    setAlertSaving(false);
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
    const html = `<div style="background:#0a0a0f;padding:40px 0;font-family:'Inter',system-ui,sans-serif"><div style="max-width:560px;margin:0 auto;background:#12121a;border-radius:16px;border:1px solid #1e293b;overflow:hidden"><div style="padding:32px 32px 24px;border-bottom:1px solid #1e293b;text-align:center"><div style="display:inline-block;background:rgba(52,211,153,0.1);border-radius:12px;padding:10px;margin-bottom:16px"><span style="color:#34d399;font-size:24px">📊</span></div><h1 style="color:#f0f0f5;font-size:22px;font-weight:800;margin:0 0 4px">Obsidian Portfoliyzer</h1><p style="color:#8b8ba7;font-size:13px;margin:0">Monthly DCA Action Plan</p></div><div style="padding:28px 32px"><p style="color:#c8c8d8;font-size:14px;line-height:1.6;margin:0 0 24px">Hello,<br/><br/>It is your scheduled DCA deployment day. Your predefined monthly investment budget of <strong style="color:#34d399">${formatUSD(dcaBudget)}</strong> is ready to be allocated.</p><div style="background:#0a0a0f;border-radius:12px;border:1px solid #1e293b;overflow:hidden;margin-bottom:24px"><div style="padding:12px 20px;border-bottom:1px solid #1e293b"><span style="color:#8b8ba7;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Action Plan</span></div><table style="width:100%;border-collapse:collapse">${actionLines}</table></div><div style="background:rgba(251,191,36,0.08);border-radius:10px;padding:16px 20px;margin-bottom:24px;border-left:3px solid #fbbf24"><p style="color:#fbbf24;font-size:12px;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.03em">Strategy Note</p><p style="color:#c8c8d8;font-size:13px;line-height:1.5;margin:0">${strategyNote}</p></div><div style="background:#0a0a0f;border-radius:10px;padding:16px 20px;margin-bottom:24px"><span style="color:#8b8ba7;font-size:11px;text-transform:uppercase;letter-spacing:0.05em">Portfolio Snapshot</span><p style="color:#f0f0f5;font-size:22px;font-weight:800;margin:8px 0 0">${formatUSD(totalPortfolioValue)}</p></div><p style="color:#5a5a72;font-size:12px;text-align:center;margin:0">Once executed, log in to Obsidian Portfoliyzer to record this transaction.</p></div></div></div>`;
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

  const selectedType = TX_TYPES.find((t) => t.value === formType)!;
  const isCashOp = formType === "Deposit" || formType === "Withdrawal";

  if (loading) return (
    <div className="tab-content-enter" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <Loader2 size={32} style={{ color: "var(--accent-green)", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div className="tab-content-enter" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <h2 style={{ color: "var(--text-primary)", fontSize: 24, fontWeight: 700 }}>Ledger & Action Center</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>Log transactions, view computed holdings, and deploy your monthly DCA.</p>
      </div>

      {error && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "var(--accent-rose-dim)", borderRadius: 10, color: "var(--accent-rose)", fontSize: 13 }}><AlertTriangle size={16} />{error}<button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--accent-rose)", cursor: "pointer" }}>✕</button></div>}

      {/* TRANSACTION FORM */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Log Transaction</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</label>
            <button onClick={() => setShowTypeMenu(!showTypeMenu)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--bg-secondary)", border: "1px solid var(--border-default)", borderRadius: 10, color: selectedType.color, fontSize: 14, fontWeight: 600, cursor: "pointer", minWidth: 150, fontFamily: "var(--font-sans)" }}>
              <selectedType.icon size={16} />{selectedType.label}<ChevronDown size={14} style={{ marginLeft: "auto", color: "var(--text-muted)" }} />
            </button>
            {showTypeMenu && (
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 20, background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 10, overflow: "hidden", minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                {TX_TYPES.map((t) => { const Icon = t.icon; return (
                  <button key={t.value} onClick={() => { setFormType(t.value); setShowTypeMenu(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", background: "transparent", color: t.color, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)", transition: "background 0.15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <Icon size={15} /> {t.label}
                  </button>); })}
              </div>)}
          </div>
          <div>
            <label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</label>
            <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-default)", borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none", colorScheme: "dark" }} />
          </div>
          {!isCashOp && <div><label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Ticker</label><input type="text" placeholder="VOO" value={formTicker} onChange={(e) => setFormTicker(e.target.value.toUpperCase())} style={{ width: 120 }} /></div>}
          {!isCashOp && <div><label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Quantity</label><input type="number" placeholder="0" value={formQty} min={0} step="any" onChange={(e) => setFormQty(e.target.value ? parseFloat(e.target.value) : "")} style={{ width: 110 }} /></div>}
          <div><label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{isCashOp ? "Amount ($)" : "Price ($)"}</label><input type="number" placeholder="0.00" value={formPrice} min={0} step="any" onChange={(e) => setFormPrice(e.target.value ? parseFloat(e.target.value) : "")} style={{ width: 130 }} /></div>
          <button className="btn-primary" onClick={handleAddTransaction} style={{ display: "flex", alignItems: "center", gap: 6, height: 42 }}><Plus size={16} /> Add</button>
        </div>
      </div>

      {/* TRANSACTION TABLE */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Transaction History ({transactions.length})</h3>
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {transactions.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No transactions yet. Add one above to get started.</div>
          ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>{["Date", "Type", "Asset", "Qty", "Price", "Total", ""].map((h) => (<th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>))}</tr></thead>
            <tbody>
              {transactions.map((tx) => {
                const typeInfo = TX_TYPES.find((t) => t.value === tx.type)!;
                const Icon = typeInfo.icon;
                const isCash = tx.type === "Deposit" || tx.type === "Withdrawal" || tx.type === "Dividend";
                const total = isCash ? tx.price : tx.quantity * tx.price;
                return (
                  <tr key={tx.id} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)" }}>{tx.date}</td>
                    <td style={{ padding: "10px 16px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: typeInfo.color, fontWeight: 600 }}><Icon size={14} /> {tx.type}</span></td>
                    <td style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 600 }}>{tx.asset_ticker || "—"}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{isCash ? "—" : tx.quantity}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{formatUSD(tx.price)}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{formatUSD(total)}</td>
                    <td style={{ padding: "10px 16px" }}><button onClick={() => removeTransaction(tx.id)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, borderRadius: 6 }} onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent-rose)"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}><Trash2 size={14} /></button></td>
                  </tr>);
              })}
            </tbody>
          </table>)}
        </div>
      </div>

      {/* SECTION B: CURRENT VS TARGET + DCA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 24, alignItems: "start" }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current vs Target</h3>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Portfolio: <span style={{ color: "var(--accent-green)", fontWeight: 700 }}>{formatUSD(totalPortfolioValue)}</span>{" · "}Cash: <span style={{ color: "var(--accent-blue)", fontWeight: 700 }}>{formatUSD(holdings.cash)}</span></span>
          </div>
          {targets.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No targets set. Go to &quot;The Strategy&quot; tab to define your allocation.</div>
          ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>{["Asset", "Current %", "Target %", "Gap", "Live Price", "Value"].map((h) => (<th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>))}</tr></thead>
            <tbody>{portfolioAnalysis.map((row) => {
              const gapColor = row.gap > 0 ? "var(--accent-green)" : row.gap < -2 ? "var(--accent-rose)" : "var(--accent-amber)";
              return (<tr key={row.ticker} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 600 }}>{row.ticker}</td>
                <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{row.currentPct.toFixed(1)}%</td>
                <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{row.targetPct}%</td>
                <td style={{ padding: "10px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: gapColor }}>{row.gap > 0 ? "+" : ""}{row.gap.toFixed(1)}%</td>
                <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{formatUSD(row.livePrice)}</td>
                <td style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{formatUSD(row.currentValue)}</td>
              </tr>);
            })}</tbody>
          </table>)}
        </div>

        {/* Smart DCA Card */}
        <div className="card glow-green" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-green-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}><Zap size={18} style={{ color: "var(--accent-green)" }} /></div>
            <div><h3 style={{ color: "var(--text-primary)", fontSize: 15, fontWeight: 700 }}>Smart DCA Deploy</h3><p style={{ color: "var(--text-muted)", fontSize: 11 }}>Fee-optimized recommendation</p></div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Monthly Budget</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14 }}>$</span>
              <input type="number" value={dcaBudget} min={0} step={100} onChange={(e) => setDcaBudget(parseFloat(e.target.value) || 0)} style={{ width: "100%", paddingLeft: 28 }} />
            </div>
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

              {/* Alert Schedule Settings */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 12, paddingTop: 16 }}>
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
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
