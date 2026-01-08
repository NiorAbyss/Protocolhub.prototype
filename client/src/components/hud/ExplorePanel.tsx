import React, { useEffect, useState } from 'react';

type SolanaStats = {
  mcap: number;
  price: number;
  tps: number;
};

type Token = {
  symbol: string;
  totalUsd: number;
  count: number;
};

type Whale = {
  id: string;
  symbol: string;
  usdValue: number;
  solAmount: number;
  timestamp?: number | string;
  wallet?: string | null;
};

type Airdrop = {
  id: string;
  priorityFee?: number;
  priorityFeeLevel?: string;
  stage?: string;
  raw?: any;
};

type Funding = {
  realWallets: number;
};

type PulseApiResponse = {
  success: boolean;
  solana?: SolanaStats;
  whales?: Whale[];
  airdrops?: Airdrop[];
  tokens?: Token[];
  funding?: Funding;
  timestamp?: string;
  error?: string;
};

const PIN_KEY = 'pinnedTokens_v1';

export default function ExplorePanel(): JSX.Element {
  const [data, setData] = useState<PulseApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [pinned, setPinned] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const sync = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/pulse', { signal: controller.signal });
        if (!res.ok) throw new Error(`Network error: ${res.status}`);
        const json = (await res.json()) as PulseApiResponse;
        if (!mounted) return;
        if (!json.success) {
          setError(json.error ?? 'Unexpected response');
          setData(null);
        } else {
          setData(json);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setError(err.message ?? 'Fetch failed');
        setData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    sync();
    const interval = setInterval(sync, 60000);

    return () => {
      mounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(pinned));
    } catch {}
  }, [pinned]);

  const togglePin = (symbol: string) => {
    setPinned((prev) => {
      const exists = prev.includes(symbol);
      if (exists) return prev.filter((s) => s !== symbol);
      if (prev.length >= 5) {
        // simple UX: alert; frontend can replace with toast
        alert('You can pin up to 5 tokens only');
        return prev;
      }
      return [symbol, ...prev];
    });
  };

  const formatMcap = (mcap: number) => `$${(mcap / 1e9).toFixed(2)}B`;

  const tokens = data?.tokens ?? [];
  const whales = data?.whales ?? [];
  const airdrops = data?.airdrops ?? [];

  const filteredTokens = tokens.filter((t) =>
    t.symbol.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-6 p-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-[10px] text-white/40 uppercase">Global_MCAP</div>
          <div className="text-lg font-bold text-cyan-400">
            {loading && !data ? 'SYNCING...' : data?.solana ? formatMcap(data.solana.mcap) : 'N/A'}
          </div>
        </div>
        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-[10px] text-white/40 uppercase">Real_Time_TPS</div>
          <div className="text-lg font-bold text-white">
            {loading && !data ? '—' : data?.solana ? Math.round(data.solana.tps).toString() : '—'}
          </div>
        </div>
        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-[10px] text-white/40 uppercase">SOL Price</div>
          <div className="text-lg font-bold text-white">
            {loading && !data ? '—' : data?.solana ? `$${data.solana.price.toFixed(2)}` : '—'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tokens (symbol)"
          className="px-3 py-2 rounded bg-white/5 border border-white/10 w-64"
        />
        <div className="flex-1">
          <div className="text-sm text-white/50">Pinned ({pinned.length}/5)</div>
          <div className="flex gap-2 mt-1">
            {pinned.length === 0 && <div className="text-xs text-white/40">No pinned tokens</div>}
            {pinned.map((sym) => (
              <button
                key={sym}
                onClick={() => togglePin(sym)}
                className="px-2 py-1 rounded bg-cyan-600/20 text-cyan-300 text-xs"
              >
                {sym} ✕
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
            <div className="flex justify-between items-center">
              <div className="text-[12px] text-white/40 uppercase">Top Tokens (Trending)</div>
            </div>
            <div className="mt-3 space-y-2">
              {(search ? filteredTokens : tokens).map((t) => (
                <div key={t.symbol} className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{t.symbol}</div>
                    <div className="text-xs text-white/50">${t.totalUsd.toFixed(2)} • {t.count} tx</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => togglePin(t.symbol)}
                      className="px-3 py-1 rounded bg-white/5 text-xs"
                    >
                      {pinned.includes(t.symbol) ? 'Unpin' : 'Pin'}
                    </button>
                  </div>
                </div>
              ))}
              {tokens.length === 0 && !loading && <div className="text-sm text-white/50">No tokens available</div>}
            </div>
          </div>

          <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
            <div className="text-[12px] text-white/40 uppercase">Whales (≥ $2k)</div>
            <div className="mt-3 space-y-2 max-h-64 overflow-auto">
              {whales.map((w) => (
                <div key={w.id} className="flex justify-between">
                  <div className="text-sm">{w.symbol} — ${w.usdValue.toFixed(2)}</div>
                  <div className="text-xs text-white/50">{w.wallet ?? '—'}</div>
                </div>
              ))}
              {whales.length === 0 && !loading && <div className="text-sm text-white/50">No whale trades</div>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
            <div className="text-[12px] text-white/40 uppercase">Airdrops</div>
            <div className="mt-3 space-y-2 max-h-48 overflow-auto">
              {airdrops.map((a) => (
                <div key={a.id} className="text-sm">
                  <div className="font-medium">{a.id}</div>
                  <div className="text-xs text-white/50">Stage: {a.stage}</div>
                </div>
              ))}
              {airdrops.length === 0 && !loading && <div className="text-sm text-white/50">No airdrops</div>}
            </div>
          </div>

          <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
            <div className="text-[12px] text-white/40 uppercase">Funding (Real Wallets)</div>
            <div className="text-lg font-bold text-white mt-2">{data?.funding?.realWallets ?? '—'}</div>
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}
    </div>
  );
}
