"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Wallet, Activity, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useLivePrices } from "@/lib/use-live-prices";
import type { TransactionType } from "@/lib/database.types";

function formatUSD(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n); }

export default function AnalyticsTab({ userId }: { userId: string }) {
  const [transactions, setTransactions] = useState<{ type: string; asset_ticker: string; quantity: number; price: number; date: string }[]>([]);
  const [snapshots, setSnapshots] = useState<{ date: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetReturns, setAssetReturns] = useState<Record<string, { return1y: number | null; cagr: number | null; pe: number | null }>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    const [txRes, snapRes] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("daily_snapshots").select("*").eq("user_id", userId).order("date"),
    ]);
    if (txRes.data) setTransactions(txRes.data.map((d) => ({ type: d.type as TransactionType, asset_ticker: d.asset_ticker || "", quantity: Number(d.quantity) || 0, price: Number(d.price) || 0, date: d.date })));
    if (snapRes.data && snapRes.data.length > 0) {
      setSnapshots(snapRes.data.map((d) => ({ date: d.date, value: Number(d.total_portfolio_value) })));
    } else {
      // Fallback mock snapshots if none in DB yet
      setSnapshots([
        { date: "Jan 15", value: 10000 }, { date: "Feb 01", value: 10450 }, { date: "Mar 01", value: 11120 },
        { date: "Apr 01", value: 11900 }, { date: "May 01", value: 12680 }, { date: "May 08", value: 13100 },
      ]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Live prices
  const allTickers = useMemo(() => {
    const s = new Set<string>();
    transactions.forEach((t) => { if (t.asset_ticker) s.add(t.asset_ticker); });
    return Array.from(s);
  }, [transactions]);
  const { prices: livePrices } = useLivePrices(allTickers);

  // Fetch historical returns
  useEffect(() => {
    if (allTickers.length === 0) return;
    fetch(`/api/returns?tickers=${allTickers.join(",")}`)
      .then((r) => r.json())
      .then((d) => setAssetReturns(d))
      .catch(() => { });
  }, [allTickers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const analysis = useMemo(() => {
    const assets: Record<string, { qty: number; totalCost: number; remainingBuys: { qty: number; cost: number; date: string }[] }> = {};
    const cashflows: { amount: number; date: string }[] = [];
    let cash = 0, totalDeposits = 0, totalWithdrawals = 0;
    
    for (const tx of transactions) {
      switch (tx.type) {
        case "Deposit": 
          cash += tx.price; 
          totalDeposits += tx.price; 
          cashflows.push({ amount: tx.price, date: tx.date });
          break;
        case "Withdrawal": 
          cash -= tx.price; 
          totalWithdrawals += tx.price; 
          cashflows.push({ amount: -tx.price, date: tx.date });
          break;
        case "Dividend": 
          cash += tx.price; 
          break;
        case "Buy":
          if (!assets[tx.asset_ticker]) assets[tx.asset_ticker] = { qty: 0, totalCost: 0, remainingBuys: [] };
          assets[tx.asset_ticker].qty += tx.quantity;
          assets[tx.asset_ticker].totalCost += tx.quantity * tx.price;
          assets[tx.asset_ticker].remainingBuys.push({ qty: tx.quantity, cost: tx.quantity * tx.price, date: tx.date });
          
          const cost = tx.quantity * tx.price;
          if (cash >= cost) {
            cash -= cost;
          } else {
            const implicitDeposit = cost - cash;
            totalDeposits += implicitDeposit;
            cashflows.push({ amount: implicitDeposit, date: tx.date });
            cash = 0;
          }
          break;
        case "Sell":
          if (assets[tx.asset_ticker]) { 
            const avg = assets[tx.asset_ticker].totalCost / assets[tx.asset_ticker].qty; 
            assets[tx.asset_ticker].qty -= tx.quantity; 
            assets[tx.asset_ticker].totalCost = assets[tx.asset_ticker].qty * avg; 
            
            let qtyToSell = tx.quantity;
            const rb = assets[tx.asset_ticker].remainingBuys;
            while (qtyToSell > 0 && rb.length > 0) {
              if (rb[0].qty <= qtyToSell) {
                qtyToSell -= rb[0].qty;
                rb.shift();
              } else {
                const ratio = qtyToSell / rb[0].qty;
                rb[0].qty -= qtyToSell;
                rb[0].cost -= rb[0].cost * ratio;
                qtyToSell = 0;
              }
            }
          }
          cash += tx.quantity * tx.price; 
          break;
      }
    }
    
    const nowMs = new Date().getTime();
    
    const perAsset = Object.entries(assets).map(([ticker, data]) => {
      const livePrice = livePrices[ticker] || 0;
      const currentValue = data.qty * livePrice;
      const pnl = currentValue - data.totalCost;
      
      let personalCagr: number | null = null;
      let weightedYears = 0;
      let activeCost = 0;
      for (const b of data.remainingBuys) {
        activeCost += b.cost;
        const yrs = (nowMs - new Date(b.date).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        weightedYears += b.cost * yrs;
      }
      if (activeCost > 0 && weightedYears > 0) {
        const avgYears = weightedYears / activeCost;
        if (avgYears > 0) {
          const yearsForCalc = Math.max(avgYears, 1); // prevent massive numbers for <1 yr holding
          personalCagr = (Math.pow(currentValue / activeCost, 1 / yearsForCalc) - 1) * 100;
        }
      }
      
      return { ticker, qty: data.qty, cost: data.totalCost, currentValue, pnl, pnlPct: data.totalCost > 0 ? (pnl / data.totalCost) * 100 : 0, livePrice, personalCagr };
    });
    
    perAsset.sort((a, b) => b.pnl - a.pnl);
    
    const totalAssetValue = perAsset.reduce((s, a) => s + a.currentValue, 0);
    const totalPortfolioValue = totalAssetValue + cash;
    const netDeposits = totalDeposits - totalWithdrawals;
    const totalPnL = totalAssetValue - (netDeposits - cash);
    
    let portfolioCagr: number | null = null;
    let pfWeightedYears = 0;
    let pfNetInvested = 0;
    for (const cf of cashflows) {
      pfNetInvested += cf.amount;
      const yrs = (nowMs - new Date(cf.date).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      pfWeightedYears += cf.amount * yrs;
    }
    if (pfNetInvested > 0 && pfWeightedYears > 0) {
      const avgYears = pfWeightedYears / pfNetInvested;
      if (avgYears > 0) {
        const yearsForCalc = Math.max(avgYears, 1); // prevent massive numbers for <1 yr holding
        portfolioCagr = (Math.pow(totalPortfolioValue / pfNetInvested, 1 / yearsForCalc) - 1) * 100;
      }
    }

    return { perAsset, cash, totalAssetValue, totalPortfolioValue, totalPnL, totalROI: netDeposits > 0 ? (totalPnL / netDeposits) * 100 : 0, netDeposits, portfolioCagr };
  }, [transactions, livePrices]);

  const barData = analysis.perAsset.map((a) => ({ name: a.ticker, pnl: parseFloat(a.pnl.toFixed(2)) }));

  if (loading) return (
    <div className="tab-content-enter" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <Loader2 size={32} style={{ color: "var(--accent-green)", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div className="tab-content-enter" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <h2 style={{ color: "var(--text-primary)", fontSize: 24, fontWeight: 700 }}>Analytics & Stats</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>Portfolio performance, PnL breakdown, and equity curve.</p>
      </div>

      {/* SCORECARDS */}
      <div className="grid-scorecards">
        <ScoreCard icon={DollarSign} iconColor="var(--accent-green)" iconBg="var(--accent-green-dim)" label="Total Portfolio Value" value={formatUSD(analysis.totalPortfolioValue)} sub={analysis.netDeposits > 0 ? `${analysis.totalROI >= 0 ? "+" : ""}${analysis.totalROI.toFixed(2)}% All Time ROI` : undefined} subColor={analysis.totalROI >= 0 ? "var(--accent-green)" : "var(--accent-rose)"} />
        <ScoreCard icon={analysis.portfolioCagr !== null && analysis.portfolioCagr >= 0 ? TrendingUp : TrendingDown} iconColor={analysis.portfolioCagr !== null && analysis.portfolioCagr >= 0 ? "var(--accent-green)" : "var(--accent-rose)"} iconBg={analysis.portfolioCagr !== null && analysis.portfolioCagr >= 0 ? "var(--accent-green-dim)" : "var(--accent-rose-dim)"} label="CAGR (Yearly)" value={analysis.portfolioCagr !== null ? `${analysis.portfolioCagr >= 0 ? "+" : ""}${analysis.portfolioCagr.toFixed(2)}%` : "—"} sub={`Open PnL: ${analysis.totalPnL >= 0 ? "+" : ""}${formatUSD(analysis.totalPnL)}`} subColor={analysis.totalPnL >= 0 ? "var(--accent-green)" : "var(--accent-rose)"} />
        <ScoreCard icon={Wallet} iconColor="var(--accent-blue)" iconBg="var(--accent-blue-dim)" label="Cash Balance" value={formatUSD(analysis.cash)} />
        <ScoreCard icon={Activity} iconColor="var(--accent-amber)" iconBg="var(--accent-amber-dim)" label="Net Deposits" value={formatUSD(analysis.netDeposits)} />
      </div>

      {/* CHARTS */}
      <div className="grid-two-col">
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 20 }}>Performance Over Time</h3>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={snapshots}>
                <defs><linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.3} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#5a5a72", fontSize: 11 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#5a5a72", fontSize: 11 }} dx={-8} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 10, color: "var(--text-primary)", fontSize: 13 }} formatter={(value) => [formatUSD(value as number), "Portfolio"]} labelStyle={{ color: "var(--text-muted)", fontSize: 11 }} />
                <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2.5} fill="url(#gradGreen)" dot={false} activeDot={{ r: 6, fill: "#34d399", stroke: "#0a0a0f", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 20 }}>Profit / Loss by Asset</h3>
          <div style={{ width: "100%", height: 340 }}>
            {barData.length === 0 ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 13 }}>No holdings yet</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#5a5a72", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#f0f0f5", fontSize: 13, fontWeight: 600 }} width={70} />
                  <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 10, color: "var(--text-primary)", fontSize: 13 }} formatter={(value) => [formatUSD(value as number), "PnL"]} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="pnl" radius={[0, 6, 6, 0]}>{barData.map((entry, i) => (<Cell key={i} fill={entry.pnl >= 0 ? "#34d399" : "#f87171"} />))}</Bar>
                </BarChart>
              </ResponsiveContainer>)}
          </div>
        </div>
      </div>

      {/* HOLDINGS TABLE */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Holdings Breakdown</h3>
        </div>
        {analysis.perAsset.length === 0 ? <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No holdings. Add Buy transactions in the Ledger tab.</div> : (
        <div className="table-scroll">
          <table className="mobile-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>{["Asset", "Qty", "Avg Cost", "PE", "Live Price", "PnL (%)", "PnL ($)", "1Y Return", "All-Time CAGR", "Pers. CAGR", "Value"].map((h) => (<th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>))}</tr></thead>
            <tbody>{analysis.perAsset.map((a) => {
              const avgCost = a.qty > 0 ? a.cost / a.qty : 0;
              const c = a.pnl >= 0 ? "var(--accent-green)" : "var(--accent-rose)";
              const ret = assetReturns[a.ticker];
              const r1y = ret?.return1y;
              const pe = ret?.pe;
              const cagrAsset = ret?.cagr;
              const cagr = a.personalCagr;
              return (<tr key={a.ticker} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <td data-label="Asset" style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 600 }}>{a.ticker}</td>
                <td data-label="Qty" style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{a.qty.toFixed(4)}</td>
                <td data-label="Avg Cost" style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{formatUSD(avgCost)}</td>
                <td data-label="PE" style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{pe !== null && pe !== undefined ? pe.toFixed(1) : "—"}</td>
                <td data-label="Live Price" style={{ padding: "10px 16px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{formatUSD(a.livePrice || 0)}</td>
                <td data-label="PnL (%)" style={{ padding: "10px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: c }}>{a.pnlPct >= 0 ? "+" : ""}{a.pnlPct.toFixed(2)}%</td>
                <td data-label="PnL ($)" style={{ padding: "10px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: c }}>{a.pnl >= 0 ? "+" : ""}{formatUSD(a.pnl)}</td>
                <td data-label="1Y Return" style={{ padding: "10px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: r1y !== null && r1y !== undefined ? (r1y >= 0 ? "var(--accent-green)" : "var(--accent-rose)") : "var(--text-muted)" }}>{r1y !== null && r1y !== undefined ? `${r1y >= 0 ? "+" : ""}${r1y.toFixed(1)}%` : "—"}</td>
                <td data-label="All-Time CAGR" style={{ padding: "10px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: cagrAsset !== null && cagrAsset !== undefined ? (cagrAsset >= 0 ? "var(--accent-green)" : "var(--accent-rose)") : "var(--text-muted)" }}>{cagrAsset !== null && cagrAsset !== undefined ? `${cagrAsset >= 0 ? "+" : ""}${cagrAsset.toFixed(1)}%/yr` : "—"}</td>
                <td data-label="Pers. CAGR" style={{ padding: "10px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: cagr !== null && cagr !== undefined ? (cagr >= 0 ? "var(--accent-green)" : "var(--accent-rose)") : "var(--text-muted)" }}>{cagr !== null && cagr !== undefined ? `${cagr >= 0 ? "+" : ""}${cagr.toFixed(1)}%/yr` : "—"}</td>
                <td data-label="Value" style={{ padding: "10px 16px", color: "var(--text-primary)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{formatUSD(a.currentValue)}</td>
              </tr>);
            })}</tbody>
          </table>
        </div>)}
      </div>
    </div>
  );
}

function ScoreCard({ icon: Icon, iconColor, iconBg, label, value, sub, subColor }: { icon: typeof DollarSign; iconColor: string; iconBg: string; label: string; value: string; sub?: string; subColor?: string; }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} style={{ color: iconColor }} /></div>
        <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, fontWeight: 600, color: subColor || "var(--text-secondary)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}
