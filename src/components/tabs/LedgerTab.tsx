"use client";

import { useState, useMemo } from "react";
import {
  Plus, ArrowUpCircle, ArrowDownCircle, Banknote, LogOut, Coins,
  Trash2, ChevronDown, Zap, TrendingUp, AlertTriangle
} from "lucide-react";
import type { TransactionType } from "@/lib/database.types";

// ============================================
// Types
// ============================================
interface TransactionRow {
  id: string;
  date: string;
  type: TransactionType;
  asset_ticker: string;
  quantity: number;
  price: number;
}

interface TargetAllocation {
  asset_ticker: string;
  target_percentage: number;
}

// ============================================
// Constants
// ============================================
const TX_TYPES: { value: TransactionType; label: string; icon: typeof Plus; color: string }[] = [
  { value: "Buy", label: "Buy", icon: ArrowUpCircle, color: "var(--accent-green)" },
  { value: "Sell", label: "Sell", icon: ArrowDownCircle, color: "var(--accent-rose)" },
  { value: "Deposit", label: "Deposit", icon: Banknote, color: "var(--accent-blue)" },
  { value: "Withdrawal", label: "Withdrawal", icon: LogOut, color: "var(--accent-amber)" },
  { value: "Dividend", label: "Dividend", icon: Coins, color: "var(--accent-green)" },
];

const MOCK_TARGETS: TargetAllocation[] = [
  { asset_ticker: "VOO", target_percentage: 40 },
  { asset_ticker: "QQQ", target_percentage: 30 },
  { asset_ticker: "BTC-USD", target_percentage: 20 },
  { asset_ticker: "GLD", target_percentage: 10 },
];

const MOCK_PRICES: Record<string, number> = {
  "VOO": 523.45, "QQQ": 478.12, "BTC-USD": 98250.00, "GLD": 238.90,
};

