// client/src/components/panels/SearchPanel.tsx
// Universal Web3 search — paste anything, get everything.
// Auto-detects: Solana wallet · EVM address · Tx signature · Token symbol · .sol/.eth domain
// APIs: Helius · GoPlus · CoinGecko · DexScreener · Bonfida (.sol) · ENS (.eth)
// Server cache: per-query 60s–5min depending on type
// Zero extra API keys — uses only existing HELIUS_API, BIRD_API, CG_API_

import { useState, useCallback, useRef } from 'react';
import AiScoreBadge from '../../aiscorebadge';
import { scoreFromCoinGecko, scoreFromDexScreener, scoreFromAudit } from '../../aiscoring';

/* ─── FONTS ──────────────────────────────────────────────────────────────── */
if (typeof document !== 'undefined' && !document.getElementById('search-kf')) {
  const s = document.createElement('style');
  s.id = 'search-kf';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Bebas+Neue&display=swap');
    @keyframes searchSpin  { to { transform: rotate(360deg); } }
    @keyframes searchPop   { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes searchSlide { from { opacity:0; transform:translateX(-6px); } to { opacity:1; transform:translateX(0); } }
    @keyframes searchPulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
    @keyframes cursorBlink { 0%,100% { opacity:1; } 50% { opacity:0; } }
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

/* ─── QUERY TYPE DETECTION ───────────────────────────────────────────────── */
type QueryType = 'solana-wallet' | 'evm-address' | 'solana-token' | 'tx-signature' | 'sol-domain' | 'eth-domain' | 'symbol' | 'unknown';

function detectQueryType(raw: string): QueryType {
  const q = raw.trim();
  if (!q) return 'unknown';
  if (q.endsWith('.sol'))                       return 'sol-domain';
  if (q.endsWith('.eth'))                       return 'eth-domain';
  if (/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(q)) return 'tx-signature';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)) return 'solana-wallet';
  if (/^0x[a-fA-F0-9]{40}$/.test(q))            return 'evm-address';
  if (/^[A-Z0-9]{2,10}$/.test(q))               return 'symbol';
  return 'symbol'; // treat anything else as a symbol/name search
}

const TYPE_LABEL: Record<QueryType, string> = {
  'solana-wallet': 'SOLANA WALLET',
  'evm-address':   'EVM CONTRACT',
  'solana-token':  'SOLANA TOKEN',
  'tx-signature':  'TRANSACTION',
  'sol-domain':    '.SOL DOMAIN',
  'eth-domain':    '.ETH DOMAIN',
  'symbol':        'TOKEN SEARCH',
  'unknown':       'UNKNOWN',
};

const TYPE_COLOR: Record<QueryType, string> = {
  'solana-wallet': '#9945ff',
  'evm-address':   '#627eea',
  'solana-token':  '#00b4ff',
  'tx-signature':  '#ffaa00',
  'sol-domain':    '#9945ff',
  'eth-domain':    '#627eea',
  'symbol':        '#00ff88',
  'unknown':       'rgba(150,180,210,0.4)',
};

/* ─── RESULT TYPES ───────────────────────────────────────────────────────── */
interface SearchResult {
  queryType:   QueryType;
  query:       string;
  wallet?:     WalletResult;
  token?:      TokenResult;
  tx?:         TxResult;
  domain?:     DomainResult;
  tokens?:     TokenResult[];  // multi-result for symbol search
}

interface WalletResult {
  address:        string;
  classification: string;
  classScore:     number;
  realisedPnl:    number;
  winRate:        number;
  totalTrades:    number;
  avgHoldMs:      number;
  topDexes:       string[];
  bestTrade:      { token: string; pnl: number } | null;
  worstTrade:     { token: string; pnl: number } | null;
  recentTxs:      any[];
  solBalance:     number;
}

interface TokenResult {
  address:        string;
  name:           string;
  symbol:         string;
  price:          number;
  priceChange24h: number;
  volume24h:      number;
  marketCap:      number;
  liquidity:      number;
  holderCount:    string;
  riskScore:      number;
  riskLevel:      string;
  aiScore:        number;
  chain:          string;
  dex:            string;
  buyTax:         string;
  sellTax:        string;
  mintable:       boolean;
  honeypot:       boolean;
  deployer:       string;
}

