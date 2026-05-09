"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Plus, ArrowUpCircle, ArrowDownCircle, Banknote, LogOut, Coins, Trash2, ChevronDown, AlertTriangle, Loader2, DollarSign, Hash } from "lucide-react";
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

export default function LedgerTab({ userId }: { userId: string }) {
  const [formType, setFormType] = useState<TransactionType>("Buy");
  const [formDate, setFormDate] = useState(todayISO());
  const [formTicker, setFormTicker] = useState("");
  const [formQty, setFormQty] = useState<number | "">("");
  const [formPrice, setFormPrice] = useState<number | "">("");
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [targets, setTargets] = useState<TargetAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Buy-by-dollar toggle
  const [buyByDollar, setBuyByDollar] = useState(false);
  const [formDollarAmt, setFormDollarAmt] = useState<number | "">("");

  // Load data from Supabase
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [txRes, targetRes] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("portfolio_targets").select("*").eq("user_id", userId),
    ]);
    if (txRes.error) setError(txRes.error.message);
    if (txRes.data) setTransactions(txRes.data.map((d) => ({ id: d.id, date: d.date, type: d.type as TransactionType, asset_ticker: d.asset_ticker || "", quantity: Number(d.quantity) || 0, price: Number(d.price) || 0 })));
    if (targetRes.data) setTargets(targetRes.data.map((d) => ({ asset_ticker: d.asset_ticker, target_percentage: Number(d.target_percentage) })));
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

  // Current vs Target — percentages based on total asset value
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
      const assetData = holdings.assets[t.asset_ticker];
      const avgCost = assetData && assetData.qty > 0 ? assetData.totalCost / assetData.qty : 0;
      const targetValue = totalAssetValue * (t.target_percentage / 100);
      return { ticker: t.asset_ticker, targetPct: t.target_percentage, currentPct, gap: currentPct - t.target_percentage, livePrice: livePrices[t.asset_ticker] || 0, avgCost, currentValue, targetValue };
    });
  }, [holdings, targets, livePrices]);

  const totalAssetValue = useMemo(() => {
    let v = 0;
    for (const [ticker, data] of Object.entries(holdings.assets)) v += data.qty * (livePrices[ticker] || 0);
    return v;
  }, [holdings, livePrices]);

  // Add transaction to Supabase
  const handleAddTransaction = async () => {
    const isCash = formType === "Deposit" || formType === "Withdrawal";
    const isBuyOrSell = formType === "Buy" || formType === "Sell";

    if (!isCash && !formTicker.trim()) return;

    let finalQty: number;
    let finalPrice: number;

    if (isCash) {
      if (formPrice === "" || (typeof formPrice === "number" && formPrice <= 0)) return;
      finalQty = 0;
      finalPrice = formPrice as number;
    } else if (isBuyOrSell && buyByDollar) {
      if (formDollarAmt === "" || formDollarAmt <= 0) return;
      const lp = livePrices[formTicker.toUpperCase()] || 0;
      if (lp <= 0) { setError(`No live price for ${formTicker.toUpperCase()}. Enter quantity instead.`); return; }
      finalPrice = lp;
      finalQty = (formDollarAmt as number) / lp;
    } else {
      if (formQty === "" || formQty <= 0) return;
      if (formPrice === "" || (typeof formPrice === "number" && formPrice <= 0)) return;
      finalQty = formQty as number;
      finalPrice = formPrice as number;
    }

    const row = {
      user_id: userId,
      date: formDate,
      type: formType,
      asset_ticker: isCash ? null : formTicker.toUpperCase(),
      quantity: isCash ? null : finalQty,
      price: finalPrice,
    };

    const { error: err } = await supabase.from("transactions").insert([row]);
    if (err) { setError(err.message); return; }

    setFormTicker(""); setFormQty(""); setFormPrice(""); setFormDollarAmt("");
    await loadData();
  };

  const removeTransaction = async (id: string) => {
    const { error: err } = await supabase.from("transactions").delete().eq("id", id);
    if (err) { setError(err.message); return; }
    setTransactions((p) => p.filter((t) => t.id !== id));
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
        <h2 style={{ color: "var(--text-primary)", fontSize: 24, fontWeight: 700 }}>Ledger</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>Log transactions and view your current portfolio allocation vs targets.</p>
      </div>

      {error && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "var(--accent-rose-dim)", borderRadius: 10, color: "var(--accent-rose)", fontSize: 13 }}><AlertTriangle size={16} />{error}<button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--accent-rose)", cursor: "pointer" }}>✕</button></div>}

      {/* TRANSACTION FORM */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Log Transaction</h3>
        <div className="form-row">
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

          {/* Buy/Sell: Toggle between qty and dollar amount */}
          {!isCashOp && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 2, background: "var(--bg-secondary)", borderRadius: 8, padding: 2, border: "1px solid var(--border-subtle)" }}>
                <button onClick={() => setBuyByDollar(false)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", background: !buyByDollar ? "var(--bg-card)" : "transparent", color: !buyByDollar ? "var(--text-primary)" : "var(--text-muted)", boxShadow: !buyByDollar ? "0 1px 4px rgba(0,0,0,0.3)" : "none" }}><Hash size={11} />QTY</button>
                <button onClick={() => setBuyByDollar(true)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", background: buyByDollar ? "var(--bg-card)" : "transparent", color: buyByDollar ? "var(--text-primary)" : "var(--text-muted)", boxShadow: buyByDollar ? "0 1px 4px rgba(0,0,0,0.3)" : "none" }}><DollarSign size={11} />USD</button>
              </div>
            </div>
          )}

          {!isCashOp && !buyByDollar && <div><label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Quantity</label><input type="number" placeholder="0" value={formQty} min={0} step="any" onChange={(e) => setFormQty(e.target.value ? parseFloat(e.target.value) : "")} style={{ width: 110 }} /></div>}
          {!isCashOp && buyByDollar && <div><label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Amount ($)</label><input type="number" placeholder="1000" value={formDollarAmt} min={0} step="any" onChange={(e) => setFormDollarAmt(e.target.value ? parseFloat(e.target.value) : "")} style={{ width: 130 }} /></div>}
          {(!isCashOp && !buyByDollar || isCashOp) && <div><label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{isCashOp ? "Amount ($)" : "Price ($)"}</label><input type="number" placeholder="0.00" value={formPrice} min={0} step="any" onChange={(e) => setFormPrice(e.target.value ? parseFloat(e.target.value) : "")} style={{ width: 130 }} /></div>}
          <button className="btn-primary" onClick={handleAddTransaction} style={{ display: "flex", alignItems: "center", gap: 6, height: 42 }}><Plus size={16} /> Add</button>
        </div>
        {!isCashOp && buyByDollar && formTicker && livePrices[formTicker] ? (
          <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 8 }}>Live price: <strong style={{ color: "var(--accent-green)" }}>{formatUSD(livePrices[formTicker])}</strong>{formDollarAmt ? ` → ≈${((formDollarAmt as number) / livePrices[formTicker]).toFixed(4)} shares` : ""}</p>
        ) : null}
      </div>

      {/* TRANSACTION TABLE */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Transaction History ({transactions.length})</h3>
        </div>
        <div className="table-scroll tx-history-scroll" style={{ maxHeight: 400, overflowY: "auto" }}>
          {transactions.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No transactions yet. Add one above to get started.</div>
          ) : (
          <table className="mobile-table tx-cards" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>{["Date", "Type", "Asset", "Qty", "Price", "Total", ""].map((h) => (<th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>))}</tr></thead>
            <tbody>
              {transactions.map((tx) => {
                const typeInfo = TX_TYPES.find((t) => t.value === tx.type)!;
                const Icon = typeInfo.icon;
                const isCash = tx.type === "Deposit" || tx.type === "Withdrawal" || tx.type === "Dividend";
                const total = isCash ? tx.price : tx.quantity * tx.price;
                return (
                  <tr key={tx.id} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td data-label="Date" style={{ padding: "10px 16px", color: "var(--text-secondary)" }}>{tx.date}</td>
                    <td data-label="Type" style={{ padding: "10px 16px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: typeInfo.color, fontWeight: 600 }}><Icon size={14} /> {tx.type}</span></td>
                    <td data-label="Asset" style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 600 }} className={isCash ? "hide-on-mobile" : ""}>{tx.asset_ticker || "—"}</td>
                    <td data-label="Qty" style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }} className={isCash ? "hide-on-mobile" : ""}>{isCash ? "—" : tx.quantity}</td>
                    <td data-label="Price" style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }} className={isCash ? "hide-on-mobile" : ""}>{formatUSD(tx.price)}</td>
                    <td data-label="Total" style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{formatUSD(total)}</td>
                    <td data-label="Action" style={{ padding: "10px 16px" }}><button onClick={() => removeTransaction(tx.id)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, borderRadius: 6 }} onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent-rose)"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}><Trash2 size={14} /></button></td>
                  </tr>);
              })}
            </tbody>
          </table>)}
        </div>
      </div>

      {/* CURRENT VS TARGET */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }} className="mobile-summary-header">
          <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current vs Target</h3>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Assets: <span style={{ color: "var(--accent-green)", fontWeight: 700 }}>{formatUSD(totalAssetValue)}</span>
            {" · "}Cash: <span style={{ color: holdings.cash >= 0 ? "var(--accent-blue)" : "var(--accent-rose)", fontWeight: 700 }}>{formatUSD(holdings.cash)}</span>
          </span>
        </div>
        {holdings.cash < 0 && (
          <div style={{ padding: "10px 20px", background: "var(--accent-amber-dim)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={14} style={{ color: "var(--accent-amber)" }} />
            <span style={{ color: "var(--accent-amber)", fontSize: 12 }}>Cash is negative — add Deposit transactions to reflect the money you invested.</span>
          </div>
        )}
        {targets.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No targets set. Go to &quot;The Strategy&quot; tab to define your allocation.</div>
        ) : (
        <div className="table-scroll">
        <table className="mobile-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>{["Asset", "Current %", "Target %", "Gap", "Target $", "Value"].map((h) => (<th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>))}</tr></thead>
          <tbody>{portfolioAnalysis.map((row) => {
            const gapColor = row.gap > 0 ? "var(--accent-green)" : row.gap < -2 ? "var(--accent-rose)" : "var(--accent-amber)";
            return (<tr key={row.ticker} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <td data-label="Asset" style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 600 }}>{row.ticker}</td>
              <td data-label="Current %" style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{row.currentPct.toFixed(1)}%</td>
              <td data-label="Target %" style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{row.targetPct}%</td>
              <td data-label="Gap" style={{ padding: "10px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: gapColor }}>{row.gap > 0 ? "+" : ""}{row.gap.toFixed(1)}%</td>
              <td data-label="Target $" style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{formatUSD(row.targetValue)}</td>
              <td data-label="Value" style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{formatUSD(row.currentValue)}</td>
            </tr>);
          })}</tbody>
        </table>
        </div>)}
      </div>
    </div>
  );
}
