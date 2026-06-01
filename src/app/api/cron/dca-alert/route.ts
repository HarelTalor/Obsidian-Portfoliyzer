import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import YahooFinance from "yahoo-finance2";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY);
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// Security: verify the request comes from Vercel Cron or an authorized source
function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  // Allow Vercel cron (no secret needed on Vercel)
  if (req.headers.get("x-vercel-cron")) return true;
  // Allow manual trigger in development
  if (process.env.NODE_ENV === "development") return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const currentHour = now.getUTCHours();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  // Find all users whose alert_day matches today and alerts are enabled
  const { data: users, error: userErr } = await supabase
    .from("users")
    .select("*")
    .eq("alert_enabled", true)
    .eq("alert_day", dayOfMonth);

  if (userErr || !users || users.length === 0) {
    return NextResponse.json({ message: "No alerts to send today", day: dayOfMonth, hour: currentHour });
  }

  // Filter by alert_time hour match and skip already-sent this month
  const eligibleUsers = users.filter((u) => {
    // Check if already sent this month
    if (u.last_alert_sent === currentMonth) return false;
    // Check if the hour matches (alert_time is "HH:MM")
    const alertHour = parseInt((u.alert_time || "09:00").split(":")[0], 10);
    return alertHour === currentHour;
  });

  if (eligibleUsers.length === 0) {
    return NextResponse.json({ message: "No alerts due this hour", day: dayOfMonth, hour: currentHour, checked: users.length });
  }

  const results: { userId: string; status: string }[] = [];

  for (const user of eligibleUsers) {
    try {
      const userId = user.id;
      const email = user.email;
      const dcaBudget = Number(user.monthly_dca_budget) || 0;

      // 1. Auto-deposit the monthly budget as a Deposit transaction
      if (dcaBudget > 0) {
        const { error: depositErr } = await supabase.from("transactions").insert([{
          user_id: userId,
          date: now.toISOString().split("T")[0],
          type: "Deposit",
          asset_ticker: null,
          quantity: null,
          price: dcaBudget,
        }]);
        if (depositErr) {
          console.error(`Failed to insert deposit for user ${userId}:`, depositErr.message);
        }
      }

      // 2. Fetch all transactions (chronological) to compute holdings + cash
      const { data: txData } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      const transactions = (txData || []).map((d) => ({
        type: d.type as string,
        asset_ticker: (d.asset_ticker || "") as string,
        quantity: Number(d.quantity) || 0,
        price: Number(d.price) || 0,
      }));

      // Compute holdings
      const assets: Record<string, { qty: number; totalCost: number }> = {};
      let cash = 0;
      for (const tx of transactions) {
        switch (tx.type) {
          case "Deposit": cash += tx.price; break;
          case "Withdrawal": cash -= tx.price; break;
          case "Dividend": cash += tx.price; break;
          case "Buy": {
            if (!assets[tx.asset_ticker]) assets[tx.asset_ticker] = { qty: 0, totalCost: 0 };
            assets[tx.asset_ticker].qty += tx.quantity;
            assets[tx.asset_ticker].totalCost += tx.quantity * tx.price;
            const cost = tx.quantity * tx.price;
            if (cash >= cost) { cash -= cost; } else { cash = 0; }
            break;
          }
          case "Sell": {
            if (assets[tx.asset_ticker]) {
              const avg = assets[tx.asset_ticker].totalCost / assets[tx.asset_ticker].qty;
              assets[tx.asset_ticker].qty -= tx.quantity;
              assets[tx.asset_ticker].totalCost = assets[tx.asset_ticker].qty * avg;
            }
            cash += tx.quantity * tx.price;
            break;
          }
        }
      }

      // 3. Fetch targets
      const { data: targetData } = await supabase
        .from("portfolio_targets")
        .select("*")
        .eq("user_id", userId);

      const targets = (targetData || []).map((d) => ({
        asset_ticker: d.asset_ticker as string,
        target_percentage: Number(d.target_percentage),
      }));

      if (targets.length === 0) {
        results.push({ userId, status: "skipped — no targets" });
        continue;
      }

      // 4. Fetch live prices
      const allTickers = new Set<string>();
      Object.keys(assets).forEach((t) => allTickers.add(t));
      targets.forEach((t) => allTickers.add(t.asset_ticker));
      const tickerList = Array.from(allTickers);

      const livePrices: Record<string, number> = {};
      await Promise.all(
        tickerList.map(async (symbol) => {
          try {
            const result = await yf.quote(symbol);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            livePrices[symbol] = (result as any).regularMarketPrice ?? 0;
          } catch {
            try {
              const result = await yf.quote(`${symbol}.TA`);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              livePrices[symbol] = (result as any).regularMarketPrice ?? 0;
            } catch {
              livePrices[symbol] = 0;
            }
          }
        })
      );

      // 5. Compute portfolio analysis
      let totalAssetValue = 0;
      const assetValues: Record<string, number> = {};
      for (const [ticker, data] of Object.entries(assets)) {
        const val = data.qty * (livePrices[ticker] || 0);
        assetValues[ticker] = val;
        totalAssetValue += val;
      }

      const portfolioAnalysis = targets.map((t) => {
        const currentValue = assetValues[t.asset_ticker] || 0;
        const currentPct = totalAssetValue > 0 ? (currentValue / totalAssetValue) * 100 : 0;
        return {
          ticker: t.asset_ticker,
          targetPct: t.target_percentage,
          currentPct,
          gap: currentPct - t.target_percentage,
          livePrice: livePrices[t.asset_ticker] || 0,
        };
      });

      // 6. Compute DCA recommendation using available cash
      const underweight = portfolioAnalysis.filter((a) => a.gap < 0).sort((a, b) => a.gap - b.gap);
      let dcaAssets: { ticker: string; gapPct: number; allocation: number; shares: number; price: number }[] = [];

      if (underweight.length > 0) {
        const top = underweight.slice(0, 2);
        const totalGap = top.reduce((s, a) => s + Math.abs(a.gap), 0);
        dcaAssets = top.map((a) => {
          const w = Math.abs(a.gap) / totalGap;
          return {
            ticker: a.ticker,
            gapPct: a.gap,
            allocation: cash * w,
            shares: a.livePrice > 0 ? (cash * w) / a.livePrice : 0,
            price: a.livePrice,
          };
        });
      }

      const totalPortfolioValue = totalAssetValue + cash;

      // 7. Build email HTML
      const actionLines = dcaAssets.map((r) =>
        `<tr><td style="padding:16px 20px;border-bottom:1px solid #1e293b"><span style="color:#34d399;font-size:18px;font-weight:800">►</span> <strong style="color:#f0f0f5;font-size:15px">BUY ${formatUSD(r.allocation)} of ${r.ticker}</strong><br/><span style="color:#8b8ba7;font-size:12px">≈ ${r.shares.toFixed(4)} shares @ ${formatUSD(r.price)} · Gap: ${r.gapPct.toFixed(1)}%</span></td></tr>`
      ).join("");

      const strategyNote = dcaAssets.length === 0
        ? "All assets are at or above target allocation. No action needed this month."
        : dcaAssets.length === 1
          ? `${dcaAssets[0].ticker} is currently the furthest from your target allocation. Concentrating your entire budget into this single asset is the most cost-effective way to close your portfolio gap.`
          : `These ${dcaAssets.length} assets are the furthest below target. Splitting across only 2 assets minimizes commission fees while efficiently closing the largest gaps.`;

      const cashNote = dcaBudget > 0
        ? `Your monthly deposit of <strong style="color:#34d399">${formatUSD(dcaBudget)}</strong> has been automatically added to your account.`
        : "";

      const html = `<div style="background:#0a0a0f;padding:40px 0;font-family:'Inter',system-ui,sans-serif"><div style="max-width:560px;margin:0 auto;background:#12121a;border-radius:16px;border:1px solid #1e293b;overflow:hidden"><div style="padding:32px 32px 24px;border-bottom:1px solid #1e293b;text-align:center"><div style="display:inline-block;background:rgba(52,211,153,0.1);border-radius:12px;padding:10px;margin-bottom:16px"><span style="color:#34d399;font-size:24px">📊</span></div><h1 style="color:#f0f0f5;font-size:22px;font-weight:800;margin:0 0 4px">Obsidian Portfoliyzer</h1><p style="color:#8b8ba7;font-size:13px;margin:0">Monthly DCA Action Plan</p></div><div style="padding:28px 32px"><p style="color:#c8c8d8;font-size:14px;line-height:1.6;margin:0 0 24px">Hello,<br/><br/>${cashNote}<br/><br/>You have <strong style="color:#34d399;font-size:18px">${formatUSD(cash)}</strong> available to deploy.</p>${dcaAssets.length > 0 ? `<div style="background:#0a0a0f;border-radius:12px;border:1px solid #1e293b;overflow:hidden;margin-bottom:24px"><div style="padding:12px 20px;border-bottom:1px solid #1e293b"><span style="color:#8b8ba7;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Here is what we recommend</span></div><table style="width:100%;border-collapse:collapse">${actionLines}</table></div>` : ""}<div style="background:rgba(251,191,36,0.08);border-radius:10px;padding:16px 20px;margin-bottom:24px;border-left:3px solid #fbbf24"><p style="color:#fbbf24;font-size:12px;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.03em">Strategy Note</p><p style="color:#c8c8d8;font-size:13px;line-height:1.5;margin:0">${strategyNote}</p></div><div style="background:#0a0a0f;border-radius:10px;padding:16px 20px;margin-bottom:24px"><span style="color:#8b8ba7;font-size:11px;text-transform:uppercase;letter-spacing:0.05em">Portfolio Snapshot</span><p style="color:#f0f0f5;font-size:22px;font-weight:800;margin:8px 0 0">${formatUSD(totalPortfolioValue)}</p></div><p style="color:#5a5a72;font-size:12px;text-align:center;margin:0">Once executed, log in to Obsidian Portfoliyzer to record your buy transactions.</p></div></div></div>`;

      // 8. Send email
      const { error: emailErr } = await resend.emails.send({
        from: "Obsidian Portfoliyzer <onboarding@resend.dev>",
        to: [email],
        subject: `Portfoliyzer: You have ${formatUSD(cash)} ready to deploy`,
        html,
      });

      results.push({ userId, status: emailErr ? `email error: ${emailErr.message}` : "sent" });

      // Mark this month as sent to prevent duplicate deposits — always set this
      // even if the email failed, since the deposit was already created.
      await supabase.from("users").update({ last_alert_sent: currentMonth }).eq("id", userId);

    } catch (err) {
      results.push({ userId: user.id, status: `error: ${err instanceof Error ? err.message : "unknown"}` });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
