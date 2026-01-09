import React, { useEffect, useState } from 'react';

type Pulse = {
  mcap: number;
  price: number;
  tps:  number;
};

type WhaleTradeEntry = {
  id: string;
  symbol: string;
  usdValue: number;
  solAmount: number;
  timestamp: number;
  wallet: string | null;
};

type TokenEntry = {
  symbol: string;
  totalUsd: number;
  count: number;
};

type AirdropEntry = {
  id: string;
  priorityFee: number;
  priorityFeeLevel: string;
  stage: string;
  raw: any;
};

type PulseApiResponse = {
  success: boolean;
  solana?: Pulse;
  whales?:  WhaleTradeEntry[];
  tokens?: TokenEntry[];
  airdrops?: AirdropEntry[];
  funding?: { realWallets: number };
  timestamp?:  string;
  error?: string;
};

export default function ExplorePanel(): JSX.Element {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [whales, setWhales] = useState<WhaleTradeEntry[]>([]);
  const [tokens, setTokens] = useState<TokenEntry[]>([]);
  const [airdrops, setAirdrops] = useState<AirdropEntry[]>([]);
  const [funding, setFunding] = useState<{ realWallets:  number } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

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
          setError(json.error ?? 'Unexpected response from server');
          setPulse(null);
          setWhales([]);
          setTokens([]);
          setAirdrops([]);
          setFunding(null);
        } else if (json.solana) {
          // Validate and set Solana network stats
          const mcap = Number(json.solana.mcap ??  NaN);
          const price = Number(json.solana. price ?? NaN);
          const tps = Number(json.solana.tps ?? NaN);
          
          setPulse({
            mcap:  Number.isFinite(mcap) ? mcap : 0,
            price: Number.isFinite(price) ? price : 0,
            tps: Number.isFinite(tps) ? tps : 0,
          });

          // Set whale trades (top 20 for display)
          const whalesData = Array.isArray(json.whales) ?  json.whales.slice(0, 20) : [];
          setWhales(whalesData);

          // Set top tokens
          const tokensData = Array. isArray(json.tokens) ? json.tokens :  [];
          setTokens(tokensData);

          // Set airdrops
          const airdropsData = Array.isArray(json.airdrops) ? json.airdrops. slice(0, 5) : [];
          setAirdrops(airdropsData);

          // Set funding data
          if (json.funding?. realWallets !== undefined) {
            setFunding({
              realWallets:  Number(json.funding.realWallets ?? 0),
            });
          }

          // Track last sync time
          if (json.timestamp) {
            setLastSyncTime(new Date(json.timestamp).toLocaleTimeString());
          }
        } else {
          setPulse(null);
          setWhales([]);
          setTokens([]);
          setAirdrops([]);
          setFunding(null);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setError(err.message ?? 'Fetch failed');
        setPulse(null);
        setWhales([]);
        setTokens([]);
        setAirdrops([]);
        setFunding(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    sync();
    const interval = setInterval(sync, 60000); // Sync every 60 seconds

    return () => {
      mounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  const formatMcap = (mcap:  number) => `$${(mcap / 1e9).toFixed(2)}B`;
  const formatPrice = (price:  number) => `$${price.toFixed(2)}`;
  const formatUsd = (usd: number) => `$${(usd / 1000).toFixed(1)}k`;

  if (error) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div className="text-sm text-red-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Network Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-[10px] text-white/40 uppercase">Global_MCAP</div>
          <div className="text-lg font-bold text-cyan-400">
            {loading ? 'SYNCING...' : pulse ? formatMcap(pulse. mcap) : 'N/A'}
          </div>
        </div>

        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-[10px] text-white/40 uppercase">SOL_Price</div>
          <div className="text-lg font-bold text-green-400">
            {loading ?  '—' : pulse?. price ?  formatPrice(pulse.price) : '—'}
          </div>
        </div>

        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-[10px] text-white/40 uppercase">Real_Time_TPS</div>
          <div className="text-lg font-bold text-white">
            {loading ? '—' : pulse ?  pulse.tps.toFixed(0) : '—'}
          </div>
        </div>
      </div>

      {/* Top Tokens Section */}
      {tokens.length > 0 && (
        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-xs font-semibold text-white/60 uppercase mb-3">
            Top_Trending_Tokens
          </div>
          <div className="space-y-2">
            {tokens.map((token, idx) => (
              <div key={token.symbol} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-xs">#{idx + 1}</span>
                  <span className="font-semibold text-white">{token.symbol}</span>
                  <span className="text-white/30 text-xs">({token.count} trades)</span>
                </div>
                <span className="text-amber-300">{formatUsd(token.totalUsd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Whale Trades Section */}
      {whales.length > 0 && (
        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-xs font-semibold text-white/60 uppercase mb-3">
            Whale_Trades (≥$2k)
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {whales.map((whale) => (
              <div
                key={whale.id}
                className="flex items-center justify-between text-sm p-2 bg-white/[0.01] rounded border border-white/5"
              >
                <div className="flex-1">
                  <div className="font-semibold text-white">{whale.symbol}</div>
                  <div className="text-xs text-white/40">
                    {whale.solAmount.toFixed(2)} SOL
                    {whale.wallet && ` • ${whale.wallet.slice(0, 8)}...`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-cyan-400">{formatUsd(whale.usdValue)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Airdrops Section */}
      {airdrops.length > 0 && (
        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-xs font-semibold text-white/60 uppercase mb-3">
            Active_Airdrops
          </div>
          <div className="space-y-2">
            {airdrops.map((airdrop) => (
              <div key={airdrop.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-white/70">Stage: </span>
                  <span className="ml-2 font-semibold text-white">{airdrop.stage}</span>
                </div>
                <span className="text-xs text-white/50">{airdrop.priorityFeeLevel}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Funding / Activity Section */}
      {funding && (
        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-xs font-semibold text-white/60 uppercase mb-2">
            Network_Activity
          </div>
          <div className="text-lg font-bold text-white">
            {funding.realWallets. toLocaleString()} unique wallets
          </div>
        </div>
      )}

      {/* Footer with Last Sync Time */}
      <div className="text-xs text-white/30 text-center">
        {lastSyncTime ?  `Last synced: ${lastSyncTime}` : 'Awaiting first sync...'}
      </div>
    </div>
  );
}