// ============================================
// Helpers
// ============================================
function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// ============================================
// Component
// ============================================
export default function LedgerTab() {
  // --- Transaction Form State ---
  const [formType, setFormType] = useState<TransactionType>("Buy");
  const [formDate, setFormDate] = useState(todayISO());
  const [formTicker, setFormTicker] = useState("");
  const [formQty, setFormQty] = useState<number | "">("");
  const [formPrice, setFormPrice] = useState<number | "">("");
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  // --- Transactions (local state, will wire to Supabase) ---
  const [transactions, setTransactions] = useState<TransactionRow[]>([
    { id: "1", date: "2025-01-15", type: "Deposit", asset_ticker: "", quantity: 0, price: 10000 },
    { id: "2", date: "2025-01-16", type: "Buy", asset_ticker: "VOO", quantity: 10, price: 480.50 },
    { id: "3", date: "2025-01-16", type: "Buy", asset_ticker: "QQQ", quantity: 5, price: 420.30 },
    { id: "4", date: "2025-02-01", type: "Buy", asset_ticker: "BTC-USD", quantity: 0.02, price: 92000 },
    { id: "5", date: "2025-03-01", type: "Deposit", asset_ticker: "", quantity: 0, price: 1000 },
    { id: "6", date: "2025-03-02", type: "Buy", asset_ticker: "GLD", quantity: 4, price: 225.10 },
    { id: "7", date: "2025-04-01", type: "Dividend", asset_ticker: "VOO", quantity: 0, price: 15.20 },
  ]);

  // --- DCA Budget ---
  const [dcaBudget, setDcaBudget] = useState(1000);

  // ============================================
  // Computed: Holdings from Transactions
  // ============================================
  const holdings = useMemo(() => {
    const h: Record<string, { qty: number; totalCost: number }> = {};
    let cash = 0;

    for (const tx of transactions) {
      switch (tx.type) {
        case "Deposit":
          cash += tx.price;
          break;
        case "Withdrawal":
          cash -= tx.price;
          break;
        case "Dividend":
          cash += tx.price;
          break;
        case "Buy":
          if (!h[tx.asset_ticker]) h[tx.asset_ticker] = { qty: 0, totalCost: 0 };
          h[tx.asset_ticker].qty += tx.quantity;
          h[tx.asset_ticker].totalCost += tx.quantity * tx.price;
          cash -= tx.quantity * tx.price;
          break;
        case "Sell":
          if (h[tx.asset_ticker]) {
            const avgCost = h[tx.asset_ticker].totalCost / h[tx.asset_ticker].qty;
            h[tx.asset_ticker].qty -= tx.quantity;
            h[tx.asset_ticker].totalCost = h[tx.asset_ticker].qty * avgCost;
          }
          cash += tx.quantity * tx.price;
          break;
      }
    }
    return { assets: h, cash };
  }, [transactions]);

  // ============================================
  // Computed: Current vs Target Table
  // ============================================
  const portfolioAnalysis = useMemo(() => {
    let totalValue = holdings.cash;
    const assetValues: Record<string, number> = {};

    for (const [ticker, data] of Object.entries(holdings.assets)) {
      const price = MOCK_PRICES[ticker] || 0;
      const val = data.qty * price;
      assetValues[ticker] = val;
      totalValue += val;
    }

    return MOCK_TARGETS.map((target) => {
      const currentValue = assetValues[target.asset_ticker] || 0;
      const currentPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
      const gap = currentPct - target.target_percentage;
      const livePrice = MOCK_PRICES[target.asset_ticker] || 0;
      return {
        ticker: target.asset_ticker,
        targetPct: target.target_percentage,
        currentPct,
        gap,
        livePrice,
        currentValue,
      };
    });
  }, [holdings]);

  const totalPortfolioValue = useMemo(() => {
    let v = holdings.cash;
    for (const [ticker, data] of Object.entries(holdings.assets)) {
      v += data.qty * (MOCK_PRICES[ticker] || 0);
    }
    return v;
  }, [holdings]);

  // ============================================
  // Computed: Smart DCA Recommendation
  // ============================================
  const dcaRecommendation = useMemo(() => {
    const underweight = portfolioAnalysis
      .filter((a) => a.gap < 0)
      .sort((a, b) => a.gap - b.gap); // most negative gap first

    if (underweight.length === 0) {
      return { assets: [], message: "All assets are at or above target. No action needed." };
    }

    // Allocate entire budget to the top 1 (or max 2) most starving
    const top = underweight.slice(0, Math.min(2, underweight.length));
    const totalGap = top.reduce((s, a) => s + Math.abs(a.gap), 0);

    const recs = top.map((a) => {
      const weight = Math.abs(a.gap) / totalGap;
      const allocation = dcaBudget * weight;
      const shares = a.livePrice > 0 ? allocation / a.livePrice : 0;
      return {
        ticker: a.ticker,
        gapPct: a.gap,
        allocation,
        shares,
        price: a.livePrice,
      };
    });

    return { assets: recs, message: "" };
  }, [portfolioAnalysis, dcaBudget]);

  // ============================================
  // Add Transaction
  // ============================================
  const handleAddTransaction = () => {
    const isCashOp = formType === "Deposit" || formType === "Withdrawal";
    if (!isCashOp && !formTicker.trim()) return;
    if (!isCashOp && (formQty === "" || formQty <= 0)) return;
    if (formPrice === "" || (typeof formPrice === "number" && formPrice <= 0)) return;

    const newTx: TransactionRow = {
      id: crypto.randomUUID(),
      date: formDate,
      type: formType,
      asset_ticker: isCashOp ? "" : formTicker.toUpperCase(),
      quantity: isCashOp ? 0 : (formQty as number),
      price: formPrice as number,
    };

    setTransactions((prev) => [newTx, ...prev]);
    setFormTicker("");
    setFormQty("");
    setFormPrice("");
  };

  const removeTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const selectedType = TX_TYPES.find((t) => t.value === formType)!;
  const isCashOp = formType === "Deposit" || formType === "Withdrawal";

  return (
    <div className="tab-content-enter" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* ========== HEADER ========== */}
      <div>
        <h2 style={{ color: "var(--text-primary)", fontSize: 24, fontWeight: 700 }}>
          Ledger & Action Center
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>
          Log transactions, view computed holdings, and deploy your monthly DCA.
        </p>
      </div>

      {/* ========== SECTION A: TRANSACTION FORM ========== */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>
          Log Transaction
        </h3>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          {/* Type Selector */}
          <div style={{ position: "relative" }}>
            <label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</label>
            <button
              onClick={() => setShowTypeMenu(!showTypeMenu)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                background: "var(--bg-secondary)", border: "1px solid var(--border-default)",
                borderRadius: 10, color: selectedType.color, fontSize: 14, fontWeight: 600,
                cursor: "pointer", minWidth: 150, fontFamily: "var(--font-sans)",
              }}
            >
              <selectedType.icon size={16} />
              {selectedType.label}
              <ChevronDown size={14} style={{ marginLeft: "auto", color: "var(--text-muted)" }} />
            </button>
            {showTypeMenu && (
              <div style={{
                position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 20,
                background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
                borderRadius: 10, overflow: "hidden", minWidth: 180,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}>
                {TX_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      onClick={() => { setFormType(t.value); setShowTypeMenu(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, width: "100%",
                        padding: "10px 14px", border: "none", background: "transparent",
                        color: t.color, fontSize: 13, fontWeight: 500, cursor: "pointer",
                        fontFamily: "var(--font-sans)", transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <Icon size={15} /> {t.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</label>
            <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-default)", borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none", colorScheme: "dark" }}
            />
          </div>

          {/* Ticker (hidden for cash ops) */}
          {!isCashOp && (
            <div>
              <label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Ticker</label>
              <input type="text" placeholder="VOO" value={formTicker}
                onChange={(e) => setFormTicker(e.target.value.toUpperCase())}
                style={{ width: 120 }}
              />
            </div>
          )}

          {/* Quantity (hidden for cash ops) */}
          {!isCashOp && (
            <div>
              <label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Quantity</label>
              <input type="number" placeholder="0" value={formQty} min={0} step="any"
                onChange={(e) => setFormQty(e.target.value ? parseFloat(e.target.value) : "")}
                style={{ width: 110 }}
              />
            </div>
          )}

          {/* Price / Amount */}
          <div>
            <label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {isCashOp ? "Amount ($)" : "Price ($)"}
            </label>
            <input type="number" placeholder="0.00" value={formPrice} min={0} step="any"
              onChange={(e) => setFormPrice(e.target.value ? parseFloat(e.target.value) : "")}
              style={{ width: 130 }}
            />
          </div>

          {/* Add Button */}
          <button className="btn-primary" onClick={handleAddTransaction}
            style={{ display: "flex", alignItems: "center", gap: 6, height: 42 }}>
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {/* ========== TRANSACTION TABLE ========== */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Transaction History
          </h3>
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {["Date", "Type", "Asset", "Qty", "Price", "Total", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const typeInfo = TX_TYPES.find((t) => t.value === tx.type)!;
                const Icon = typeInfo.icon;
                const isCash = tx.type === "Deposit" || tx.type === "Withdrawal" || tx.type === "Dividend";
                const total = isCash ? tx.price : tx.quantity * tx.price;
                return (
                  <tr key={tx.id} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)" }}>{tx.date}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: typeInfo.color, fontWeight: 600 }}>
                        <Icon size={14} /> {tx.type}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 600 }}>{tx.asset_ticker || "—"}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{isCash ? "—" : tx.quantity}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{formatUSD(tx.price)}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{formatUSD(total)}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <button onClick={() => removeTransaction(tx.id)}
                        style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, borderRadius: 6, transition: "color 0.15s" }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent-rose)"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========== SECTION B: CURRENT VS TARGET + DCA ========== */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 24, alignItems: "start" }}>
        {/* Current vs Target Table */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Current vs Target
            </h3>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
              Portfolio: <span style={{ color: "var(--accent-green)", fontWeight: 700 }}>{formatUSD(totalPortfolioValue)}</span>
              {" · "}Cash: <span style={{ color: "var(--accent-blue)", fontWeight: 700 }}>{formatUSD(holdings.cash)}</span>
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {["Asset", "Current %", "Target %", "Gap", "Live Price", "Value"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolioAnalysis.map((row) => {
                const gapColor = row.gap > 0 ? "var(--accent-green)" : row.gap < -2 ? "var(--accent-rose)" : "var(--accent-amber)";
                return (
                  <tr key={row.ticker} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 600 }}>{row.ticker}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{row.currentPct.toFixed(1)}%</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{row.targetPct}%</td>
                    <td style={{ padding: "10px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: gapColor }}>
                      {row.gap > 0 ? "+" : ""}{row.gap.toFixed(1)}%
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{formatUSD(row.livePrice)}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{formatUSD(row.currentValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Smart DCA Card */}
        <div className="card glow-green" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-green-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={18} style={{ color: "var(--accent-green)" }} />
            </div>
            <div>
              <h3 style={{ color: "var(--text-primary)", fontSize: 15, fontWeight: 700 }}>Smart DCA Deploy</h3>
              <p style={{ color: "var(--text-muted)", fontSize: 11 }}>Fee-optimized recommendation</p>
            </div>
          </div>

          {/* Budget Input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Monthly Budget
            </label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14 }}>$</span>
              <input type="number" value={dcaBudget} min={0} step={100}
                onChange={(e) => setDcaBudget(parseFloat(e.target.value) || 0)}
                style={{ width: "100%", paddingLeft: 28 }}
              />
            </div>
          </div>

          {/* Recommendation */}
          {dcaRecommendation.message ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 16, background: "var(--accent-green-dim)", borderRadius: 10 }}>
              <TrendingUp size={16} style={{ color: "var(--accent-green)" }} />
              <span style={{ color: "var(--accent-green)", fontSize: 13, fontWeight: 500 }}>{dcaRecommendation.message}</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "var(--accent-amber-dim)", borderRadius: 10 }}>
                <AlertTriangle size={14} style={{ color: "var(--accent-amber)" }} />
                <span style={{ color: "var(--accent-amber)", fontSize: 12, fontWeight: 500 }}>
                  Concentrate into {dcaRecommendation.assets.length === 1 ? "1 asset" : "2 assets"} to minimize fees
                </span>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
