// client/src/components/panels/ProtocolPanel.tsx
// Tabs: AUDIT · TRANSACTIONS · LIVE FEED · WHALE TRACKER
// APIs: GoPlus (free) · Tenderly (T_SIM_) · Helius · QuickNode SSE (QN_WSS_B) · Birdeye (BIRD_API)
// Server cache: audit 5 min · transactions 60s · whale-tracker 30s
// Live feed: SSE — one QN WebSocket shared across all users server-side

import { useState, useEffect, useCallback, useRef } from 'react';
import AiScoreBadge from '../../aiscorebadge';
import { scoreFromAudit, scoreFromWhale } from '../../aiscoring';
import ComingSoon from '../shared/ComingSoon';

/* ─── FONTS ──────────────────────────────────────────────────────────────── */
if (typeof document !== 'undefined' && !document.getElementById('proto-kf')) {
  const s = document.createElement('style');
  s.id = 'proto-kf';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Bebas+Neue&display=swap');
    @keyframes protoSpin  { to { transform: rotate(360deg); } }
    @keyframes livePulse  { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
    @keyframes rowPop     { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:translateX(0); } }
    @keyframes feedSlide  { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
    @keyframes arcFill    { from { stroke-dasharray: 0 999; } }
  `;
  document.head.appendChild(s);
}

/* ─── DESIGN TOKENS (identical to NetworkPanel) ──────────────────────────── */
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
  TRANSACTIONS:  60,        //  1 min  — tx history
  WHALES:        30,        // 30 sec  — large trades
} as const;

/* ─── TYPES ──────────────────────────────────────────────────────────────── */
type TabId = 'audit' | 'transactions' | 'livefeed' | 'whales' | 'walletintel' | 'markethype';

interface AuditFlag   { label: string; value: boolean; severity: string; positive?: boolean; }
interface AuditResult {
  address: string; chainId: string; riskScore: number;
  riskLevel: 'SAFE' | 'CAUTION' | 'DANGER'; flags: AuditFlag[];
  tenderly: { success: boolean; reverted: boolean; gasUsed: number; errorMessage: string | null; hiddenFeeDetected: boolean; } | null;
  metadata: { name: string; symbol: string; decimals: string; totalSupply: string; holderCount: string; buyTax: string; sellTax: string; creatorAddress: string; ownerAddress: string; };
  cached: boolean;
}

interface Tx {
  signature: string; type: string; description: string;
  timestamp: number; fee: number; status: 'SUCCESS' | 'FAILED'; source: string;
  totalSolMoved:       number;
  primaryTokenAmount:  number;
  primaryTokenSymbol:  string;
  tokenTransfers:  { mint: string; fromUser: string; toUser: string; amount: number; symbol: string; }[];
  nativeTransfers: { fromUser: string; toUser: string; amount: number; }[];
}

interface LiveEvent {
  id: string; type: 'SWAP' | 'TRANSFER' | 'WHALE' | 'CONNECTED';
  program: string; signature: string;
  amountSol?: number; amountUsd?: number;
  fromWallet?: string; toWallet?: string;
  dex?: string; tokenIn?: string; tokenOut?: string;
  timestamp: number;
}

interface WhaleMove {
  txHash: string; side: 'BUY' | 'SELL';
  tokenIn: string; tokenOut: string;
  amountUsd: number; amountIn: number; amountOut: number;
  wallet: string; timestamp: number;
  priceImpact: number | null; dex: string;
}

/* ─── UTILS ──────────────────────────────────────────────────────────────── */
function fmtBig(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtUsd(n: number): string { return n >= 1000 ? `$${fmtBig(n)}` : `$${n.toFixed(2)}`; }
function fmtSol(n: number): string { return `${n.toFixed(4)} SOL`; }
function truncate(s: string, n = 8): string { return s ? `${s.slice(0, n)}...${s.slice(-4)}` : '—'; }

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts * (ts < 1e12 ? 1000 : 1)) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

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
      <div style={{ width: 16, height: 16, border: `1px solid ${C.cyanFaint}`, borderTop: `1px solid ${C.cyan}`, borderRadius: '50%', animation: 'protoSpin 0.8s linear infinite' }} />
    </div>
  );
}

function LiveDot() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, boxShadow: `0 0 6px ${C.green}`, animation: 'livePulse 2s ease-in-out infinite', display: 'inline-block' }} />
      <span style={{ fontSize: 7, letterSpacing: 2, color: 'rgba(0,255,136,0.5)', fontFamily: FM }}>LIVE</span>
    </span>
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

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ background: 'none', border: `1px solid ${copied ? C.green : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', padding: '2px 6px', borderRadius: 3, color: copied ? C.green : C.dim, fontSize: 8, fontFamily: FM, letterSpacing: 1 }}>
      {copied ? '✓ COPIED' : label ?? '⧉ COPY'}
    </button>
  );
}

function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontFamily: FH, fontSize: 13, letterSpacing: 2, color: C.cyan }}>{label}</span>
      {right}
    </div>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color, border: `1px solid ${color}44`, borderRadius: 3, padding: '2px 6px', background: `${color}0d`, fontFamily: FM }}>
      {label}
    </span>
  );
}

