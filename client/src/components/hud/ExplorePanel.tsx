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
  MARKET:  60,
  PAIRS:   60,
  YIELDS:  5 * 60,
  NEWS:    10 * 60,
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

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

const TAG_COLOR: Record<NewsTag, string> = {
  ALL:    C.cyan,
  SOLANA: C.solPurple,
  DEFI:   C.green,
  MARKET: C.orange,
  WEB3:   C.purple,
};

/* ─── SHARED ATOMS ───────────────────────────────────────────────────────── */
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
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '6px 10px', color: C.text, fontSize: 10, fontFamily: FM, outline: 'none', boxSizing: 'border-box' }} />
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

  useEffect(() => { load(mode, 1, q); }, [mode, q]);
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
      <div style={{ padding: '8px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{ padding: '4px 12px', borderRadius: 3, border: `1px solid ${mode === m.id ? C.cyan : C.border}`, background: mode === m.id ? C.cyanFaint : 'transparent', color: mode === m.id ? C.cyan : C.dim, fontSize: 9, cursor: 'pointer', fontFamily: FM, letterSpacing: 1 }}>
              {m.label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto' }}><RefreshBadge ms={lastMs} every={TTL.MARKET} /></div>
        </div>
        <SearchBar value={q} onChange={setQ} placeholder="Search by name or symbol..." />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 90px 80px auto', gap: 6, padding: '4px 4px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 540 }}>
        {['#', 'NAME', 'PRICE', '24H', 'MCap', 'VOL', 'AI'].map(h => (
          <div key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>{h}</div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {loading && <Loader />}
        {!loading && coins.map((coin, i) => (
          <div key={coin.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 90px 80px auto', gap: 6, padding: '7px 4px', borderBottom: `1px solid rgba(255,255,255,0.03)`, alignItems: 'center', animation: `rowPopEx 0.2s ease ${Math.min(i, 10) * 0.02}s both`, minWidth: 540 }}>
            <span style={{ fontSize: 8, color: C.dim, textAlign: 'right' }}>{coin.rank}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{coin.name}</div>
              <div style={{ fontSize: 8, color: C.dim }}>{coin.symbol}</div>
            </div>
            <span style={{ fontSize: 10, color: C.silver, textAlign: 'right' }}>${fmtPrice(coin.price)}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: chgColor(coin.priceChange24h), textAlign: 'right' }}>{chgSign(coin.priceChange24h)}</span>
            <span style={{ fontSize: 9, color: C.dim, textAlign: 'right' }}>${fmtBig(coin.marketCap)}</span>
            <span style={{ fontSize: 9, color: C.dim, textAlign: 'right' }}>${fmtBig(coin.volume24h)}</span>
            <AiScoreBadge score={scoreFromCoinGecko(coin)} compact />
          </div>
        ))}
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
      <div style={{ padding: '8px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: FH, fontSize: 13, letterSpacing: 2, color: C.cyan, flexShrink: 0 }}>DEX PAIRS</span>
          <div style={{ marginLeft: 'auto' }}><RefreshBadge ms={lastMs} every={TTL.PAIRS} /></div>
        </div>
        <SearchBar value={q} onChange={setQ} placeholder="Search by token symbol..." />
        <div style={{ fontSize: 7, color: C.dim, marginTop: 4, letterSpacing: 1 }}>Solana + Ethereum · liquidity &gt; $5K · {total.toLocaleString()} pairs</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 90px 80px 60px auto', gap: 6, padding: '4px 4px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 560 }}>
        {['PAIR', 'PRICE', '24H', 'LIQUIDITY', 'VOLUME', 'BUYS', 'AI'].map(h => (
          <div key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>{h}</div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {loading && <Loader />}
        {!loading && pairs.map((pair, i) => {
          const buys  = pair.buys24h;
          const sells = pair.sells24h;
          const tot   = buys + sells;
          const buyPct = tot > 0 ? Math.round((buys / tot) * 100) : 50;
          return (
            <div key={pair.pairAddress} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 90px 80px 60px auto', gap: 6, padding: '7px 4px', borderBottom: `1px solid rgba(255,255,255,0.03)`, alignItems: 'center', animation: `rowPopEx 0.2s ease ${Math.min(i, 10) * 0.02}s both`, minWidth: 560 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, color: C.text, fontWeight: 700 }}>{pair.baseSymbol}</span>
                  <span style={{ fontSize: 8, color: C.dim }}>/</span>
                  <span style={{ fontSize: 9, color: C.dim }}>{pair.quoteSymbol}</span>
                  <Pill label={pair.chainId.toUpperCase().slice(0, 3)} color={chainColor(pair.chainId)} />
                </div>
                <div style={{ fontSize: 7, color: C.cyanDim }}>{pair.dexId}</div>
              </div>
              <span style={{ fontSize: 10, color: C.silver }}>${fmtPrice(pair.priceUsd)}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: chgColor(pair.priceChange24h) }}>{chgSign(pair.priceChange24h)}</span>
              <span style={{ fontSize: 9, color: pair.liquidityUsd < 50_000 ? C.red : C.dim }}>${fmtBig(pair.liquidityUsd)}</span>
              <span style={{ fontSize: 9, color: C.dim }}>${fmtBig(pair.volume24h)}</span>
              <div>
                <div style={{ height: 3, background: `${C.red}44`, borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
                  <div style={{ height: '100%', width: `${buyPct}%`, background: C.green, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 7, color: buyPct >= 55 ? C.green : C.red }}>{buyPct}% B</div>
              </div>
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
      <div style={{ padding: '8px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: FH, fontSize: 13, letterSpacing: 2, color: C.cyan }}>YIELD POOLS</span>
          <span style={{ fontSize: 8, color: C.dim }}>stablecoins only · {total} pools</span>
          <div style={{ marginLeft: 'auto' }}><RefreshBadge ms={lastMs} every={TTL.YIELDS} /></div>
        </div>
        <SearchBar value={q} onChange={setQ} placeholder="Search by protocol or symbol..." />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px 70px 50px', gap: 6, padding: '4px 4px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 460 }}>
        {['POOL', 'CHAIN', 'APY', 'TVL', 'BASE', 'IL'].map(h => (
          <div key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>{h}</div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {loading && <Loader />}
        {!loading && pools.map((pool, i) => (
          <div key={pool.pool} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px 70px 50px', gap: 6, padding: '7px 4px', borderBottom: `1px solid rgba(255,255,255,0.03)`, alignItems: 'center', animation: `rowPopEx 0.2s ease ${Math.min(i, 10) * 0.02}s both`, minWidth: 460 }}>
            <div>
              <div style={{ fontSize: 10, color: C.text, fontWeight: 700 }}>{pool.symbol}</div>
              <div style={{ fontSize: 7, color: C.cyanDim }}>{pool.project}</div>
            </div>
            <Pill label={pool.chain.slice(0, 5).toUpperCase()} color={chainColor(pool.chain)} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: apyColor(pool.apy) }}>{pool.apy.toFixed(2)}%</div>
              {pool.apyReward != null && <div style={{ fontSize: 7, color: C.dim }}>+{pool.apyReward.toFixed(2)}% rwrd</div>}
            </div>
            <div><div style={{ fontSize: 10, color: C.silver }}>${fmtBig(pool.tvlUsd)}</div></div>
            <span style={{ fontSize: 9, color: C.dim }}>{pool.apyBase.toFixed(2)}%</span>
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

      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {loading && <Loader />}
        {!loading && filtered.map((item, i) => {
          const tagColor = TAG_COLOR[item.tag as NewsTag] ?? C.cyan;
          const isOpen   = expanded === item.id;
          const totalVotes = (item.votes?.positive ?? 0) + (item.votes?.negative ?? 0);
          const bullPct = totalVotes > 0 ? Math.round(((item.votes?.positive ?? 0) / totalVotes) * 100) : 0;
          return (
            <div key={item.id} onClick={() => setExpanded(isOpen ? null : item.id)}
              style={{ padding: '10px 6px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', animation: `rowPopEx 0.2s ease ${Math.min(i, 8) * 0.03}s both` }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Pill label={item.tag} color={tagColor} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.text, lineHeight: 1.4, marginBottom: 4 }}>{item.title}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 8, color: C.cyanDim }}>{item.source}</span>
                    <span style={{ fontSize: 8, color: C.dim }}>{item.time}</span>
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
   SNIPER TAB — points gated
   ═══════════════════════════════════════════════════════════════════════════ */
function SniperTab() {
  const [unlocked, setUnlocked] = useState(() => {
    try { const exp = localStorage.getItem('sniper_unlock_exp'); return exp ? Date.now() < parseInt(exp) : false; } catch { return false; }
  });
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (unlocked) return;
    async function checkAccess() {
      try {
        const gateRes = await fetch('/api/gate/status');
        const gate = await gateRes.json();
        if (!gate.gateLive) { setUnlocked(true); localStorage.setItem('sniper_unlock_exp', String(Date.now() + 24 * 60 * 60 * 1000)); return; }
        const wallet = (window as any).__walletPublicKey || localStorage.getItem('connectedWallet');
        if (!wallet) return;
        const r = await fetch(`/api/nft/check/${wallet}`);
        const d = await r.json();
        if (d.hasAccess && (d.isWhitelisted || d.isFounder)) { setUnlocked(true); localStorage.setItem('sniper_unlock_exp', String(Date.now() + 365 * 24 * 60 * 60 * 1000)); }
      } catch {}
    }
    checkAccess();
  }, []);

  async function handleUnlock() {
    const wallet = (window as any).__walletPublicKey || localStorage.getItem('connectedWallet');
    if (!wallet) { alert('Connect your wallet first'); return; }
    setUnlocking(true);
    try {
      const res = await fetch('/api/points/burn-page-access', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wallet': wallet }, body: JSON.stringify({ page: 'sniper', wallet }) });
      const data = await res.json();
      if (data.success) { localStorage.setItem('sniper_unlock_exp', String(Date.now() + 24 * 60 * 60 * 1000)); setUnlocked(true); }
      else alert(data.error || 'Not enough points — you need 50 points to unlock');
    } catch { localStorage.setItem('sniper_unlock_exp', String(Date.now() + 24 * 60 * 60 * 1000)); setUnlocked(true); }
    setUnlocking(false);
  }

  if (!unlocked) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 28, fontFamily: FM }}>
      <div style={{ fontSize: 40 }}>⚡</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FH, fontSize: 24, letterSpacing: 4, color: C.purple, marginBottom: 4 }}>TOKEN LAUNCH SNIPER</div>
        <div style={{ fontSize: 8, color: C.dim, letterSpacing: 3 }}>REAL-TIME LAUNCHES · RUG SCORING · LIVE DATA</div>
      </div>
      <div style={{ fontSize: 9, color: C.dim, textAlign: 'center', lineHeight: 1.9, maxWidth: 340 }}>Catch new Solana token launches the moment they go live. Live buy/sell pressure, liquidity depth, risk flags, and rug detection — the edge you need in the first 10 minutes.</div>
      <div style={{ padding: '10px 24px', border: `1px solid rgba(153,102,255,0.3)`, borderRadius: 6, background: 'rgba(153,102,255,0.05)', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontFamily: FH, color: C.purple, letterSpacing: 2 }}>50 PTS · 24HR ACCESS</div>
      </div>
      <button onClick={handleUnlock} disabled={unlocking} style={{ padding: '12px 32px', borderRadius: 4, border: `1px solid ${C.purple}`, background: 'rgba(153,102,255,0.1)', color: C.purple, fontFamily: FM, fontSize: 10, letterSpacing: 2, fontWeight: 700, cursor: unlocking ? 'not-allowed' : 'pointer', opacity: unlocking ? 0.6 : 1 }}>
        {unlocking ? '⏳ UNLOCKING...' : '🔓 UNLOCK FOR 24HR — 50 PTS'}
      </button>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 10, fontFamily: FM }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
        <div>Sniper data loading...</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HUB AI TAB — points gated
   ═══════════════════════════════════════════════════════════════════════════ */
function HubAiTab() {
  const [unlocked, setUnlocked] = useState(() => {
    try { const exp = localStorage.getItem('hubai_unlock_exp'); return exp ? Date.now() < parseInt(exp) : false; } catch { return false; }
  });
  const [unlocking, setUnlocking] = useState(false);
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!unlocked) { setLoading(false); return; }
    const wallet = (window as any).__walletPublicKey || localStorage.getItem('connectedWallet') || '';
    fetch('/api/hub-ai', { headers: { 'x-wallet': wallet } }).then(r => r.json()).then(d => { if (d.signals) setSignals(d.signals); }).catch(() => {}).finally(() => setLoading(false));
  }, [unlocked]);

  async function handleUnlock() {
    const wallet = (window as any).__walletPublicKey || localStorage.getItem('connectedWallet');
    if (!wallet) { alert('Connect your wallet first'); return; }
    setUnlocking(true);
    try {
      const r = await fetch('/api/points/burn-page-access', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wallet': wallet }, body: JSON.stringify({ wallet, page: 'hub_ai' }) });
      const d = await r.json();
      if (d.success) { localStorage.setItem('hubai_unlock_exp', String(Date.now() + 24 * 60 * 60 * 1000)); setUnlocked(true); }
      else alert(d.error || 'Need 50 points');
    } catch { alert('Failed — try again'); }
    setUnlocking(false);
  }

  if (!unlocked) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 28, fontFamily: FM }}>
      <div style={{ fontSize: 40 }}>🤖</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FH, fontSize: 24, letterSpacing: 4, color: C.cyan, marginBottom: 4 }}>HUB AI</div>
        <div style={{ fontSize: 8, color: C.dim, letterSpacing: 3 }}>INTELLIGENCE DIGEST · TWICE DAILY</div>
      </div>
      <div style={{ fontSize: 9, color: C.dim, textAlign: 'center', lineHeight: 1.9, maxWidth: 340 }}>Comprehensive AI intelligence briefs with per-token analysis, confluence scoring, active narrative tracking, and real-time anomaly alerts.</div>
      <div style={{ padding: '10px 24px', border: `1px solid ${C.borderHi}`, borderRadius: 6, background: C.cyanFaint, textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontFamily: FH, color: C.yellow, letterSpacing: 2 }}>50 PTS · 24HR ACCESS</div>
        <div style={{ fontSize: 7, color: C.dim, marginTop: 2 }}>Briefs drop at 09:00 UTC and 18:00 UTC daily</div>
      </div>
      <button onClick={handleUnlock} disabled={unlocking} style={{ padding: '10px 36px', borderRadius: 4, border: `1px solid ${C.cyan}`, background: C.cyanFaint, color: C.cyan, fontFamily: FM, fontSize: 10, letterSpacing: 2, fontWeight: 700, cursor: unlocking ? 'not-allowed' : 'pointer', opacity: unlocking ? 0.6 : 1 }}>
        {unlocking ? '⟳ UNLOCKING...' : '🔓 UNLOCK — 50 POINTS'}
      </button>
    </div>
  );

  if (loading) return <Loader />;

  if (signals.length === 0) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28, fontFamily: FM }}>
      <div style={{ fontSize: 32 }}>🤖</div>
      <div style={{ fontFamily: FH, fontSize: 18, letterSpacing: 3, color: C.cyan }}>HUB AI</div>
      <div style={{ fontSize: 9, color: C.dim, textAlign: 'center', lineHeight: 1.8, maxWidth: 300 }}>No briefs generated yet. First brief drops at 09:00 UTC. The owner can generate one manually from the admin dashboard.</div>
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '8px 4px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
      {signals.map((sig, idx) => {
        const brief = typeof sig.brief === 'string' ? JSON.parse(sig.brief) : sig.brief;
        const pColor = sig.posture === 'BULLISH' ? C.green : sig.posture === 'BEARISH' ? C.red : C.yellow;
        return (
          <div key={sig.id} style={{ marginBottom: 10, padding: '14px', border: `1px solid ${pColor}22`, borderRadius: 6, background: `${pColor}04` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: FH, fontSize: 18, letterSpacing: 3, color: pColor }}>{sig.posture ?? 'NEUTRAL'}</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>CONFIDENCE</div>
                <div style={{ fontSize: 18, fontFamily: FH, color: pColor }}>{brief?.confidence ?? '—'}%</div>
              </div>
            </div>
            {brief?.headline && <div style={{ fontSize: 9, color: C.silver, lineHeight: 1.7, fontFamily: FM }}>{brief.headline}</div>}
            <div style={{ fontSize: 7, color: C.dim, marginTop: 8 }}>{new Date(sig.created_at * 1000).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN — EXPLORE PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
const TABS: { id: TabId; label: string; }[] = [
  { id: 'market',     label: 'MARKET'      },
  { id: 'pairs',      label: 'DEX PAIRS'   },
  { id: 'yields',     label: 'YIELDS'      },
  { id: 'news',       label: 'NEWS'        },
  { id: 'narrative',  label: 'NARRATIVE'   },
  { id: 'alpha',      label: 'ALPHA FEED'  },
  { id: 'smartmoney', label: 'SMART MONEY' },
  { id: 'sniper',     label: '🔒 SNIPER'    },
  { id: 'hubai',      label: '🤖 HUB AI'    },
];

export default function ExplorePanel({ features = {} }: { features?: Record<string, string> }) {
  const [tab, setTab] = useState<TabId>('market');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>
      <div style={{ display: 'flex', gap: 2, padding: '6px 6px 0', borderBottom: `1px solid ${C.border}`, overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '6px 14px', borderRadius: '4px 4px 0 0', border: 'none', cursor: 'pointer', background: tab === t.id ? C.cyanFaint : 'transparent', borderBottom: tab === t.id ? `2px solid ${C.cyan}` : '2px solid transparent', color: tab === t.id ? C.cyan : C.dim, fontSize: 9, fontFamily: FM, letterSpacing: 2, fontWeight: 700, whiteSpace: 'nowrap', transition: 'color 0.2s, background 0.2s' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '0 6px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {tab === 'market'     && <MarketTab />}
        {tab === 'pairs'      && <DexPairsTab />}
        {tab === 'yields'     && <YieldsTab />}
        {tab === 'news'       && <NewsTab />}
        {tab === 'narrative'  && (
          features['narrative'] === 'unlocked'
            ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:C.dim, fontSize:10 }}>Narrative data loading...</div>
            : <div style={{ position: 'relative', height: '100%', minHeight: 400 }}><ComingSoon featureName="NARRATIVE" description="Dominant market narratives and momentum scores" panel="Explore" /></div>
        )}
        {tab === 'alpha'      && (
          features['alpha_feed'] === 'unlocked'
            ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:C.dim, fontSize:10 }}>Alpha feed loading...</div>
            : <div style={{ position: 'relative', height: '100%', minHeight: 400 }}><ComingSoon featureName="ALPHA FEED" description="High-signal market intelligence and unusual activity" panel="Explore" /></div>
        )}
        {tab === 'smartmoney' && (
          features['smart_money_explore'] === 'unlocked'
            ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:C.dim, fontSize:10 }}>Smart money data loading...</div>
            : <div style={{ position: 'relative', height: '100%', minHeight: 400 }}><ComingSoon featureName="SMART MONEY" description="Whale wallet convergence signals" panel="Explore" /></div>
        )}
        {tab === 'sniper'     && <SniperTab />}
        {tab === 'hubai'      && <HubAiTab />}
      </div>
    </div>
  );
}
