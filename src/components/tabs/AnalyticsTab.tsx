"use client";

import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Wallet, Activity } from "lucide-react";

// ============================================
// Mock Data (will wire to Supabase + live prices)
// ============================================
const MOCK_TRANSACTIONS = [
  { type: "Deposit", asset_ticker: "", quantity: 0, price: 10000 },
  { type: "Buy", asset_ticker: "VOO", quantity: 10, price: 480.50 },
  { type: "Buy", asset_ticker: "QQQ", quantity: 5, price: 420.30 },
  { type: "Buy", asset_ticker: "BTC-USD", quantity: 0.02, price: 92000 },
  { type: "Deposit", asset_ticker: "", quantity: 0, price: 1000 },
  { type: "Buy", asset_ticker: "GLD", quantity: 4, price: 225.10 },
  { type: "Dividend", asset_ticker: "VOO", quantity: 0, price: 15.20 },
];

const MOCK_PRICES: Record<string, number> = {
  "VOO": 523.45, "QQQ": 478.12, "BTC-USD": 98250.00, "GLD": 238.90,
};

const MOCK_SNAPSHOTS = [
  { date: "Jan 15", value: 10000 },
  { date: "Feb 01", value: 10450 },
  { date: "Feb 15", value: 10280 },
  { date: "Mar 01", value: 11120 },
  { date: "Mar 15", value: 11580 },
  { date: "Apr 01", value: 11900 },
  { date: "Apr 15", value: 12350 },
  { date: "May 01", value: 12680 },
  { date: "May 08", value: 13100 },
];

function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

