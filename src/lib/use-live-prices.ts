import { useState, useEffect, useCallback } from "react";

// Cache prices in memory for the session
let priceCache: Record<string, number> = {};
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useLivePrices(tickers: string[]) {
  const [prices, setPrices] = useState<Record<string, number>>(priceCache);
  const [loading, setLoading] = useState(false);

  const fetchPrices = useCallback(async () => {
    const validTickers = tickers.filter((t) => t.trim() !== "");
    if (validTickers.length === 0) return;

    // Check cache freshness
    const allCached = validTickers.every((t) => t in priceCache) && Date.now() - lastFetch < CACHE_TTL;
    if (allCached) { setPrices({ ...priceCache }); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/prices?tickers=${validTickers.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        priceCache = { ...priceCache, ...data };
        lastFetch = Date.now();
        setPrices({ ...priceCache });
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [tickers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  return { prices, loading, refetch: fetchPrices };
}