/* ─── RISK ARC ───────────────────────────────────────────────────────────── */
function RiskArc({ score, level }: { score: number; level: string }) {
  const r = 38, cx = 50, cy = 54;
  const circ = 2 * Math.PI * r;
  const arcSpan = circ * 0.75;
  const fill = (score / 100) * arcSpan;
  const color = level === 'DANGER' ? C.red : level === 'CAUTION' ? C.orange : C.green;
  const offset = -(circ * 0.125);

  return (
    <svg viewBox="0 0 100 100" width={110} height={110} style={{ overflow: 'visible' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={7}
        strokeDasharray={`${arcSpan} ${circ}`} strokeDashoffset={offset} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${fill} ${circ}`} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 8px ${color}66)` }} />
      <text x={cx} y={cy - 2} textAnchor="middle" fill={color} fontSize={26} fontWeight={700} fontFamily="IBM Plex Mono">{score}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill={color} fontSize={7.5} fontFamily="IBM Plex Mono" letterSpacing={2} opacity={0.9}>{level}</text>
      <text x={cx} y={cy + 26} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={6.5} fontFamily="IBM Plex Mono" letterSpacing={1}>RISK SCORE</text>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 1 — AUDIT
   GoPlus static analysis + Tenderly sell simulation → combined risk score
   ═══════════════════════════════════════════════════════════════════════════ */
function AuditTab() {
  const [address, setAddress]   = useState('');
  const [chainId, setChainId]   = useState('1');
  const [result,  setResult]    = useState<AuditResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState<string | null>(null);

  const CHAINS = [
    { id: '1',  label: 'ETH'  },
    { id: '56', label: 'BNB'  },
    { id: '137',label: 'POLY' },
    { id: 'solana', label: 'SOL' },
  ];

  const runAudit = useCallback(async () => {
    if (!address.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/protocol/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim(), chainId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Audit failed');
      setResult(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [address, chainId]);

  const riskFlags    = result?.flags.filter(f => !f.positive && f.value)   ?? [];
  const passedFlags  = result?.flags.filter(f =>  f.positive && f.value)   ?? [];
  const cleanFlags   = result?.flags.filter(f => !f.positive && !f.value)  ?? [];

  return (
    <ScrollArea>
      <div style={{ padding: '12px 4px', fontFamily: FM }}>

        {/* ── Usage hint ── */}
        <div style={{ marginBottom: 10, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 5, background: C.cyanFaint, fontSize: 8, color: C.dim, lineHeight: 1.8 }}>
          <span style={{ color: C.cyan, fontWeight: 700 }}>HOW TO USE</span>
          {'  '}Paste any EVM or Solana token contract address →{' '}
          <span style={{ color: C.silver }}>Audit</span> runs GoPlus static scan +
          Tenderly sell simulation →{' '}
          <span style={{ color: C.silver }}>Pre-Rug Score</span> computes 9 rug patterns →{' '}
          <span style={{ color: C.silver }}>Genealogy</span> shows developer history.
          Try a token you're about to ape into.
        </div>

        {/* ── Input row ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 2, marginBottom: 6 }}>CONTRACT ADDRESS</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runAudit()}
              placeholder="0x... or Solana mint address"
              style={{ flex: 1, minWidth: 220, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '6px 10px', color: C.text, fontSize: 10, fontFamily: FM, outline: 'none' }}
            />
            {/* Chain selector */}
            <div style={{ display: 'flex', gap: 4 }}>
              {CHAINS.map(ch => (
                <button key={ch.id} onClick={() => setChainId(ch.id)}
                  style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${chainId === ch.id ? C.cyan : C.border}`, background: chainId === ch.id ? C.cyanFaint : 'transparent', color: chainId === ch.id ? C.cyan : C.dim, fontSize: 9, cursor: 'pointer', fontFamily: FM, letterSpacing: 1 }}>
                  {ch.label}
                </button>
              ))}
            </div>
            <button onClick={runAudit} disabled={loading || !address.trim()}
              style={{ padding: '6px 16px', borderRadius: 4, border: `1px solid ${C.cyan}`, background: C.cyanFaint, color: C.cyan, fontSize: 10, cursor: 'pointer', fontFamily: FM, letterSpacing: 2, fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'AUDITING...' : 'AUDIT'}
            </button>
          </div>
          {error && <div style={{ marginTop: 6, fontSize: 9, color: C.red }}>{error}</div>}
        </div>

        {/* ── Loading ── */}
        {loading && <Loader />}

        {/* ── Results ── */}
        {result && !loading && (
          <div style={{ animation: 'rowPop 0.3s ease' }}>

            {/* ── Score + metadata row ── */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap' }}>
              <RiskArc score={result.riskScore} level={result.riskLevel} />

              <div style={{ flex: 1, minWidth: 160 }}>
                {/* Token info */}
                <div style={{ fontSize: 18, fontFamily: FH, letterSpacing: 2, color: C.text, lineHeight: 1 }}>
                  {result.metadata.name || '—'}
                </div>
                <div style={{ fontSize: 10, color: C.cyan, marginBottom: 10 }}>{result.metadata.symbol || '—'}</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                  {[
                    ['HOLDERS',  result.metadata.holderCount],
                    ['SUPPLY',   result.metadata.totalSupply ? fmtBig(Number(result.metadata.totalSupply)) : '—'],
                    ['BUY TAX',  `${result.metadata.buyTax}%`],
                    ['SELL TAX', `${result.metadata.sellTax}%`],
                    ['DECIMALS', result.metadata.decimals],
                    ['CHAIN',    chainId],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>{k}</div>
                      <div style={{ fontSize: 10, color: C.silver }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Address copy */}
                <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 8, color: C.dim }}>{truncate(result.address, 10)}</span>
                  <CopyBtn text={result.address} label="⧉ COPY ADDRESS" />
                </div>
              </div>

              {/* AI Score */}
              <div>
                <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 6 }}>AI SIGNAL</div>
                <AiScoreBadge score={scoreFromAudit(result)} />
              </div>
            </div>

            {/* ── Tenderly simulation ── */}
            {result.tenderly && (
              <div style={{ marginBottom: 14, padding: '10px 12px', border: `1px solid ${result.tenderly.reverted ? C.red : C.green}22`, borderRadius: 6, background: `${result.tenderly.reverted ? C.red : C.green}08` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 8, letterSpacing: 2, color: C.dim }}>TENDERLY SELL SIMULATION</span>
                  <Pill label={result.tenderly.reverted ? 'REVERTED' : 'PASSED'} color={result.tenderly.reverted ? C.red : C.green} />
                  {result.tenderly.hiddenFeeDetected && <Pill label="HIDDEN FEE DETECTED" color={C.red} />}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div><div style={{ fontSize: 7, color: C.dim }}>STATUS</div><div style={{ fontSize: 9, color: result.tenderly.success ? C.green : C.red }}>{result.tenderly.success ? 'SUCCESS' : 'FAILED'}</div></div>
                  <div><div style={{ fontSize: 7, color: C.dim }}>GAS USED</div><div style={{ fontSize: 9, color: C.silver }}>{result.tenderly.gasUsed.toLocaleString()}</div></div>
                  {result.tenderly.errorMessage && (
                    <div style={{ flex: 1 }}><div style={{ fontSize: 7, color: C.dim }}>ERROR</div><div style={{ fontSize: 9, color: C.red, wordBreak: 'break-all' }}>{result.tenderly.errorMessage}</div></div>
                  )}
                </div>
              </div>
            )}

            {/* ── Risk flags ── */}
            {riskFlags.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 7, letterSpacing: 2, color: C.red, marginBottom: 6 }}>⚠ RISK FLAGS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {riskFlags.map((f, i) => (
                    <div key={i} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.red}33`, background: `${C.red}0a`, fontSize: 9, color: C.red, fontFamily: FM }}>
                      {f.label}
                      <span style={{ fontSize: 7, opacity: 0.6, marginLeft: 4 }}>{f.severity.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Passed checks ── */}
            {(passedFlags.length > 0 || cleanFlags.length > 0) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 7, letterSpacing: 2, color: C.green, marginBottom: 6 }}>✓ PASSED CHECKS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[...passedFlags, ...cleanFlags.slice(0, 4)].map((f, i) => (
                    <div key={i} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.green}22`, background: `${C.green}08`, fontSize: 9, color: C.green, fontFamily: FM }}>
                      {f.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Creator / owner ── */}
            {result.metadata.creatorAddress !== '—' && (
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
                {[['CREATOR', result.metadata.creatorAddress], ['OWNER', result.metadata.ownerAddress]].map(([label, addr]) => (
                  <div key={label}>
                    <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 2 }}>{label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, color: C.silver }}>{truncate(addr, 10)}</span>
                      <CopyBtn text={addr} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {result.cached && (
              <div style={{ marginTop: 8, fontSize: 7, color: C.dim, letterSpacing: 1 }}>↻ CACHED RESULT</div>
            )}

            {/* ── Pre-Rug Pattern Score ── */}
            <PreRugScore result={result} />

            {/* ── Token Genealogy ── */}
            {result.metadata.creatorAddress !== '—' && (
              <TokenGenealogy deployer={result.metadata.creatorAddress} />
            )}
          </div>
        )}

        {/* ── Empty state ── */}
        {!result && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9, lineHeight: 2 }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>⬡</div>
            Paste any EVM or Solana contract address above.<br />
            GoPlus static analysis + Tenderly sell simulation<br />
            combined into a 0–100 risk score.
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 2 — TRANSACTIONS
   Helius enhanced parsing — human-readable tx history for any wallet
   ═══════════════════════════════════════════════════════════════════════════ */
const TX_TYPE_ICON: Record<string, string> = {
  SWAP: '⇄', TRANSFER: '→', NFT_SALE: '◈', NFT_MINT: '◉',
  STAKE: '⬡', UNKNOWN: '◌', FAILED: '✕',
};
const TX_TYPE_COLOR: Record<string, string> = {
  SWAP: '#00b4ff', TRANSFER: '#9966ff', NFT_SALE: '#f7931a',
  NFT_MINT: '#00ff88', STAKE: '#627eea', UNKNOWN: 'rgba(150,180,210,0.4)',
};

function TransactionsTab() {
  const [wallet,  setWallet]  = useState('');
  const [txs,     setTxs]     = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total,   setTotal]   = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const LIMIT = 10;

  const load = useCallback(async (w: string, p: number) => {
    if (!w.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/protocol/transactions?wallet=${encodeURIComponent(w.trim())}&page=${p}&limit=${LIMIT}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load transactions');
      if (p === 1) setTxs(data.items);
      else setTxs(prev => [...prev, ...data.items]);
      setHasMore(data.hasMore);
      setTotal(data.total);
      setPage(p);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const lookup = useCallback(() => { setPage(1); load(wallet, 1); }, [wallet, load]);

  return (
    <ScrollArea>
      <div style={{ padding: '12px 4px', fontFamily: FM }}>

        {/* ── Wallet input ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 2, marginBottom: 6 }}>SOLANA WALLET ADDRESS</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={wallet}
              onChange={e => setWallet(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookup()}
              placeholder="Paste wallet address..."
              style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '6px 10px', color: C.text, fontSize: 10, fontFamily: FM, outline: 'none' }}
            />
            <button onClick={lookup} disabled={loading || !wallet.trim()}
              style={{ padding: '6px 16px', borderRadius: 4, border: `1px solid ${C.cyan}`, background: C.cyanFaint, color: C.cyan, fontSize: 10, cursor: 'pointer', fontFamily: FM, letterSpacing: 2, fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
              {loading && page === 1 ? 'LOADING...' : 'LOAD'}
            </button>
          </div>
          {error && <div style={{ marginTop: 6, fontSize: 9, color: C.red }}>{error}</div>}
        </div>

        {/* ── Stats row ── */}
        {txs.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
            <div><div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>LOADED</div><div style={{ fontSize: 12, color: C.cyan }}>{txs.length}</div></div>
            <div><div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>TOTAL</div><div style={{ fontSize: 12, color: C.silver }}>{total}</div></div>
            <div><div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>FAILED</div><div style={{ fontSize: 12, color: C.red }}>{txs.filter(t => t.status === 'FAILED').length}</div></div>
            <div style={{ marginLeft: 'auto' }}><CopyBtn text={wallet} label="⧉ COPY WALLET" /></div>
          </div>
        )}

        {/* ── TX list ── */}
        {txs.map((tx, i) => {
          const isOpen  = expanded === tx.signature;
          const color   = TX_TYPE_COLOR[tx.type] ?? C.dim;
          const icon    = tx.status === 'FAILED' ? TX_TYPE_ICON.FAILED : TX_TYPE_ICON[tx.type] ?? TX_TYPE_ICON.UNKNOWN;
          const solFee  = tx.fee / 1e9;

          return (
            <div key={tx.signature}
              onClick={() => setExpanded(isOpen ? null : tx.signature)}
              style={{ borderBottom: `1px solid ${C.border}`, padding: '8px 0', cursor: 'pointer', animation: `rowPop 0.2s ease ${i * 0.02}s both` }}>

              {/* ── Main row ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Type icon */}
                <div style={{ width: 28, height: 28, borderRadius: 4, border: `1px solid ${color}33`, background: `${color}0d`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color, flexShrink: 0 }}>
                  {icon}
                </div>
                {/* Description */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: tx.status === 'FAILED' ? C.red : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tx.description}
                  </div>
                  <div style={{ fontSize: 8, color: C.dim, marginTop: 2 }}>
                    {tx.source !== '—' && <span style={{ marginRight: 8 }}>{tx.source}</span>}
                    {timeAgo(tx.timestamp)}
                  </div>
                </div>
                {/* Amount + status */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {tx.totalSolMoved > 0.001 ? (
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.solPurple }}>
                      {tx.totalSolMoved >= 1000 ? fmtBig(tx.totalSolMoved) : tx.totalSolMoved.toFixed(3)} SOL
                    </div>
                  ) : tx.primaryTokenAmount > 0 ? (
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.orange }}>
                      {fmtBig(tx.primaryTokenAmount)} {tx.primaryTokenSymbol}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 2 }}>
                    <span style={{ fontSize: 7, color: C.dim }}>{solFee.toFixed(5)}◎</span>
                    <Pill label={tx.status} color={tx.status === 'SUCCESS' ? C.green : C.red} />
                  </div>
                </div>
                <span style={{ fontSize: 9, color: isOpen ? C.cyan : C.dim, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
              </div>

              {/* ── Expanded details ── */}
              {isOpen && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, animation: 'feedSlide 0.15s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>SIGNATURE</span>
                    <span style={{ fontSize: 8, color: C.silver }}>{truncate(tx.signature, 20)}</span>
                    <CopyBtn text={tx.signature} />
                  </div>
                  {tx.tokenTransfers.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 4 }}>TOKEN TRANSFERS</div>
                      {tx.tokenTransfers.slice(0, 4).map((t, j) => (
                        <div key={j} style={{ fontSize: 9, color: C.silver, marginBottom: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ color: C.orange }}>{t.amount.toFixed(4)} {t.symbol}</span>
                          <span style={{ color: C.dim }}>{truncate(t.fromUser)} → {truncate(t.toUser)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {tx.nativeTransfers.length > 0 && (
                    <div>
                      <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 4 }}>SOL TRANSFERS</div>
                      {tx.nativeTransfers.slice(0, 3).map((t, j) => (
                        <div key={j} style={{ fontSize: 9, color: C.silver, marginBottom: 2 }}>
                          <span style={{ color: C.solPurple }}>{fmtSol(t.amount / 1e9)}</span>
                          <span style={{ color: C.dim, marginLeft: 8 }}>{truncate(t.fromUser)} → {truncate(t.toUser)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Load more ── */}
        {hasMore && (
          <button onClick={() => load(wallet, page + 1)} disabled={loading}
            style={{ width: '100%', marginTop: 10, padding: '8px', borderRadius: 4, border: `1px solid ${C.border}`, background: C.cyanFaint, color: C.cyan, fontSize: 9, cursor: 'pointer', fontFamily: FM, letterSpacing: 2, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'LOADING...' : `LOAD MORE (${total - txs.length} remaining)`}
          </button>
        )}

        {/* ── Empty ── */}
        {!loading && txs.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9, lineHeight: 2 }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>◌</div>
            Paste a Solana wallet address above.<br />
            Helius enhanced parsing shows human-readable<br />
            swaps, transfers, NFT events, and staking.
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 3 — LIVE FEED
   SSE stream from /api/protocol/live-stream
   Server maintains one QN WebSocket — fans out to all connected clients
   ═══════════════════════════════════════════════════════════════════════════ */
type FeedFilter = 'ALL' | 'SWAPS' | 'TRANSFERS' | 'WHALE';

function LiveFeedTab() {
  const [feed,           setFeed]           = useState<LiveEvent[]>([]);
  const [status,         setStatus]         = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [filter,         setFilter]         = useState<FeedFilter>('ALL');
  const [paused,         setPaused]         = useState(false);
  const [count,          setCount]          = useState(0);
  const [whaleThreshold, setWhaleThreshold] = useState(100_000);

  const WHALE_TIERS = [
    { label: '$100K+', value: 100_000, minTier: 'bronze' as const },
    { label: '$150K+', value: 150_000, minTier: 'bronze' as const },
    { label: '$250K+', value: 250_000, minTier: 'silver' as const },
    { label: '$500K+', value: 500_000, minTier: 'gold'   as const },
    { label: '$1M+',   value: 1_000_000, minTier: 'gold' as const },
  ];
  const USER_TIER: 'bronze' | 'silver' | 'gold' = 'bronze';
  const TIER_ORDER_FEED = { bronze: 0, silver: 1, gold: 2 };
  const tierOk = (t: typeof WHALE_TIERS[0]) => TIER_ORDER_FEED[USER_TIER] >= TIER_ORDER_FEED[t.minTier];
  const bufferRef = useRef<LiveEvent[]>([]);
  const esRef     = useRef<EventSource | null>(null);

  useEffect(() => {
    let retries = 0;
    let retryTimer: any = null;

    const connect = () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }

      setStatus('connecting');
      const es = new EventSource('/api/protocol/live-stream');
      esRef.current = es;

      es.onopen = () => {
        setStatus('connected');
        retries = 0;
      };

      es.onmessage = (e) => {
        setStatus('connected');
        try {
          const raw: any = JSON.parse(e.data);
          if (raw.type === 'CONNECTED') return;

          // Enriched update — patch existing row by id, don't add new row
          if (raw.enriched && raw.id) {
            setFeed(prev => prev.map(item =>
              item.id === raw.id
                ? { ...item, amountSol: raw.amountSol, amountUsd: raw.amountUsd, dex: raw.dex ?? item.dex }
                : item
            ));
            return;
          }

          // New event — prepend to feed
          const event: LiveEvent = { ...raw, id: raw.id || `${Date.now()}-${Math.random().toString(36).slice(2,6)}` };
          setCount(c => c + 1);
          if (!paused) {
            setFeed(prev => [event, ...prev].slice(0, 120));
          } else {
            bufferRef.current = [event, ...bufferRef.current].slice(0, 50);
          }
        } catch {}
      };

      es.onerror = () => {
        setStatus('disconnected');
        es.close();
        esRef.current = null;
        const delay = Math.min(3000 * Math.pow(2, retries), 30_000);
        retries++;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, []);

  // Flush buffer when unpaused
  useEffect(() => {
    if (!paused && bufferRef.current.length > 0) {
      setFeed(prev => [...bufferRef.current, ...prev].slice(0, 120));
      bufferRef.current = [];
    }
  }, [paused]);

  const FILTERS: FeedFilter[] = ['ALL', 'SWAPS', 'TRANSFERS', 'WHALE'];

  // ── FIX: WHALE filter only hides enriched events below threshold,
  //         not events still waiting on enrichment (amountUsd === undefined)
  const filtered = feed.filter(e => {
    if (filter === 'ALL')       return true;
    if (filter === 'SWAPS')     return e.type === 'SWAP';
    if (filter === 'TRANSFERS') return e.type === 'TRANSFER';
    if (filter === 'WHALE')     return e.amountUsd != null && e.amountUsd >= whaleThreshold;
    return true;
  });

  const statusColor = status === 'connected' ? C.green : status === 'connecting' ? C.orange : C.red;

  const eventColor = (type: string) => {
    if (type === 'SWAP')     return C.cyan;
    if (type === 'TRANSFER') return C.purple;
    if (type === 'WHALE')    return C.orange;
    return C.dim;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FM }}>

      {/* ── Header bar ── */}
      <div style={{ padding: '8px 4px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: status === 'connected' ? `0 0 8px ${C.green}` : 'none', animation: status === 'connecting' ? 'livePulse 1s infinite' : 'none', display: 'inline-block' }} />
            <span style={{ fontSize: 8, letterSpacing: 2, color: statusColor }}>{status.toUpperCase()}</span>
          </div>
          <span style={{ fontSize: 8, color: C.dim }}>QN WebSocket · {count} events</span>
          {/* Pause toggle */}
          <button onClick={() => setPaused(p => !p)}
            style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 3, border: `1px solid ${paused ? C.orange : C.border}`, background: paused ? `${C.orange}11` : 'transparent', color: paused ? C.orange : C.dim, fontSize: 8, cursor: 'pointer', fontFamily: FM, letterSpacing: 1 }}>
            {paused ? `▶ RESUME (${bufferRef.current.length})` : '⏸ PAUSE'}
          </button>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '3px 10px', borderRadius: 3, border: `1px solid ${filter === f ? C.cyan : C.border}`, background: filter === f ? C.cyanFaint : 'transparent', color: filter === f ? C.cyan : C.dim, fontSize: 8, cursor: 'pointer', fontFamily: FM, letterSpacing: 1 }}>
              {f === 'WHALE' ? `🐋 WHALE` : f}
            </button>
          ))}
        </div>

        {/* Whale threshold — tier gated */}
        {filter === 'WHALE' && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>THRESHOLD</span>
            {WHALE_TIERS.map(t => {
              const unlocked = tierOk(t);
              const active   = whaleThreshold === t.value;
              return (
                <button key={t.value}
                  onClick={() => unlocked && setWhaleThreshold(t.value)}
                  title={!unlocked ? `${t.minTier.toUpperCase()} tier required` : ''}
                  style={{ padding: '2px 8px', borderRadius: 3, cursor: unlocked ? 'pointer' : 'not-allowed',
                    border: `1px solid ${active ? C.orange : unlocked ? C.border : 'rgba(255,255,255,0.04)'}`,
                    background: active ? `${C.orange}11` : 'transparent',
                    color: active ? C.orange : unlocked ? C.dim : 'rgba(255,255,255,0.15)',
                    fontSize: 7, fontFamily: FM, letterSpacing: 1, opacity: unlocked ? 1 : 0.5 }}>
                  {t.label}{!unlocked && ' 🔒'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Feed rows ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.15) transparent' }}>
        {filtered.length === 0 && status === 'connected' && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9 }}>
            <div style={{ animation: 'livePulse 1.5s infinite', marginBottom: 8 }}>⬡</div>
            Waiting for transactions on Solana mainnet...
          </div>
        )}
        {status !== 'connected' && feed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9 }}>
            <div style={{ animation: 'protoSpin 1s linear infinite', display: 'inline-block', marginBottom: 8 }}>↻</div>
            <div>Connecting to Helius WebSocket...</div>
          </div>
        )}

        {/* Column headers */}
        {feed.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '44px 60px 64px 90px 80px 70px auto', gap: 6, padding: '4px 6px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,0.85)' }}>
            {['AGO', 'TYPE', 'PROGRAM', 'SIG', 'USD', 'SOL', ''].map(h => (
              <div key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>{h}</div>
            ))}
          </div>
        )}

        {filtered.map((e, i) => {
          const color   = eventColor(e.type);
          const isWhale = (e.amountUsd ?? 0) >= whaleThreshold;
          const solAmt  = e.amountSol ?? (e.amountUsd && e.amountUsd > 0 ? e.amountUsd / 185 : null);
          return (
            <div key={e.id}
              style={{ display: 'grid', gridTemplateColumns: '44px 60px 64px 90px 80px 70px auto', gap: 6, padding: '6px 6px', borderBottom: `1px solid ${isWhale ? `${C.orange}22` : 'rgba(255,255,255,0.03)'}`, animation: i === 0 ? 'feedSlide 0.2s ease' : 'none', minWidth: 480, background: isWhale ? `${C.orange}05` : 'transparent', alignItems: 'center' }}>

              {/* Time */}
              <span style={{ fontSize: 8, color: C.dim, textAlign: 'right' }}>{timeAgo(e.timestamp)}</span>

              {/* Type */}
              <Pill label={e.type} color={color} />

              {/* Program */}
              <span style={{ fontSize: 8, color: C.silver, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.program || '—'}</span>

              {/* Sig */}
              <span style={{ fontSize: 8, color: C.dim, fontFamily: FM, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {e.signature ? `${e.signature.slice(0, 8)}…` : '—'}
              </span>

              {/* USD amount */}
              <div style={{ textAlign: 'right' }}>
                {e.amountUsd != null && e.amountUsd > 0 ? (
                  <span style={{ fontSize: 9, fontWeight: isWhale ? 700 : 400, color: isWhale ? C.orange : C.silver }}>
                    {fmtUsd(e.amountUsd)}
                  </span>
                ) : <span style={{ color: C.dim, fontSize: 8 }}>—</span>}
              </div>

              {/* SOL amount */}
              <div style={{ textAlign: 'right' }}>
                {solAmt != null && solAmt > 0.001 ? (
                  <span style={{ fontSize: 9, color: C.solPurple }}>
                    {solAmt >= 1000 ? `${fmtBig(solAmt)}◎` : `${solAmt.toFixed(2)}◎`}
                  </span>
                ) : <span style={{ color: C.dim, fontSize: 8 }}>—</span>}
              </div>

              {/* Copy */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {e.dex && <span style={{ fontSize: 7, color: C.cyanDim }}>{e.dex}</span>}
                {e.signature && <CopyBtn text={e.signature} label="⧉" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 4 — WHALE TRACKER
   Birdeye large trades · 30s polling · AI score per row
   ═══════════════════════════════════════════════════════════════════════════ */
function WhaleTrackerTab() {
  const [moves,   setMoves]   = useState<WhaleMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastMs,  setLastMs]  = useState(0);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/protocol/whale-tracker');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMoves(data.items ?? []);
      setLastMs(Date.now());
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, TTL.WHALES * 1_000); return () => clearInterval(t); }, [load]);

  const totalBuy  = moves.filter(m => m.side === 'BUY').reduce((s, m) => s + m.amountUsd, 0);
  const totalSell = moves.filter(m => m.side === 'SELL').reduce((s, m) => s + m.amountUsd, 0);
  const total     = totalBuy + totalSell;
  const buyPct    = total > 0 ? (totalBuy / total) * 100 : 50;

  return (
    <ScrollArea>
      <div style={{ padding: '12px 4px', fontFamily: FM }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LiveDot />
            <span style={{ fontFamily: FH, fontSize: 13, letterSpacing: 2, color: C.cyan }}>WHALE TRACKER</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RefreshBadge ms={lastMs} every={TTL.WHALES} />
          </div>
        </div>

        {/* ── Buy/sell pressure bar ── */}
        {moves.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 8, color: C.green }}>BUY {fmtUsd(totalBuy)}</span>
              <span style={{ fontSize: 8, color: C.dim }}>PRESSURE</span>
              <span style={{ fontSize: 8, color: C.red }}>SELL {fmtUsd(totalSell)}</span>
            </div>
            <div style={{ height: 5, background: `${C.red}44`, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${buyPct}%`, background: `linear-gradient(90deg,${C.green}88,${C.green})`, borderRadius: 3, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        )}

        {loading && <Loader />}
        {error && <div style={{ fontSize: 9, color: C.red, padding: '8px 0' }}>{error}</div>}

        {/* ── Column headers ── */}
        {moves.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 90px 100px 80px auto', gap: 6, padding: '4px 0', borderBottom: `1px solid ${C.border}`, marginBottom: 4, minWidth: 560 }}>
            {['SIDE', 'PAIR', 'AMOUNT', 'WALLET', 'AGO', 'AI'].map(h => (
              <div key={h} style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>{h}</div>
            ))}
          </div>
        )}

        {/* ── Whale rows ── */}
        {moves.map((m, i) => (
          <div key={m.txHash + i}
            style={{ display: 'grid', gridTemplateColumns: '50px 1fr 90px 100px 80px auto', gap: 6, padding: '7px 0', borderBottom: `1px solid rgba(255,255,255,0.03)`, alignItems: 'center', animation: `rowPop 0.2s ease ${i * 0.03}s both`, minWidth: 560 }}>

            {/* Side */}
            <Pill label={m.side} color={m.side === 'BUY' ? C.green : C.red} />

            {/* Pair */}
            <div>
              <div style={{ fontSize: 9, color: C.text }}>{m.tokenIn} → {m.tokenOut}</div>
              <div style={{ fontSize: 7, color: C.cyanDim }}>{m.dex}</div>
            </div>

            {/* Amount */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: m.amountUsd >= 500_000 ? C.orange : C.silver }}>{fmtUsd(m.amountUsd)}</div>
              <div style={{ fontSize: 7, color: C.dim }}>{fmtSol(m.amountIn)}</div>
            </div>

            {/* Wallet + copy */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 8, color: C.dim }}>{truncate(m.wallet, 6)}</span>
              <CopyBtn text={m.wallet} label="⧉" />
            </div>

            {/* Time */}
            <span style={{ fontSize: 8, color: C.dim }}>{timeAgo(m.timestamp)}</span>

            {/* AI score */}
            <AiScoreBadge score={scoreFromWhale(m)} compact />
          </div>
        ))}

        {!loading && moves.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9, lineHeight: 2 }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>🐋</div>
            No whale moves above $5K detected recently.<br />
            Refreshes every 30 seconds.
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRE-RUG PATTERN SCORE
   ═══════════════════════════════════════════════════════════════════════════ */
interface RugPattern { label: string; triggered: boolean; weight: number; description: string; }

function computeRugPatterns(result: AuditResult): { score: number; level: string; color: string; patterns: RugPattern[] } {
  const flags  = result.flags ?? [];
  const meta   = result.metadata;
  const sim    = result.tenderly;
  const getFlag = (label: string) => flags.find(f => f.label === label);

  const patterns: RugPattern[] = [
    { label: 'Liquidity Unlocked',      triggered: getFlag('Liquidity Locked')?.value === false,                                                         weight: 25, description: 'Dev can drain liquidity at any time — classic rug vector' },
    { label: 'Hidden Sell Tax',         triggered: sim?.hiddenFeeDetected === true || parseFloat(meta.sellTax) > 15,                                      weight: 22, description: 'Sell simulation detected hidden fees or sell tax > 15%' },
    { label: 'Mintable Supply',         triggered: getFlag('Mint Function')?.value === true,                                                              weight: 18, description: 'Dev can print unlimited tokens and dump on holders' },
    { label: 'Ownership Not Renounced', triggered: getFlag('Can Take Back Owner')?.value === true || getFlag('Hidden Owner')?.value === true,             weight: 16, description: 'Owner can change contract rules or blacklist wallets' },
    { label: 'Top Holder Concentration',triggered: parseFloat(meta.holderCount || '0') > 0 && result.riskScore > 40,                                     weight: 12, description: 'Small number of wallets control enough supply to crash price' },
    { label: 'Proxy / Upgradeable',     triggered: getFlag('Proxy Contract')?.value === true,                                                             weight: 10, description: 'Contract logic can be swapped after launch' },
    { label: 'Sell Simulation Reverted',triggered: sim?.reverted === true,                                                                                weight: 30, description: 'Cannot sell token — honeypot confirmed by simulation' },
    { label: 'External Call Risk',      triggered: getFlag('External Call Risk')?.value === true,                                                         weight:  8, description: 'Contract calls external addresses — potential backdoor' },
    { label: 'Self-Destruct Capable',   triggered: getFlag('Self-Destruct')?.value === true,                                                              weight: 20, description: 'Dev can destroy the contract and all liquidity' },
  ];

  const triggered = patterns.filter(p => p.triggered);
  const raw       = triggered.reduce((s, p) => s + p.weight, 0);
  const score     = Math.min(100, Math.round(raw));
  const level     = score >= 70 ? 'HIGH' : score >= 40 ? 'MODERATE' : score >= 20 ? 'LOW' : 'MINIMAL';
  const color     = score >= 70 ? C.red : score >= 40 ? C.orange : score >= 20 ? C.yellow : C.green;

  return { score, level, color, patterns };
}

function PreRugScore({ result }: { result: AuditResult }) {
  const { score, level, color, patterns } = computeRugPatterns(result);
  const [open, setOpen] = useState(false);
  const triggered = patterns.filter(p => p.triggered);
  const clean     = patterns.filter(p => !p.triggered);

  return (
    <div style={{ marginTop: 14, border: `1px solid ${color}22`, borderRadius: 6, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', background: `${color}08` }}>
        <div>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 2 }}>PRE-RUG PATTERN SCORE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color, fontFamily: FM }}>{score}</span>
            <Pill label={`${level} RUG RISK`} color={color} />
            <span style={{ fontSize: 8, color: C.dim }}>{triggered.length}/{patterns.length} patterns triggered</span>
          </div>
        </div>
        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${score}%`, background: `linear-gradient(90deg,${color}88,${color})`, borderRadius: 2, transition: 'width 0.8s ease', boxShadow: `0 0 8px ${color}44` }} />
        </div>
        <span style={{ fontSize: 9, color: open ? C.cyan : C.dim, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </div>

      {open && (
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${color}22`, animation: 'feedSlide 0.15s ease' }}>
          {triggered.length > 0 && (
            <>
              <div style={{ fontSize: 7, letterSpacing: 2, color: C.red, marginBottom: 6 }}>⚠ TRIGGERED PATTERNS</div>
              {triggered.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, padding: '6px 8px', background: 'rgba(255,51,85,0.06)', borderRadius: 4, borderLeft: `2px solid ${C.red}44` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: C.red, fontWeight: 700, marginBottom: 2 }}>{p.label}</div>
                    <div style={{ fontSize: 8, color: C.dim, lineHeight: 1.5 }}>{p.description}</div>
                  </div>
                  <div style={{ fontSize: 9, color: C.red, flexShrink: 0 }}>+{p.weight}</div>
                </div>
              ))}
            </>
          )}
          {clean.length > 0 && (
            <>
              <div style={{ fontSize: 7, letterSpacing: 2, color: C.green, margin: '8px 0 6px' }}>✓ CLEAN CHECKS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {clean.map((p, i) => (
                  <div key={i} style={{ fontSize: 8, color: C.green, padding: '3px 8px', border: `1px solid ${C.green}22`, borderRadius: 3, background: `${C.green}08` }}>
                    {p.label}
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ marginTop: 8, fontSize: 7, color: C.dim, lineHeight: 1.5 }}>
            ⚠ Pattern score is heuristic — not a guarantee. Always verify liquidity lock and renouncement on-chain.
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOKEN GENEALOGY
   ═══════════════════════════════════════════════════════════════════════════ */
interface GenealogyToken {
  address: string; name: string; symbol: string;
  status: 'ACTIVE' | 'DEAD' | 'RUGGED' | 'UNKNOWN';
  riskScore: number; deployedAt: string;
  holderCount: string; sellTax: string;
}

function TokenGenealogy({ deployer }: { deployer: string }) {
  const [data,    setData]    = useState<GenealogyToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`/api/protocol/token-genealogy?deployer=${encodeURIComponent(deployer)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json.tokens ?? []);
      setLoaded(true);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [deployer]);

  const statusColor = (s: string) => s === 'ACTIVE' ? C.green : s === 'RUGGED' ? C.red : s === 'DEAD' ? C.dim : C.orange;
  const rugCount    = data.filter(t => t.status === 'RUGGED').length;
  const activeCount = data.filter(t => t.status === 'ACTIVE').length;

  return (
    <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: C.cyanFaint }}>
        <div>
          <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 2 }}>TOKEN GENEALOGY</div>
          <div style={{ fontSize: 8, color: C.silver }}>Developer deployment history</div>
        </div>
        {!loaded && !loading && (
          <button onClick={load}
            style={{ padding: '4px 12px', borderRadius: 3, border: `1px solid ${C.cyan}`, background: 'transparent', color: C.cyan, fontSize: 8, cursor: 'pointer', fontFamily: FM, letterSpacing: 1 }}>
            LOAD HISTORY
          </button>
        )}
        {loading && <div style={{ width: 14, height: 14, border: `1px solid ${C.cyanFaint}`, borderTop: `1px solid ${C.cyan}`, borderRadius: '50%', animation: 'protoSpin 0.8s linear infinite' }} />}
      </div>

      {error && <div style={{ padding: '8px 12px', fontSize: 9, color: C.red }}>{error}</div>}

      {loaded && data.length === 0 && (
        <div style={{ padding: '12px', fontSize: 9, color: C.dim }}>No other tokens found from this deployer.</div>
      )}

      {loaded && data.length > 0 && (
        <div style={{ padding: '8px 12px' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 10, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
            <div><div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>TOTAL</div><div style={{ fontSize: 14, color: C.cyan }}>{data.length}</div></div>
            <div><div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>ACTIVE</div><div style={{ fontSize: 14, color: C.green }}>{activeCount}</div></div>
            <div><div style={{ fontSize: 7, color: C.dim, letterSpacing: 2 }}>RUGGED</div><div style={{ fontSize: 14, color: rugCount > 0 ? C.red : C.dim }}>{rugCount}</div></div>
            {rugCount > 0 && <Pill label={`⚠ SERIAL RUGGER — ${rugCount} rug${rugCount > 1 ? 's' : ''}`} color={C.red} />}
          </div>
          {data.map((t, i) => (
            <div key={t.address} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: `1px solid rgba(255,255,255,0.03)`, animation: `rowPop 0.2s ease ${i * 0.03}s both` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, color: C.text }}>{t.name || '—'} <span style={{ color: C.dim }}>({t.symbol})</span></div>
                <div style={{ fontSize: 7, color: C.dim }}>{truncate(t.address, 8)}</div>
              </div>
              <Pill label={t.status} color={statusColor(t.status)} />
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: t.riskScore > 60 ? C.red : t.riskScore > 30 ? C.orange : C.green }}>Risk {t.riskScore}</div>
                <div style={{ fontSize: 7, color: C.dim }}>{t.holderCount} holders</div>
              </div>
              <CopyBtn text={t.address} label="⧉" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 5 — WALLET INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════════════ */
type WalletClass = 'SMART MONEY' | 'WHALE' | 'BOT' | 'INSIDER' | 'RETAIL';

interface WalletProfile {
  wallet:          string;
  classification:  WalletClass;
  classScore:      number;
  realisedPnl:     number;
  winRate:         number;
  totalTrades:     number;
  avgHoldMs:       number;
  bestTrade:       { token: string; pnl: number } | null;
  worstTrade:      { token: string; pnl: number } | null;
  topDexes:        string[];
  activityBurst:   number;
  firstSeen:       number;
  lastSeen:        number;
}

const CLASS_COLOR: Record<WalletClass, string> = {
  'SMART MONEY': '#00ff88',
  'WHALE':       '#f7931a',
  'BOT':         '#9966ff',
  'INSIDER':     '#ff3355',
  'RETAIL':      'rgba(180,200,220,0.5)',
};

const CLASS_DESC: Record<WalletClass, string> = {
  'SMART MONEY': 'Consistent winner — high win rate, moderate size, patient holds',
  'WHALE':       'Very large position sizes — market-moving capital',
  'BOT':         'High-frequency automated — many micro transactions',
  'INSIDER':     'Early entries before announcements — possible alpha access',
  'RETAIL':      'Standard retail pattern — average hold time, mixed results',
};

function classifyWallet(txs: any[]): { classification: WalletClass; score: number } {
  if (!txs.length) return { classification: 'RETAIL', score: 0 };
  const swaps     = txs.filter(t => t.type === 'SWAP');
  const totalTxs  = txs.length;
  const timeSpan  = txs.length > 1 ? (txs[0].timestamp - txs[txs.length - 1].timestamp) : 86400;
  const txPerDay  = totalTxs / Math.max(1, timeSpan / 86400);
  const avgNative = txs.reduce((s, t) => s + (t.nativeTransfers?.[0]?.amount ?? 0), 0) / totalTxs / 1e9;
  if (txPerDay > 50)    return { classification: 'BOT',         score: Math.min(100, txPerDay) };
  if (avgNative > 500)  return { classification: 'WHALE',       score: Math.min(100, avgNative / 10) };
  const nftMints = txs.filter(t => t.type === 'NFT_MINT').length;
  if (nftMints > 5 && swaps.length > 10 && txPerDay > 5) return { classification: 'INSIDER', score: 75 };
  if (swaps.length > 15 && txPerDay < 10 && avgNative > 5) return { classification: 'SMART MONEY', score: 80 };
  return { classification: 'RETAIL', score: 40 };
}

function WalletIntelTab() {
  const [wallet,  setWallet]  = useState('');
  const [profile, setProfile] = useState<WalletProfile | null>(null);
  const [txs,     setTxs]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const analyze = useCallback(async () => {
    if (!wallet.trim()) return;
    setLoading(true); setError(null); setProfile(null);
    try {
      const res  = await fetch(`/api/protocol/wallet-intel?wallet=${encodeURIComponent(wallet.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProfile(data.profile);
      setTxs(data.recentTxs ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [wallet]);

  const fmtMs = (ms: number) => {
    if (ms < 60_000)     return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000)  return `${Math.round(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
    return `${Math.round(ms / 86_400_000)}d`;
  };
  const fmtDate = (ts: number) => ts ? new Date(ts * 1000).toLocaleDateString() : '—';

  return (
    <ScrollArea>
      <div style={{ padding: '12px 4px', fontFamily: FM }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 2, marginBottom: 6 }}>SOLANA WALLET ADDRESS</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={wallet} onChange={e => setWallet(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && analyze()}
              placeholder="Paste any Solana wallet..."
              style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '6px 10px', color: C.text, fontSize: 10, fontFamily: FM, outline: 'none' }}
            />
            <button onClick={analyze} disabled={loading || !wallet.trim()}
              style={{ padding: '6px 16px', borderRadius: 4, border: `1px solid ${C.cyan}`, background: C.cyanFaint, color: C.cyan, fontSize: 10, cursor: 'pointer', fontFamily: FM, letterSpacing: 2, fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'ANALYZING...' : 'ANALYZE'}
            </button>
          </div>
          {error && <div style={{ marginTop: 6, fontSize: 9, color: C.red }}>{error}</div>}
        </div>

        {loading && <Loader />}

        {profile && !loading && (
          <div style={{ animation: 'rowPop 0.3s ease' }}>
            <div style={{ marginBottom: 14, padding: '12px 14px', border: `1px solid ${CLASS_COLOR[profile.classification]}33`, borderRadius: 6, background: `${CLASS_COLOR[profile.classification]}08` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ fontSize: 22, fontFamily: FH, letterSpacing: 3, color: CLASS_COLOR[profile.classification] }}>{profile.classification}</div>
                <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${profile.classScore}%`, background: CLASS_COLOR[profile.classification], borderRadius: 2, transition: 'width 0.8s ease' }} />
                </div>
                <span style={{ fontSize: 9, color: CLASS_COLOR[profile.classification] }}>{profile.classScore}%</span>
              </div>
              <div style={{ fontSize: 9, color: C.dim, lineHeight: 1.6 }}>{CLASS_DESC[profile.classification]}</div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 8, color: C.dim }}>{truncate(profile.wallet, 10)}</span>
                <CopyBtn text={profile.wallet} label="⧉ COPY" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'REALISED PnL',  value: `${profile.realisedPnl >= 0 ? '+' : ''}$${fmtBig(Math.abs(profile.realisedPnl))}`, color: profile.realisedPnl >= 0 ? C.green : C.red },
                { label: 'WIN RATE',      value: `${profile.winRate.toFixed(1)}%`,     color: profile.winRate > 55 ? C.green : profile.winRate > 45 ? C.yellow : C.red },
                { label: 'TOTAL TRADES',  value: profile.totalTrades.toString(),        color: C.cyan },
                { label: 'AVG HOLD TIME', value: fmtMs(profile.avgHoldMs),              color: C.silver },
                { label: 'FIRST SEEN',    value: fmtDate(profile.firstSeen),             color: C.dim },
                { label: 'LAST SEEN',     value: fmtDate(profile.lastSeen),              color: C.dim },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 4, background: 'rgba(0,0,0,0.2)' }}>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {(profile.bestTrade || profile.worstTrade) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {profile.bestTrade && (
                  <div style={{ padding: '8px 10px', border: `1px solid ${C.green}22`, borderRadius: 4, background: `${C.green}06` }}>
                    <div style={{ fontSize: 7, letterSpacing: 2, color: C.green, marginBottom: 3 }}>BEST TRADE</div>
                    <div style={{ fontSize: 10, color: C.text }}>{profile.bestTrade.token}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>+${fmtBig(profile.bestTrade.pnl)}</div>
                  </div>
                )}
                {profile.worstTrade && (
                  <div style={{ padding: '8px 10px', border: `1px solid ${C.red}22`, borderRadius: 4, background: `${C.red}06` }}>
                    <div style={{ fontSize: 7, letterSpacing: 2, color: C.red, marginBottom: 3 }}>WORST TRADE</div>
                    <div style={{ fontSize: 10, color: C.text }}>{profile.worstTrade.token}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>-${fmtBig(Math.abs(profile.worstTrade.pnl))}</div>
                  </div>
                )}
              </div>
            )}

            {profile.topDexes.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 6 }}>PREFERRED DEXES</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {profile.topDexes.map((dex, i) => (
                    <Pill key={i} label={dex} color={i === 0 ? C.cyan : C.silverDim} />
                  ))}
                </div>
              </div>
            )}

            {txs.length > 0 && (
              <div>
                <div style={{ fontSize: 7, letterSpacing: 2, color: C.dim, marginBottom: 6 }}>RECENT ACTIVITY</div>
                {txs.slice(0, 6).map((tx: any, i: number) => (
                  <div key={tx.signature + i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                    <Pill label={tx.type} color={TX_TYPE_COLOR[tx.type] ?? C.dim} />
                    <span style={{ flex: 1, fontSize: 9, color: C.silver, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</span>
                    <span style={{ fontSize: 8, color: C.dim, flexShrink: 0 }}>{timeAgo(tx.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!profile && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9, lineHeight: 2 }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>◈</div>
            Paste any Solana wallet to see a full intelligence profile.<br />
            PnL · Win Rate · Avg Hold Time · DEX preference<br />
            Classified as Smart Money / Whale / Bot / Insider / Retail.
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 6 — MARKET HYPE
   ═══════════════════════════════════════════════════════════════════════════ */
interface HypeCoin {
  id: string; name: string; symbol: string; thumb: string;
  hypeScore: number; hypeRank: number;
  hypeLevel: 'EXTREME' | 'HIGH' | 'MODERATE' | 'BUILDING';
  sources: string[];
  price: number; priceChange24h: number; priceChange7d: number;
  volume24h: number; marketCap: number; rank: number | null;
}

const HYPE_LEVEL_COLOR: Record<string, string> = {
  EXTREME:  '#ff3355',
  HIGH:     '#ffaa00',
  MODERATE: '#00b4ff',
  BUILDING: 'rgba(150,180,210,0.5)',
};

const SOURCE_COLOR: Record<string, string> = {
  'TRENDING':  '#9966ff',
  'MOMENTUM':  '#00ff88',
  'HIGH VOL':  '#00b4ff',
  'DEX BOOST': '#ffaa00',
};

function HypeBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.round((score / 80) * 100));
  const color = score >= 60 ? '#ff3355' : score >= 40 ? '#ffaa00' : score >= 20 ? '#00b4ff' : 'rgba(150,180,210,0.4)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${color}66,${color})`, borderRadius: 2, transition: 'width 0.7s ease', boxShadow: `0 0 6px ${color}44` }} />
      </div>
      <span style={{ fontSize: 8, color, fontWeight: 700, minWidth: 18 }}>{score}</span>
    </div>
  );
}

function MarketHypeTab() {
  const [coins,   setCoins]   = useState<HypeCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastMs,  setLastMs]  = useState(0);
  const [error,   setError]   = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/protocol/market-hype');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCoins(data.coins ?? []);
      setLastMs(Date.now());
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 5 * 60 * 1000); return () => clearInterval(t); }, [load]);

  const extremeCount = coins.filter(c => c.hypeLevel === 'EXTREME').length;
  const highCount    = coins.filter(c => c.hypeLevel === 'HIGH').length;

  return (
    <ScrollArea>
      <div style={{ padding: '12px 4px', fontFamily: FM }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: FH, fontSize: 14, letterSpacing: 3, color: C.cyan }}>MARKET HYPE</div>
            <div style={{ fontSize: 8, color: C.dim, marginTop: 2 }}>CoinGecko trending · price momentum · DEX boosts</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshBadge ms={lastMs} every={300} />
            <button onClick={load} style={{ padding: '3px 8px', borderRadius: 3, border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, fontSize: 8, cursor: 'pointer', fontFamily: FM }}>↻</button>
          </div>
        </div>

        {coins.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {extremeCount > 0 && <Pill label={`🔥 ${extremeCount} EXTREME HYPE`} color={C.red}    />}
            {highCount > 0    && <Pill label={`⚡ ${highCount} HIGH HYPE`}        color={C.orange} />}
            <Pill label={`TOP ${coins.length} COINS`} color={C.cyan} />
          </div>
        )}

        {loading && <Loader />}
        {error && <div style={{ fontSize: 9, color: C.red, padding: '8px 0' }}>{error}</div>}

        {coins.map((coin, i) => {
          const isOpen  = expanded === coin.id;
          const hlColor = HYPE_LEVEL_COLOR[coin.hypeLevel];
          const isTop3  = coin.hypeRank <= 3;

          return (
            <div key={coin.id}
              onClick={() => setExpanded(isOpen ? null : coin.id)}
              style={{ marginBottom: 6, borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${isTop3 ? `${hlColor}44` : C.border}`,
                background: isTop3 ? `${hlColor}06` : 'rgba(0,0,0,0.15)',
                animation: `rowPop 0.2s ease ${i * 0.04}s both`, overflow: 'hidden' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                <div style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isTop3 ? `${hlColor}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isTop3 ? `${hlColor}44` : 'rgba(255,255,255,0.06)'}`,
                  fontSize: 9, fontWeight: 700, color: isTop3 ? hlColor : C.dim }}>
                  {coin.hypeRank}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  {coin.thumb ? (
                    <img src={coin.thumb} alt="" width={20} height={20}
                      style={{ borderRadius: '50%', flexShrink: 0, opacity: 0.9 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: `${hlColor}22`,
                      border: `1px solid ${hlColor}33`, flexShrink: 0, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 7, color: hlColor }}>
                      {coin.symbol.slice(0, 2)}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {coin.symbol}{isTop3 && <span style={{ marginLeft: 5 }}>{coin.hypeRank === 1 ? '🔥' : coin.hypeRank === 2 ? '⚡' : '📈'}</span>}
                    </div>
                    <div style={{ fontSize: 7, color: C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{coin.name}</div>
                  </div>
                </div>

                <div style={{ flexShrink: 0 }}>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 1, marginBottom: 3 }}>HYPE</div>
                  <HypeBar score={coin.hypeScore} />
                </div>

                <Pill label={coin.hypeLevel} color={hlColor} />

                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 50 }}>
                  {coin.priceChange24h !== 0 && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: coin.priceChange24h >= 0 ? C.green : C.red }}>
                      {coin.priceChange24h >= 0 ? '+' : ''}{coin.priceChange24h.toFixed(1)}%
                    </div>
                  )}
                  {coin.price > 0 && (
                    <div style={{ fontSize: 8, color: C.dim }}>
                      {coin.price < 0.001 ? coin.price.toExponential(2) : coin.price < 1 ? `$${coin.price.toFixed(4)}` : `$${coin.price.toFixed(2)}`}
                    </div>
                  )}
                </div>

                <span style={{ fontSize: 9, color: isOpen ? C.cyan : C.dim, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
              </div>

              <div style={{ display: 'flex', gap: 4, paddingLeft: 52, paddingBottom: isOpen ? 0 : 8, flexWrap: 'wrap' }}>
                {coin.sources.map((src, j) => (
                  <span key={j} style={{ fontSize: 7, letterSpacing: 1, fontWeight: 700,
                    color: SOURCE_COLOR[src] ?? C.dim, padding: '1px 5px', borderRadius: 2,
                    border: `1px solid ${SOURCE_COLOR[src] ?? C.dim}33`,
                    background: `${SOURCE_COLOR[src] ?? C.dim}0a` }}>
                    {src}
                  </span>
                ))}
              </div>

              {isOpen && (
                <div style={{ padding: '8px 12px 12px', borderTop: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.2)', animation: 'feedSlide 0.15s ease' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                    {[
                      { label: 'PRICE',      value: coin.price > 0 ? (coin.price < 0.001 ? coin.price.toExponential(3) : coin.price < 1 ? `$${coin.price.toFixed(4)}` : `$${coin.price.toFixed(2)}`) : '—', color: C.silver },
                      { label: '24H',        value: coin.priceChange24h !== 0 ? `${coin.priceChange24h >= 0 ? '+' : ''}${coin.priceChange24h.toFixed(2)}%` : '—', color: coin.priceChange24h >= 0 ? C.green : C.red },
                      { label: '7D',         value: coin.priceChange7d  !== 0 ? `${coin.priceChange7d  >= 0 ? '+' : ''}${coin.priceChange7d.toFixed(2)}%`  : '—', color: coin.priceChange7d  >= 0 ? C.green : C.red },
                      { label: 'VOLUME 24H', value: coin.volume24h > 0 ? fmtUsd(coin.volume24h)  : '—', color: C.cyan   },
                      { label: 'MARKET CAP', value: coin.marketCap > 0 ? fmtUsd(coin.marketCap) : '—', color: C.silver },
                      { label: 'HYPE SCORE', value: `${coin.hypeScore} / 80`,                          color: hlColor  },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ padding: '6px 8px', border: `1px solid ${C.border}`, borderRadius: 4, background: 'rgba(0,0,0,0.2)' }}>
                        <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 8, color: C.dim, lineHeight: 1.6, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 4 }}>
                    <span style={{ color: hlColor, fontWeight: 700 }}>{coin.hypeLevel} HYPE — </span>
                    {coin.hypeLevel === 'EXTREME'  && 'Multiple strong signals converging. High FOMO risk — caution on entries.'}
                    {coin.hypeLevel === 'HIGH'      && 'Strong trending or major price momentum. Community attention elevated.'}
                    {coin.hypeLevel === 'MODERATE'  && 'Moderate interest building. Price moving but not yet parabolic.'}
                    {coin.hypeLevel === 'BUILDING'  && 'Early hype signal. Monitor for confirmation before acting.'}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!loading && coins.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.dim, fontSize: 9, lineHeight: 2 }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>🔥</div>
            Fetching market hype data...<br />
            CoinGecko trending + momentum movers + DEX boosts
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 7, color: C.dim, lineHeight: 1.5 }}>
          ⚠ Hype score is a composite signal — not financial advice. High hype often precedes reversals.
        </div>
      </div>
    </ScrollArea>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN — PROTOCOL PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
const TABS: { id: TabId; label: string; }[] = [
  { id: 'audit',        label: 'AUDIT'        },
  { id: 'transactions', label: 'TRANSACTIONS' },
  { id: 'livefeed',     label: 'LIVE FEED'    },
  { id: 'whales',       label: 'WHALE TRACKER'},
  { id: 'walletintel',  label: 'WALLET INTEL' },
  { id: 'markethype',   label: '🔥 HYPE'      },
];

export default function ProtocolPanel({ features = {} }: { features?: Record<string, string> }) {
  const [tab, setTab] = useState<TabId>('audit');

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
            {t.id === 'livefeed' && (
              <span style={{ marginLeft: 6, width: 5, height: 5, borderRadius: '50%', background: C.green, boxShadow: `0 0 4px ${C.green}`, display: 'inline-block', animation: 'livePulse 2s infinite', verticalAlign: 'middle' }} />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 6px' }}>
        {tab === 'audit'        && (
          features['protocol_audit'] === 'unlocked'
            ? <AuditTab />
            : <div style={{ position: 'relative', height: '100%', minHeight: 400 }}>
                <ComingSoon featureName="PROTOCOL AUDIT" description="Contract risk analysis and rug pattern scoring" panel="Protocol" />
              </div>
        )}
        {tab === 'transactions' && <TransactionsTab />}
        {tab === 'livefeed'     && <LiveFeedTab />}
        {tab === 'whales'       && <WhaleTrackerTab />}
        {tab === 'walletintel'  && (
          features['wallet_intel'] === 'unlocked'
            ? <WalletIntelTab />
            : <div style={{ position: 'relative', height: '100%', minHeight: 400 }}>
                <ComingSoon featureName="WALLET INTELLIGENCE" description="Full wallet profiling and classification" panel="Protocol" />
              </div>
        )}
        {tab === 'markethype'   && <MarketHypeTab />}
      </div>
    </div>
  );
}
