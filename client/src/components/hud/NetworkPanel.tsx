// client/src/components/panels/NetworkPanel.tsx
// Tabs: MARKET INTEL | DEX FLOWS | CHAIN | VALIDATORS
// APIs: CoinGecko · Alternative.me · DexScreener · Solana RPC (all free, no key)

import { useState, useEffect, useCallback } from 'react';
import ComingSoon from '../shared/ComingSoon';
import AiScoreBadge from '../../aiscorebadge';
import { scoreAsset } from '../../aiscoring';

/* ─── FONTS ─────────────────────────────────────────────────────────────── */
if (typeof document !== 'undefined' && !document.getElementById('net-kf')) {
  const style = document.createElement('style');
  style.id = 'net-kf';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Bebas+Neue&display=swap');
    @keyframes netSpin   { to { transform: rotate(360deg); } }
    @keyframes livePulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
    @keyframes rowPop    { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:translateX(0); } }
  `;
  document.head.appendChild(style);
}

/* ─── DESIGN TOKENS ─────────────────────────────────────────────────────── */
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

/* ─── IN-MODULE CACHE ───────────────────────────────────────────────────────
 * Module-level singleton. Lives outside any component so it survives tab
 * switches, re-renders, and remounts for the lifetime of the browser session.
 * All 7-8k users' browsers each have their own copy — this protects against
 * the same user hammering refresh, and keeps API calls to one per TTL window
 * per browser. Pair this with a server-side proxy later if you need true
 * shared caching across all users.
 * ─────────────────────────────────────────────────────────────────────────── */
interface CacheEntry<T> {
  data:      T;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry<unknown>>();

async function cachedFetch<T>(
  key:        string,
  fetcher:    () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  const hit = _cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() < hit.expiresAt) return hit.data;

  const data = await fetcher();
  _cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1_000 });
  return data;
}

// TTL constants — one place to tune all timings
const TTL = {
  MARKETS:    3 * 60,   //  3 min  — CoinGecko prices
  GLOBAL:     3 * 60,   //  3 min  — CoinGecko global stats
  TRENDING:   5 * 60,   //  5 min  — trending list
  FNG:       60 * 60,   // 60 min  — Fear & Greed (source updates once/day)
  DEX_PAIRS:     60,    //  1 min  — DexScreener pairs
  DEX_NEW:       60,    //  1 min  — new listings
  DEX_BOOST:  5 * 60,   //  5 min  — boosted tokens
  SOL_PERF:      30,    // 30 sec  — TPS samples
  SOL_FEES:      30,    // 30 sec  — priority fees
  SOL_EPOCH:  2 * 60,   //  2 min  — epoch/slot info
  SOL_SUPPLY: 15 * 60,  // 15 min  — circulating supply
  SOL_HEALTH:    30,    // 30 sec  — network health
  VALIDATORS: 15 * 60,  // 15 min  — vote accounts
  NODES:      10 * 60,  // 10 min  — cluster nodes
} as const;

// API helper — all Solana calls go through the backend to avoid CORS
async function api<T = any>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

/* ─── SCORING ───────────────────────────────────────────────────────────── */
function scoreCoin(coin: any) {
  return scoreAsset({
    priceChange24h: coin.price_change_percentage_24h ?? coin.price_change_percentage_24h_in_currency ?? 0,
    volume24h:      coin.total_volume   ?? 0,
    marketCap:      coin.market_cap     ?? 0,
  });
}

function scorePair(pair: any) {
  return scoreAsset({
    priceChange24h: pair.priceChange?.h24  ?? 0,
    volume24h:      pair.volume?.h24       ?? 0,
    liquidity:      pair.liquidity?.usd    ?? 0,
  });
}

function scoreTrending(item: any) {
  const c = item.item ?? item;
  return scoreAsset({
    priceChange24h: c.data?.price_change_percentage_24h?.usd ?? 0,
    volume24h:      c.data?.total_volume ?? 0,
    marketCap:      c.data?.market_cap   ?? 0,
  });
}

/* ─── UTILS ─────────────────────────────────────────────────────────────── */
function fmtPrice(n: number): string {
  if (!n)          return '0.00';
  if (n < 0.00001) return n.toExponential(2);
  if (n < 0.001)   return n.toFixed(6);
  if (n < 1)       return n.toFixed(4);
  if (n < 1000)    return n.toFixed(2);
  return fmtBig(n);
}

function fmtBig(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function timeAgo(ts: number | string): string {
  const s = Math.floor((Date.now() - Number(new Date(ts))) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function chgColor(v: number): string { return v >= 0 ? C.green : C.red; }
function chgSign(v: number): string  { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }

/* ─── SHARED ATOMS ──────────────────────────────────────────────────────── */
function ScrollArea({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      height:         '100%',
      overflowY:      'auto',
      overflowX:      'auto',
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(0,180,255,0.15) transparent',
    }}>
      {children}
    </div>
  );
}

function Loader() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200 }}>
      <div style={{ width:16, height:16, border:`1px solid ${C.cyanFaint}`, borderTop:`1px solid ${C.cyan}`, borderRadius:'50%', animation:'netSpin 0.8s linear infinite' }} />
    </div>
  );
}

function LiveDot() {
  return (
    <span style={{ display:'flex', alignItems:'center', gap:5 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:C.green, boxShadow:`0 0 6px ${C.green}`, animation:'livePulse 2s ease-in-out infinite', display:'inline-block' }} />
      <span style={{ fontSize:7, letterSpacing:2, color:'rgba(0,255,136,0.5)', fontFamily:FM }}>LIVE</span>
    </span>
  );
}

function RefreshBadge({ ms, every }: { ms: number; every: number }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec(ms > 0 ? Math.floor((Date.now() - ms) / 1000) : 0), 1000);
    return () => clearInterval(t);
  }, [ms]);
  return (
    <span style={{ fontSize:8, color:C.dim, fontFamily:FM, letterSpacing:1 }}>
      ↻ {sec}s · /{every}s
    </span>
  );
}

function SecHead({ label }: { label: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, margin:'12px 0 7px' }}>
      <div style={{ width:3, height:11, background:C.cyan, boxShadow:`0 0 5px ${C.cyan}` }} />
      <span style={{ fontSize:8, letterSpacing:2, color:C.cyanDim, fontFamily:FM, whiteSpace:'nowrap' }}>{label}</span>
      <div style={{ flex:1, height:1, background:C.border }} />
    </div>
  );
}

function StatCard({ label, value, color, sub }: { label:string; value:string; color:string; sub?:string }) {
  return (
    <div style={{ padding:'8px 12px', border:`1px solid ${C.border}`, borderRadius:6, background:C.cyanFaint }}>
      <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:3, fontFamily:FM }}>{label}</div>
      <div style={{ fontSize:14, fontFamily:FH, letterSpacing:1, color }}>{value}</div>
      {sub && <div style={{ fontSize:7, color:C.dim, marginTop:2, fontFamily:FM }}>{sub}</div>}
    </div>
  );
}

function ChgCell({ v }: { v: number }) {
  return <span style={{ fontSize:8, fontWeight:600, color:chgColor(v), fontFamily:FM }}>{chgSign(v)}</span>;
}

function BarRow({ label, pct, color }: { label:string; pct:number; color:string }) {
  return (
    <div style={{ marginBottom:7 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
        <span style={{ fontSize:8, color, letterSpacing:1, fontFamily:FM }}>{label}</span>
        <span style={{ fontSize:8, color:C.dim, fontFamily:FM }}>{pct.toFixed(2)}%</span>
      </div>
      <div style={{ height:4, background:'rgba(255,255,255,0.05)', borderRadius:2, overflow:'hidden' }}>
        <div style={{ width:`${Math.min(pct, 100)}%`, height:'100%', background:`linear-gradient(90deg,${color}66,${color})`, borderRadius:2, transition:'width 0.6s ease' }} />
      </div>
    </div>
  );
}

/* ─── TAB BUTTON ────────────────────────────────────────────────────────── */
function TabBtn({ label, active, onClick }: { label:string; active:boolean; onClick:()=>void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding:       '8px 16px',
        background:    active ? 'rgba(0,180,255,0.08)' : 'transparent',
        border:        'none',
        borderBottom:  active ? `2px solid ${C.cyan}` : '2px solid transparent',
        color:         active ? C.cyan : C.dim,
        fontFamily:    FM,
        fontSize:      9,
        letterSpacing: 3,
        fontWeight:    active ? 700 : 400,
        cursor:        'pointer',
        textTransform: 'uppercase',
        whiteSpace:    'nowrap',
        flexShrink:    0,
        transition:    'color 0.15s, border-color 0.15s',
      }}
    >
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANEL ROOT — no background / border / borderRadius, parent panel owns that
   ═══════════════════════════════════════════════════════════════════════════ */
type Tab = 'intel' | 'flows' | 'chain' | 'validators' | 'protocols' | 'staking' | 'capitalflow';

export default function NetworkPanel({ onClose, features = {} }: { onClose?: () => void; features?: Record<string, string> }) {
  const [tab, setTab] = useState<Tab>('intel');

  const TABS: { id: Tab; label: string }[] = [
    { id: 'intel',      label: 'MARKET INTEL' },
    { id: 'flows',      label: 'DEX FLOWS'    },
    { id: 'chain',      label: 'CHAIN'        },
    { id: 'validators', label: 'VALIDATORS'   },
    { id: 'protocols',  label: 'PROTOCOLS'    },
    { id: 'staking',    label: 'STAKING'      },
    { id: 'capitalflow', label: 'CAPITAL FLOW' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', fontFamily:FM, color:C.text }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 20px 0', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
          <span style={{ fontFamily:FH, fontSize:26, letterSpacing:3, color:C.cyan }}>NETWORK</span>
          <LiveDot />
        </div>
        <span style={{ fontSize:8, color:C.dim, letterSpacing:2, fontFamily:FM }}>PANEL 01</span>
      </div>

      {/* Tab bar — horizontally scrollable, no visible scrollbar */}
      <div style={{
        display:          'flex',
        gap:              2,
        padding:          '10px 20px 0',
        flexShrink:       0,
        borderBottom:     `1px solid ${C.border}`,
        overflowX:        'auto',
        scrollbarWidth:   'none',
      }}>
        {TABS.map(t => (
          <TabBtn key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:'hidden', minHeight:0 }}>
        {tab === 'intel'      && <IntelTab />}
        {tab === 'flows'      && <FlowsTab />}
        {tab === 'chain'      && <ChainTab />}
        {tab === 'validators' && <ValidatorsTab />}
        {tab === 'protocols'  && <ProtocolsTab />}
        {tab === 'staking'    && <StakingTab />}
        {tab === 'capitalflow' && (
          features['capital_flow'] === 'unlocked'
            ? <CapitalFlowTab />
            : <div style={{ position: 'relative', height: '100%', minHeight: 400 }}>
                <ComingSoon featureName="CAPITAL FLOW & ROTATION" description="Sector rotation, smart money destinations, bridge inflows, whale concentration" panel="Network" />
              </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB — MARKET INTEL
   CoinGecko public API + Alternative.me Fear & Greed
   Refresh: 60s
   ═══════════════════════════════════════════════════════════════════════════ */
function IntelTab() {
  const [fng,      setFng]      = useState<any>(null);
  const [global_,  setGlobal]   = useState<any>(null);
  const [trending, setTrending] = useState<any[]>([]);
  const [markets,  setMarkets]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [lastMs,   setLastMs]   = useState(0);

  const load = useCallback(async () => {
    try {
      const [fng, global_, trending, markets] = await Promise.all([
        cachedFetch('fng',      () => fetch('https://api.alternative.me/fng/?limit=10').then(r => r.json()), TTL.FNG),
        cachedFetch('global',   () => fetch('https://api.coingecko.com/api/v3/global').then(r => r.json()), TTL.GLOBAL),
        cachedFetch('trending', () => fetch('https://api.coingecko.com/api/v3/search/trending').then(r => r.json()), TTL.TRENDING),
        cachedFetch('markets',  () => fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&sparkline=false&price_change_percentage=1h%2C24h%2C7d').then(r => r.json()), TTL.MARKETS),
      ]);
      setFng(fng);
      setGlobal((global_ as any)?.data);
      setTrending((trending as any)?.coins ?? []);
      setMarkets((markets as any) ?? []);
      setLastMs(Date.now());
    } catch (e) {
      console.error('[IntelTab]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, TTL.MARKETS * 1_000); return () => clearInterval(t); }, [load]);

  if (loading) return <Loader />;

  const fngVal   = Number(fng?.data?.[0]?.value ?? 50);
  const fngLabel = (fng?.data?.[0]?.value_classification ?? 'Neutral').toUpperCase();
  const fngColor = fngVal >= 75 ? C.green : fngVal >= 55 ? '#88ff44' : fngVal >= 45 ? C.yellow : fngVal >= 25 ? C.orange : C.red;
  const fng10d   = ([...(fng?.data ?? [])] as any[]).slice(0, 10).reverse();

  const g        = global_ ?? {};
  const mcap     = g.total_market_cap?.usd ?? 0;
  const vol      = g.total_volume?.usd ?? 0;
  const btcDom   = g.market_cap_percentage?.btc ?? 0;
  const ethDom   = g.market_cap_percentage?.eth ?? 0;
  const solDom   = g.market_cap_percentage?.sol ?? 0;
  const active   = g.active_cryptocurrencies ?? 0;
  const defiMcap = g.defi_market_cap ?? 0;
  const defiPct  = mcap > 0 ? (defiMcap / mcap) * 100 : 0;
  const mcapChg  = g.market_cap_change_percentage_24h_usd ?? 0;
  const stblPct  = (g.market_cap_percentage?.usdt ?? 0) + (g.market_cap_percentage?.usdc ?? 0);

  const sorted  = [...markets].sort((a, b) => (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0));
  const gainers = sorted.slice(0, 5);
  const losers  = sorted.slice(-5).reverse();
  const byVol   = [...markets].sort((a, b) => (b.total_volume ?? 0) - (a.total_volume ?? 0)).slice(0, 8);

  return (
    <ScrollArea>
      <div style={{ padding:'4px 20px 0', display:'flex', justifyContent:'flex-end' }}>
        <RefreshBadge ms={lastMs} every={60} />
      </div>

      {/* Fear & Greed */}
      <div style={{ margin:'8px 20px', padding:'14px 18px', border:`1px solid ${fngColor}33`, borderRadius:8, background:`${fngColor}06`, display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ textAlign:'center', minWidth:78 }}>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:4, fontFamily:FM }}>FEAR & GREED</div>
          <div style={{ fontSize:50, fontFamily:FH, color:fngColor, lineHeight:1 }}>{fngVal}</div>
          <div style={{ fontSize:8, letterSpacing:2, color:fngColor, marginTop:4, fontWeight:700, fontFamily:FM }}>{fngLabel}</div>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:6, fontFamily:FM }}>10-DAY TREND</div>
          <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:42 }}>
            {fng10d.map((d: any, i: number) => {
              const v   = Number(d.value);
              const col = v >= 75 ? C.green : v >= 55 ? '#88ff44' : v >= 45 ? C.yellow : v >= 25 ? C.orange : C.red;
              const now = i === fng10d.length - 1;
              return (
                <div key={i} title={`${d.value_classification} · ${v}`} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                  <div style={{ width:'100%', height:`${(v / 100) * 42}px`, background:col, borderRadius:2, opacity:now ? 1 : 0.5, boxShadow:now ? `0 0 8px ${col}` : 'none', transition:'height 0.5s' }} />
                  <span style={{ fontSize:6, color:now ? col : C.dim, fontFamily:FM }}>{v}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:2 }}>
            <span style={{ fontSize:6, color:C.dim, fontFamily:FM }}>10 DAYS AGO</span>
            <span style={{ fontSize:6, color:C.dim, fontFamily:FM }}>TODAY</span>
          </div>
        </div>
        <div style={{ textAlign:'center', minWidth:58 }}>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:6, fontFamily:FM }}>MCAP 24H</div>
          <div style={{ fontSize:20, color:mcapChg >= 0 ? C.green : C.red }}>{mcapChg >= 0 ? '▲' : '▼'}</div>
          <div style={{ fontSize:13, fontWeight:700, color:mcapChg >= 0 ? C.green : C.red, fontFamily:FH, letterSpacing:1 }}>
            {mcapChg >= 0 ? '+' : ''}{mcapChg.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Global stats */}
      <div style={{ margin:'0 20px 10px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 }}>
        <StatCard label="TOTAL MCAP"   value={`$${fmtBig(mcap)}`}           color={C.cyan}      sub={`${mcapChg >= 0 ? '+' : ''}${mcapChg.toFixed(2)}% 24h`} />
        <StatCard label="24H VOLUME"   value={`$${fmtBig(vol)}`}             color={C.silver}    sub={`${((vol/mcap)*100).toFixed(1)}% of mcap`} />
        <StatCard label="BTC DOM"      value={`${btcDom.toFixed(1)}%`}       color={C.btcOrange} />
        <StatCard label="ETH DOM"      value={`${ethDom.toFixed(1)}%`}       color={C.ethBlue}   />
        <StatCard label="SOL DOM"      value={`${solDom.toFixed(1)}%`}       color={C.solPurple} />
        <StatCard label="ACTIVE COINS" value={active.toLocaleString()}        color={C.text}      />
      </div>

      {/* Dominance bars */}
      <div style={{ margin:'0 20px 10px', padding:'10px 14px', border:`1px solid ${C.border}`, borderRadius:6, background:C.cyanFaint }}>
        <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:8, fontFamily:FM }}>DOMINANCE SPLIT</div>
        <BarRow label="BTC"    pct={btcDom}  color={C.btcOrange} />
        <BarRow label="ETH"    pct={ethDom}  color={C.ethBlue}   />
        <BarRow label="SOL"    pct={solDom}  color={C.solPurple} />
        <BarRow label="STABLE" pct={stblPct} color="#44ffcc"     />
        <BarRow label="DeFi"   pct={defiPct} color={C.purple}    />
      </div>

      {/* Trending */}
      <div style={{ padding:'0 20px' }}>
        <SecHead label="🔥 TRENDING NOW · COINGECKO" />
        <div style={{ display:'grid', gridTemplateColumns:'20px 65px 80px 60px 50px 1fr', gap:8, padding:'0 0 5px', borderBottom:`1px solid ${C.border}` }}>
          {['#','SYMBOL','PRICE','24H','RANK','AI SIGNAL'].map(h => (
            <span key={h} style={{ fontSize:7, letterSpacing:2, color:C.dim, fontFamily:FM }}>{h}</span>
          ))}
        </div>
        {trending.slice(0, 7).map((item: any, i: number) => {
          const c   = item.item;
          const chg = c.data?.price_change_percentage_24h?.usd ?? 0;
          return (
            <div key={c.id} style={{ display:'grid', gridTemplateColumns:'20px 65px 80px 60px 50px 1fr', alignItems:'center', gap:8, padding:'7px 0', borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:9, color:C.dim, fontFamily:FM }}>{i + 1}</span>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:C.cyan, fontFamily:FM }}>{c.symbol?.toUpperCase()}</div>
                <div style={{ fontSize:7, color:C.dim, fontFamily:FM, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</div>
              </div>
              <span style={{ fontSize:9, color:C.text, fontFamily:FM }}>${fmtPrice(c.data?.price ?? 0)}</span>
              <span style={{ fontSize:9, fontWeight:700, color:chgColor(chg), fontFamily:FM }}>{chgSign(chg)}</span>
              <span style={{ fontSize:9, color:C.dim, fontFamily:FM }}>#{c.market_cap_rank ?? '?'}</span>
              <AiScoreBadge score={scoreTrending(item)} compact />
            </div>
          );
        })}
      </div>

      {/* Gainers / Losers */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, margin:'10px 20px' }}>
        {[
          { title:'▲ TOP GAINERS 24H', color:C.green,  coins:gainers, plus:true  },
          { title:'▼ TOP LOSERS 24H',  color:C.red,    coins:losers,  plus:false },
        ].map(({ title, color, coins, plus }) => (
          <div key={title} style={{ border:`1px solid ${color}22`, borderRadius:6, overflow:'hidden' }}>
            <div style={{ padding:'5px 10px', background:`${color}0a`, fontSize:8, letterSpacing:2, color, fontFamily:FM }}>{title}</div>
            {coins.map((coin: any) => (
              <div key={coin.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 10px', borderTop:`1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:C.cyan, fontFamily:FM }}>{coin.symbol?.toUpperCase()}</div>
                  <div style={{ fontSize:7, color:C.dim, fontFamily:FM }}>${fmtPrice(coin.current_price ?? 0)}</div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, color, fontFamily:FM }}>
                  {plus ? '+' : ''}{(coin.price_change_percentage_24h ?? 0).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Volume leaders */}
      <div style={{ margin:'0 20px 16px' }}>
        <SecHead label="📊 VOLUME LEADERS 24H" />
        {byVol.map((coin: any, i: number) => {
          const volPct = (coin.total_volume / (byVol[0]?.total_volume ?? 1)) * 100;
          return (
            <div key={coin.id} style={{ display:'grid', gridTemplateColumns:'20px 55px 1fr 80px 70px 120px', alignItems:'center', gap:8, padding:'6px 0', borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:9, color:C.dim, fontFamily:FM }}>{i + 1}</span>
              <span style={{ fontSize:10, fontWeight:700, color:C.cyan, fontFamily:FM }}>{coin.symbol?.toUpperCase()}</span>
              <div style={{ height:3, background:'rgba(255,255,255,0.05)', borderRadius:2, overflow:'hidden' }}>
                <div style={{ width:`${volPct}%`, height:'100%', background:C.purple, borderRadius:2 }} />
              </div>
              <span style={{ fontSize:9, color:C.silver, fontFamily:FM }}>${fmtBig(coin.total_volume)}</span>
              <span style={{ fontSize:9, fontWeight:700, color:chgColor(coin.price_change_percentage_24h ?? 0), fontFamily:FM }}>
                {chgSign(coin.price_change_percentage_24h ?? 0)}
              </span>
              <AiScoreBadge score={scoreCoin(coin)} compact />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB — DEX FLOWS
   DexScreener public API — no key required
   Refresh: 30s
   ═══════════════════════════════════════════════════════════════════════════ */
function FlowsTab() {
  const [pairs,    setPairs]    = useState<any[]>([]);
  const [newPairs, setNewPairs] = useState<any[]>([]);
  const [boosted,  setBoosted]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [lastMs,   setLastMs]   = useState(0);
  const [flash,    setFlash]    = useState<Set<string>>(new Set());

  const load = useCallback(async (refresh = false) => {
    try {
      const [solPairs, search, boostedRaw] = await Promise.all([
        cachedFetch('dex:pairs',  () => fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112').then(r => r.json()), TTL.DEX_PAIRS),
        cachedFetch('dex:new',    () => fetch('https://api.dexscreener.com/latest/dex/search?q=solana').then(r => r.json()), TTL.DEX_NEW),
        cachedFetch('dex:boost',  () => fetch('https://api.dexscreener.com/token-boosts/top/v1').then(r => r.json()), TTL.DEX_BOOST),
      ]);

      const sorted = (((solPairs as any)?.pairs ?? []) as any[])
        .filter((p: any) => (p.liquidity?.usd ?? 0) > 5_000)
        .sort((a: any, b: any) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
        .slice(0, 30);

      if (refresh) {
        const ids = new Set<string>(sorted.map((p: any) => p.pairAddress as string));
        setFlash(ids);
        setTimeout(() => setFlash(new Set()), 1200);
      }
      setPairs(sorted);

      const now = Date.now();
      setNewPairs((((search as any)?.pairs ?? []) as any[])
        .filter((p: any) => p.chainId === 'solana' && p.pairCreatedAt && now - p.pairCreatedAt < 86_400_000)
        .sort((a: any, b: any) => (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0))
        .slice(0, 8));

      setBoosted((Array.isArray(boostedRaw) ? boostedRaw : [])
        .filter((b: any) => b.chainId === 'solana').slice(0, 6));

      setLastMs(Date.now());
    } catch (e) {
      console.error('[FlowsTab]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const t = setInterval(() => load(true), TTL.DEX_PAIRS * 1_000); return () => clearInterval(t); }, [load]);

  if (loading) return <Loader />;

  const totalVol = pairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0);
  const totalTx  = pairs.reduce((s, p) => s + (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0), 0);
  const bulls    = pairs.filter(p => (p.priceChange?.h24 ?? 0) >= 0).length;
  const bullPct  = pairs.length > 0 ? (bulls / pairs.length) * 100 : 50;

  return (
    <ScrollArea>
      <div style={{ padding:'4px 20px 0', display:'flex', justifyContent:'flex-end' }}>
        <RefreshBadge ms={lastMs} every={30} />
      </div>

      {/* Aggregate */}
      <div style={{ margin:'8px 20px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 }}>
        <StatCard label="SOL DEX VOL 24H" value={`$${fmtBig(totalVol)}`}    color={C.cyan}                           />
        <StatCard label="TOTAL TXNs 24H"  value={fmtBig(totalTx)}             color={C.silver}                         />
        <StatCard label="BULL PAIRS"       value={`${bulls}/${pairs.length}`} color={bullPct > 50 ? C.green : C.red}   />
      </div>

      {/* Buy/sell pressure */}
      <div style={{ margin:'0 20px 10px', padding:'10px 14px', border:`1px solid ${C.border}`, borderRadius:6, background:C.cyanFaint }}>
        <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:6, fontFamily:FM }}>AGGREGATE BUY / SELL PRESSURE</div>
        <div style={{ height:8, borderRadius:4, overflow:'hidden', display:'flex' }}>
          <div style={{ width:`${bullPct}%`, height:'100%', background:`linear-gradient(90deg,${C.green}88,${C.green})`, transition:'width .8s ease' }} />
          <div style={{ flex:1, height:'100%', background:`linear-gradient(90deg,${C.red}88,${C.red})` }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
          <span style={{ fontSize:8, color:C.green, fontFamily:FM }}>▲ BUYS {bullPct.toFixed(1)}%</span>
          <span style={{ fontSize:8, color:C.red,   fontFamily:FM }}>▼ SELLS {(100 - bullPct).toFixed(1)}%</span>
        </div>
      </div>

      {/* Boosted */}
      {boosted.length > 0 && (
        <div style={{ margin:'0 20px 10px' }}>
          <SecHead label="⚡ BOOSTED TOKENS · SOLANA" />
          <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:6, scrollbarWidth:'none' }}>
            {boosted.map((b: any, i: number) => (
              <div key={i} style={{ minWidth:110, padding:'8px 10px', border:`1px solid ${C.purple}44`, borderRadius:6, background:`${C.purple}0a`, flexShrink:0 }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.purple, fontFamily:FM, marginBottom:2 }}>
                  {b.tokenAddress ? `${b.tokenAddress.slice(0, 4)}…${b.tokenAddress.slice(-4)}` : '?'}
                </div>
                <div style={{ fontSize:7, color:C.dim, fontFamily:FM }}>BOOSTED</div>
                {b.totalAmount != null && <div style={{ fontSize:9, color:C.silver, fontFamily:FM, marginTop:3 }}>{fmtBig(b.totalAmount)} pts</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New listings */}
      {newPairs.length > 0 && (
        <div style={{ margin:'0 20px 10px' }}>
          <SecHead label="🆕 NEW LISTINGS · LAST 24H" />
          {newPairs.map((p: any, i: number) => {
            const chg = p.priceChange?.h24 ?? 0;
            return (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'90px 80px 55px 55px 80px 1fr', alignItems:'center', gap:8, padding:'7px 0', borderBottom:`1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:C.green, fontFamily:FM }}>{p.baseToken?.symbol ?? '?'}</div>
                  <div style={{ fontSize:7, color:C.dim, fontFamily:FM }}>{p.dexId?.toUpperCase()}</div>
                </div>
                <span style={{ fontSize:9, color:C.text, fontFamily:FM }}>${fmtPrice(parseFloat(p.priceUsd ?? '0'))}</span>
                <span style={{ fontSize:9, fontWeight:700, color:chgColor(chg), fontFamily:FM }}>{chg >= 0 ? '+' : ''}{chg.toFixed(1)}%</span>
                <span style={{ fontSize:8, color:C.dim, fontFamily:FM }}>🕐 {timeAgo(p.pairCreatedAt)}</span>
                <span style={{ fontSize:8, color:C.silver, fontFamily:FM }}>${fmtBig(p.liquidity?.usd ?? 0)} liq</span>
                <AiScoreBadge score={scorePair(p)} compact />
              </div>
            );
          })}
        </div>
      )}

      {/* Top pairs */}
      <div style={{ padding:'0 20px 16px' }}>
        <SecHead label="📊 TOP SOLANA PAIRS · VOLUME" />
        <div style={{ display:'grid', gridTemplateColumns:'20px 100px 80px 46px 46px 46px 70px 62px 56px 1fr', alignItems:'center', gap:5, padding:'0 0 5px', borderBottom:`1px solid ${C.border}` }}>
          {['#','PAIR','PRICE','5M','1H','24H','VOL','LIQ','TXNS','SIG'].map(h => (
            <span key={h} style={{ fontSize:7, letterSpacing:2, color:C.dim, fontFamily:FM }}>{h}</span>
          ))}
        </div>
        {pairs.map((p: any, i: number) => {
          const isNew  = flash.has(p.pairAddress);
          const buys   = p.txns?.h24?.buys  ?? 0;
          const sells  = p.txns?.h24?.sells ?? 0;
          const buyPct = buys + sells > 0 ? (buys / (buys + sells)) * 100 : 50;
          return (
            <div key={p.pairAddress ?? i} style={{
              display:         'grid',
              gridTemplateColumns: '20px 100px 80px 46px 46px 46px 70px 62px 56px 1fr',
              alignItems:      'center',
              gap:             5,
              padding:         '6px 0',
              borderBottom:    `1px solid ${C.border}`,
              background:      isNew ? 'rgba(0,255,136,0.03)' : 'transparent',
              animation:       isNew ? 'rowPop 0.4s ease' : 'none',
            }}>
              <span style={{ fontSize:8, color:C.dim, fontFamily:FM }}>{i + 1}</span>
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:C.cyan, fontFamily:FM }}>
                  {p.baseToken?.symbol ?? '?'}/{p.quoteToken?.symbol ?? '?'}
                </div>
                <div style={{ fontSize:6, color:C.dim, fontFamily:FM }}>{p.dexId?.toUpperCase()}</div>
              </div>
              <span style={{ fontSize:9, color:C.text, fontFamily:FM }}>${fmtPrice(parseFloat(p.priceUsd ?? '0'))}</span>
              <ChgCell v={p.priceChange?.m5  ?? 0} />
              <ChgCell v={p.priceChange?.h1  ?? 0} />
              <ChgCell v={p.priceChange?.h24 ?? 0} />
              <span style={{ fontSize:8, color:C.silver, fontFamily:FM }}>${fmtBig(p.volume?.h24 ?? 0)}</span>
              <span style={{ fontSize:8, color:C.dim,    fontFamily:FM }}>${fmtBig(p.liquidity?.usd ?? 0)}</span>
              <div>
                <div style={{ height:3, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ width:`${buyPct}%`, height:'100%', background:C.green }} />
                </div>
                <span style={{ fontSize:6, color:C.dim, fontFamily:FM }}>{fmtBig(buys + sells)}</span>
              </div>
              <AiScoreBadge score={scorePair(p)} compact />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB — CHAIN
   Solana public RPC — no key required
   Refresh: 15s
   ═══════════════════════════════════════════════════════════════════════════ */
interface PerfSample { numTransactions: number; samplePeriodSecs: number; }
interface EpochInfo  { epoch: number; slotIndex: number; slotsInEpoch: number; absoluteSlot: number; }
interface FeeEntry   { prioritizationFee: number; }
interface SupplyVal  { circulating: number; nonCirculating: number; total: number; }

function ChainTab() {
  const [perf,    setPerf]    = useState<PerfSample[]>([]);
  const [epoch,   setEpoch]   = useState<EpochInfo | null>(null);
  const [fees,    setFees]    = useState<FeeEntry[]>([]);
  const [supply,  setSupply]  = useState<SupplyVal | null>(null);
  const [health,  setHealth]  = useState<string>('ok');
  const [loading, setLoading] = useState(true);
  const [lastMs,  setLastMs]  = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await cachedFetch('sol:chain', () => api('/api/network/chain'), TTL.SOL_PERF);
      setPerf(  (data as any).perf          ?? []);
      setEpoch( (data as any).epoch         ?? null);
      setFees(  (data as any).fees          ?? []);
      setSupply((data as any).supply?.value ?? (data as any).supply ?? null);
      setHealth((data as any).health        ?? 'ok');
      setLastMs(Date.now());
    } catch (e) {
      console.error('[ChainTab]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, TTL.SOL_PERF * 1_000); return () => clearInterval(t); }, [load]);

  if (loading) return <Loader />;

  const liveTps  = perf.length > 0 ? perf[0].numTransactions / perf[0].samplePeriodSecs : 0;
  const avgTps   = perf.length > 0 ? perf.reduce((s, x) => s + x.numTransactions / x.samplePeriodSecs, 0) / perf.length : 0;
  const peakTps  = perf.length > 0 ? Math.max(...perf.map(x => x.numTransactions / x.samplePeriodSecs)) : 0;
  const tpsCo    = health === 'ok'
    ? (avgTps > 3500 ? C.green : avgTps > 2000 ? '#88ff44' : avgTps > 1000 ? C.yellow : avgTps > 400 ? C.orange : C.red)
    : C.red;
  const status   = health === 'ok'
    ? (avgTps > 3500 ? 'HEALTHY' : avgTps > 2000 ? 'GOOD' : avgTps > 1000 ? 'MODERATE' : avgTps > 400 ? 'CONGESTED' : 'DEGRADED')
    : 'DEGRADED';

  const feeVals = fees.map(f => Number(f.prioritizationFee ?? 0)).filter(v => v > 0).sort((a, b) => a - b);
  const ptile   = (p: number) => feeVals[Math.floor(feeVals.length * p)] ?? 0;
  const p25 = ptile(0.25), p50 = ptile(0.5), p75 = ptile(0.75), p90 = ptile(0.9), p95 = ptile(0.95);
  const feeMax = Math.max(p95, 1);

  const ep       = epoch ?? ({} as EpochInfo);
  const epochPct = ep.slotIndex && ep.slotsInEpoch ? (ep.slotIndex / ep.slotsInEpoch) * 100 : 0;
  const minsLeft = Math.floor(((ep.slotsInEpoch ?? 0) - (ep.slotIndex ?? 0)) * 0.4 / 60);
  const circSol  = (supply?.circulating  ?? 0) / 1e9;
  const totalSol = (supply?.total        ?? 0) / 1e9;
  const nonCirc  = (supply?.nonCirculating ?? 0) / 1e9;
  const circPct  = totalSol > 0 ? (circSol / totalSol) * 100 : 0;
  const tpsHist  = [...perf].reverse().map(s => s.numTransactions / s.samplePeriodSecs);

  return (
    <ScrollArea>
      <div style={{ padding:'4px 20px 0', display:'flex', justifyContent:'flex-end' }}>
        <RefreshBadge ms={lastMs} every={15} />
      </div>

      {/* Status banner */}
      <div style={{ margin:'8px 20px', padding:'14px 18px', border:`1px solid ${tpsCo}44`, borderRadius:8, background:`${tpsCo}08`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:4, fontFamily:FM }}>NETWORK STATUS</div>
          <div style={{ fontSize:26, fontFamily:FH, letterSpacing:3, color:tpsCo }}>{status}</div>
          <div style={{ fontSize:7, color:C.dim, marginTop:3, fontFamily:FM }}>SOLANA MAINNET-BETA</div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:4, fontFamily:FM }}>LIVE TPS</div>
          <div style={{ fontSize:30, fontFamily:FH, color:tpsCo, lineHeight:1 }}>{liveTps.toFixed(0)}</div>
          <div style={{ fontSize:7, color:C.dim, marginTop:3, fontFamily:FM }}>AVG {avgTps.toFixed(0)} · PEAK {peakTps.toFixed(0)}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:4, fontFamily:FM }}>BLOCK TIME</div>
          <div style={{ fontSize:18, fontFamily:FH, color:C.silver }}>~400ms</div>
          <div style={{ fontSize:7, color:C.dim, marginTop:3, fontFamily:FM }}>AVG SLOT</div>
        </div>
      </div>

      {/* TPS history */}
      <div style={{ margin:'0 20px 10px', padding:'12px 14px', border:`1px solid ${C.border}`, borderRadius:8, background:C.cyanFaint }}>
        <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:8, fontFamily:FM }}>TPS · {tpsHist.length}-SAMPLE HISTORY</div>
        <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:48 }}>
          {tpsHist.map((t: number, i: number) => {
            const pct    = Math.min(100, (t / 5000) * 100);
            const col    = t > 3500 ? C.green : t > 2000 ? '#88ff44' : t > 1000 ? C.yellow : t > 400 ? C.orange : C.red;
            const isLast = i === tpsHist.length - 1;
            return (
              <div key={i} title={`${t.toFixed(0)} TPS`}
                style={{ flex:1, height:`${Math.max(pct, 3)}%`, background:col, borderRadius:2, opacity:isLast ? 1 : 0.6, minHeight:2, boxShadow:isLast ? `0 0 6px ${col}88` : 'none', transition:'height 0.5s ease' }} />
            );
          })}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
          <span style={{ fontSize:6, color:C.dim, fontFamily:FM }}>OLDEST</span>
          <span style={{ fontSize:6, color:tpsCo, fontFamily:FM }}>LATEST: {liveTps.toFixed(0)} TPS</span>
        </div>
      </div>

      {/* Epoch progress */}
      <div style={{ margin:'0 20px 10px', padding:'12px 16px', border:`1px solid ${C.border}`, borderRadius:8, background:C.cyanFaint }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:2, fontFamily:FM }}>EPOCH</div>
            <div style={{ fontSize:22, fontFamily:FH, color:C.cyan }}>{ep.epoch ?? '—'}</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:2, fontFamily:FM }}>ABS SLOT</div>
            <div style={{ fontSize:14, fontFamily:FH, color:C.silver }}>{ep.absoluteSlot?.toLocaleString() ?? '—'}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:2, fontFamily:FM }}>ENDS IN ~</div>
            <div style={{ fontSize:14, fontFamily:FH, color:C.dim }}>{minsLeft > 0 ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m` : '—'}</div>
          </div>
        </div>
        <div style={{ fontSize:7, letterSpacing:2, color:C.cyanDim, marginBottom:4, fontFamily:FM }}>
          EPOCH PROGRESS · {epochPct.toFixed(1)}% · SLOT {ep.slotIndex?.toLocaleString()} / {ep.slotsInEpoch?.toLocaleString()}
        </div>
        <div style={{ height:7, background:'rgba(255,255,255,0.05)', borderRadius:3, overflow:'hidden' }}>
          <div style={{ width:`${epochPct}%`, height:'100%', background:`linear-gradient(90deg,${C.cyan}88,${C.cyan})`, borderRadius:3, transition:'width 1s ease', boxShadow:`0 0 8px ${C.cyan}44` }} />
        </div>
      </div>

      {/* Priority fees */}
      <div style={{ margin:'0 20px 10px' }}>
        <SecHead label="⛽ PRIORITY FEES · LIVE PERCENTILES" />
        {([
          { label:'P25 · ECONOMY',  val:p25, color:C.green      },
          { label:'P50 · MEDIAN',   val:p50, color:'#88ff44'    },
          { label:'P75 · STANDARD', val:p75, color:C.yellow     },
          { label:'P90 · FAST',     val:p90, color:C.orange     },
          { label:'P95 · TURBO',    val:p95, color:C.red        },
        ] as { label:string; val:number; color:string }[]).map(({ label, val, color }) => (
          <div key={label} style={{ marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, alignItems:'baseline' }}>
              <span style={{ fontSize:8, letterSpacing:2, color, fontFamily:FM }}>{label}</span>
              <div style={{ display:'flex', gap:12 }}>
                <span style={{ fontSize:8, color:C.dim,    fontFamily:FM }}>{val.toLocaleString()} μ◎</span>
                <span style={{ fontSize:8, color:C.silverDim, fontFamily:FM }}>{(val / 1e9).toFixed(8)} SOL</span>
              </div>
            </div>
            <div style={{ height:5, background:'rgba(255,255,255,0.05)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ width:`${(val / feeMax) * 100}%`, height:'100%', background:`linear-gradient(90deg,${color}55,${color})`, borderRadius:3, transition:'width 0.9s cubic-bezier(0.4,0,0.2,1)', boxShadow:`0 0 5px ${color}44` }} />
            </div>
          </div>
        ))}
        <div style={{ padding:'8px 12px', border:`1px solid ${C.yellow}22`, borderRadius:6, background:`${C.yellow}06`, marginTop:4 }}>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:3, fontFamily:FM }}>RECOMMENDATION</div>
          <div style={{ fontSize:9, color:C.yellow, fontFamily:FM }}>
            Use P75 ({p75.toLocaleString()} μ◎) for reliable inclusion · P90 for time-critical txns
          </div>
        </div>
      </div>

      {/* SOL supply */}
      {totalSol > 0 && (
        <div style={{ margin:'0 20px 10px' }}>
          <SecHead label="🪙 SOL SUPPLY" />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7, marginBottom:8 }}>
            <StatCard label="CIRCULATING" value={`${fmtBig(circSol)} SOL`}  color={C.cyan}   />
            <StatCard label="NON-CIRC"    value={`${fmtBig(nonCirc)} SOL`}  color={C.dim}    />
            <StatCard label="TOTAL"        value={`${fmtBig(totalSol)} SOL`} color={C.silver} />
          </div>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:4, fontFamily:FM }}>
            CIRCULATING RATIO · {circPct.toFixed(1)}%
          </div>
          <div style={{ height:5, background:'rgba(255,255,255,0.05)', borderRadius:3, overflow:'hidden' }}>
            <div style={{ width:`${circPct}%`, height:'100%', background:`linear-gradient(90deg,${C.cyan}88,${C.cyan})`, borderRadius:3, transition:'width 0.8s' }} />
          </div>
        </div>
      )}

      {/* AI signal */}
      <div style={{ margin:'8px 20px 20px', padding:'12px 14px', border:`1px solid ${C.border}`, borderRadius:6, background:C.cyanFaint }}>
        <div style={{ fontSize:8, letterSpacing:2, color:C.dim, marginBottom:8, fontFamily:FM }}>NETWORK AI SIGNAL</div>
        <AiScoreBadge score={scoreAsset({
          priceChange24h: avgTps > 3500 ? 8 : avgTps > 2000 ? 3 : avgTps > 1000 ? -3 : avgTps > 400 ? -8 : -18,
          volume24h:      avgTps * 1500,
        })} />
      </div>
    </ScrollArea>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB — VALIDATORS
   Solana RPC: getVoteAccounts + getClusterNodes
   Refresh: 60s
   ═══════════════════════════════════════════════════════════════════════════ */
interface VoteAccount {
  votePubkey:     string;
  activatedStake: number;
  commission:     number;
  lastVote:       number;
}
interface VoteAccounts {
  current:    VoteAccount[];
  delinquent: VoteAccount[];
}
interface ClusterNode {
  pubkey:  string;
  version: string | null;
}

function ValidatorsTab() {
  const [current,  setCurrent]  = useState<VoteAccount[]>([]);
  const [delin,    setDelin]    = useState<VoteAccount[]>([]);
  const [nodes,    setNodes]    = useState<ClusterNode[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [lastMs,   setLastMs]   = useState(0);
  const [showAll,  setShowAll]  = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await cachedFetch('sol:validators', () => api('/api/network/validators'), TTL.VALIDATORS);
      setCurrent((data as any).voteAccounts?.current    ?? []);
      setDelin(  (data as any).voteAccounts?.delinquent ?? []);
      setNodes(  (data as any).clusterNodes             ?? []);
      setLastMs(Date.now());
    } catch (e) {
      console.error('[ValidatorsTab]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, TTL.VALIDATORS * 1_000); return () => clearInterval(t); }, [load]);

  if (loading) return <Loader />;

  /* ── derived ─────────────────────────────────────────────────────────── */
  const totalActive  = current.length;
  const totalDelin   = delin.length;
  const totalVals    = totalActive + totalDelin;
  const delinPct     = totalVals > 0 ? (totalDelin / totalVals) * 100 : 0;
  const stCo         = delinPct < 1 ? C.green : delinPct < 5 ? '#88ff44' : delinPct < 10 ? C.orange : C.red;
  const netStatus    = delinPct < 1 ? 'HEALTHY' : delinPct < 5 ? 'WATCH' : delinPct < 10 ? 'WARNING' : 'CRITICAL';

  const totalLam     = current.reduce((s, v) => s + (v.activatedStake ?? 0), 0);
  const totalStk     = totalLam / 1e9;
  const byStake      = [...current].sort((a, b) => (b.activatedStake ?? 0) - (a.activatedStake ?? 0));
  const displayed    = showAll ? byStake : byStake.slice(0, 20);

  // Nakamoto coefficient: min validators to exceed 33% of stake
  let runningLam = 0, nakamoto = 0;
  for (const v of byStake) {
    runningLam += v.activatedStake ?? 0;
    nakamoto++;
    if (runningLam / Math.max(totalLam, 1) > 0.33) break;
  }

  const top10Lam  = byStake.slice(0, 10).reduce((s, v) => s + (v.activatedStake ?? 0), 0);
  const top10Pct  = totalLam > 0 ? (top10Lam / totalLam) * 100 : 0;
  const top1Pct   = totalLam > 0 ? ((byStake[0]?.activatedStake ?? 0) / totalLam) * 100 : 0;
  const top33Pct  = totalLam > 0
    ? (byStake.slice(0, nakamoto).reduce((s, v) => s + (v.activatedStake ?? 0), 0) / totalLam) * 100
    : 0;
  const avgComm   = current.length > 0 ? current.reduce((s, v) => s + (v.commission ?? 0), 0) / current.length : 0;
  const nakColor  = nakamoto < 19 ? C.red : nakamoto < 30 ? C.orange : C.green;

  // Version breakdown
  const verMap: Record<string, number> = {};
  nodes.forEach(n => {
    const v = n.version ?? 'unknown';
    verMap[v] = (verMap[v] ?? 0) + 1;
  });
  const verList = Object.entries(verMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <ScrollArea>
      <div style={{ padding:'4px 20px 0', display:'flex', justifyContent:'flex-end' }}>
        <RefreshBadge ms={lastMs} every={60} />
      </div>

      {/* Health banner */}
      <div style={{ margin:'8px 20px', padding:'14px 18px', border:`1px solid ${stCo}44`, borderRadius:8, background:`${stCo}08`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:4, fontFamily:FM }}>VALIDATOR NETWORK</div>
          <div style={{ fontSize:26, fontFamily:FH, letterSpacing:3, color:stCo }}>{netStatus}</div>
          <div style={{ fontSize:7, color:C.dim, marginTop:3, fontFamily:FM }}>{delinPct.toFixed(1)}% DELINQUENT · {totalVals.toLocaleString()} TOTAL</div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:4, fontFamily:FM }}>ACTIVE</div>
          <div style={{ fontSize:28, fontFamily:FH, color:C.green, lineHeight:1 }}>{totalActive.toLocaleString()}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:4, fontFamily:FM }}>DELINQUENT</div>
          <div style={{ fontSize:28, fontFamily:FH, color:totalDelin > 0 ? C.red : C.dim, lineHeight:1 }}>{totalDelin.toLocaleString()}</div>
          <div style={{ fontSize:7, color:C.dim, marginTop:3, fontFamily:FM }}>MISSING VOTES</div>
        </div>
      </div>

      {/* Key stats */}
      <div style={{ margin:'0 20px 10px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 }}>
        <StatCard label="TOTAL STAKE"    value={`${fmtBig(totalStk)} SOL`}              color={C.cyan}    />
        <StatCard label="NAKAMOTO COEFF" value={`${nakamoto}`}                            color={nakColor}  sub={`${nakamoto} vals control >33%`} />
        <StatCard label="TOP-10 STAKE"   value={`${top10Pct.toFixed(1)}%`}              color={top10Pct > 40 ? C.red : top10Pct > 30 ? C.orange : C.yellow} />
        <StatCard label="AVG COMMISSION" value={`${avgComm.toFixed(1)}%`}               color={C.silver}  />
        <StatCard label="CLUSTER NODES"  value={nodes.length.toLocaleString()}           color={C.text}    />
        <StatCard label="DELINQUENT %"   value={`${delinPct.toFixed(2)}%`}              color={stCo}      />
      </div>

      {/* Nakamoto callout */}
      <div style={{ margin:'0 20px 10px', padding:'10px 14px', border:`1px solid ${nakColor}33`, borderRadius:6, background:`${nakColor}07` }}>
        <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:4, fontFamily:FM }}>NAKAMOTO COEFFICIENT</div>
        <div style={{ fontSize:9, color:nakColor, fontFamily:FM, lineHeight:1.7 }}>
          {nakamoto} validators control &gt;33% of staked SOL — the minimum to halt consensus.
          {nakamoto < 19  && ' ⚠ LOW — network is more centralised than ideal.'}
          {nakamoto >= 19 && nakamoto < 30 && ' ⚡ Moderate decentralisation.'}
          {nakamoto >= 30 && ' ✓ STRONG decentralisation.'}
        </div>
      </div>

      {/* Stake concentration */}
      <div style={{ margin:'0 20px 10px', padding:'10px 14px', border:`1px solid ${C.border}`, borderRadius:6, background:C.cyanFaint }}>
        <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:8, fontFamily:FM }}>STAKE CONCENTRATION</div>
        <BarRow label={`TOP ${nakamoto} VALIDATORS (33% CONTROL)`} pct={top33Pct} color={C.red}    />
        <BarRow label="TOP 10 VALIDATORS"                           pct={top10Pct} color={C.orange} />
        <BarRow label="TOP 1 VALIDATOR"                             pct={top1Pct}  color={C.yellow} />
      </div>

      {/* Client versions */}
      {verList.length > 0 && (
        <div style={{ margin:'0 20px 10px', padding:'10px 14px', border:`1px solid ${C.border}`, borderRadius:6, background:C.cyanFaint }}>
          <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:8, fontFamily:FM }}>CLIENT VERSIONS · TOP {verList.length}</div>
          {verList.map(([ver, count]) => {
            const pct = nodes.length > 0 ? (count / nodes.length) * 100 : 0;
            return (
              <div key={ver} style={{ marginBottom:6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:8, color:C.cyan, fontFamily:FM }}>{ver}</span>
                  <span style={{ fontSize:8, color:C.dim, fontFamily:FM }}>{count} nodes · {pct.toFixed(1)}%</span>
                </div>
                <div style={{ height:3, background:'rgba(255,255,255,0.05)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background:`linear-gradient(90deg,${C.cyan}66,${C.cyan})`, borderRadius:2, transition:'width 0.6s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delinquent list */}
      {delin.length > 0 && (
        <div style={{ margin:'0 20px 10px' }}>
          <SecHead label={`⚠ DELINQUENT VALIDATORS · ${delin.length}`} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 50px 70px', gap:6, padding:'0 0 5px', borderBottom:`1px solid ${C.border}` }}>
            {['VOTE KEY','STAKE','COMM%','LAST VOTE'].map(h => (
              <span key={h} style={{ fontSize:7, letterSpacing:2, color:C.dim, fontFamily:FM }}>{h}</span>
            ))}
          </div>
          {delin.slice(0, 10).map((v, i) => {
            const stk = (v.activatedStake ?? 0) / 1e9;
            return (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 50px 70px', gap:6, padding:'6px 0', borderBottom:`1px solid ${C.border}`, alignItems:'center' }}>
                <span style={{ fontSize:9, color:C.red, fontFamily:FM }}>{v.votePubkey.slice(0, 5)}…{v.votePubkey.slice(-5)}</span>
                <span style={{ fontSize:9, color:C.silver, fontFamily:FM }}>{fmtBig(stk)} SOL</span>
                <span style={{ fontSize:9, color:C.dim, fontFamily:FM }}>{v.commission ?? '?'}%</span>
                <span style={{ fontSize:9, color:C.dim, fontFamily:FM }}>{v.lastVote?.toLocaleString() ?? '—'}</span>
              </div>
            );
          })}
          {delin.length > 10 && <div style={{ fontSize:8, color:C.dim, padding:'6px 0', fontFamily:FM }}>+{delin.length - 10} more delinquent validators</div>}
        </div>
      )}

      {/* Active validators */}
      <div style={{ margin:'0 20px 10px' }}>
        <SecHead label={`✓ ACTIVE VALIDATORS · TOP ${displayed.length} OF ${totalActive}`} />
        <div style={{ display:'grid', gridTemplateColumns:'22px 1fr 90px 54px 52px 60px', gap:6, padding:'0 0 5px', borderBottom:`1px solid ${C.border}` }}>
          {['#','VOTE KEY','STAKE','SHARE%','COMM%','LAST VOTE'].map(h => (
            <span key={h} style={{ fontSize:7, letterSpacing:2, color:C.dim, fontFamily:FM }}>{h}</span>
          ))}
        </div>
        {displayed.map((v, i) => {
          const stk      = (v.activatedStake ?? 0) / 1e9;
          const sharePct = totalStk > 0 ? (stk / totalStk) * 100 : 0;
          const isTop3   = i < 3;
          return (
            <div key={i} style={{
              display:             'grid',
              gridTemplateColumns: '22px 1fr 90px 54px 52px 60px',
              gap:                 6,
              padding:             '6px 0',
              borderBottom:        `1px solid ${C.border}`,
              alignItems:          'center',
              background:          isTop3 ? `${C.orange}04` : 'transparent',
            }}>
              <span style={{ fontSize:8, color:isTop3 ? C.orange : C.dim, fontFamily:FM }}>{i + 1}</span>
              <span style={{ fontSize:9, color:isTop3 ? C.orange : C.cyan, fontFamily:FM, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {v.votePubkey.slice(0, 5)}…{v.votePubkey.slice(-5)}
              </span>
              <span style={{ fontSize:9, color:C.text,   fontFamily:FM }}>{fmtBig(stk)} SOL</span>
              <span style={{ fontSize:9, color:sharePct > 5 ? C.orange : C.dim, fontFamily:FM }}>{sharePct.toFixed(2)}%</span>
              <span style={{ fontSize:9, color:C.dim,    fontFamily:FM }}>{v.commission ?? '?'}%</span>
              <span style={{ fontSize:9, color:C.dim,    fontFamily:FM }}>{v.lastVote?.toLocaleString() ?? '—'}</span>
            </div>
          );
        })}
        {!showAll && byStake.length > 20 && (
          <button
            onClick={() => setShowAll(true)}
            style={{ width:'100%', marginTop:8, padding:'7px 0', background:C.cyanFaint, border:`1px solid ${C.border}`, borderRadius:4, color:C.cyanDim, fontFamily:FM, fontSize:9, letterSpacing:2, cursor:'pointer' }}
          >
            SHOW ALL {totalActive} VALIDATORS
          </button>
        )}
      </div>

      <div style={{ height:20 }} />
    </ScrollArea>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB — PROTOCOLS
   DeFiLlama public API — no key required
   Top Solana DeFi protocols ranked by TVL · Refresh: 5 min
   ═══════════════════════════════════════════════════════════════════════════ */
const PROTOCOL_CATEGORY_COLOR: Record<string, string> = {
  Dexes:            '#00b4ff',
  'Liquid Staking':  '#9945ff',
  Lending:           '#ffaa00',
  Bridge:            '#00ff88',
  Yield:             '#ffdd00',
  RWA:               '#f7931a',
  Options:           '#ff3355',
  Derivatives:       '#ff6600',
  CDP:               '#627eea',
  Other:             'rgba(150,180,210,0.4)',
};

function categoryColor(cat: string): string {
  return PROTOCOL_CATEGORY_COLOR[cat] ?? PROTOCOL_CATEGORY_COLOR.Other;
}

function ProtocolsTab() {
  const [protocols, setProtocols] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [lastMs,    setLastMs]    = useState(0);
  const [filter,    setFilter]    = useState<string>('ALL');
  const [sortBy,    setSortBy]    = useState<'tvl' | 'change1d' | 'change7d'>('tvl');

  const load = useCallback(async () => {
    try {
      const data = await cachedFetch('protocols:solana', async () => {
        const res  = await fetch('https://api.llama.fi/protocols');
        const json = await res.json();
        // Filter to Solana protocols with meaningful TVL
        return (json as any[])
          .filter((p: any) =>
            p.chains?.includes('Solana') &&
            (p.tvl ?? 0) > 100_000
          )
          .sort((a: any, b: any) => (b.tvl ?? 0) - (a.tvl ?? 0))
          .slice(0, 60)
          .map((p: any) => ({
            name:       p.name,
            slug:       p.slug,
            symbol:     p.symbol ?? '—',
            category:   p.category ?? 'Other',
            tvl:        p.tvl ?? 0,
            change1d:   p.change_1d  ?? 0,
            change7d:   p.change_7d  ?? 0,
            change1m:   p.change_1m  ?? 0,
            logo:       p.logo ?? '',
            url:        p.url  ?? '',
            chains:     p.chains ?? [],
            mcap:       p.mcap  ?? 0,
          }));
      }, 5 * 60);

      setProtocols(data as any[]);
      setLastMs(Date.now());
    } catch (e) {
      console.error('[ProtocolsTab]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <Loader />;

  // Categories present in data
  const categories = ['ALL', ...Array.from(new Set(protocols.map(p => p.category))).sort()];

  const filtered = protocols
    .filter(p => filter === 'ALL' || p.category === filter)
    .sort((a, b) => {
      if (sortBy === 'change1d') return (b.change1d ?? 0) - (a.change1d ?? 0);
      if (sortBy === 'change7d') return (b.change7d ?? 0) - (a.change7d ?? 0);
      return (b.tvl ?? 0) - (a.tvl ?? 0);
    });

  const totalTvl  = protocols.reduce((s, p) => s + (p.tvl ?? 0), 0);
  const gainers   = protocols.filter(p => (p.change1d ?? 0) > 0).length;
  const losers    = protocols.filter(p => (p.change1d ?? 0) < 0).length;

  // Category breakdown
  const catMap: Record<string, number> = {};
  protocols.forEach(p => { catMap[p.category] = (catMap[p.category] ?? 0) + (p.tvl ?? 0); });
  const catList = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <ScrollArea>
      <div style={{ padding: '4px 20px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <RefreshBadge ms={lastMs} every={300} />
      </div>

      {/* ── Summary stats ── */}
      <div style={{ margin: '8px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
        <StatCard label="TOTAL TVL"     value={`$${fmtBig(totalTvl)}`}             color={C.cyan}   />
        <StatCard label="PROTOCOLS"     value={protocols.length.toString()}          color={C.silver} />
        <StatCard label="GAINERS 24H"   value={`${gainers} ↑ ${losers} ↓`}         color={gainers > losers ? C.green : C.red} />
      </div>

      {/* ── TVL by category ── */}
      <div style={{ margin: '0 20px 10px', padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.cyanFaint }}>
        <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 8, fontFamily: FM }}>TVL BY CATEGORY</div>
        {catList.map(([cat, tvl]) => (
          <BarRow key={cat} label={cat.toUpperCase()} pct={(tvl / totalTvl) * 100} color={categoryColor(cat)} />
        ))}
      </div>

      {/* ── Filters + sort ── */}
      <div style={{ margin: '0 20px 8px' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {categories.slice(0, 8).map(cat => (
            <button key={cat} onClick={() => setFilter(cat)}
              style={{ padding: '3px 8px', borderRadius: 3, border: `1px solid ${filter === cat ? categoryColor(cat) : C.border}`,
                background: filter === cat ? `${categoryColor(cat)}15` : 'transparent',
                color: filter === cat ? categoryColor(cat) : C.dim,
                fontSize: 7, cursor: 'pointer', fontFamily: FM, letterSpacing: 1 }}>
              {cat}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 7, color: C.dim, letterSpacing: 1 }}>SORT:</span>
          {(['tvl', 'change1d', 'change7d'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              style={{ padding: '2px 8px', borderRadius: 3, border: `1px solid ${sortBy === s ? C.cyan : C.border}`,
                background: sortBy === s ? C.cyanFaint : 'transparent',
                color: sortBy === s ? C.cyan : C.dim,
                fontSize: 7, cursor: 'pointer', fontFamily: FM }}>
              {s === 'tvl' ? 'TVL' : s === 'change1d' ? '24H' : '7D'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Column headers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 90px 60px 60px 70px', gap: 6, padding: '4px 20px 5px', borderBottom: `1px solid ${C.border}` }}>
        {['#', 'PROTOCOL', 'TVL', '24H', '7D', 'CATEGORY'].map(h => (
          <span key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2, fontFamily: FM }}>{h}</span>
        ))}
      </div>

      {/* ── Protocol rows ── */}
      <div style={{ padding: '0 20px 16px' }}>
        {filtered.map((p, i) => {
          const catCol = categoryColor(p.category);
          return (
            <div key={p.slug} style={{
              display: 'grid', gridTemplateColumns: '24px 1fr 90px 60px 60px 70px',
              gap: 6, padding: '8px 0', borderBottom: `1px solid ${C.border}`,
              alignItems: 'center',
            }}>
              {/* Rank */}
              <span style={{ fontSize: 8, color: C.dim, fontFamily: FM }}>{i + 1}</span>

              {/* Name + logo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {p.logo ? (
                  <img src={p.logo} alt="" width={16} height={16}
                    style={{ borderRadius: '50%', flexShrink: 0, opacity: 0.9 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: `${catCol}22`,
                    border: `1px solid ${catCol}33`, flexShrink: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 6, color: catCol }}>
                    {p.name.slice(0, 1)}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name}
                  </div>
                  {p.symbol !== '—' && (
                    <div style={{ fontSize: 7, color: C.dim }}>{p.symbol}</div>
                  )}
                </div>
              </div>

              {/* TVL */}
              <span style={{ fontSize: 10, fontWeight: 700, color: C.cyan, fontFamily: FM }}>${fmtBig(p.tvl)}</span>

              {/* 24h */}
              <span style={{ fontSize: 9, fontWeight: 600, color: chgColor(p.change1d), fontFamily: FM }}>
                {chgSign(p.change1d)}
              </span>

              {/* 7d */}
              <span style={{ fontSize: 9, fontWeight: 600, color: chgColor(p.change7d), fontFamily: FM }}>
                {chgSign(p.change7d)}
              </span>

              {/* Category */}
              <span style={{ fontSize: 7, color: catCol, border: `1px solid ${catCol}33`,
                borderRadius: 3, padding: '1px 5px', background: `${catCol}0a`,
                fontFamily: FM, letterSpacing: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.category}
              </span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB — STAKING
   DeFiLlama yields API + Solana RPC staking data — no key required
   LST rates · Validator APY · Epoch timing · Refresh: 5 min
   ═══════════════════════════════════════════════════════════════════════════ */
const LST_TOKENS: { symbol: string; name: string; color: string; project: string }[] = [
  { symbol: 'mSOL',   name: 'Marinade',      color: '#00C0B5', project: 'marinade-finance'    },
  { symbol: 'JitoSOL',name: 'Jito',          color: '#19FB9B', project: 'jito'                },
  { symbol: 'bSOL',   name: 'BlazeStake',    color: '#FF6B35', project: 'blazestake'          },
  { symbol: 'stSOL',  name: 'Lido',          color: '#00A3FF', project: 'lido'                },
  { symbol: 'jitoSOL',name: 'Jito (alt)',    color: '#19FB9B', project: 'jito'                },
  { symbol: 'JSOL',   name: 'JPool',         color: '#9966ff', project: 'jpool'               },
];

function StakingTab() {
  const [lstRates,  setLstRates]  = useState<any[]>([]);
  const [nativeApy, setNativeApy] = useState<number>(0);
  const [epoch,     setEpoch]     = useState<any>(null);
  const [totalStake,setTotalStake]= useState<number>(0);
  const [loading,   setLoading]   = useState(true);
  const [lastMs,    setLastMs]    = useState(0);

  const load = useCallback(async () => {
    try {
      const [yieldsData, chainData] = await Promise.allSettled([
        cachedFetch('staking:yields', async () => {
          const res  = await fetch('https://yields.llama.fi/pools');
          const json = await res.json();
          // Filter for SOL staking pools
          return (json.data as any[]).filter((p: any) =>
            (p.symbol?.toLowerCase().includes('sol') ||
             p.project?.toLowerCase().includes('sol') ||
             p.project?.toLowerCase().includes('marinade') ||
             p.project?.toLowerCase().includes('jito') ||
             p.project?.toLowerCase().includes('blaze') ||
             p.project?.toLowerCase().includes('lido')) &&
            p.chain === 'Solana' &&
            (p.apy ?? 0) > 0 &&
            (p.tvlUsd ?? 0) > 100_000
          ).slice(0, 20);
        }, 5 * 60),
        cachedFetch('sol:chain', () => api('/api/network/chain'), 30),
      ]);

      if (yieldsData.status === 'fulfilled') {
        const pools = yieldsData.value as any[];
        // Match to known LSTs + extras
        const mapped = pools.map((p: any) => ({
          symbol:  p.symbol ?? '—',
          project: p.project ?? '—',
          apy:     p.apy ?? 0,
          apyBase: p.apyBase ?? p.apy ?? 0,
          apyReward: p.apyReward ?? 0,
          tvl:     p.tvlUsd ?? 0,
          il7d:    p.il7d ?? null,
          pool:    p.pool ?? '',
          color:   LST_TOKENS.find(l =>
            p.symbol?.toLowerCase().includes(l.symbol.toLowerCase()) ||
            p.project?.toLowerCase().includes(l.project.toLowerCase())
          )?.color ?? C.cyan,
        }));
        setLstRates(mapped);
      }

      if (chainData.status === 'fulfilled') {
        const d = chainData.value as any;
        setEpoch(d.epoch ?? null);

        // Estimate native staking APY from epoch data
        // Solana native staking ≈ 6-8% APY, derived from inflation schedule
        // Rough formula: annualRewardRate ≈ 0.08 * (1 - commissionAvg)
        setNativeApy(6.8); // baseline — Solana's current ~6.8% native staking APY

        // Total stake from supply
        const supply = d.supply?.value ?? d.supply ?? null;
        if (supply?.circulating) {
          setTotalStake(supply.circulating / 1e9);
        }
      }

      setLastMs(Date.now());
    } catch (e) {
      console.error('[StakingTab]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <Loader />;

  const ep       = epoch ?? {} as any;
  const epochPct = ep.slotIndex && ep.slotsInEpoch ? (ep.slotIndex / ep.slotsInEpoch) * 100 : 0;
  const slotsLeft = (ep.slotsInEpoch ?? 0) - (ep.slotIndex ?? 0);
  const minsLeft  = Math.floor(slotsLeft * 0.4 / 60);
  const bestLst   = lstRates.length > 0 ? [...lstRates].sort((a, b) => b.apy - a.apy)[0] : null;
  const totalLstTvl = lstRates.reduce((s, p) => s + (p.tvl ?? 0), 0);

  return (
    <ScrollArea>
      <div style={{ padding: '4px 20px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <RefreshBadge ms={lastMs} every={300} />
      </div>

      {/* ── Overview cards ── */}
      <div style={{ margin: '8px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
        <StatCard label="NATIVE SOL APY"  value={`${nativeApy.toFixed(2)}%`}
          color={C.solPurple} sub="Inflation-adjusted" />
        <StatCard label="BEST LST APY"    value={bestLst ? `${bestLst.apy.toFixed(2)}%` : '—'}
          color={C.green} sub={bestLst?.symbol ?? ''} />
        <StatCard label="TOTAL LST TVL"   value={`$${fmtBig(totalLstTvl)}`}
          color={C.cyan} sub={`${lstRates.length} pools`} />
      </div>

      {/* ── Epoch timing ── */}
      {ep.epoch && (
        <div style={{ margin: '0 20px 10px', padding: '12px 16px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.cyanFaint }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 2, fontFamily: FM }}>CURRENT EPOCH</div>
              <div style={{ fontSize: 24, fontFamily: FH, color: C.cyan }}>{ep.epoch}</div>
              <div style={{ fontSize: 7, color: C.dim, marginTop: 2, fontFamily: FM }}>
                Staking rewards paid at epoch end
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 2, fontFamily: FM }}>NEXT REWARD IN ~</div>
              <div style={{ fontSize: 18, fontFamily: FH, color: minsLeft < 60 ? C.green : C.silver }}>
                {minsLeft > 0 ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m` : '—'}
              </div>
              <div style={{ fontSize: 7, color: C.dim, marginTop: 2, fontFamily: FM }}>
                {slotsLeft.toLocaleString()} slots remaining
              </div>
            </div>
          </div>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.cyanDim, marginBottom: 4, fontFamily: FM }}>
            EPOCH PROGRESS · {epochPct.toFixed(1)}%
          </div>
          <div style={{ height: 7, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${epochPct}%`, height: '100%', background: `linear-gradient(90deg,${C.cyan}88,${C.cyan})`,
              borderRadius: 3, transition: 'width 1s ease', boxShadow: `0 0 8px ${C.cyan}44` }} />
          </div>
          {epochPct > 90 && (
            <div style={{ marginTop: 6, fontSize: 8, color: C.green, fontFamily: FM, letterSpacing: 1 }}>
              ⚡ Epoch ending soon — rewards distributing shortly
            </div>
          )}
        </div>
      )}

      {/* ── Native vs LST comparison ── */}
      <div style={{ margin: '0 20px 10px', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.cyanFaint }}>
        <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 8, fontFamily: FM }}>
          STAKING METHOD COMPARISON
        </div>
        {[
          { label: 'Native Staking (direct)', apy: nativeApy, color: C.solPurple, desc: 'Lock period · earn SOL rewards · no liquidity' },
          ...(bestLst ? [{ label: `${bestLst.symbol} (best LST)`, apy: bestLst.apy, color: bestLst.color, desc: `Liquid · tradeable · ${bestLst.project}` }] : []),
        ].map(item => (
          <div key={item.label} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <span style={{ fontSize: 9, color: item.color, fontWeight: 700, fontFamily: FM }}>{item.label}</span>
                <div style={{ fontSize: 7, color: C.dim, marginTop: 1 }}>{item.desc}</div>
              </div>
              <span style={{ fontSize: 16, fontFamily: FH, color: item.color }}>{item.apy.toFixed(2)}%</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min((item.apy / 12) * 100, 100)}%`, height: '100%',
                background: `linear-gradient(90deg,${item.color}66,${item.color})`,
                borderRadius: 3, transition: 'width 0.8s ease' }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── LST rates table ── */}
      <div style={{ padding: '0 20px' }}>
        <SecHead label="⚡ LIQUID STAKING TOKEN RATES" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px 90px', gap: 6, padding: '0 0 5px', borderBottom: `1px solid ${C.border}` }}>
          {['POOL', 'APY', 'BASE', 'TVL', 'REWARD'].map(h => (
            <span key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2, fontFamily: FM }}>{h}</span>
          ))}
        </div>
        {lstRates.sort((a, b) => b.tvl - a.tvl).map((p, i) => (
          <div key={p.pool || i} style={{
            display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px 90px',
            gap: 6, padding: '8px 0', borderBottom: `1px solid ${C.border}`,
            alignItems: 'center',
          }}>
            {/* Symbol + project */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: p.color, fontFamily: FM }}>{p.symbol}</div>
              <div style={{ fontSize: 7, color: C.dim }}>{p.project}</div>
            </div>

            {/* APY */}
            <span style={{ fontSize: 11, fontWeight: 700, color: p.apy > nativeApy ? C.green : C.silver, fontFamily: FM }}>
              {p.apy.toFixed(2)}%
              {p.apy > nativeApy && <span style={{ fontSize: 7, color: C.green, marginLeft: 2 }}>↑</span>}
            </span>

            {/* Base APY */}
            <span style={{ fontSize: 9, color: C.dim, fontFamily: FM }}>{p.apyBase.toFixed(2)}%</span>

            {/* TVL */}
            <span style={{ fontSize: 9, color: C.cyan, fontFamily: FM }}>${fmtBig(p.tvl)}</span>

            {/* Reward APY */}
            <span style={{ fontSize: 9, color: (p.apyReward ?? 0) > 0 ? C.purple : C.dim, fontFamily: FM }}>
              {(p.apyReward ?? 0) > 0 ? `+${p.apyReward.toFixed(2)}%` : '—'}
            </span>
          </div>
        ))}

        {lstRates.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9 }}>
            No LST data available right now
          </div>
        )}
      </div>

      {/* ── Info note ── */}
      <div style={{ margin: '12px 20px 20px', padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.cyanFaint }}>
        <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 4, fontFamily: FM }}>ℹ INFO</div>
        <div style={{ fontSize: 8, color: C.dim, lineHeight: 1.7, fontFamily: FM }}>
          APY rates sourced from DeFiLlama. Native SOL staking APY is inflation-based (~6-8% annually).
          LSTs offer liquidity while earning staking rewards. Higher APY LSTs may include additional incentive rewards.
          This is informational only — not financial advice.
        </div>
      </div>
    </ScrollArea>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB — CAPITAL FLOW & ROTATION  (The Broker's Tab)
   5 sub-tabs: Sector Rotation | Smart Money | Bridge Inflow |
               Whale Concentration | Liquidity Alerts
   ═══════════════════════════════════════════════════════════════════════════ */
type CapitalSubTab = 'sector' | 'smartmoney' | 'bridge' | 'whale' | 'liqalerts';

// ── Helpers ──────────────────────────────────────────────────────────────────
function getWallet(): string | null {
  return (window as any).__walletPublicKey
    || (window as any).__phantomWallet
    || localStorage.getItem('connectedWallet')
    || null;
}

function checkLocalUnlock(key: string): boolean {
  try {
    const exp = localStorage.getItem(key);
    return exp ? Date.now() < parseInt(exp) : false;
  } catch { return false; }
}

function setLocalUnlock(key: string, hrs: number) {
  localStorage.setItem(key, String(Date.now() + hrs * 60 * 60 * 1000));
}

// ── Points lock overlay ───────────────────────────────────────────────────────
function PointsLock({
  featureName, cost, durationHrs, pageKey, onUnlocked,
}: {
  featureName: string; cost: number; durationHrs: number;
  pageKey: string; onUnlocked: () => void;
}) {
  const [unlocking, setUnlocking] = useState(false);

  async function handleUnlock() {
    const wallet = getWallet();

    // Gate off or whitelist — auto unlock
    try {
      const gateRes  = await fetch('/api/gate/status');
      const gate     = await gateRes.json();
      if (!gate.gateLive) { setLocalUnlock(pageKey, durationHrs); onUnlocked(); return; }
      if (wallet) {
        const nr = await fetch(`/api/nft/check/${wallet}`);
        const nd = await nr.json();
        if (nd.hasAccess && (nd.isWhitelisted || nd.isFounder)) {
          setLocalUnlock(pageKey, 365 * 24);
          onUnlocked();
          return;
        }
      }
    } catch {}

    if (!wallet) { alert('Connect your wallet first'); return; }
    setUnlocking(true);
    try {
      const r = await fetch('/api/points/burn-page-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Wallet': wallet },
        body: JSON.stringify({ wallet, page: pageKey }),
      });
      const d = await r.json();
      if (d.success) { setLocalUnlock(pageKey, durationHrs); onUnlocked(); }
      else alert(d.error || `Need ${cost} points`);
    } catch { alert('Failed to unlock — try again'); }
    setUnlocking(false);
  }

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: 'rgba(2,4,8,0.95)', backdropFilter: 'blur(8px)', zIndex: 10, padding: 24 }}>
      <div style={{ fontSize: 28 }}>🔒</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FH, fontSize: 20, letterSpacing: 3, color: C.cyan, marginBottom: 6 }}>{featureName}</div>
        <div style={{ fontSize: 9, color: C.dim, fontFamily: FM }}>POINTS-LOCKED FEATURE</div>
      </div>
      <div style={{ padding: '10px 20px', border: `1px solid ${C.border}`, borderRadius: 6,
        background: C.cyanFaint, textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontFamily: FH, color: C.gold ?? C.yellow }}>{cost} PTS</div>
        <div style={{ fontSize: 8, color: C.dim, fontFamily: FM, marginTop: 2 }}>UNLOCKS FOR {durationHrs} HOURS</div>
      </div>
      <button onClick={handleUnlock} disabled={unlocking}
        style={{ padding: '10px 28px', borderRadius: 4, border: `1px solid ${C.cyan}`,
          background: C.cyanFaint, color: C.cyan, fontFamily: FM, fontSize: 10,
          letterSpacing: 2, fontWeight: 700, cursor: unlocking ? 'not-allowed' : 'pointer',
          opacity: unlocking ? 0.6 : 1 }}>
        {unlocking ? 'UNLOCKING...' : `🔓 UNLOCK — ${cost} POINTS`}
      </button>
      <div style={{ fontSize: 7, color: C.dim, fontFamily: FM }}>
        Points earned by minting or renewing your Genesis NFT
      </div>
    </div>
  );
}

// ── Silver tier lock ──────────────────────────────────────────────────────────
function SilverLock({ featureName }: { featureName: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: 'rgba(2,4,8,0.95)', backdropFilter: 'blur(8px)', zIndex: 10, padding: 24 }}>
      <div style={{ fontSize: 28 }}>⚗️</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FH, fontSize: 20, letterSpacing: 3, color: C.silver, marginBottom: 6 }}>{featureName}</div>
        <div style={{ display: 'inline-block', padding: '3px 12px', borderRadius: 3,
          border: '1px solid rgba(180,200,220,0.3)', background: 'rgba(180,200,220,0.06)',
          fontSize: 9, color: C.silver, fontFamily: FM, letterSpacing: 2, marginBottom: 8 }}>
          SILVER TIER EXCLUSIVE
        </div>
        <div style={{ fontSize: 9, color: C.dim, fontFamily: FM, lineHeight: 1.7 }}>
          Silver tier membership is coming soon.<br />
          This feature will be available to Silver holders only.
        </div>
      </div>
      <div style={{ padding: '10px 20px', border: '1px solid rgba(180,200,220,0.2)', borderRadius: 6,
        background: 'rgba(180,200,220,0.04)', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontFamily: FH, color: C.silver, letterSpacing: 2 }}>COMING SOON</div>
        <div style={{ fontSize: 8, color: C.dim, fontFamily: FM, marginTop: 2 }}>Silver tier launch TBA</div>
      </div>
    </div>
  );
}

// ── Sub-tab 1: Sector Rotation Heatmap ───────────────────────────────────────
const SECTOR_COLORS: Record<string, string> = {
  AI: '#9966ff', RWA: '#f7931a', DePIN: '#00ff88',
  LST: '#9945ff', DEX: '#00b4ff', Lending: '#ffaa00',
  Bridge: '#00ffcc', Yield: '#ffdd00',
};

function SectorRotationTab() {
  const [data,     setData]     = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [unlocked, setUnlocked] = useState(() => checkLocalUnlock('cf_sector'));
  const [lastMs,   setLastMs]   = useState(0);

  useEffect(() => {
    if (unlocked) return;
    async function check() {
      try {
        const r = await fetch('/api/gate/status');
        const d = await r.json();
        if (!d.gateLive) { setLocalUnlock('cf_sector', 12); setUnlocked(true); return; }
        const w = getWallet();
        if (w) {
          const r2 = await fetch(`/api/nft/check/${w}`);
          const d2 = await r2.json();
          if (d2.hasAccess && (d2.isWhitelisted || d2.isFounder)) {
            setLocalUnlock('cf_sector', 365 * 24); setUnlocked(true);
          }
        }
      } catch {}
    }
    check();
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/network/capital/sector-rotation');
      const d = await r.json();
      setData(d.sectors);
      setLastMs(Date.now());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!unlocked) { setLoading(false); return; }
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [unlocked, load]);

  if (!unlocked) return (
    <div style={{ flex: 1, position: 'relative', minHeight: 300 }}>
      <PointsLock featureName="SECTOR ROTATION HEATMAP" cost={25} durationHrs={12}
        pageKey="cf_sector" onUnlocked={() => setUnlocked(true)} />
    </div>
  );

  if (loading) return <Loader />;

  const sectors = Object.entries(data ?? {})
    .map(([name, s]: [string, any]) => ({ name, ...s }))
    .filter(s => s.tvl > 0)
    .sort((a, b) => b.tvl - a.tvl);

  const totalTvl = sectors.reduce((s, x) => s + x.tvl, 0);

  return (
    <ScrollArea>
      <div style={{ padding: '4px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 7, color: C.dim, fontFamily: FM, letterSpacing: 2 }}>SOLANA SECTOR TVL · LIVE ROTATION</div>
        <RefreshBadge ms={lastMs} every={300} />
      </div>

      {/* Heatmap grid */}
      <div style={{ margin: '12px 20px', display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        {sectors.map(s => {
          const color  = SECTOR_COLORS[s.name] ?? C.cyan;
          const pct    = totalTvl > 0 ? (s.tvl / totalTvl) * 100 : 0;
          const isGain = s.change1d >= 0;
          return (
            <div key={s.name} style={{ padding: '12px 14px', border: `1px solid ${color}33`,
              borderRadius: 8, background: `${color}08`, position: 'relative', overflow: 'hidden' }}>
              {/* Heatmap fill bar */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, height: 3,
                width: `${pct}%`, background: `linear-gradient(90deg,${color}66,${color})`,
                transition: 'width 0.8s ease' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ fontFamily: FH, fontSize: 16, letterSpacing: 2, color }}>{s.name}</span>
                <span style={{ fontSize: 8, color: isGain ? C.green : C.red, fontWeight: 700, fontFamily: FM }}>
                  {isGain ? '▲' : '▼'} {Math.abs(s.change1d).toFixed(1)}%
                </span>
              </div>
              <div style={{ fontSize: 14, fontFamily: FH, color: C.text, marginBottom: 4 }}>${fmtBig(s.tvl)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 7, color: C.dim, fontFamily: FM }}>{pct.toFixed(1)}% of total</span>
                <span style={{ fontSize: 7, color: C.dim, fontFamily: FM }}>7D: {s.change7d >= 0 ? '+' : ''}{s.change7d.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Flow summary */}
      <div style={{ margin: '0 20px 16px', padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.cyanFaint }}>
        <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 8, fontFamily: FM }}>24H INFLOW vs OUTFLOW BY SECTOR</div>
        {sectors.map(s => {
          const color = SECTOR_COLORS[s.name] ?? C.cyan;
          const isGain = s.change1d >= 0;
          return (
            <div key={s.name} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 8, color, fontFamily: FM }}>{s.name}</span>
                <span style={{ fontSize: 8, color: isGain ? C.green : C.red, fontFamily: FM }}>
                  {isGain ? '+' : ''}{s.change1d.toFixed(2)}% · {s.protocols} protocols
                </span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(Math.abs(s.change1d) * 5, 100)}%`,
                  background: isGain ? `linear-gradient(90deg,${color}66,${color})` : `linear-gradient(90deg,${C.red}66,${C.red})`,
                  borderRadius: 2, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ── Sub-tab 2: Smart Money Destination ───────────────────────────────────────
function SmartMoneyTab() {
  const [data,     setData]     = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [unlocked, setUnlocked] = useState(() => checkLocalUnlock('cf_smart'));
  const [lastMs,   setLastMs]   = useState(0);

  // Auto-unlock if gate is off or wallet is whitelisted
  useEffect(() => {
    if (unlocked) return;
    async function check() {
      try {
        const r = await fetch('/api/gate/status');
        const d = await r.json();
        if (!d.gateLive) { setLocalUnlock('cf_smart', 12); setUnlocked(true); return; }
        const w = getWallet();
        if (w) {
          const r2 = await fetch(`/api/nft/check/${w}`);
          const d2 = await r2.json();
          if (d2.hasAccess && (d2.isWhitelisted || d2.isFounder)) {
            setLocalUnlock('cf_smart', 365 * 24); setUnlocked(true);
          }
        }
      } catch {}
    }
    check();
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/network/capital/smart-money');
      const d = await r.json();
      setData(d.protocols ?? []);
      setLastMs(Date.now());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!unlocked) { setLoading(false); return; }
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [unlocked, load]);

  if (!unlocked) return (
    <div style={{ flex: 1, position: 'relative', minHeight: 300 }}>
      <PointsLock featureName="SMART MONEY DESTINATION" cost={25} durationHrs={12}
        pageKey="capital_flow_smart" onUnlocked={() => setUnlocked(true)} />
    </div>
  );

  if (loading) return <Loader />;

  const totalInflow = data.reduce((s, p) => s + p.inflow1d, 0);

  return (
    <ScrollArea>
      <div style={{ padding: '4px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 7, color: C.dim, fontFamily: FM, letterSpacing: 2 }}>TOP PROTOCOLS RECEIVING CAPITAL · 24H</div>
        <RefreshBadge ms={lastMs} every={300} />
      </div>

      <div style={{ margin: '8px 20px', padding: '10px 14px', border: `1px solid ${C.green}22`, borderRadius: 6, background: `${C.green}06` }}>
        <div style={{ fontSize: 7, color: C.dim, fontFamily: FM, marginBottom: 4, letterSpacing: 2 }}>TOTAL 24H INFLOW TO TOP PROTOCOLS</div>
        <div style={{ fontSize: 24, fontFamily: FH, color: C.green }}>${fmtBig(totalInflow)}</div>
      </div>

      <div style={{ padding: '0 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 70px 80px', gap: 6,
          padding: '4px 0 5px', borderBottom: `1px solid ${C.border}` }}>
          {['#', 'PROTOCOL', 'TVL', '24H', 'INFLOW'].map(h => (
            <span key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2, fontFamily: FM }}>{h}</span>
          ))}
        </div>

        {data.map((p, i) => (
          <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 70px 80px',
            gap: 6, padding: '10px 0', borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: i < 3 ? C.green : C.dim, fontWeight: i < 3 ? 700 : 400, fontFamily: FM }}>{i + 1}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {p.logo ? <img src={p.logo} alt="" width={16} height={16}
                style={{ borderRadius: '50%', opacity: 0.9 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : null}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: FM }}>{p.name}</div>
                <div style={{ fontSize: 7, color: C.dim }}>{p.category}</div>
              </div>
            </div>
            <span style={{ fontSize: 9, color: C.cyan, fontFamily: FM }}>${fmtBig(p.tvl)}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: chgColor(p.change1d), fontFamily: FM }}>{chgSign(p.change1d)}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.green, fontFamily: FM }}>+${fmtBig(p.inflow1d)}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ── Sub-tab 3: Bridge Inflow Tracker ─────────────────────────────────────────
function BridgeInflowTab() {
  const [data,     setData]     = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [unlocked, setUnlocked] = useState(() => checkLocalUnlock('cf_bridge'));
  const [lastMs,   setLastMs]   = useState(0);

  useEffect(() => {
    if (unlocked) return;
    async function check() {
      try {
        const r = await fetch('/api/gate/status');
        const d = await r.json();
        if (!d.gateLive) { setLocalUnlock('cf_bridge', 12); setUnlocked(true); return; }
        const w = getWallet();
        if (w) {
          const r2 = await fetch(`/api/nft/check/${w}`);
          const d2 = await r2.json();
          if (d2.hasAccess && (d2.isWhitelisted || d2.isFounder)) {
            setLocalUnlock('cf_bridge', 365 * 24); setUnlocked(true);
          }
        }
      } catch {}
    }
    check();
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/network/capital/bridge-inflow');
      const d = await r.json();
      setData(d);
      setLastMs(Date.now());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!unlocked) { setLoading(false); return; }
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [unlocked, load]);

  if (!unlocked) return (
    <div style={{ flex: 1, position: 'relative', minHeight: 300 }}>
      <PointsLock featureName="BRIDGE INFLOW TRACKER" cost={25} durationHrs={12}
        pageKey="cf_bridge" onUnlocked={() => setUnlocked(true)} />
    </div>
  );

  if (loading) return <Loader />;

  const summary = data?.summary ?? {};
  const netPositive = (summary.netFlow ?? 0) >= 0;

  return (
    <ScrollArea>
      <div style={{ padding: '4px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 7, color: C.dim, fontFamily: FM, letterSpacing: 2 }}>CAPITAL ENTERING SOLANA VIA BRIDGES · 24H</div>
        <RefreshBadge ms={lastMs} every={300} />
      </div>

      {/* Net flow summary */}
      <div style={{ margin: '8px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
        <StatCard label="24H INFLOW"  value={`$${fmtBig(summary.inflow24h ?? 0)}`}  color={C.green} />
        <StatCard label="24H OUTFLOW" value={`$${fmtBig(summary.outflow24h ?? 0)}`} color={C.red}   />
        <StatCard label="NET FLOW"    value={`${netPositive ? '+' : ''}$${fmtBig(Math.abs(summary.netFlow ?? 0))}`}
          color={netPositive ? C.green : C.red} sub={netPositive ? '↑ Capital entering' : '↓ Capital leaving'} />
      </div>

      {/* 7-day volume chart */}
      {data?.volumeHistory?.length > 0 && (
        <div style={{ margin: '0 20px 10px', padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.cyanFaint }}>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 8, fontFamily: FM }}>7-DAY BRIDGE INFLOW vs OUTFLOW</div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 48 }}>
            {data.volumeHistory.map((d: any, i: number) => {
              const maxVol = Math.max(...data.volumeHistory.map((x: any) => Math.max(x.inflow, x.outflow)), 1);
              const inPct  = (d.inflow  / maxVol) * 100;
              const outPct = (d.outflow / maxVol) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, height: `${Math.max(inPct, 2)}%`, background: C.green, borderRadius: 2, opacity: 0.7 }} />
                  <div style={{ flex: 1, height: `${Math.max(outPct, 2)}%`, background: C.red,   borderRadius: 2, opacity: 0.7 }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <span style={{ fontSize: 7, color: C.green, fontFamily: FM }}>▪ Inflow</span>
            <span style={{ fontSize: 7, color: C.red,   fontFamily: FM }}>▪ Outflow</span>
          </div>
        </div>
      )}

      {/* Bridge list */}
      <div style={{ padding: '0 20px 16px' }}>
        <SecHead label="🌉 ACTIVE BRIDGES TO SOLANA" />
        {(data?.bridges ?? []).map((b: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
            {b.logo ? <img src={b.logo} alt="" width={18} height={18} style={{ borderRadius: '50%', opacity: 0.9 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : null}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: FM }}>{b.name}</div>
              <div style={{ fontSize: 7, color: C.dim }}>{(b.chains ?? []).slice(0, 4).join(' · ')}</div>
            </div>
            {b.volume24h > 0 && (
              <span style={{ fontSize: 10, color: C.cyan, fontFamily: FM, fontWeight: 700 }}>${fmtBig(b.volume24h)}</span>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ── Sub-tab 4: Whale Concentration Score ─────────────────────────────────────
function WhaleConcentrationTab() {
  const [data,     setData]     = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [unlocked, setUnlocked] = useState(() => checkLocalUnlock('cf_whale'));
  const [lastMs,   setLastMs]   = useState(0);

  // Auto-unlock if gate is off or wallet is whitelisted
  useEffect(() => {
    if (unlocked) return;
    async function check() {
      try {
        const r = await fetch('/api/gate/status');
        const d = await r.json();
        if (!d.gateLive) { setLocalUnlock('cf_whale', 12); setUnlocked(true); return; }
        const w = getWallet();
        if (w) {
          const r2 = await fetch(`/api/nft/check/${w}`);
          const d2 = await r2.json();
          if (d2.hasAccess && (d2.isWhitelisted || d2.isFounder)) {
            setLocalUnlock('cf_whale', 365 * 24); setUnlocked(true);
          }
        }
      } catch {}
    }
    check();
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/network/capital/whale-concentration');
      const d = await r.json();
      setData(d);
      setLastMs(Date.now());
    } catch (e) {
      console.error('[WhaleConcentration]', e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!unlocked) { setLoading(false); return; }
    load();
    const t = setInterval(load, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [unlocked, load]);

  if (!unlocked) return (
    <div style={{ flex: 1, position: 'relative', minHeight: 300 }}>
      <PointsLock featureName="WHALE CONCENTRATION" cost={25} durationHrs={12}
        pageKey="capital_flow_whale" onUnlocked={() => setUnlocked(true)} />
    </div>
  );

  if (loading) return <Loader />;

  const score   = data?.avgWhaleScore ?? 50;
  const driven  = data?.marketDriven  ?? 'MIXED';
  const scoreColor = score > 65 ? C.orange : score > 35 ? C.yellow : C.green;

  return (
    <ScrollArea>
      <div style={{ padding: '4px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 7, color: C.dim, fontFamily: FM, letterSpacing: 2 }}>WHALE vs RETAIL PARTICIPATION · SOLANA</div>
        <RefreshBadge ms={lastMs} every={120} />
      </div>

      {/* Market score */}
      <div style={{ margin: '8px 20px', padding: '16px 18px', border: `1px solid ${scoreColor}33`,
        borderRadius: 8, background: `${scoreColor}08` }}>
        <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 6, fontFamily: FM }}>CURRENT MARKET DRIVEN BY</div>
        <div style={{ fontSize: 28, fontFamily: FH, letterSpacing: 3, color: scoreColor, marginBottom: 8 }}>{driven}</div>
        <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 5, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: `${score}%`,
            background: `linear-gradient(90deg,${C.green}88,${scoreColor})`,
            borderRadius: 5, transition: 'width 0.8s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 8, color: C.green, fontFamily: FM }}>RETAIL 0</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor, fontFamily: FM }}>SCORE: {score}/100</span>
          <span style={{ fontSize: 8, color: C.orange, fontFamily: FM }}>100 WHALE</span>
        </div>
      </div>

      {/* Explanation */}
      <div style={{ margin: '0 20px 10px', padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.cyanFaint }}>
        <div style={{ fontSize: 8, color: C.dim, fontFamily: FM, lineHeight: 1.7 }}>
          {score > 65 && '⚠ High whale concentration detected. Volume is driven by a small number of large wallets — pumps may be artificial. Exercise caution.'}
          {score > 35 && score <= 65 && '⚡ Mixed participation. Both whales and retail are active. Normal market conditions.'}
          {score <= 35 && '✓ Broad retail participation. Volume is distributed across many smaller wallets — organic activity signal.'}
        </div>
      </div>

      {/* Per-pair breakdown */}
      <div style={{ padding: '0 20px 16px' }}>
        <SecHead label="CONCENTRATION BY PAIR" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 70px', gap: 6,
          padding: '0 0 5px', borderBottom: `1px solid ${C.border}` }}>
          {['PAIR', 'SCORE', 'AVG TXN', 'DRIVEN BY'].map(h => (
            <span key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2, fontFamily: FM }}>{h}</span>
          ))}
        </div>
        {(data?.pairs ?? []).slice(0, 15).map((p: any, i: number) => {
          const c = p.whaleScore > 65 ? C.orange : p.whaleScore > 35 ? C.yellow : C.green;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 70px',
              gap: 6, padding: '7px 0', borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: C.text, fontFamily: FM }}>{p.pair}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: c, fontFamily: FM }}>{p.whaleScore}</span>
              <span style={{ fontSize: 9, color: C.dim, fontFamily: FM }}>${fmtBig(p.avgTxnUsd)}</span>
              <span style={{ fontSize: 8, color: c, fontFamily: FM, border: `1px solid ${c}33`,
                borderRadius: 3, padding: '1px 5px', background: `${c}0a` }}>{p.driven}</span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ── Sub-tab 5: Liquidity Migration Alerts ─────────────────────────────────────
function LiquidityAlertsTab() {
  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 300 }}>
      <SilverLock featureName="LIQUIDITY MIGRATION ALERTS" />
    </div>
  );
}

// ── Main CapitalFlowTab ───────────────────────────────────────────────────────
const CAPITAL_SUBTABS: { id: CapitalSubTab; label: string; locked?: string }[] = [
  { id: 'sector',     label: '📊 SECTOR'       },
  { id: 'smartmoney', label: '🧠 SMART MONEY'  },
  { id: 'bridge',     label: '🌉 BRIDGE INFLOW' },
  { id: 'whale',      label: '🐋 WHALE SCORE'   },
  { id: 'liqalerts',  label: '⚗️ LIQ ALERTS', locked: 'SILVER' },
];

function CapitalFlowTab() {
  const [sub, setSub] = useState<CapitalSubTab>('sector');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>

      {/* Header */}
      <div style={{ padding: '8px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: FH, fontSize: 16, letterSpacing: 3, color: C.cyan }}>CAPITAL FLOW</span>
          <span style={{ fontSize: 7, color: C.dim, fontFamily: FM }}>THE BROKER'S TAB</span>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '0 20px', borderBottom: `1px solid ${C.border}`,
        overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 }}>
        {CAPITAL_SUBTABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            style={{ padding: '6px 12px', background: sub === t.id ? C.cyanFaint : 'transparent',
              border: 'none', borderBottom: sub === t.id ? `2px solid ${C.cyan}` : '2px solid transparent',
              color: sub === t.id ? C.cyan : t.locked ? C.silverDim : C.dim,
              fontFamily: FM, fontSize: 8, letterSpacing: 1, cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0, transition: 'color 0.15s' }}>
            {t.label}
            {t.locked && <span style={{ marginLeft: 4, fontSize: 7, color: C.silverDim }}>🔒</span>}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {sub === 'sector'     && <SectorRotationTab />}
        {sub === 'smartmoney' && <SmartMoneyTab />}
        {sub === 'bridge'     && <BridgeInflowTab />}
        {sub === 'whale'      && <WhaleConcentrationTab />}
        {sub === 'liqalerts'  && <LiquidityAlertsTab />}
      </div>
    </div>
  );
}