interface TxResult {
  signature:       string;
  type:            string;
  description:     string;
  timestamp:       number;
  fee:             number;
  status:          'SUCCESS' | 'FAILED';
  source:          string;
  totalSolMoved:   number;
  tokenTransfers:  any[];
  nativeTransfers: any[];
  accounts:        string[];
}

interface DomainResult {
  domain:  string;
  address: string;
  chain:   string;
}

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
  if (n < 1_000)   return n.toFixed(2);
  return fmtBig(n);
}

function fmtMs(ms: number): string {
  if (ms < 60_000)     return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000)  return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts * (ts < 1e12 ? 1000 : 1)) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function truncate(s: string, n = 8): string { return s ? `${s.slice(0, n)}...${s.slice(-4)}` : '—'; }
function chgColor(v: number): string { return v >= 0 ? C.green : C.red; }
function chgSign(v: number): string  { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }

/* ─── SHARED ATOMS ───────────────────────────────────────────────────────── */
function Loader({ label = 'SEARCHING...' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 140 }}>
      <div style={{ width: 14, height: 14, border: `1px solid ${C.cyanFaint}`, borderTop: `1px solid ${C.cyan}`, borderRadius: '50%', animation: 'searchSpin 0.8s linear infinite' }} />
      <span style={{ fontSize: 9, color: C.dim, letterSpacing: 2, fontFamily: FM }}>{label}</span>
    </div>
  );
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ background: 'none', border: `1px solid ${copied ? C.green : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', padding: '2px 6px', borderRadius: 3, color: copied ? C.green : C.dim, fontSize: 8, fontFamily: FM, letterSpacing: 1 }}>
      {copied ? '✓ COPIED' : label ?? '⧉'}
    </button>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color, border: `1px solid ${color}44`, borderRadius: 3, padding: '2px 6px', background: `${color}0d`, fontFamily: FM, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function StatBox({ label, value, color = C.silver }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 4, background: 'rgba(0,0,0,0.2)' }}>
      <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

/* ─── RESULT CARDS ───────────────────────────────────────────────────────── */
const CLASS_COLOR: Record<string, string> = {
  'SMART MONEY': '#00ff88', 'WHALE': '#f7931a', 'BOT': '#9966ff', 'INSIDER': '#ff3355', 'RETAIL': 'rgba(180,200,220,0.5)',
};
const CLASS_DESC: Record<string, string> = {
  'SMART MONEY': 'Consistent winner — high win rate, patient holds',
  'WHALE':       'Very large position sizes — market-moving capital',
  'BOT':         'High-frequency automated — many micro transactions',
  'INSIDER':     'Early entries before announcements',
  'RETAIL':      'Standard retail pattern — mixed results',
};

function WalletCard({ w }: { w: WalletResult }) {
  const clsColor = CLASS_COLOR[w.classification] ?? C.dim;
  return (
    <div style={{ animation: 'searchPop 0.3s ease' }}>
      {/* Classification header */}
      <div style={{ marginBottom: 12, padding: '12px 14px', border: `1px solid ${clsColor}33`, borderRadius: 6, background: `${clsColor}08` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FH, fontSize: 20, letterSpacing: 3, color: clsColor }}>{w.classification}</span>
          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, minWidth: 60 }}>
            <div style={{ height: '100%', width: `${w.classScore}%`, background: clsColor, borderRadius: 2, transition: 'width 0.8s ease' }} />
          </div>
          <span style={{ fontSize: 9, color: clsColor }}>{w.classScore}%</span>
        </div>
        <div style={{ fontSize: 9, color: C.dim }}>{CLASS_DESC[w.classification]}</div>
        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: C.dim }}>{truncate(w.address, 12)}</span>
          <CopyBtn text={w.address} label="⧉ COPY" />
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
        <StatBox label="REALISED PnL"  value={`${w.realisedPnl >= 0 ? '+' : ''}$${fmtBig(Math.abs(w.realisedPnl))}`} color={w.realisedPnl >= 0 ? C.green : C.red} />
        <StatBox label="WIN RATE"      value={`${w.winRate.toFixed(1)}%`} color={w.winRate > 55 ? C.green : w.winRate > 45 ? C.yellow : C.red} />
        <StatBox label="TOTAL TRADES"  value={w.totalTrades.toString()} color={C.cyan} />
        <StatBox label="AVG HOLD TIME" value={fmtMs(w.avgHoldMs)} />
        <StatBox label="SOL BALANCE"   value={`${w.solBalance.toFixed(3)} SOL`} color={C.solPurple} />
        <StatBox label="TOP DEX"       value={w.topDexes[0] ?? '—'} color={C.cyanDim} />
      </div>

      {/* Best / worst */}
      {(w.bestTrade || w.worstTrade) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {w.bestTrade && (
            <div style={{ padding: '8px 10px', border: `1px solid ${C.green}22`, borderRadius: 4, background: `${C.green}06` }}>
              <div style={{ fontSize: 7, letterSpacing: 2, color: C.green, marginBottom: 3 }}>BEST TRADE</div>
              <div style={{ fontSize: 10, color: C.text }}>{w.bestTrade.token}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>+${fmtBig(w.bestTrade.pnl)}</div>
            </div>
          )}
          {w.worstTrade && (
            <div style={{ padding: '8px 10px', border: `1px solid ${C.red}22`, borderRadius: 4, background: `${C.red}06` }}>
              <div style={{ fontSize: 7, letterSpacing: 2, color: C.red, marginBottom: 3 }}>WORST TRADE</div>
              <div style={{ fontSize: 10, color: C.text }}>{w.worstTrade.token}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>-${fmtBig(Math.abs(w.worstTrade.pnl))}</div>
            </div>
          )}
        </div>
      )}

      {/* Recent txs */}
      {w.recentTxs.length > 0 && (
        <div>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 6 }}>RECENT ACTIVITY</div>
          {w.recentTxs.slice(0, 5).map((tx: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: `1px solid rgba(255,255,255,0.03)`, animation: `searchSlide 0.2s ease ${i * 0.04}s both` }}>
              <Pill label={tx.type || 'TX'} color={C.cyan} />
              <span style={{ flex: 1, fontSize: 9, color: C.silver, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description || tx.type}</span>
              {tx.totalSolMoved > 0.001 && <span style={{ fontSize: 9, color: C.solPurple, flexShrink: 0 }}>{tx.totalSolMoved.toFixed(3)}◎</span>}
              <span style={{ fontSize: 8, color: C.dim, flexShrink: 0 }}>{timeAgo(tx.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TokenCard({ t, compact = false }: { t: TokenResult; compact?: boolean }) {
  const riskColor = t.riskLevel === 'DANGER' ? C.red : t.riskLevel === 'CAUTION' ? C.orange : C.green;
  const chainColor = t.chain === 'solana' ? C.solPurple : t.chain === 'ethereum' ? C.ethBlue : C.cyan;

  return (
    <div style={{ padding: compact ? '8px 0' : 0, borderBottom: compact ? `1px solid ${C.border}` : 'none', animation: 'searchPop 0.25s ease' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: compact ? 0 : 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontFamily: FH, fontSize: compact ? 16 : 20, letterSpacing: 2, color: C.text }}>{t.name || t.symbol}</span>
            <span style={{ fontSize: 10, color: C.cyan }}>{t.symbol}</span>
            <Pill label={t.chain.toUpperCase()} color={chainColor} />
            <Pill label={t.riskLevel} color={riskColor} />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 8, color: C.dim }}>{truncate(t.address, 10)}</span>
            <CopyBtn text={t.address} />
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: compact ? 14 : 20, fontWeight: 700, color: C.silver }}>${fmtPrice(t.price)}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: chgColor(t.priceChange24h) }}>{chgSign(t.priceChange24h)}</div>
        </div>
        {!compact && <AiScoreBadge score={t.aiScore} />}
      </div>

      {!compact && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
            <StatBox label="MARKET CAP"  value={`$${fmtBig(t.marketCap)}`} />
            <StatBox label="VOLUME 24H"  value={`$${fmtBig(t.volume24h)}`} />
            <StatBox label="LIQUIDITY"   value={`$${fmtBig(t.liquidity)}`} color={t.liquidity < 50_000 ? C.red : C.silver} />
            <StatBox label="HOLDERS"     value={t.holderCount || '—'} />
            <StatBox label="BUY TAX"     value={`${t.buyTax}%`}  color={parseFloat(t.buyTax)  > 10 ? C.red : C.silver} />
            <StatBox label="SELL TAX"    value={`${t.sellTax}%`} color={parseFloat(t.sellTax) > 10 ? C.red : C.silver} />
          </div>

          {/* Risk flags */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {t.honeypot  && <Pill label="⚠ HONEYPOT"  color={C.red} />}
            {t.mintable  && <Pill label="⚠ MINTABLE"  color={C.orange} />}
            {!t.honeypot && !t.mintable && <Pill label="✓ NO HONEYPOT" color={C.green} />}
          </div>

          {/* Deployer */}
          {t.deployer && t.deployer !== '—' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>DEPLOYER</span>
              <span style={{ fontSize: 9, color: C.silver }}>{truncate(t.deployer, 10)}</span>
              <CopyBtn text={t.deployer} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TxCard({ tx }: { tx: TxResult }) {
  const statusColor = tx.status === 'SUCCESS' ? C.green : C.red;
  const typeColors: Record<string, string> = { SWAP: C.cyan, TRANSFER: C.purple, NFT_SALE: C.btcOrange, NFT_MINT: C.green, STAKE: C.ethBlue };
  const typeColor = typeColors[tx.type] ?? C.dim;

  return (
    <div style={{ animation: 'searchPop 0.3s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Pill label={tx.type}   color={typeColor} />
        <Pill label={tx.status} color={statusColor} />
        <span style={{ fontSize: 9, color: C.dim }}>{tx.source !== '—' ? tx.source : ''}</span>
        <span style={{ fontSize: 8, color: C.dim, marginLeft: 'auto' }}>{timeAgo(tx.timestamp)}</span>
      </div>

      {/* Description */}
      <div style={{ marginBottom: 12, padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 5, background: 'rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 11, color: C.text, lineHeight: 1.6 }}>{tx.description}</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
        <StatBox label="FEE"        value={`${(tx.fee / 1e9).toFixed(5)} SOL`} />
        <StatBox label="SOL MOVED"  value={`${tx.totalSolMoved.toFixed(4)}◎`} color={C.solPurple} />
        <StatBox label="TRANSFERS"  value={`${tx.tokenTransfers.length + tx.nativeTransfers.length}`} color={C.cyan} />
      </div>

      {/* Token transfers */}
      {tx.tokenTransfers.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 6 }}>TOKEN TRANSFERS</div>
          {tx.tokenTransfers.slice(0, 5).map((t: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: `1px solid rgba(255,255,255,0.03)`, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.orange }}>{t.amount?.toFixed(4)} {t.symbol}</span>
              <span style={{ fontSize: 8, color: C.dim }}>{truncate(t.fromUser)} → {truncate(t.toUser)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Native transfers */}
      {tx.nativeTransfers.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 6 }}>SOL TRANSFERS</div>
          {tx.nativeTransfers.slice(0, 5).map((t: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: `1px solid rgba(255,255,255,0.03)`, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.solPurple }}>{(t.amount / 1e9).toFixed(4)}◎</span>
              <span style={{ fontSize: 8, color: C.dim }}>{truncate(t.fromUser)} → {truncate(t.toUser)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Signature */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>SIGNATURE</span>
        <span style={{ fontSize: 8, color: C.silver }}>{truncate(tx.signature, 20)}</span>
        <CopyBtn text={tx.signature} label="⧉ COPY FULL" />
      </div>
    </div>
  );
}

function DomainCard({ d }: { d: DomainResult }) {
  const chainColor = d.chain === 'solana' ? C.solPurple : C.ethBlue;
  return (
    <div style={{ animation: 'searchPop 0.3s ease', padding: '16px', border: `1px solid ${chainColor}22`, borderRadius: 6, background: `${chainColor}06` }}>
      <div style={{ fontFamily: FH, fontSize: 22, letterSpacing: 2, color: chainColor, marginBottom: 8 }}>{d.domain}</div>
      <div style={{ fontSize: 8, color: C.dim, letterSpacing: 2, marginBottom: 6 }}>RESOLVES TO</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: C.silver }}>{truncate(d.address, 16)}</span>
        <CopyBtn text={d.address} label="⧉ COPY ADDRESS" />
      </div>
      <div style={{ marginTop: 8 }}>
        <Pill label={d.chain.toUpperCase()} color={chainColor} />
      </div>
    </div>
  );
}

/* ─── RECENT SEARCHES ────────────────────────────────────────────────────── */
const MAX_RECENT = 8;
let _recentSearches: { query: string; type: QueryType; }[] = [];

function addRecent(query: string, type: QueryType) {
  _recentSearches = [{ query, type }, ..._recentSearches.filter(r => r.query !== query)].slice(0, MAX_RECENT);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN — SEARCH PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
export default function SearchPanel() {
  const [query,   setQuery]   = useState('');
  const [result,  setResult]  = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [recent,  setRecent]  = useState<typeof _recentSearches>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const detected = detectQueryType(query);

  const search = useCallback(async (q: string) => {
    const raw = q.trim();
    if (!raw) return;
    const type = detectQueryType(raw);
    setLoading(true); setError(null); setResult(null);
    try {
      const res  = await cachedFetch<SearchResult>(
        `search:${raw}`,
        async () => {
          const r = await fetch(`/api/search?q=${encodeURIComponent(raw)}&type=${type}`);
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Search failed');
          return d;
        },
        60,
      );
      setResult(res);
      addRecent(raw, type);
      setRecent([...  _recentSearches]);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') search(query); };
  const clear     = () => { setQuery(''); setResult(null); setError(null); inputRef.current?.focus(); };

  const EXAMPLES = [
    { label: 'Solana wallet', ex: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
    { label: 'Token symbol',  ex: 'BONK' },
    { label: 'EVM contract',  ex: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>

      {/* ── Search bar ── */}
      <div style={{ padding: '10px 8px 8px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>

        {/* Input row */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          {/* Detected type badge */}
          {query.trim() && (
            <div style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 3, border: `1px solid ${TYPE_COLOR[detected]}44`, background: `${TYPE_COLOR[detected]}0d`, fontSize: 7, color: TYPE_COLOR[detected], letterSpacing: 2, whiteSpace: 'nowrap' }}>
              {TYPE_LABEL[detected]}
            </div>
          )}

          {/* Input */}
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Paste wallet · contract · tx hash · symbol · .sol domain..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{ width: '100%', background: 'rgba(0,0,0,0.45)', border: `1px solid ${query ? C.borderHi : C.border}`, borderRadius: 5, padding: '8px 32px 8px 10px', color: C.text, fontSize: 10, fontFamily: FM, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
            />
            {query && (
              <button onClick={clear}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.dim, fontSize: 12, padding: 0, lineHeight: 1 }}>
                ✕
              </button>
            )}
          </div>

          {/* Search button */}
          <button onClick={() => search(query)} disabled={loading || !query.trim()}
            style={{ padding: '8px 16px', borderRadius: 5, border: `1px solid ${C.cyan}`, background: C.cyanFaint, color: C.cyan, fontSize: 10, cursor: 'pointer', fontFamily: FM, letterSpacing: 2, fontWeight: 700, flexShrink: 0, opacity: (loading || !query.trim()) ? 0.5 : 1 }}>
            {loading ? '...' : '⌕ SEARCH'}
          </button>
        </div>

        {/* Hint strip */}
        <div style={{ fontSize: 8, color: C.dim, lineHeight: 1.8 }}>
          Auto-detects: wallet · contract · tx signature · token symbol · .sol/.eth domain — just paste and go
        </div>
      </div>

      {/* ── Scrollable results area ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent', padding: '10px 8px' }}>

        {/* ── Loading ── */}
        {loading && <Loader label={`SCANNING ${TYPE_LABEL[detected]}...`} />}

        {/* ── Error ── */}
        {error && !loading && (
          <div style={{ padding: '12px 14px', border: `1px solid ${C.red}33`, borderRadius: 5, background: `${C.red}08`, fontSize: 9, color: C.red, animation: 'searchPop 0.2s ease' }}>
            {error}
          </div>
        )}

        {/* ── Results ── */}
        {result && !loading && (
          <div style={{ animation: 'searchPop 0.3s ease' }}>

            {/* Result type header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
              <Pill label={TYPE_LABEL[result.queryType]} color={TYPE_COLOR[result.queryType]} />
              <span style={{ fontSize: 8, color: C.dim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.query}</span>
              <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, fontSize: 9, fontFamily: FM }}>✕ CLEAR</button>
            </div>

            {/* Domain resolved — show resolved address then profile it */}
            {result.domain && <DomainCard d={result.domain} />}
            {result.domain && result.wallet && <div style={{ marginTop: 14 }}><WalletCard w={result.wallet} /></div>}

            {/* Wallet profile */}
            {!result.domain && result.wallet && <WalletCard w={result.wallet} />}

            {/* Single token */}
            {result.token && <TokenCard t={result.token} />}

            {/* Transaction */}
            {result.tx && <TxCard tx={result.tx} />}

            {/* Multi-token symbol search results */}
            {result.tokens && result.tokens.length > 0 && (
              <div>
                <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 8 }}>{result.tokens.length} RESULTS</div>
                {result.tokens.map((t, i) => (
                  <div key={t.address + i} onClick={() => search(t.address)} style={{ cursor: 'pointer', padding: '8px 0', transition: 'background 0.1s' }}>
                    <TokenCard t={t} compact />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Empty state + examples + recent ── */}
        {!result && !loading && !error && (
          <div>
            {/* Hero prompt */}
            <div style={{ textAlign: 'center', padding: '24px 16px 20px', borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
              <div style={{ fontFamily: FH, fontSize: 28, letterSpacing: 4, color: C.cyan, marginBottom: 6 }}>
                WEB3 SEARCH
              </div>
              <div style={{ fontSize: 9, color: C.dim, lineHeight: 2 }}>
                Paste any wallet, token, transaction, or domain.<br />
                Auto-detected and profiled in seconds.
              </div>
            </div>

            {/* What you can search */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 10 }}>SUPPORTED LOOKUPS</div>
              {[
                { icon: '◈', label: 'Solana Wallet',    desc: 'PnL · classification · hold time · top DEXes', color: C.solPurple },
                { icon: '⬡', label: 'Token Contract',   desc: 'Risk score · GoPlus screen · price · deployer', color: C.cyan },
                { icon: '→', label: 'Transaction Hash', desc: 'Full breakdown · amounts · accounts · fee',     color: C.orange },
                { icon: '⇄', label: 'Token Symbol',     desc: 'CoinGecko + DexScreener ranked by liquidity',  color: C.green },
                { icon: '◉', label: 'EVM Contract',     desc: 'GoPlus + Tenderly sell simulation + risk',      color: C.ethBlue },
                { icon: '⬡', label: '.sol / .eth Domain', desc: 'Resolves address + profiles the wallet',    color: C.purple },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: `1px solid rgba(255,255,255,0.03)`, animation: `searchSlide 0.2s ease ${i * 0.05}s both` }}>
                  <span style={{ fontSize: 14, color: item.color, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.silver, marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 8, color: C.dim }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent searches */}
            {recent.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 8 }}>RECENT</div>
                {recent.map((r, i) => (
                  <div key={i} onClick={() => { setQuery(r.query); search(r.query); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                    <Pill label={TYPE_LABEL[r.type]} color={TYPE_COLOR[r.type]} />
                    <span style={{ fontSize: 9, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.query}</span>
                    <span style={{ fontSize: 8, color: C.cyan }}>→</span>
                  </div>
                ))}
              </div>
            )}

            {/* Example searches */}
            <div>
              <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 8 }}>TRY AN EXAMPLE</div>
              {EXAMPLES.map((ex, i) => (
                <div key={i} onClick={() => { setQuery(ex.ex); search(ex.ex); }}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 0', cursor: 'pointer', borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                  <span style={{ fontSize: 8, color: C.dim }}>{ex.label}</span>
                  <span style={{ fontSize: 8, color: C.cyanDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ex.ex}</span>
                  <span style={{ fontSize: 8, color: C.cyan, flexShrink: 0 }}>→</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}