// ============================================
// Component
// ============================================
export default function AnalyticsTab() {
  // Compute holdings, PnL, ROI from transactions
  const analysis = useMemo(() => {
    const assets: Record<string, { qty: number; totalCost: number }> = {};
    let cash = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;

    for (const tx of MOCK_TRANSACTIONS) {
      switch (tx.type) {
        case "Deposit": cash += tx.price; totalDeposits += tx.price; break;
        case "Withdrawal": cash -= tx.price; totalWithdrawals += tx.price; break;
        case "Dividend": cash += tx.price; break;
        case "Buy":
          if (!assets[tx.asset_ticker]) assets[tx.asset_ticker] = { qty: 0, totalCost: 0 };
          assets[tx.asset_ticker].qty += tx.quantity;
          assets[tx.asset_ticker].totalCost += tx.quantity * tx.price;
          cash -= tx.quantity * tx.price;
          break;
        case "Sell":
          if (assets[tx.asset_ticker]) {
            const avg = assets[tx.asset_ticker].totalCost / assets[tx.asset_ticker].qty;
            assets[tx.asset_ticker].qty -= tx.quantity;
            assets[tx.asset_ticker].totalCost = assets[tx.asset_ticker].qty * avg;
          }
          cash += tx.quantity * tx.price;
          break;
      }
    }

    // Per-asset PnL
    const perAsset = Object.entries(assets).map(([ticker, data]) => {
      const livePrice = MOCK_PRICES[ticker] || 0;
      const currentValue = data.qty * livePrice;
      const pnl = currentValue - data.totalCost;
      const pnlPct = data.totalCost > 0 ? (pnl / data.totalCost) * 100 : 0;
      return { ticker, qty: data.qty, cost: data.totalCost, currentValue, pnl, pnlPct };
    });

    const totalAssetValue = perAsset.reduce((s, a) => s + a.currentValue, 0);
    const totalPortfolioValue = totalAssetValue + cash;
    const netDeposits = totalDeposits - totalWithdrawals;
    const totalPnL = totalPortfolioValue - netDeposits;
    const totalROI = netDeposits > 0 ? (totalPnL / netDeposits) * 100 : 0;

    return { perAsset, cash, totalPortfolioValue, totalPnL, totalROI, netDeposits };
  }, []);

  // Bar chart data
  const barData = analysis.perAsset.map((a) => ({
    name: a.ticker,
    pnl: parseFloat(a.pnl.toFixed(2)),
  }));

  return (
    <div className="tab-content-enter" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div>
        <h2 style={{ color: "var(--text-primary)", fontSize: 24, fontWeight: 700 }}>Analytics & Stats</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>
          Portfolio performance, PnL breakdown, and equity curve.
        </p>
      </div>

      {/* ========== SCORECARDS ========== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <ScoreCard
          icon={DollarSign} iconColor="var(--accent-green)" iconBg="var(--accent-green-dim)"
          label="Total Portfolio Value" value={formatUSD(analysis.totalPortfolioValue)}
        />
        <ScoreCard
          icon={analysis.totalPnL >= 0 ? TrendingUp : TrendingDown}
          iconColor={analysis.totalPnL >= 0 ? "var(--accent-green)" : "var(--accent-rose)"}
          iconBg={analysis.totalPnL >= 0 ? "var(--accent-green-dim)" : "var(--accent-rose-dim)"}
          label="Total Open PnL"
          value={`${formatUSD(analysis.totalPnL)}`}
          sub={`${analysis.totalROI >= 0 ? "+" : ""}${analysis.totalROI.toFixed(2)}% ROI`}
          subColor={analysis.totalROI >= 0 ? "var(--accent-green)" : "var(--accent-rose)"}
        />
        <ScoreCard
          icon={Wallet} iconColor="var(--accent-blue)" iconBg="var(--accent-blue-dim)"
          label="Cash Balance" value={formatUSD(analysis.cash)}
        />
        <ScoreCard
          icon={Activity} iconColor="var(--accent-amber)" iconBg="var(--accent-amber-dim)"
          label="Net Deposits" value={formatUSD(analysis.netDeposits)}
        />
      </div>

      {/* ========== CHARTS ROW ========== */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>

        {/* Equity Curve (Area Chart) */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 20 }}>
            Performance Over Time
          </h3>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_SNAPSHOTS}>
                <defs>
                  <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#5a5a72", fontSize: 11 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#5a5a72", fontSize: 11 }} dx={-8} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 10, color: "var(--text-primary)", fontSize: 13 }}
                  formatter={(value) => [formatUSD(value as number), "Portfolio"]}
                  labelStyle={{ color: "var(--text-muted)", fontSize: 11 }}
                />
                <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2.5} fill="url(#gradGreen)" dot={false}
                  activeDot={{ r: 6, fill: "#34d399", stroke: "#0a0a0f", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PnL Per Asset (Bar Chart) */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 20 }}>
            Profit / Loss by Asset
          </h3>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#5a5a72", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#f0f0f5", fontSize: 13, fontWeight: 600 }} width={70} />
                <Tooltip
                  contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 10, color: "var(--text-primary)", fontSize: 13 }}
                  formatter={(value) => [formatUSD(value as number), "PnL"]}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Bar dataKey="pnl" radius={[0, 6, 6, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? "#34d399" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ========== PER-ASSET TABLE ========== */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Holdings Breakdown
          </h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              {["Asset", "Qty", "Avg Cost", "Live Price", "Value", "PnL ($)", "PnL (%)"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.perAsset.map((a) => {
              const avgCost = a.qty > 0 ? a.cost / a.qty : 0;
              const pnlColor = a.pnl >= 0 ? "var(--accent-green)" : "var(--accent-rose)";
              return (
                <tr key={a.ticker} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.15s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 600 }}>{a.ticker}</td>
                  <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{a.qty.toFixed(4)}</td>
                  <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{formatUSD(avgCost)}</td>
                  <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{formatUSD(MOCK_PRICES[a.ticker] || 0)}</td>
                  <td style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{formatUSD(a.currentValue)}</td>
                  <td style={{ padding: "10px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: pnlColor }}>
                    {a.pnl >= 0 ? "+" : ""}{formatUSD(a.pnl)}
                  </td>
                  <td style={{ padding: "10px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: pnlColor }}>
                    {a.pnlPct >= 0 ? "+" : ""}{a.pnlPct.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// ScoreCard Sub-Component
// ============================================
function ScoreCard({ icon: Icon, iconColor, iconBg, label, value, sub, subColor }: {
  icon: typeof DollarSign; iconColor: string; iconBg: string;
  label: string; value: string; sub?: string; subColor?: string;
}) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={18} style={{ color: iconColor }} />
        </div>
        <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 13, fontWeight: 600, color: subColor || "var(--text-secondary)", marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
