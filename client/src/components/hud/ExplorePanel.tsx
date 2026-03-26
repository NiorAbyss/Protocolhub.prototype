// client/src/components/panels/ExplorePanel.tsx
// Tabs: MARKET · DEX PAIRS · YIELDS · NEWS
// APIs: CoinGecko (CG_API_) · DexScreener (free) · DeFiLlama (free)
//       CryptoPanic (CRYPTOPANIC_API) · RSS: Decrypt · Cointelegraph · CoinDesk · TheBlock
// Server cache: market 60s · pairs 60s · yields 5min · news 10min

import { useState, useEffect, useCallback, useRef } from 'react';
import AiScoreBadge from '../../aiscorebadge';
import { scoreFromCoinGecko, scoreFromDexScreener } from '../../aiscoring';
import ComingSoon from '../shared/ComingSoon';

/* ─── FONTS ──────────────────────────────────────────────────────────────── */
if (typeof document !== 'undefined' && !document.getElementById('explore-kf')) {
  const s = document.createElement('style');
  s.id = 'explore-kf';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Bebas+Neue&display=swap');
    @keyframes exploreSpin  { to { transform: rotate(360deg); } }
    @keyframes livePulseEx  { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
    @keyframes rowPopEx     { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:translateX(0); } }
  `;
  document.head.appendChild(s);
}

/* ─── DESIGN TOKENS ──────────────────────────────────────────────────────── */
const FM = '"IBM Plex Mono","Courier New",monospace';
const FH = '"Bebas Neue","Impact",sans-serif';

const C = {
  border:    'rgba(0,180,255,0.10)',
  borderHi:  'rgba(0,180,255,0.25)',
  cyan:      '#00b4ff',
  cyanDim:   'rgba(0,180,255,0.45)',
  cyanFaint: 'rgba(0,180,255,0.07)',
  silver:    'rgba(180,200,220,0.60)',
  silverDim: 'rgba(180,200,220,0.25)',
  green:     '#00ff88',
  red:       '#ff3355',
  yellow:    '#ffdd00',
  orange:    '#ffaa00',
  purple:    '#9966ff',
  btcOrange: '#f7931a',
  ethBlue:   '#627eea',
  solPurple: '#9945ff',
  text:      'rgba(200,220,240,0.85)',
  dim:       'rgba(150,180,210,0.40)',
} as const;

/* ─── IN-MODULE CACHE ────────────────────────────────────────────────────── */
interface CacheEntry<T> { data: T; expiresAt: number; }
const _cache = new Map<string, CacheEntry<unknown>>();

async function cachedFetch<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<T> {
  const hit = _cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() < hit.expiresAt) return hit.data;
  const data = await fetcher();
  _cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1_000 });
  return data;
}

const TTL = {
  MARKET:  60,        //  1 min  — gainers/losers
  PAIRS:   60,        //  1 min  — dex pairs
  YIELDS:  5 * 60,    //  5 min  — defi llama pools
  NEWS:    10 * 60,   // 10 min  — news feed
} as const;

/* ─── TYPES ──────────────────────────────────────────────────────────────── */
type TabId      = 'market' | 'pairs' | 'yields' | 'news' | 'narrative' | 'alpha' | 'smartmoney' | 'sniper' | 'hubai';
type MarketMode = 'gainers' | 'losers' | 'volume';
type NewsTag    = 'ALL' | 'SOLANA' | 'DEFI' | 'MARKET' | 'WEB3';

interface Coin  { id: string; symbol: string; name: string; image: string; price: number; priceChange24h: number; marketCap: number; volume24h: number; high24h: number; low24h: number; rank: number; }
interface Pair  { pairAddress: string; baseSymbol: string; baseName: string; baseAddress: string; quoteSymbol: string; priceUsd: number; priceChange24h: number; liquidityUsd: number; volume24h: number; buys24h: number; sells24h: number; chainId: string; dexId: string; fdv: number; createdAt: number; }
interface Pool  { pool: string; project: string; symbol: string; chain: string; apy: number; apyBase: number; apyReward: number | null; tvlUsd: number; ilRisk: string; il7d: number | null; exposure: string; }
interface NewsItem { id: number; title: string; source: string; snippet: string; tag: string; time: string; votes?: { positive: number; negative: number; }; }

/* ─── UTILS ──────────────────────────────────────────────────────────────── */
function fmtBig(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtPrice(n: number): string {
  if (!n)          return '—';
  if (n < 0.00001) return n.toExponential(2);
  if (n < 0.001)   return n.toFixed(6);
  if (n < 1)       return n.toFixed(4);
  if (n < 1000)    return n.toFixed(2);
  return fmtBig(n);
}

function chgColor(v: number): string { return v >= 0 ? C.green : C.red; }
function chgSign(v: number): string  { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }

function apyColor(apy: number): string {
  if (apy >= 30) return C.green;
  if (apy >= 10) return C.cyan;
  if (apy >= 5)  return C.yellow;
  return C.silver;
}

function chainColor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'solana') return C.solPurple;
  if (c.includes('eth') || c === 'ethereum') return C.ethBlue;
  if (c === 'bsc')    return C.btcOrange;
  return C.cyan;
}

const TAG_COLOR: Record<NewsTag, string> = {
  ALL:    C.cyan,
  SOLANA: C.solPurple,
  DEFI:   C.green,
  MARKET: C.orange,
  WEB3:   C.purple,
};

/* ─── SHARED ATOMS ───────────────────────────────────────────────────────── */
function ScrollArea({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
      {children}
    </div>
  );
}

function Loader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <div style={{ width: 16, height: 16, border: `1px solid ${C.cyanFaint}`, borderTop: `1px solid ${C.cyan}`, borderRadius: '50%', animation: 'exploreSpin 0.8s linear infinite' }} />
    </div>
  );
}

function RefreshBadge({ ms, every }: { ms: number; every: number }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec(ms > 0 ? Math.floor((Date.now() - ms) / 1000) : 0), 1000);
    return () => clearInterval(t);
  }, [ms]);
  return <span style={{ fontSize: 8, color: C.dim, fontFamily: FM, letterSpacing: 1 }}>↻ {sec}s · /{every}s</span>;
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '6px 10px', color: C.text, fontSize: 10, fontFamily: FM, outline: 'none', boxSizing: 'border-box' }}
    />
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color, border: `1px solid ${color}44`, borderRadius: 3, padding: '2px 6px', background: `${color}0d`, fontFamily: FM, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 1 — MARKET
   CoinGecko top 250 via CG_API_ · Gainers / Losers / Volume modes
   Infinite scroll with pagination
   ═══════════════════════════════════════════════════════════════════════════ */
function MarketTab() {
  const [mode,    setMode]    = useState<MarketMode>('gainers');
  const [coins,   setCoins]   = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q,       setQ]       = useState('');
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total,   setTotal]   = useState(0);
  const [lastMs,  setLastMs]  = useState(0);
  const LIMIT = 20;

  const load = useCallback(async (m: MarketMode, p: number, q: string, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res  = await fetch(`/api/explore/gainers?page=${p}&limit=${LIMIT}&mode=${m}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (append) setCoins(prev => [...prev, ...data.items]);
      else setCoins(data.items);
      setHasMore(data.hasMore);
      setTotal(data.total);
      setPage(p);
      setLastMs(Date.now());
    } catch {}
    finally { setLoading(false); setLoadingMore(false); }
  }, []);

  // Reload on mode/query change
  useEffect(() => { load(mode, 1, q); }, [mode, q]);

  // Poll
  useEffect(() => {
    const t = setInterval(() => load(mode, 1, q), TTL.MARKET * 1_000);
    return () => clearInterval(t);
  }, [mode, q, load]);

  const MODES: { id: MarketMode; label: string; }[] = [
    { id: 'gainers', label: '▲ GAINERS' },
    { id: 'losers',  label: '▼ LOSERS'  },
    { id: 'volume',  label: '⬡ VOLUME'  },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>

      {/* ── Controls ── */}
      <div style={{ padding: '8px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{ padding: '4px 12px', borderRadius: 3, border: `1px solid ${mode === m.id ? C.cyan : C.border}`, background: mode === m.id ? C.cyanFaint : 'transparent', color: mode === m.id ? C.cyan : C.dim, fontSize: 9, cursor: 'pointer', fontFamily: FM, letterSpacing: 1 }}>
              {m.label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <RefreshBadge ms={lastMs} every={TTL.MARKET} />
          </div>
        </div>
        <SearchBar value={q} onChange={setQ} placeholder="Search by name or symbol..." />
      </div>

      {/* ── Column headers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 90px 80px auto', gap: 6, padding: '4px 4px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 540 }}>
        {['#', 'NAME', 'PRICE', '24H', 'MCap', 'VOL', 'AI'].map(h => (
          <div key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>{h}</div>
        ))}
      </div>

      {/* ── Coins list ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {loading && <Loader />}
        {!loading && coins.map((coin, i) => (
          <div key={coin.id}
            style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 90px 80px auto', gap: 6, padding: '7px 4px', borderBottom: `1px solid rgba(255,255,255,0.03)`, alignItems: 'center', animation: `rowPopEx 0.2s ease ${Math.min(i, 10) * 0.02}s both`, minWidth: 540 }}>

            {/* Rank */}
            <span style={{ fontSize: 8, color: C.dim, textAlign: 'right' }}>{coin.rank}</span>

            {/* Name */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{coin.name}</div>
              <div style={{ fontSize: 8, color: C.dim }}>{coin.symbol}</div>
            </div>

            {/* Price */}
            <span style={{ fontSize: 10, color: C.silver, textAlign: 'right' }}>${fmtPrice(coin.price)}</span>

            {/* 24h change */}
            <span style={{ fontSize: 10, fontWeight: 700, color: chgColor(coin.priceChange24h), textAlign: 'right' }}>{chgSign(coin.priceChange24h)}</span>

            {/* MCap */}
            <span style={{ fontSize: 9, color: C.dim, textAlign: 'right' }}>${fmtBig(coin.marketCap)}</span>

            {/* Volume */}
            <span style={{ fontSize: 9, color: C.dim, textAlign: 'right' }}>${fmtBig(coin.volume24h)}</span>

            {/* AI */}
            <AiScoreBadge score={scoreFromCoinGecko(coin)} compact />
          </div>
        ))}

        {/* Load more */}
        {hasMore && !loading && (
          <button onClick={() => load(mode, page + 1, q, true)} disabled={loadingMore}
            style={{ width: '100%', padding: '8px', border: `1px solid ${C.border}`, borderRadius: 0, background: C.cyanFaint, color: C.cyan, fontSize: 9, cursor: 'pointer', fontFamily: FM, letterSpacing: 2, opacity: loadingMore ? 0.6 : 1 }}>
            {loadingMore ? '...' : `LOAD MORE (${total - coins.length} left)`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 2 — DEX PAIRS
   DexScreener Solana + ETH · liquidity > $5k · infinite scroll
   ═══════════════════════════════════════════════════════════════════════════ */
function DexPairsTab() {
  const [pairs,   setPairs]   = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q,       setQ]       = useState('');
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total,   setTotal]   = useState(0);
  const [lastMs,  setLastMs]  = useState(0);
  const LIMIT = 20;

  const load = useCallback(async (p: number, q: string, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res  = await fetch(`/api/explore/pairs?page=${p}&limit=${LIMIT}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (append) setPairs(prev => [...prev, ...data.items]);
      else setPairs(data.items);
      setHasMore(data.hasMore);
      setTotal(data.total);
      setPage(p);
      setLastMs(Date.now());
    } catch {}
    finally { setLoading(false); setLoadingMore(false); }
  }, []);

  useEffect(() => { load(1, q); }, [q]);
  useEffect(() => {
    const t = setInterval(() => load(1, q), TTL.PAIRS * 1_000);
    return () => clearInterval(t);
  }, [q, load]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>

      {/* ── Controls ── */}
      <div style={{ padding: '8px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: FH, fontSize: 13, letterSpacing: 2, color: C.cyan, flexShrink: 0 }}>DEX PAIRS</span>
          <div style={{ marginLeft: 'auto' }}>
            <RefreshBadge ms={lastMs} every={TTL.PAIRS} />
          </div>
        </div>
        <SearchBar value={q} onChange={setQ} placeholder="Search by token symbol..." />
        <div style={{ fontSize: 7, color: C.dim, marginTop: 4, letterSpacing: 1 }}>
          Solana + Ethereum · liquidity &gt; $5K · {total.toLocaleString()} pairs
        </div>
      </div>

      {/* ── Column headers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 90px 80px 60px auto', gap: 6, padding: '4px 4px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 560 }}>
        {['PAIR', 'PRICE', '24H', 'LIQUIDITY', 'VOLUME', 'BUYS', 'AI'].map(h => (
          <div key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>{h}</div>
        ))}
      </div>

      {/* ── Pairs list ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {loading && <Loader />}
        {!loading && pairs.map((pair, i) => {
          const buys  = pair.buys24h;
          const sells = pair.sells24h;
          const total = buys + sells;
          const buyPct = total > 0 ? Math.round((buys / total) * 100) : 50;

          return (
            <div key={pair.pairAddress}
              style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 90px 80px 60px auto', gap: 6, padding: '7px 4px', borderBottom: `1px solid rgba(255,255,255,0.03)`, alignItems: 'center', animation: `rowPopEx 0.2s ease ${Math.min(i, 10) * 0.02}s both`, minWidth: 560 }}>

              {/* Pair name */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, color: C.text, fontWeight: 700 }}>{pair.baseSymbol}</span>
                  <span style={{ fontSize: 8, color: C.dim }}>/</span>
                  <span style={{ fontSize: 9, color: C.dim }}>{pair.quoteSymbol}</span>
                  <Pill label={pair.chainId.toUpperCase().slice(0, 3)} color={chainColor(pair.chainId)} />
                </div>
                <div style={{ fontSize: 7, color: C.cyanDim }}>{pair.dexId}</div>
              </div>

              {/* Price */}
              <span style={{ fontSize: 10, color: C.silver }}>${fmtPrice(pair.priceUsd)}</span>

              {/* 24h */}
              <span style={{ fontSize: 10, fontWeight: 700, color: chgColor(pair.priceChange24h) }}>{chgSign(pair.priceChange24h)}</span>

              {/* Liquidity */}
              <span style={{ fontSize: 9, color: pair.liquidityUsd < 50_000 ? C.red : C.dim }}>${fmtBig(pair.liquidityUsd)}</span>

              {/* Volume */}
              <span style={{ fontSize: 9, color: C.dim }}>${fmtBig(pair.volume24h)}</span>

              {/* Buy ratio mini-bar */}
              <div>
                <div style={{ height: 3, background: `${C.red}44`, borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
                  <div style={{ height: '100%', width: `${buyPct}%`, background: C.green, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 7, color: buyPct >= 55 ? C.green : C.red }}>{buyPct}% B</div>
              </div>

              {/* AI */}
              <AiScoreBadge score={scoreFromDexScreener(pair)} compact />
            </div>
          );
        })}

        {hasMore && !loading && (
          <button onClick={() => load(page + 1, q, true)} disabled={loadingMore}
            style={{ width: '100%', padding: '8px', border: `1px solid ${C.border}`, borderRadius: 0, background: C.cyanFaint, color: C.cyan, fontSize: 9, cursor: 'pointer', fontFamily: FM, letterSpacing: 2, opacity: loadingMore ? 0.6 : 1 }}>
            {loadingMore ? '...' : `LOAD MORE (${total - pairs.length} left)`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 3 — YIELDS
   DeFiLlama stablecoin pools · sorted by APY · infinite scroll
   ═══════════════════════════════════════════════════════════════════════════ */
function YieldsTab() {
  const [pools,   setPools]   = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q,       setQ]       = useState('');
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total,   setTotal]   = useState(0);
  const [lastMs,  setLastMs]  = useState(0);
  const LIMIT = 20;

  const load = useCallback(async (p: number, q: string, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res  = await fetch(`/api/explore/yields?page=${p}&limit=${LIMIT}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (append) setPools(prev => [...prev, ...data.items]);
      else setPools(data.items);
      setHasMore(data.hasMore);
      setTotal(data.total);
      setPage(p);
      setLastMs(Date.now());
    } catch {}
    finally { setLoading(false); setLoadingMore(false); }
  }, []);

  useEffect(() => { load(1, q); }, [q]);
  useEffect(() => {
    const t = setInterval(() => load(1, q), TTL.YIELDS * 1_000);
    return () => clearInterval(t);
  }, [q, load]);

  const IL_COLOR: Record<string, string> = { NONE: C.green, LOW: C.cyan, MEDIUM: C.orange, HIGH: C.red };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>

      {/* ── Controls ── */}
      <div style={{ padding: '8px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: FH, fontSize: 13, letterSpacing: 2, color: C.cyan }}>YIELD POOLS</span>
          <span style={{ fontSize: 8, color: C.dim }}>stablecoins only · {total} pools</span>
          <div style={{ marginLeft: 'auto' }}>
            <RefreshBadge ms={lastMs} every={TTL.YIELDS} />
          </div>
        </div>
        <SearchBar value={q} onChange={setQ} placeholder="Search by protocol or symbol..." />
      </div>

      {/* ── Column headers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px 70px 50px', gap: 6, padding: '4px 4px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 460 }}>
        {['POOL', 'CHAIN', 'APY', 'TVL', 'BASE', 'IL'].map(h => (
          <div key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>{h}</div>
        ))}
      </div>

      {/* ── Pools list ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {loading && <Loader />}
        {!loading && pools.map((pool, i) => (
          <div key={pool.pool}
            style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px 70px 50px', gap: 6, padding: '7px 4px', borderBottom: `1px solid rgba(255,255,255,0.03)`, alignItems: 'center', animation: `rowPopEx 0.2s ease ${Math.min(i, 10) * 0.02}s both`, minWidth: 460 }}>

            {/* Pool name */}
            <div>
              <div style={{ fontSize: 10, color: C.text, fontWeight: 700 }}>{pool.symbol}</div>
              <div style={{ fontSize: 7, color: C.cyanDim }}>{pool.project}</div>
            </div>

            {/* Chain */}
            <Pill label={pool.chain.slice(0, 5).toUpperCase()} color={chainColor(pool.chain)} />

            {/* APY */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: apyColor(pool.apy) }}>{pool.apy.toFixed(2)}%</div>
              {pool.apyReward != null && <div style={{ fontSize: 7, color: C.dim }}>+{pool.apyReward.toFixed(2)}% rwrd</div>}
            </div>

            {/* TVL */}
            <div>
              <div style={{ fontSize: 10, color: C.silver }}>${fmtBig(pool.tvlUsd)}</div>
            </div>

            {/* Base APY */}
            <span style={{ fontSize: 9, color: C.dim }}>{pool.apyBase.toFixed(2)}%</span>

            {/* IL Risk */}
            <Pill label={pool.ilRisk.slice(0, 4)} color={IL_COLOR[pool.ilRisk] ?? C.dim} />
          </div>
        ))}

        {hasMore && !loading && (
          <button onClick={() => load(page + 1, q, true)} disabled={loadingMore}
            style={{ width: '100%', padding: '8px', border: `1px solid ${C.border}`, borderRadius: 0, background: C.cyanFaint, color: C.cyan, fontSize: 9, cursor: 'pointer', fontFamily: FM, letterSpacing: 2, opacity: loadingMore ? 0.6 : 1 }}>
            {loadingMore ? '...' : `LOAD MORE (${total - pools.length} left)`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 4 — NEWS
   CryptoPanic (auth_token) + RSS: Decrypt · Cointelegraph · CoinDesk · TheBlock
   Tagged: SOLANA · DEFI · MARKET · WEB3
   10 min server-side cache
   ═══════════════════════════════════════════════════════════════════════════ */
function NewsTab() {
  const [news,    setNews]    = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tag,     setTag]     = useState<NewsTag>('ALL');
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total,   setTotal]   = useState(0);
  const [lastMs,  setLastMs]  = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const LIMIT = 12;

  const load = useCallback(async (p: number, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res  = await fetch(`/api/explore/news?page=${p}&limit=${LIMIT}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (append) setNews(prev => [...prev, ...data.items]);
      else setNews(data.items);
      setHasMore(data.hasMore);
      setTotal(data.total);
      setPage(p);
      setLastMs(Date.now());
    } catch {}
    finally { setLoading(false); setLoadingMore(false); }
  }, []);

  useEffect(() => { load(1); }, []);
  useEffect(() => {
    const t = setInterval(() => load(1), TTL.NEWS * 1_000);
    return () => clearInterval(t);
  }, [load]);

  const TAGS: NewsTag[] = ['ALL', 'SOLANA', 'DEFI', 'MARKET', 'WEB3'];
  const filtered = tag === 'ALL' ? news : news.filter(n => n.tag === tag);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>

      {/* ── Tag bar ── */}
      <div style={{ padding: '8px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FH, fontSize: 13, letterSpacing: 2, color: C.cyan, flexShrink: 0 }}>WEB3 NEWS</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 7, color: C.dim }}>CryptoPanic + RSS · 10m cache</span>
            <RefreshBadge ms={lastMs} every={TTL.NEWS} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TAGS.map(t => (
            <button key={t} onClick={() => setTag(t)}
              style={{ padding: '4px 12px', borderRadius: 3, border: `1px solid ${tag === t ? TAG_COLOR[t] : C.border}`, background: tag === t ? `${TAG_COLOR[t]}11` : 'transparent', color: tag === t ? TAG_COLOR[t] : C.dim, fontSize: 8, cursor: 'pointer', fontFamily: FM, letterSpacing: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── News list ── */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {loading && <Loader />}

        {!loading && filtered.map((item, i) => {
          const tagColor = TAG_COLOR[item.tag as NewsTag] ?? C.cyan;
          const isOpen   = expanded === item.id;
          const totalVotes = (item.votes?.positive ?? 0) + (item.votes?.negative ?? 0);
          const bullPct = totalVotes > 0 ? Math.round(((item.votes?.positive ?? 0) / totalVotes) * 100) : 0;

          return (
            <div key={item.id}
              onClick={() => setExpanded(isOpen ? null : item.id)}
              style={{ padding: '10px 6px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', animation: `rowPopEx 0.2s ease ${Math.min(i, 8) * 0.03}s both` }}>

              {/* ── Main row ── */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {/* Tag pill */}
                <Pill label={item.tag} color={tagColor} />

                {/* Title + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.text, lineHeight: 1.4, marginBottom: 4 }}>{item.title}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 8, color: C.cyanDim }}>{item.source}</span>
                    <span style={{ fontSize: 8, color: C.dim }}>{item.time}</span>
                    {/* Vote bar */}
                    {totalVotes > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 32, height: 3, background: `${C.red}44`, borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${bullPct}%`, background: C.green, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 7, color: C.dim }}>{bullPct}% bull</span>
                      </div>
                    )}
                  </div>
                </div>

                <span style={{ fontSize: 9, color: isOpen ? C.cyan : C.dim, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>▾</span>
              </div>

              {/* ── Expanded snippet ── */}
              {isOpen && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, borderLeft: `2px solid ${tagColor}44` }}>
                  <p style={{ fontSize: 9, color: C.silver, lineHeight: 1.7, margin: 0 }}>{item.snippet}</p>
                  {item.votes && totalVotes > 0 && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      <span style={{ fontSize: 8, color: C.green }}>▲ {item.votes.positive} bullish</span>
                      <span style={{ fontSize: 8, color: C.red }}>▼ {item.votes.negative} bearish</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9, lineHeight: 2 }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>◌</div>
            No {tag !== 'ALL' ? tag : ''} news available right now.
          </div>
        )}

        {hasMore && !loading && tag === 'ALL' && (
          <button onClick={() => load(page + 1, true)} disabled={loadingMore}
            style={{ width: '100%', padding: '10px', border: `1px solid ${C.border}`, borderRadius: 0, background: C.cyanFaint, color: C.cyan, fontSize: 9, cursor: 'pointer', fontFamily: FM, letterSpacing: 2, opacity: loadingMore ? 0.6 : 1 }}>
            {loadingMore ? '...' : `LOAD MORE (${total - news.length} left)`}
          </button>
        )}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   TIER HELPER
   Hard-coded bronze for now. Replace with wallet/NFT check when
   wallet connect is built — swap this one constant and everything gates.
   ═══════════════════════════════════════════════════════════════════════════ */
const USER_TIER: 'bronze' | 'silver' | 'gold' = 'bronze';

const LIQUIDITY_OPTIONS: { label: string; value: number; minTier: 'bronze' | 'silver' | 'gold' }[] = [
  { label: '$10K+',  value: 10_000,  minTier: 'bronze' },
  { label: '$20K+',  value: 20_000,  minTier: 'bronze' },
  { label: '$30K+',  value: 30_000,  minTier: 'bronze' },
  { label: '$50K+',  value: 50_000,  minTier: 'silver' },
  { label: '$100K+', value: 100_000, minTier: 'silver' },
  { label: '$250K+', value: 250_000, minTier: 'gold'   },
];

const TIER_ORDER = { bronze: 0, silver: 1, gold: 2 };
function tierUnlocked(opt: typeof LIQUIDITY_OPTIONS[0]): boolean {
  return TIER_ORDER[USER_TIER] >= TIER_ORDER[opt.minTier];
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 5 — NARRATIVE MOMENTUM INDEX
   6 narrative baskets scored by price momentum + social volume.
   CoinGecko public (no key) + DexScreener fallback for LSTs.
   Server cache 3 min — single fetch serves all 8k users.
   ═══════════════════════════════════════════════════════════════════════════ */
interface NarrativeIndex {
  id:          string;
  label:       string;
  emoji:       string;
  score:       number;   // 0–100 momentum score
  change24h:   number;   // weighted avg 24h price change
  volume24h:   number;   // total volume across basket
  leader:      string;   // top performer symbol
  leaderChg:   number;
  tokens:      { symbol: string; change24h: number; volume24h: number; }[];
  trend:       'SURGING' | 'RISING' | 'NEUTRAL' | 'FALLING' | 'CRASHING';
}

const TREND_COLOR = {
  SURGING:  '#00ff88',
  RISING:   '#00ccff',
  NEUTRAL:  'rgba(180,200,220,0.5)',
  FALLING:  '#ffaa00',
  CRASHING: '#ff3355',
};

function NarrativeTab() {
  const [indices, setIndices] = useState<NarrativeIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastMs,  setLastMs]  = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/explore/narrative');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIndices(data.indices ?? []);
      setLastMs(Date.now());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 3 * 60 * 1_000); return () => clearInterval(t); }, [load]);

  const sorted = [...indices].sort((a, b) => b.score - a.score);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>
      <div style={{ padding: '8px 4px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FH, fontSize: 13, letterSpacing: 2, color: C.cyan }}>NARRATIVE MOMENTUM</span>
        <RefreshBadge ms={lastMs} every={180} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {loading && <Loader />}

        {/* Ranking bars */}
        {!loading && sorted.map((idx, i) => {
          const color   = TREND_COLOR[idx.trend];
          const isOpen  = selected === idx.id;
          return (
            <div key={idx.id}
              onClick={() => setSelected(isOpen ? null : idx.id)}
              style={{ padding: '10px 4px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', animation: `rowPopEx 0.2s ease ${i * 0.04}s both` }}>

              {/* ── Main row ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {/* Rank */}
                <span style={{ fontSize: 16, width: 28, textAlign: 'center', flexShrink: 0 }}>{idx.emoji}</span>

                {/* Label + trend */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontFamily: FH, fontSize: 14, letterSpacing: 2, color: C.text }}>{idx.label}</span>
                    <Pill label={idx.trend} color={color} />
                  </div>
                  {/* Momentum bar */}
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${idx.score}%`, background: `linear-gradient(90deg,${color}66,${color})`, borderRadius: 2, transition: 'width 0.8s ease', boxShadow: `0 0 6px ${color}44` }} />
                  </div>
                </div>

                {/* Stats */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: FM }}>{idx.change24h >= 0 ? '+' : ''}{idx.change24h.toFixed(2)}%</div>
                  <div style={{ fontSize: 7, color: C.dim }}>${fmtBig(idx.volume24h)} vol</div>
                </div>

                {/* Score */}
                <div style={{ width: 38, textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color }}>{idx.score}</div>
                  <div style={{ fontSize: 6, color: C.dim, letterSpacing: 1 }}>SCORE</div>
                </div>

                <span style={{ fontSize: 9, color: isOpen ? C.cyan : C.dim, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
              </div>

              {/* ── Expanded token breakdown ── */}
              {isOpen && (
                <div style={{ paddingLeft: 38, animation: 'rowPopEx 0.15s ease' }}>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 5 }}>
                    LEADER: <span style={{ color: chgColor(idx.leaderChg) }}>{idx.leader} {idx.leaderChg >= 0 ? '+' : ''}{idx.leaderChg.toFixed(2)}%</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {idx.tokens.map(t => (
                      <div key={t.symbol} style={{ padding: '3px 8px', borderRadius: 3, border: `1px solid ${chgColor(t.change24h)}22`, background: `${chgColor(t.change24h)}08`, display: 'flex', gap: 5, alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: C.silver }}>{t.symbol}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: chgColor(t.change24h) }}>{t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 6 — ALPHA FEED
   New DexScreener pools auto-screened by GoPlus.
   Only surfaces pools that pass: not honeypot, liq > threshold, deployer clean.
   Tier-gated liquidity filter — bronze: $10k–$50k, silver: $50k+, gold: $250k+
   Server cache 60s — single fetch, GoPlus screened server-side.
   ═══════════════════════════════════════════════════════════════════════════ */
interface AlphaPool {
  pairAddress:    string;
  baseSymbol:     string;
  baseName:       string;
  baseAddress:    string;
  quoteSymbol:    string;
  priceUsd:       number;
  priceChange24h: number;
  liquidityUsd:   number;
  volume24h:      number;
  buys24h:        number;
  sells24h:       number;
  chainId:        string;
  dexId:          string;
  createdAt:      number;
  riskScore:      number;
  riskLevel:      'SAFE' | 'CAUTION' | 'DANGER';
  passedScreen:   boolean;
  ageHours:       number;
}

function AlphaFeedTab() {
  const [pools,       setPools]       = useState<AlphaPool[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [lastMs,      setLastMs]      = useState(0);
  const [liqFilter,   setLiqFilter]   = useState(10_000);
  const [error,       setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/explore/alpha-feed');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPools(data.pools ?? []);
      setLastMs(Date.now());
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const filtered = pools.filter(p => p.liquidityUsd >= liqFilter && p.passedScreen);

  const buyPct = (p: AlphaPool) => {
    const total = p.buys24h + p.sells24h;
    return total > 0 ? Math.round((p.buys24h / total) * 100) : 50;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>

      {/* ── Header + filter ── */}
      <div style={{ padding: '8px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FH, fontSize: 13, letterSpacing: 2, color: C.cyan }}>ALPHA FEED</span>
          <span style={{ fontSize: 7, color: C.dim }}>auto-screened · GoPlus · new pools only</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 8, color: C.green }}>{filtered.length} passing</span>
            <RefreshBadge ms={lastMs} every={60} />
          </div>
        </div>

        {/* Tier-gated liquidity filter */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginRight: 2 }}>MIN LIQ</span>
          {LIQUIDITY_OPTIONS.map(opt => {
            const unlocked = tierUnlocked(opt);
            const active   = liqFilter === opt.value;
            return (
              <div key={opt.value} style={{ position: 'relative' }}>
                <button
                  onClick={() => unlocked && setLiqFilter(opt.value)}
                  style={{
                    padding: '3px 10px', borderRadius: 3, cursor: unlocked ? 'pointer' : 'not-allowed',
                    border:      `1px solid ${active ? C.cyan : unlocked ? C.border : 'rgba(255,255,255,0.04)'}`,
                    background:  active ? C.cyanFaint : 'transparent',
                    color:       active ? C.cyan : unlocked ? C.dim : 'rgba(255,255,255,0.15)',
                    fontSize: 8, fontFamily: FM, letterSpacing: 1, opacity: unlocked ? 1 : 0.5,
                  }}>
                  {opt.label}
                  {!unlocked && <span style={{ marginLeft: 4, fontSize: 7, opacity: 0.6 }}>🔒</span>}
                </button>
                {/* Tier tooltip on locked options */}
                {!unlocked && (
                  <div style={{
                    position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.9)', border: `1px solid ${C.border}`, borderRadius: 4,
                    padding: '4px 8px', fontSize: 7, color: C.orange, whiteSpace: 'nowrap',
                    pointerEvents: 'none', opacity: 0, transition: 'opacity 0.2s', zIndex: 10,
                  }}
                  className="tier-tooltip">
                    {opt.minTier.toUpperCase()} tier required
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {error && <div style={{ marginTop: 6, fontSize: 9, color: C.red }}>{error}</div>}
      </div>

      {/* ── Column headers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 60px 90px 70px 50px 50px', gap: 6, padding: '4px 4px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 520 }}>
        {['POOL', 'PRICE', '24H', 'LIQ', 'VOL', 'BUYS', 'AGE'].map(h => (
          <div key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>{h}</div>
        ))}
      </div>

      {/* ── Pool list ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {loading && <Loader />}

        {!loading && filtered.map((pool, i) => (
          <div key={pool.pairAddress}
            style={{ display: 'grid', gridTemplateColumns: '1fr 70px 60px 90px 70px 50px 50px', gap: 6, padding: '7px 4px', borderBottom: `1px solid rgba(255,255,255,0.03)`, alignItems: 'center', animation: `rowPopEx 0.2s ease ${Math.min(i, 10) * 0.03}s both`, minWidth: 520 }}>

            {/* Pool */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{pool.baseSymbol}</span>
                <span style={{ fontSize: 8, color: C.dim }}>/{pool.quoteSymbol}</span>
                <Pill label={pool.riskLevel} color={pool.riskLevel === 'SAFE' ? C.green : pool.riskLevel === 'CAUTION' ? C.orange : C.red} />
              </div>
              <div style={{ fontSize: 7, color: C.cyanDim }}>{pool.dexId} · {pool.chainId}</div>
            </div>

            {/* Price */}
            <span style={{ fontSize: 9, color: C.silver }}>${fmtPrice(pool.priceUsd)}</span>

            {/* 24h */}
            <span style={{ fontSize: 10, fontWeight: 700, color: chgColor(pool.priceChange24h) }}>{chgSign(pool.priceChange24h)}</span>

            {/* Liquidity */}
            <span style={{ fontSize: 9, color: C.silver }}>${fmtBig(pool.liquidityUsd)}</span>

            {/* Volume */}
            <span style={{ fontSize: 9, color: C.dim }}>${fmtBig(pool.volume24h)}</span>

            {/* Buy ratio */}
            <div>
              <div style={{ height: 3, background: `${C.red}44`, borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
                <div style={{ height: '100%', width: `${buyPct(pool)}%`, background: C.green, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 7, color: buyPct(pool) >= 55 ? C.green : C.red }}>{buyPct(pool)}%</div>
            </div>

            {/* Age */}
            <span style={{ fontSize: 8, color: pool.ageHours < 6 ? C.orange : C.dim }}>
              {pool.ageHours < 1 ? `${Math.round(pool.ageHours * 60)}m` : `${Math.round(pool.ageHours)}h`}
            </span>
          </div>
        ))}

        {!loading && filtered.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9, lineHeight: 2 }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>◎</div>
            No new pools passing current screen right now.<br />
            Refreshes every 60 seconds.
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 7 — SMART MONEY SIGNALS
   Aggregates Birdeye whale data across 15-min windows server-side.
   When 3+ distinct whale wallets buy the same token → ACCUMULATION signal.
   Zero extra API calls — computed on existing whale cache.
   ═══════════════════════════════════════════════════════════════════════════ */
interface SmartSignal {
  tokenIn:      string;
  tokenOut:     string;
  whaleCount:   number;
  totalUsd:     number;
  avgUsd:       number;
  buyPct:       number;
  wallets:      string[];
  signal:       'ACCUMULATION' | 'DISTRIBUTION' | 'MIXED';
  strength:     'STRONG' | 'MODERATE' | 'WEAK';
  firstSeen:    number;
  lastSeen:     number;
}

const SIGNAL_COLOR = { ACCUMULATION: '#00ff88', DISTRIBUTION: '#ff3355', MIXED: '#ffaa00' };
const STRENGTH_COLOR = { STRONG: '#00ff88', MODERATE: '#00b4ff', WEAK: 'rgba(180,200,220,0.4)' };

function SmartMoneyTab() {
  const [signals, setSignals] = useState<SmartSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastMs,  setLastMs]  = useState(0);
  const [minWhales, setMinWhales] = useState(3);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/explore/smart-money');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSignals(data.signals ?? []);
      setLastMs(Date.now());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const filtered = signals.filter(s => s.whaleCount >= minWhales);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>

      {/* ── Header ── */}
      <div style={{ padding: '8px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FH, fontSize: 13, letterSpacing: 2, color: C.cyan }}>SMART MONEY SIGNALS</span>
          <span style={{ fontSize: 7, color: C.dim }}>whale wallet convergence · 30s</span>
          <div style={{ marginLeft: 'auto' }}>
            <RefreshBadge ms={lastMs} every={30} />
          </div>
        </div>
        {/* Min whale count filter */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>MIN WALLETS</span>
          {[2, 3, 5, 10].map(n => (
            <button key={n} onClick={() => setMinWhales(n)}
              style={{ padding: '3px 10px', borderRadius: 3, border: `1px solid ${minWhales === n ? C.cyan : C.border}`, background: minWhales === n ? C.cyanFaint : 'transparent', color: minWhales === n ? C.cyan : C.dim, fontSize: 8, cursor: 'pointer', fontFamily: FM }}>
              {n}+
            </button>
          ))}
          <span style={{ fontSize: 8, color: C.green, marginLeft: 8 }}>{filtered.length} signals</span>
        </div>
      </div>

      {/* ── Signal list ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {loading && <Loader />}

        {!loading && filtered.map((sig, i) => {
          const sigColor = SIGNAL_COLOR[sig.signal];
          const strColor = STRENGTH_COLOR[sig.strength];
          return (
            <div key={`${sig.tokenOut}-${sig.firstSeen}`}
              style={{ padding: '10px 4px', borderBottom: `1px solid ${sigColor}22`, animation: `rowPopEx 0.2s ease ${i * 0.04}s both`, borderLeft: `3px solid ${sigColor}44` }}>

              {/* ── Top row ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <Pill label={sig.signal} color={sigColor} />
                <Pill label={sig.strength} color={strColor} />
                <span style={{ fontFamily: FH, fontSize: 16, letterSpacing: 2, color: C.text }}>{sig.tokenOut}</span>
                <span style={{ fontSize: 8, color: C.dim }}>← {sig.tokenIn}</span>
              </div>

              {/* ── Stats row ── */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>WHALE WALLETS</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: sigColor }}>{sig.whaleCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>TOTAL USD</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.silver }}>${fmtBig(sig.totalUsd)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>AVG SIZE</div>
                  <div style={{ fontSize: 12, color: C.silver }}>${fmtBig(sig.avgUsd)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>BUY RATIO</div>
                  <div style={{ fontSize: 12, color: sig.buyPct > 60 ? C.green : C.red }}>{sig.buyPct}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>WINDOW</div>
                  <div style={{ fontSize: 9, color: C.dim }}>{timeAgo(sig.firstSeen)} → {timeAgo(sig.lastSeen)}</div>
                </div>
              </div>

              {/* ── Wallet list ── */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {sig.wallets.slice(0, 5).map((w, j) => (
                  <span key={j} style={{ fontSize: 7, color: C.cyanDim, padding: '2px 6px', border: `1px solid ${C.border}`, borderRadius: 3 }}>
                    {w.slice(0, 6)}...{w.slice(-4)}
                  </span>
                ))}
                {sig.wallets.length > 5 && (
                  <span style={{ fontSize: 7, color: C.dim }}>+{sig.wallets.length - 5} more</span>
                )}
              </div>
            </div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9, lineHeight: 2 }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>◈</div>
            No whale convergence signals right now.<br />
            Lower the minimum wallet count or wait for next refresh.
          </div>
        )}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   TAB 8 — TOKEN LAUNCH SNIPER  🔒 50pts · 24hr unlock
   DexScreener free API · Solana new pairs · live rug scoring
   ═══════════════════════════════════════════════════════════════════════════ */

interface SniperToken {
  pairAddress:   string;
  baseAddress:   string;
  symbol:        string;
  name:          string;
  priceUsd:      number;
  priceChange5m: number;
  priceChange1h: number;
  liquidityUsd:  number;
  volume5m:      number;
  volume1h:      number;
  buys5m:        number;
  sells5m:       number;
  fdv:           number;
  createdAt:     number;   // unix ms
  dexId:         string;
  txns24h:       number;
}

type RugFlag = { label: string; color: string; };

function rugFlags(t: SniperToken): RugFlag[] {
  const flags: RugFlag[] = [];
  if (t.liquidityUsd < 5_000)                          flags.push({ label: 'LOW LIQ',    color: C.red    });
  if (t.liquidityUsd >= 5_000 && t.liquidityUsd < 25_000) flags.push({ label: 'MED LIQ', color: C.orange });
  const ageMin = (Date.now() - t.createdAt) / 60_000;
  if (ageMin < 10)                                     flags.push({ label: 'BRAND NEW',  color: C.cyan   });
  if (t.sells5m > t.buys5m * 2)                        flags.push({ label: 'DUMP',       color: C.red    });
  if (t.buys5m  > t.sells5m * 3 && t.buys5m > 10)     flags.push({ label: 'FOMO BUY',   color: C.green  });
  if (t.volume5m > t.liquidityUsd * 0.5)               flags.push({ label: 'VOL SPIKE',  color: C.yellow });
  if (t.fdv > 0 && t.fdv / (t.liquidityUsd || 1) > 1000) flags.push({ label: 'HIGH FDV', color: C.orange });
  if (t.priceChange5m > 50)                            flags.push({ label: '+50% 5M',    color: C.green  });
  if (t.priceChange5m < -40)                           flags.push({ label: 'CRASH',      color: C.red    });
  return flags;
}

function riskScore(t: SniperToken): { score: number; color: string; label: string } {
  let risk = 0;
  if (t.liquidityUsd < 5_000)   risk += 40;
  else if (t.liquidityUsd < 25_000) risk += 20;
  if (t.sells5m > t.buys5m * 2) risk += 25;
  if (t.fdv > 0 && t.fdv / (t.liquidityUsd || 1) > 1000) risk += 15;
  const ageMin = (Date.now() - t.createdAt) / 60_000;
  if (ageMin < 5) risk += 10;
  risk = Math.min(100, risk);
  if (risk >= 65) return { score: risk, color: C.red,    label: 'HIGH RISK'  };
  if (risk >= 35) return { score: risk, color: C.orange, label: 'MED RISK'   };
  return            { score: risk, color: C.green,  label: 'LOW RISK'   };
}

function ageLabel(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 60)  return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

/* ── Locked overlay ── */
function SniperLocked({ onUnlock, unlocking }: { onUnlock: () => void; unlocking: boolean }) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
      background: 'rgba(2,4,8,0.96)', backdropFilter: 'blur(8px)',
      zIndex: 10, padding: 24, overflowY: 'auto',
    }}>
      {/* Icon */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        border: `1px solid rgba(153,102,255,0.4)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(153,102,255,0.06)', fontSize: 28,
        animation: 'exploreSpin 12s linear infinite',
      }}>🔒</div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FH, fontSize: 26, letterSpacing: 4, color: C.text, marginBottom: 6 }}>
          TOKEN LAUNCH <span style={{ color: C.purple }}>SNIPER</span>
        </div>
        <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.8, maxWidth: 340 }}>
          Real-time Solana token launches with live rug scoring, buy/sell pressure,
          liquidity depth, and instant risk flags — the edge you need in the first 10 minutes.
        </div>
      </div>

      {/* Feature preview */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        width: '100%', maxWidth: 360,
      }}>
        {[
          { icon: '⚡', text: 'Live launches every 15s' },
          { icon: '🛡', text: 'Rug flag detection'      },
          { icon: '📊', text: 'Buy/sell pressure ratio'  },
          { icon: '💧', text: 'Liquidity depth tracking' },
          { icon: '🎯', text: 'Risk score per token'     },
          { icon: '🔗', text: 'Direct Birdeye links'     },
        ].map((f, i) => (
          <div key={i} style={{
            padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 5,
            background: 'rgba(153,102,255,0.03)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 12 }}>{f.icon}</span>
            <span style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>{f.text}</span>
          </div>
        ))}
      </div>

      {/* Unlock CTA */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={onUnlock}
          disabled={unlocking}
          style={{
            fontFamily: FM, fontSize: 11, letterSpacing: 3, fontWeight: 700,
            color: unlocking ? C.dim : '#000',
            background: unlocking ? 'rgba(153,102,255,0.1)' : C.purple,
            border: `1px solid ${unlocking ? 'rgba(153,102,255,0.2)' : C.purple}`,
            borderRadius: 4, padding: '12px 32px', cursor: unlocking ? 'not-allowed' : 'pointer',
            boxShadow: unlocking ? 'none' : '0 0 24px rgba(153,102,255,0.35)',
            transition: 'all 0.2s',
          }}
        >
          {unlocking ? '⏳ UNLOCKING...' : '🔓 UNLOCK FOR 24HR — 50 PTS'}
        </button>
        <div style={{ fontSize: 8, color: C.faint, marginTop: 8, letterSpacing: 1 }}>
          50 points deducted · access expires in 24 hours
        </div>
      </div>
    </div>
  );
}

/* ── Main SniperTab ── */
function SniperTab() {
  const [tokens,    setTokens]    = useState<SniperToken[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [lastMs,    setLastMs]    = useState(0);
  const [minLiq,    setMinLiq]    = useState(10_000);
  const [maxAgeMin, setMaxAgeMin] = useState(60);
  const [sortBy,    setSortBy]    = useState<'age' | 'volume' | 'liq' | 'risk'>('age');
  const [search,    setSearch]    = useState('');
  const [unlocking, setUnlocking] = useState(false);

  // Unlock logic:
  // 1. Whitelisted wallets → always unlocked
  // 2. Active NFT holders → check points burn
  // 3. localStorage 24hr expiry fallback
  const [unlocked, setUnlocked] = useState(() => {
    try {
      const exp = localStorage.getItem('sniper_unlock_exp');
      return exp ? Date.now() < parseInt(exp) : false;
    } catch { return false; }
  });

  // On mount — check gate status and wallet access
  useEffect(() => {
    if (unlocked) return;

    async function checkAccess() {
      try {
        // If gate is OFF — sniper is free for everyone
        const gateRes = await fetch('/api/gate/status');
        const gate    = await gateRes.json();
        if (!gate.gateLive) {
          setUnlocked(true);
          localStorage.setItem('sniper_unlock_exp', String(Date.now() + 24 * 60 * 60 * 1000));
          return;
        }

        // Gate is on — check if wallet is whitelisted or founder
        const wallet = (window as any).__walletPublicKey
          || localStorage.getItem('connectedWallet');
        if (!wallet) return;

        const r = await fetch(`/api/nft/check/${wallet}`);
        const d = await r.json();
        if (d.hasAccess && (d.isWhitelisted || d.isFounder)) {
          setUnlocked(true);
          localStorage.setItem('sniper_unlock_exp', String(Date.now() + 365 * 24 * 60 * 60 * 1000));
        }
      } catch {}
    }

    checkAccess();
  }, []);

  async function handleUnlock() {
    // Check whitelist first before burning points
    const wallet = (window as any).__walletPublicKey
      || localStorage.getItem('connectedWallet');
    if (wallet) {
      try {
        const check = await fetch(`/api/nft/check/${wallet}`);
        const d     = await check.json();
        if (d.hasAccess && (d.isWhitelisted || d.isFounder)) {
          setUnlocked(true);
          localStorage.setItem('sniper_unlock_exp', String(Date.now() + 365 * 24 * 60 * 60 * 1000));
          return;
        }
      } catch {}
    }

    setUnlocking(true);
    try {
      const res  = await fetch('/api/points/burn-page-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Wallet': wallet || '' },
        body: JSON.stringify({ page: 'sniper', wallet }),
      });
      const data = await res.json();
      if (data.success) {
        const exp = Date.now() + 24 * 60 * 60 * 1000;
        localStorage.setItem('sniper_unlock_exp', String(exp));
        setUnlocked(true);
      } else {
        alert(data.error || 'Not enough points — you need 50 points to unlock');
      }
    } catch {
      const exp = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem('sniper_unlock_exp', String(exp));
      setUnlocked(true);
    }
    setUnlocking(false);
  }

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/explore/sniper');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTokens(data.tokens ?? []);
      setLastMs(Date.now());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [unlocked, load]);

  const filtered = tokens
    .filter(t => {
      const ageMin = (Date.now() - t.createdAt) / 60_000;
      if (ageMin > maxAgeMin)          return false;
      if (t.liquidityUsd < minLiq)     return false;
      if (search && !t.symbol.toLowerCase().includes(search.toLowerCase()) &&
          !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'age')    return b.createdAt - a.createdAt;
      if (sortBy === 'volume') return b.volume1h - a.volume1h;
      if (sortBy === 'liq')    return b.liquidityUsd - a.liquidityUsd;
      if (sortBy === 'risk')   return riskScore(a).score - riskScore(b).score;
      return 0;
    });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM, position: 'relative', overflow: 'hidden' }}>

      {/* ── Locked overlay ── */}
      {!unlocked && <SniperLocked onUnlock={handleUnlock} unlocking={unlocking} />}

      {/* ── Header ── */}
      <div style={{ padding: '8px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FH, fontSize: 13, letterSpacing: 2, color: C.purple }}>
            ⚡ TOKEN LAUNCH SNIPER
          </span>
          <span style={{ fontSize: 7, color: C.dim }}>solana · new pairs · 15s</span>
          {unlocked && (
            <span style={{
              fontSize: 7, color: C.purple, border: `1px solid rgba(153,102,255,0.3)`,
              borderRadius: 3, padding: '1px 6px', letterSpacing: 1,
            }}>
              🔓 UNLOCKED
            </span>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <RefreshBadge ms={lastMs} every={15} />
          </div>
        </div>

        {/* Filters row 1 */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>AGE</span>
          {[15, 30, 60, 240].map(m => (
            <button key={m} onClick={() => setMaxAgeMin(m)}
              style={{ padding: '3px 8px', borderRadius: 3, fontFamily: FM, fontSize: 7, cursor: 'pointer',
                border: `1px solid ${maxAgeMin === m ? C.purple : C.border}`,
                background: maxAgeMin === m ? 'rgba(153,102,255,0.12)' : 'transparent',
                color: maxAgeMin === m ? C.purple : C.dim }}>
              {m < 60 ? `${m}m` : `${m/60}h`}
            </button>
          ))}
          <span style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginLeft: 8 }}>LIQ</span>
          {[1_000, 10_000, 50_000].map(l => (
            <button key={l} onClick={() => setMinLiq(l)}
              style={{ padding: '3px 8px', borderRadius: 3, fontFamily: FM, fontSize: 7, cursor: 'pointer',
                border: `1px solid ${minLiq === l ? C.purple : C.border}`,
                background: minLiq === l ? 'rgba(153,102,255,0.12)' : 'transparent',
                color: minLiq === l ? C.purple : C.dim }}>
              ${fmtBig(l)}+
            </button>
          ))}
        </div>

        {/* Filters row 2 */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>SORT</span>
          {([['age','NEWEST'], ['volume','VOLUME'], ['liq','LIQUIDITY'], ['risk','SAFE FIRST']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setSortBy(id)}
              style={{ padding: '3px 8px', borderRadius: 3, fontFamily: FM, fontSize: 7, cursor: 'pointer',
                border: `1px solid ${sortBy === id ? C.cyan : C.border}`,
                background: sortBy === id ? C.cyanFaint : 'transparent',
                color: sortBy === id ? C.cyan : C.dim }}>
              {label}
            </button>
          ))}
          <span style={{ fontSize: 8, color: C.dim, marginLeft: 'auto' }}>{filtered.length} tokens</span>
        </div>

        <SearchBar value={search} onChange={setSearch} placeholder="Search symbol or name..." />
      </div>

      {/* ── Token list ── */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(153,102,255,0.15) transparent' }}>
        {loading && unlocked && <Loader />}

        {!loading && filtered.map((t, i) => {
          const risk  = riskScore(t);
          const flags = rugFlags(t);
          const ratio = t.buys5m + t.sells5m > 0
            ? Math.round((t.buys5m / (t.buys5m + t.sells5m)) * 100)
            : 50;
          const ratioColor = ratio >= 60 ? C.green : ratio <= 40 ? C.red : C.orange;

          return (
            <div key={t.pairAddress} style={{
              padding: '12px 4px', borderBottom: `1px solid ${risk.color}18`,
              borderLeft: `3px solid ${risk.color}55`,
              animation: `rowPopEx 0.15s ease ${Math.min(i, 20) * 0.03}s both`,
            }}>
              {/* ── Row 1: symbol + age + risk ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FH, fontSize: 17, letterSpacing: 2, color: C.text }}>
                  {t.symbol}
                </span>
                <span style={{ fontSize: 8, color: C.dim }}>{t.name}</span>
                <Pill label={ageLabel(t.createdAt)} color={C.cyanDim} />
                <Pill label={risk.label}            color={risk.color} />
                <Pill label={t.dexId.toUpperCase()} color={C.dim}     />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <a href={`https://birdeye.so/token/${t.baseAddress}?chain=solana`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 7, color: C.cyanDim, textDecoration: 'none',
                      border: `1px solid ${C.border}`, borderRadius: 3, padding: '2px 6px' }}>
                    BIRDEYE ↗
                  </a>
                  <a href={`https://dexscreener.com/solana/${t.pairAddress}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 7, color: C.dim, textDecoration: 'none',
                      border: `1px solid ${C.border}`, borderRadius: 3, padding: '2px 6px' }}>
                    DEXSCR ↗
                  </a>
                </div>
              </div>

              {/* ── Row 2: price + stats ── */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>PRICE</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtPrice(t.priceUsd)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>5M CHG</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: chgColor(t.priceChange5m) }}>
                    {chgSign(t.priceChange5m)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>1H CHG</div>
                  <div style={{ fontSize: 12, color: chgColor(t.priceChange1h) }}>
                    {chgSign(t.priceChange1h)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>LIQUIDITY</div>
                  <div style={{ fontSize: 12, color: t.liquidityUsd < 10_000 ? C.red : C.silver }}>
                    ${fmtBig(t.liquidityUsd)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>VOL 1H</div>
                  <div style={{ fontSize: 12, color: C.silver }}>${fmtBig(t.volume1h)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>FDV</div>
                  <div style={{ fontSize: 11, color: C.dim }}>${fmtBig(t.fdv)}</div>
                </div>
              </div>

              {/* ── Row 3: buy/sell bar + flags ── */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Buy/sell pressure bar */}
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 7, color: C.green }}>B {t.buys5m}</span>
                    <span style={{ fontSize: 7, color: ratioColor, letterSpacing: 1 }}>5M PRESSURE</span>
                    <span style={{ fontSize: 7, color: C.red }}>S {t.sells5m}</span>
                  </div>
                  <div style={{ height: 4, background: `rgba(255,51,85,0.25)`, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${ratio}%`, height: '100%', borderRadius: 2,
                      background: `linear-gradient(90deg, ${C.green}88, ${C.green})`,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>

                {/* Risk bar */}
                <div style={{ width: 80 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 7, color: C.dim }}>RISK</span>
                    <span style={{ fontSize: 7, color: risk.color }}>{risk.score}%</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${risk.score}%`, height: '100%', borderRadius: 2,
                      background: risk.color, transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>

                {/* Rug flags */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {flags.map((f, j) => (
                    <Pill key={j} label={f.label} color={f.color} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {!loading && unlocked && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9, lineHeight: 2 }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>⚡</div>
            No launches matching your filters right now.<br />
            Try widening age window or lowering min liquidity.
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN — EXPLORE PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
const TABS: { id: TabId; label: string; }[] = [
  { id: 'market',     label: 'MARKET'       },
  { id: 'pairs',      label: 'DEX PAIRS'    },
  { id: 'yields',     label: 'YIELDS'       },
  { id: 'news',       label: 'NEWS'         },
  { id: 'narrative',  label: 'NARRATIVE'    },
  { id: 'alpha',      label: 'ALPHA FEED'   },
  { id: 'smartmoney', label: 'SMART MONEY'  },
  { id: 'sniper',     label: '🔒 SNIPER'     },
  { id: 'hubai',      label: '🤖 HUB AI'     },
];

export default function ExplorePanel({ features = {} }: { features?: Record<string, string> }) {
  const [tab, setTab] = useState<TabId>('market');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>

      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', gap: 2, padding: '6px 6px 0', borderBottom: `1px solid ${C.border}`,
        overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '6px 14px', borderRadius: '4px 4px 0 0', border: 'none', cursor: 'pointer',
              background:   tab === t.id ? C.cyanFaint : 'transparent',
              borderBottom: tab === t.id ? `2px solid ${C.cyan}` : '2px solid transparent',
              color:        tab === t.id ? C.cyan : C.dim,
              fontSize: 9, fontFamily: FM, letterSpacing: 2, fontWeight: 700, whiteSpace: 'nowrap',
              transition: 'color 0.2s, background 0.2s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 6px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {tab === 'market'     && <MarketTab />}
        {tab === 'pairs'      && <DexPairsTab />}
        {tab === 'yields'     && <YieldsTab />}
        {tab === 'news'       && <NewsTab />}
        {tab === 'narrative'  && (
          features['narrative'] === 'unlocked'
            ? <NarrativeTab />
            : <div style={{ position: 'relative', height: '100%', minHeight: 400 }}>
                <ComingSoon featureName="NARRATIVE" description="Dominant market narratives and momentum scores" panel="Explore" />
              </div>
        )}
        {tab === 'alpha'      && (
          features['alpha_feed'] === 'unlocked'
            ? <AlphaFeedTab />
            : <div style={{ position: 'relative', height: '100%', minHeight: 400 }}>
                <ComingSoon featureName="ALPHA FEED" description="High-signal market intelligence and unusual activity" panel="Explore" />
              </div>
        )}
        {tab === 'smartmoney' && (
          features['smart_money_explore'] === 'unlocked'
            ? <SmartMoneyTab />
            : <div style={{ position: 'relative', height: '100%', minHeight: 400 }}>
                <ComingSoon featureName="SMART MONEY" description="Whale wallet convergence signals" panel="Explore" />
              </div>
        )}
        {tab === 'sniper'      && <SniperTab />}
        {tab === 'hubai'       && <HubAiTab />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HUB AI — Full Intelligence Digest
   Twice daily: 09:00 UTC + 18:00 UTC · Owner manual generation
   50pts / 24hr lock · Confluence scoring · Per-token · Anomaly alerts
   ═══════════════════════════════════════════════════════════════════════════ */

const POSTURE_COLOR: Record<string, string> = {
  'STRONGLY BULLISH':   '#00ff88',
  'BULLISH':            '#00ff88',
  'CAUTIOUSLY BULLISH': '#88ff44',
  'CONSTRUCTIVE':       '#00b4ff',
  'NEUTRAL':            '#ffdd00',
  'CAUTIOUSLY BEARISH': '#ffaa00',
  'BEARISH':            '#ff3355',
  'RISK-OFF':           '#ff3355',
};
const POSTURE_BG: Record<string, string> = {
  'STRONGLY BULLISH':   'rgba(0,255,136,0.06)',
  'BULLISH':            'rgba(0,255,136,0.06)',
  'CAUTIOUSLY BULLISH': 'rgba(136,255,68,0.05)',
  'CONSTRUCTIVE':       'rgba(0,180,255,0.06)',
  'NEUTRAL':            'rgba(255,221,0,0.05)',
  'CAUTIOUSLY BEARISH': 'rgba(255,170,0,0.05)',
  'BEARISH':            'rgba(255,51,85,0.06)',
  'RISK-OFF':           'rgba(255,51,85,0.06)',
};

const TOKEN_ICONS: Record<string, string> = {
  SOL: '◎', JUP: '⚡', BONK: '🐶', WIF: '🐕', JTO: '⚙',
};

function postureColor(p: string): string { return POSTURE_COLOR[p] ?? C.cyan; }
function postureBg(p: string): string    { return POSTURE_BG[p]    ?? C.cyanFaint; }

function ConfluenceBar({ score }: { score: number }) {
  const col = score >= 70 ? C.green : score >= 50 ? C.yellow : C.red;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 7, color: C.dim, letterSpacing: 2, fontFamily: FM }}>SIGNAL CONFLUENCE</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: col, fontFamily: FM }}>{score}/100</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`,
          background: `linear-gradient(90deg,${col}66,${col})`,
          borderRadius: 3, transition: 'width 1s ease',
          boxShadow: `0 0 8px ${col}44` }} />
      </div>
      <div style={{ fontSize: 7, color: C.dim, marginTop: 3, fontFamily: FM }}>
        {score >= 70 ? '✓ Strong alignment across signals'
          : score >= 50 ? '⚡ Mixed signals — moderate conviction'
          : '⚠ Conflicting signals — low conviction'}
      </div>
    </div>
  );
}

function TokenCard({ symbol, data, isSpotlight }: { symbol: string; data: any; isSpotlight?: boolean }) {
  const col = data.posture === 'BULLISH' ? C.green : data.posture === 'BEARISH' ? C.red : C.yellow;
  return (
    <div style={{ padding: '10px 12px', border: `1px solid ${col}22`,
      borderRadius: 6, background: `${col}05`,
      ...(isSpotlight ? { boxShadow: `0 0 12px ${col}22`, border: `1px solid ${col}44` } : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>{TOKEN_ICONS[symbol] ?? '◈'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: FM }}>{symbol}</span>
          {isSpotlight && (
            <span style={{ fontSize: 6, color: col, border: `1px solid ${col}33`,
              borderRadius: 3, padding: '1px 5px', letterSpacing: 1, fontFamily: FM }}>
              SPOTLIGHT
            </span>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: col, fontFamily: FM, letterSpacing: 1 }}>
            {data.posture}
          </div>
          <div style={{ fontSize: 7, color: C.dim }}>{data.confidence}%</div>
        </div>
      </div>
      <div style={{ fontSize: 8, color: 'rgba(180,200,220,0.65)', lineHeight: 1.6, fontFamily: FM }}>
        {data.note}
      </div>
      <div style={{ marginTop: 6, height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${data.confidence}%`, background: col, borderRadius: 1 }} />
      </div>
    </div>
  );
}

function NarrativeTag({ n }: { n: any }) {
  const col = n.direction === 'gaining' ? C.green : n.direction === 'declining' ? C.red : C.orange;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
      border: `1px solid ${col}22`, borderRadius: 20, background: `${col}08`, flexShrink: 0 }}>
      <span style={{ fontSize: 10 }}>{n.icon}</span>
      <span style={{ fontSize: 8, color: col, fontFamily: FM, letterSpacing: 1 }}>{n.label}</span>
      {n.momentum !== 0 && (
        <span style={{ fontSize: 7, color: col, fontFamily: FM }}>
          {n.momentum > 0 ? '+' : ''}{n.momentum}%
        </span>
      )}
    </div>
  );
}

function AnomalyAlert({ anomaly, onDismiss }: { anomaly: any; onDismiss: (id: number) => void }) {
  const sevColor = anomaly.severity === 'critical' ? '#ff00aa'
    : anomaly.severity === 'high' ? C.red
    : C.orange;
  const icons: Record<string, string> = {
    WHALE_SPIKE: '🐋', BRIDGE_SURGE: '🌉', TPS_DROP: '⚠', FNG_DROP: '📉', CONCENTRATION: '🎯',
  };
  return (
    <div style={{ padding: '10px 14px', border: `1px solid ${sevColor}33`,
      borderRadius: 6, background: `${sevColor}06`,
      display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icons[anomaly.type] ?? '⚡'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: sevColor, fontFamily: FM, marginBottom: 3 }}>
          {anomaly.title}
        </div>
        <div style={{ fontSize: 8, color: C.dim, lineHeight: 1.6 }}>{anomaly.detail}</div>
        <div style={{ fontSize: 7, color: C.dim, marginTop: 4 }}>
          {new Date(anomaly.created_at * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
        </div>
      </div>
      <button onClick={() => onDismiss(anomaly.id)}
        style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 10, padding: '0 4px', flexShrink: 0 }}>
        ✕
      </button>
    </div>
  );
}

const SECTION_META: Record<string, { label: string; icon: string }> = {
  network:          { label: 'SOLANA NETWORK',    icon: '🔗' },
  capital_flow:     { label: 'CAPITAL FLOW',       icon: '💸' },
  market_structure: { label: 'MARKET STRUCTURE',   icon: '📊' },
  smart_money:      { label: 'SMART MONEY',        icon: '🐋' },
  outlook:          { label: 'OUTLOOK',            icon: '🔭' },
};

function HubAiTab() {
  const [signals,   setSignals]   = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [sigCount,  setSigCount]  = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [unlocked,  setUnlocked]  = useState(() => {
    try {
      const exp = localStorage.getItem('hubai_unlock_exp');
      return exp ? Date.now() < parseInt(exp) : false;
    } catch { return false; }
  });
  const [unlocking,  setUnlocking]  = useState(false);
  const [expanded,   setExpanded]   = useState<number | null>(0);
  const [activeView, setActiveView] = useState<'briefs' | 'anomalies'>('briefs');
  const [lastMs,     setLastMs]     = useState(0);

  // Auto-unlock checks
  useEffect(() => {
    if (unlocked) return;
    async function check() {
      try {
        const r = await fetch('/api/gate/status');
        const d = await r.json();
        if (!d.gateLive) {
          localStorage.setItem('hubai_unlock_exp', String(Date.now() + 24 * 60 * 60 * 1000));
          setUnlocked(true); return;
        }
        const w = (window as any).__walletPublicKey || localStorage.getItem('connectedWallet');
        if (w) {
          const r2 = await fetch(`/api/nft/check/${w}`);
          const d2 = await r2.json();
          if (d2.hasAccess && (d2.isWhitelisted || d2.isFounder)) {
            localStorage.setItem('hubai_unlock_exp', String(Date.now() + 365 * 24 * 60 * 60 * 1000));
            setUnlocked(true);
          }
        }
      } catch {}
    }
    check();
  }, []);

  const load = useCallback(async () => {
    const wallet = (window as any).__walletPublicKey || localStorage.getItem('connectedWallet') || '';
    try {
      const r = await fetch('/api/hub-ai', { headers: { 'x-wallet': wallet } });
      const d = await r.json();
      if (d.signals)   { setSignals(d.signals); setLastMs(Date.now()); }
      if (d.anomalies) setAnomalies(d.anomalies);
      if (d.signalCount) setSigCount(d.signalCount);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!unlocked) { setLoading(false); return; }
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [unlocked, load]);

  async function handleUnlock() {
    const wallet = (window as any).__walletPublicKey || localStorage.getItem('connectedWallet');
    if (!wallet) { alert('Connect your wallet first'); return; }
    setUnlocking(true);
    try {
      const r = await fetch('/api/points/burn-page-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Wallet': wallet },
        body: JSON.stringify({ wallet, page: 'hub_ai' }),
      });
      const d = await r.json();
      if (d.success) {
        localStorage.setItem('hubai_unlock_exp', String(Date.now() + 24 * 60 * 60 * 1000));
        setUnlocked(true);
      } else alert(d.error || 'Need 50 points');
    } catch { alert('Failed — try again'); }
    setUnlocking(false);
  }

  async function dismissAnomaly(id: number) {
    setAnomalies(prev => prev.filter(a => a.id !== id));
    fetch('/api/hub-ai/dismiss-anomaly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  // ── Lock screen ──────────────────────────────────────────────────────────
  if (!unlocked) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 18, padding: 28, fontFamily: FM }}>
      <div style={{ fontSize: 40 }}>🤖</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FH, fontSize: 24, letterSpacing: 4, color: C.cyan, marginBottom: 4 }}>HUB AI</div>
        <div style={{ fontSize: 8, color: C.dim, letterSpacing: 3 }}>INTELLIGENCE DIGEST · TWICE DAILY</div>
      </div>
      <div style={{ maxWidth: 360, textAlign: 'center', fontSize: 9, color: C.dim, lineHeight: 1.9 }}>
        Comprehensive AI intelligence briefs with per-token analysis, confluence scoring,
        active narrative tracking, and real-time anomaly alerts — all synthesised from live platform data.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', maxWidth: 360 }}>
        {[
          { icon: '📡', text: 'Live chain + market data'  },
          { icon: '🎯', text: 'Confluence scoring 0-100'   },
          { icon: '◎⚡🐶🐕', text: 'Per-token analysis'  },
          { icon: '🚨', text: 'Real-time anomaly alerts'  },
          { icon: '🗺', text: 'Narrative momentum tags'   },
          { icon: '📈', text: 'Signal history tracking'   },
        ].map((f, i) => (
          <div key={i} style={{ padding: '8px 10px', border: `1px solid ${C.border}`,
            borderRadius: 5, background: C.cyanFaint, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11 }}>{f.icon}</span>
            <span style={{ fontSize: 8, color: C.dim }}>{f.text}</span>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', padding: '10px 24px', border: `1px solid ${C.border}`,
        borderRadius: 6, background: C.cyanFaint }}>
        <div style={{ fontSize: 20, fontFamily: FH, color: '#ffdd00', letterSpacing: 2 }}>50 PTS · 24HR ACCESS</div>
        <div style={{ fontSize: 7, color: C.dim, marginTop: 2 }}>Briefs drop at 09:00 UTC and 18:00 UTC daily</div>
      </div>
      <button onClick={handleUnlock} disabled={unlocking}
        style={{ padding: '10px 36px', borderRadius: 4, border: `1px solid ${C.cyan}`,
          background: C.cyanFaint, color: C.cyan, fontFamily: FM, fontSize: 10,
          letterSpacing: 2, fontWeight: 700, cursor: unlocking ? 'not-allowed' : 'pointer',
          opacity: unlocking ? 0.6 : 1 }}>
        {unlocking ? '⟳ UNLOCKING...' : '🔓 UNLOCK — 50 POINTS'}
      </button>
    </div>
  );

  if (loading) return <Loader />;

  // ── Empty state ──────────────────────────────────────────────────────────
  if (signals.length === 0 && anomalies.length === 0) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 14, padding: 28, fontFamily: FM }}>
      <div style={{ fontSize: 32 }}>🤖</div>
      <div style={{ fontFamily: FH, fontSize: 18, letterSpacing: 3, color: C.cyan }}>HUB AI</div>
      <div style={{ fontSize: 9, color: C.dim, textAlign: 'center', lineHeight: 1.8, maxWidth: 300 }}>
        No briefs generated yet. First brief drops at 09:00 UTC.
        The owner can generate one manually from the admin dashboard.
      </div>
      <div style={{ fontSize: 8, color: C.dim }}>
        Next brief: {new Date().getUTCHours() < 9 ? '09:00 UTC today' : new Date().getUTCHours() < 18 ? '18:00 UTC today' : '09:00 UTC tomorrow'}
      </div>
    </div>
  );

  const latestSignal = signals[0];
  const latestBrief  = latestSignal ? (typeof latestSignal.brief === 'string' ? JSON.parse(latestSignal.brief) : latestSignal.brief) : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>

      {/* ── Top bar ── */}
      <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: FH, fontSize: 16, letterSpacing: 3, color: C.cyan }}>HUB AI</span>
            <span style={{ fontSize: 7, color: C.dim }}>INTELLIGENCE DIGEST</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {anomalies.length > 0 && (
              <button onClick={() => setActiveView(v => v === 'anomalies' ? 'briefs' : 'anomalies')}
                style={{ padding: '3px 8px', borderRadius: 3,
                  border: `1px solid ${C.red}44`, background: `${C.red}11`,
                  color: C.red, fontSize: 7, cursor: 'pointer', fontFamily: FM,
                  animation: 'livePulse 2s ease-in-out infinite' }}>
                🚨 {anomalies.length} ALERT{anomalies.length > 1 ? 'S' : ''}
              </button>
            )}
            <RefreshBadge ms={lastMs} every={300} />
          </div>
        </div>

        {/* Signal count */}
        {sigCount > 0 && (
          <div style={{ fontSize: 7, color: C.dim, marginBottom: 6 }}>
            {sigCount} briefs generated since launch
          </div>
        )}

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {(['briefs', 'anomalies'] as const).map(v => (
            <button key={v} onClick={() => setActiveView(v)}
              style={{ padding: '4px 12px', borderRadius: 3, border: `1px solid ${activeView === v ? C.cyan : C.border}`,
                background: activeView === v ? C.cyanFaint : 'transparent',
                color: activeView === v ? C.cyan : C.dim,
                fontSize: 7, cursor: 'pointer', fontFamily: FM, letterSpacing: 1 }}>
              {v === 'briefs' ? `📋 BRIEFS (${signals.length})` : `🚨 ANOMALIES (${anomalies.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 16px',
        scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>

        {/* ANOMALIES VIEW */}
        {activeView === 'anomalies' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {anomalies.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9 }}>
                  No active anomalies — all signals within normal range
                </div>
              : anomalies.map(a => <AnomalyAlert key={a.id} anomaly={a} onDismiss={dismissAnomaly} />)
            }
          </div>
        )}

        {/* BRIEFS VIEW */}
        {activeView === 'briefs' && signals.map((sig, idx) => {
          const brief      = typeof sig.brief === 'string' ? JSON.parse(sig.brief) : sig.brief;
          const tokens     = typeof sig.tokens === 'string' ? JSON.parse(sig.tokens) : (sig.tokens ?? {});
          const narratives: any[] = typeof sig.narratives === 'string' ? JSON.parse(sig.narratives) : (sig.narratives ?? []);
          const isOpen     = expanded === idx;
          const pColor     = postureColor(brief?.posture ?? 'NEUTRAL');
          const pBg        = postureBg(brief?.posture ?? 'NEUTRAL');
          const slotLabel  = sig.slot === 'morning' ? '🌅 MORNING · 09:00 UTC'
            : sig.slot === 'evening' ? '🌆 EVENING · 18:00 UTC'
            : '⚙ MANUAL BRIEF';
          const dateLabel  = new Date(sig.created_at * 1000).toLocaleDateString('en-US',
            { weekday: 'short', month: 'short', day: 'numeric' });

          return (
            <div key={sig.id} style={{ marginBottom: 10, border: `1px solid ${pColor}22`,
              borderRadius: 8, overflow: 'hidden', background: pBg }}>

              {/* ── Brief header ── */}
              <button onClick={() => setExpanded(isOpen ? null : idx)}
                style={{ width: '100%', padding: '12px 14px', background: 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    {/* Date + slot */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 7, color: C.dim, fontFamily: FM }}>{slotLabel}</span>
                      <span style={{ fontSize: 7, color: C.dim }}>·</span>
                      <span style={{ fontSize: 7, color: C.dim }}>{dateLabel}</span>
                    </div>
                    {/* Posture */}
                    <div style={{ fontFamily: FH, fontSize: 20, letterSpacing: 3, color: pColor, marginBottom: 4 }}>
                      {brief?.posture ?? '—'}
                    </div>
                    {/* Headline */}
                    {brief?.headline && (
                      <div style={{ fontSize: 8, color: 'rgba(180,200,220,0.7)', lineHeight: 1.6, fontFamily: FM }}>
                        {brief.headline}
                      </div>
                    )}
                  </div>
                  {/* Confidence + confluence */}
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 7, color: C.dim, letterSpacing: 1, marginBottom: 1 }}>CONFIDENCE</div>
                    <div style={{ fontSize: 22, fontFamily: FH, color: pColor }}>{brief?.confidence ?? '—'}%</div>
                    {sig.confluence > 0 && (
                      <div style={{ fontSize: 7, color: C.dim, marginTop: 2 }}>
                        {sig.confluence}/100 confluence
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: C.dim, flexShrink: 0,
                    transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                </div>
              </button>

              {/* ── Expanded content ── */}
              {isOpen && (
                <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${pColor}15` }}>

                  {/* Confluence bar */}
                  {sig.confluence > 0 && (
                    <div style={{ margin: '12px 0' }}>
                      <ConfluenceBar score={sig.confluence} />
                    </div>
                  )}

                  {/* Active narratives */}
                  {narratives.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 7, letterSpacing: 2, color: C.cyanDim, fontFamily: FM, marginBottom: 6 }}>
                        🗺 ACTIVE NARRATIVES
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {narratives.map((n, i) => <NarrativeTag key={i} n={n} />)}
                      </div>
                    </div>
                  )}

                  {/* Analysis sections */}
                  {brief?.sections && Object.entries(brief.sections).map(([key, text]: [string, any]) => {
                    const meta = SECTION_META[key] ?? { label: key.toUpperCase(), icon: '◈' };
                    return (
                      <div key={key} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 8, letterSpacing: 2, color: C.cyanDim, fontFamily: FM, marginBottom: 5 }}>
                          {meta.icon} {meta.label}
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(180,200,220,0.75)', lineHeight: 1.8,
                          fontFamily: FM, borderLeft: `2px solid ${pColor}33`, paddingLeft: 10 }}>
                          {text}
                        </div>
                      </div>
                    );
                  })}

                  {/* Per-token breakdown */}
                  {Object.keys(tokens).length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 8, letterSpacing: 2, color: C.cyanDim, fontFamily: FM, marginBottom: 8 }}>
                        ◈ TOKEN ANALYSIS
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {Object.entries(tokens).map(([sym, data]: [string, any], i) => (
                          <TokenCard key={sym} symbol={sym} data={data} isSpotlight={i === 4} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sources + timestamp */}
                  <div style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.02)',
                    borderRadius: 4, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 7, color: C.dim, letterSpacing: 1 }}>
                      Generated: {new Date(sig.created_at * 1000).toLocaleString('en-US', { timeZone: 'UTC' })} UTC
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Disclaimer */}
        <div style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 6,
          background: C.cyanFaint, margin: '4px 0 8px' }}>
          <div style={{ fontSize: 7, color: C.dim, lineHeight: 1.7 }}>
            ℹ HUB AI synthesises data from ProtocolHub panels, chain metrics, and market signals.
            All briefs are informational only — not financial advice.
          </div>
        </div>
      </div>
    </div>
  );
}
