// client/src/components/panels/ConnectPanel.tsx
// NFT access gate — shown to wallets with no active NFT
// States: no_wallet | none | revoked | expired | grace | gate_open | active

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { Transaction } from '@solana/web3.js';

/* ─── FONTS ─────────────────────────────────────────────────────────────── */
if (typeof document !== 'undefined') {
  const existing = document.getElementById('con-kf');
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.id = 'con-kf';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Bebas+Neue&display=swap');
    @keyframes conSpin    { to { transform: rotate(360deg); } }
    @keyframes conSpinRev { to { transform: rotate(-360deg); } }
    @keyframes conPulse   { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
    @keyframes conFade    { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    @keyframes conIn      { from { opacity:0; } to { opacity:1; } }
    @keyframes conUp      { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
    @keyframes conScan    { 0% { top:0; opacity:1; } 100% { top:100%; opacity:0; } }
    @keyframes conBlink   { 0%,49% { opacity:1; } 50%,100% { opacity:0; } }
    @keyframes conShake   { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-3px)} 40%{transform:translateX(3px)} 60%{transform:translateX(-2px)} 80%{transform:translateX(2px)} }
  `;
  document.head.appendChild(style);
}

/* ─── DESIGN TOKENS ─────────────────────────────────────────────────────── */
const FM = '"IBM Plex Mono","Courier New",monospace';
const FH = '"Bebas Neue","Impact",sans-serif';

const C = {
  bg:        '#020408',
  bgCard:    'rgba(0,180,255,0.02)',
  border:    'rgba(0,180,255,0.10)',
  borderHi:  'rgba(0,180,255,0.28)',
  cyan:      '#00b4ff',
  cyanDim:   'rgba(0,180,255,0.45)',
  cyanFaint: 'rgba(0,180,255,0.07)',
  green:     '#00ff88',
  red:       '#ff3355',
  orange:    '#ffaa00',
  yellow:    '#ffdd00',
  purple:    '#9966ff',
  text:      'rgba(200,220,240,0.85)',
  dim:       'rgba(140,180,220,0.45)',
  faint:     'rgba(100,150,200,0.28)',
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

/* ─── TYPES ──────────────────────────────────────────────────────────────── */
type AccessStatus = 'checking' | 'no_wallet' | 'none' | 'revoked' | 'expired' | 'grace' | 'gate_open' | 'active';
type Tier = 'bronze' | 'silver' | 'gold';

interface AccessInfo {
  hasAccess:    boolean;
  status:       AccessStatus;
  tier?:        Tier;
  source?:      string;
  mintAddress?: string;
  mintNumber?:  number;
  expiresAt?:   string;
  daysLeft?:    number;
  originalPrice?: number;
  graceDaysLeft?: number;
  graceEndsAt?:   string;
  reason?:      string;
  serial?:      string;
  revokedAt?:   string;
  appealEmail?: string;
  pointsBalance?: number;
  pointsTotal?:   number;
  pageAccess?:    { page: string; expiresAt: string } | null;
}

interface PriceInfo {
  usdPrice:    number;
  solPrice:    number;
  solUsd:      number;
  minted:      number;
  remaining:   number;
  isEarlyPrice: boolean;
}

/* ─── UTILS ──────────────────────────────────────────────────────────────── */
function fmtSol(n: number): string {
  return n < 0.001 ? n.toFixed(6) : n < 1 ? n.toFixed(4) : n.toFixed(3);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

function pct(minted: number, supply = 2000): number {
  return Math.min(100, Math.round((minted / supply) * 100));
}

/* ─── SMALL COMPONENTS ───────────────────────────────────────────────────── */
function Spinner({ size = 16, color = C.cyan }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `1px solid rgba(0,180,255,0.15)`,
      borderTop: `1px solid ${color}`,
      animation: 'conSpin 0.7s linear infinite', flexShrink: 0,
    }} />
  );
}

function LiveDot({ color = C.cyan }: { color?: string }) {
  return (
    <div style={{
      width: 6, height: 6, borderRadius: '50%',
      background: color, flexShrink: 0,
      animation: 'conPulse 1.8s ease-in-out infinite',
      boxShadow: `0 0 6px ${color}`,
    }} />
  );
}

function ProgressBar({ value, max, color = C.cyan }: { value: number; max: number; color?: string }) {
  const pctVal = Math.min(100, (value / max) * 100);
  return (
    <div style={{ width: '100%', height: 4, background: 'rgba(0,180,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        width: `${pctVal}%`, height: '100%', borderRadius: 2,
        background: `linear-gradient(90deg, ${color}88, ${color})`,
        boxShadow: `0 0 8px ${color}44`,
        transition: 'width 0.6s ease',
      }} />
    </div>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  const cfg = {
    bronze: { color: C.orange,  label: 'BRONZE', icon: '◈' },
    silver: { color: '#aaccff', label: 'SILVER', icon: '◈' },
    gold:   { color: C.yellow,  label: 'GOLD',   icon: '★' },
  }[tier] ?? { color: C.orange, label: "BRONZE", icon: "◈", desc: "Full platform access · 30-day renewal" };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 9, fontWeight: 700, letterSpacing: 2,
      color: cfg.color, fontFamily: FM,
      padding: '3px 10px', borderRadius: 3,
      background: `${cfg.color}12`,
      border: `1px solid ${cfg.color}40`,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

/* ─── SCAN LINE EFFECT ───────────────────────────────────────────────────── */
function ScanLine() {
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, height: 1,
      background: 'linear-gradient(90deg, transparent, rgba(0,180,255,0.3), transparent)',
      animation: 'conScan 3s linear infinite',
      pointerEvents: 'none',
    }} />
  );
}

/* ─── TIER CARD ──────────────────────────────────────────────────────────── */
function TierCard({
  tier, price, solPrice, solUsd, minted, supply, locked, comingSoon, selected, onSelect,
}: {
  tier: Tier; price: number; solPrice?: number; solUsd?: number;
  minted?: number; supply?: number; locked?: boolean; comingSoon?: boolean;
  selected?: boolean; onSelect?: () => void;
}) {
  const cfg = {
    bronze: { color: C.orange,  icon: '◈', desc: 'Full platform access · 30-day renewal' },
    silver: { color: '#aaccff', icon: '◇', desc: 'Enhanced features · Priority data feeds' },
    gold:   { color: C.yellow,  icon: '★', desc: 'All features · Exclusive alpha channels' },
  }[tier] ?? { color: C.orange, label: "BRONZE", icon: "◈", desc: "Full platform access · 30-day renewal" };

  const progress = minted !== undefined && supply !== undefined ? pct(minted, supply) : null;

  return (
    <div
      onClick={!locked && !comingSoon ? onSelect : undefined}
      style={{
        flex: 1, minWidth: 200, padding: '20px 18px',
        background: selected ? `${cfg.color}08` : C.bgCard,
        border: `1px solid ${selected ? cfg.color + '60' : locked || comingSoon ? C.border : C.border}`,
        borderRadius: 6, cursor: locked || comingSoon ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
        opacity: locked || comingSoon ? 0.5 : 1,
        boxShadow: selected ? `0 0 24px ${cfg.color}18, inset 0 0 40px ${cfg.color}04` : 'none',
        animation: 'conFade 0.4s ease both',
      }}
    >
      {selected && <ScanLine />}

      {/* Tier header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 9, color: C.faint, letterSpacing: 3, marginBottom: 4 }}>{cfg.icon} TIER</div>
          <div style={{ fontFamily: FH, fontSize: 22, letterSpacing: 3, color: cfg.color }}>
            {tier.toUpperCase()}
          </div>
        </div>
        {comingSoon && (
          <span style={{
            fontSize: 8, letterSpacing: 2, color: C.faint,
            border: `1px solid ${C.border}`, borderRadius: 3,
            padding: '2px 8px', fontFamily: FM,
          }}>
            🔒 SOON
          </span>
        )}
        {selected && !comingSoon && (
          <span style={{
            fontSize: 8, letterSpacing: 2, color: cfg.color,
            border: `1px solid ${cfg.color}50`, borderRadius: 3,
            padding: '2px 8px', fontFamily: FM,
            background: `${cfg.color}10`,
          }}>
            ✓ SELECTED
          </span>
        )}
      </div>

      {/* Price — shows USDC label */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: comingSoon ? C.faint : C.text, fontFamily: FM }}>
          {comingSoon ? '—' : `$${price}`}
        </div>
        {!comingSoon && (
          <div style={{ fontSize: 9, color: C.cyan, marginTop: 2, fontFamily: FM, letterSpacing: 1 }}>
            USDC · Solana
          </div>
        )}
        {comingSoon && (
          <div style={{ fontSize: 9, color: C.faint, marginTop: 2 }}>Price TBA</div>
        )}
      </div>

      {/* Description */}
      <div style={{ fontSize: 9, color: C.dim, lineHeight: 1.6, marginBottom: 14, fontFamily: FM }}>
        {cfg.desc}
      </div>

      {/* Supply bar for bronze */}
      {progress !== null && !comingSoon && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 8, color: C.faint, letterSpacing: 2 }}>SUPPLY</span>
            <span style={{ fontSize: 8, color: progress < 80 ? cfg.color : C.red, fontFamily: FM }}>
              {minted}/{supply} ({progress}%)
            </span>
          </div>
          <ProgressBar value={minted!} max={supply!} color={progress < 80 ? cfg.color : C.red} />
          {progress >= 80 && (
            <div style={{ fontSize: 8, color: C.red, marginTop: 4, letterSpacing: 1 }}>
              ⚑ EARLY PRICING ENDS SOON
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── STATE: NO WALLET ───────────────────────────────────────────────────── */
function NoWalletState({ onConnect }: { onConnect: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: 24,
      animation: 'conFade 0.5s ease both',
    }}>
      <div style={{ position: 'relative', animation: 'conIn 0.6s ease both' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          border: `1px solid ${C.borderHi}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,180,255,0.03)',
        }}>
          <span style={{ fontSize: 24, color: C.cyan }}>◈</span>
        </div>
        <div style={{
          position: 'absolute', inset: -10, borderRadius: '50%',
          border: `1px dashed rgba(0,180,255,0.12)`,
          animation: 'conSpin 20s linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: -20, borderRadius: '50%',
          border: `1px dashed rgba(0,180,255,0.06)`,
          animation: 'conSpinRev 30s linear infinite',
        }} />
      </div>

      <div style={{ textAlign: 'center', animation: 'conUp 0.5s ease 0.15s both' }}>
        <div style={{ fontFamily: FH, fontSize: 28, letterSpacing: 4, color: C.text, marginBottom: 8 }}>
          CONNECT YOUR <span style={{ color: C.cyan }}>WALLET</span>
        </div>
        <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, lineHeight: 1.7, maxWidth: 320 }}>
          Connect a Solana wallet to check your access status or mint a ProtocolHub NFT
        </div>
      </div>

      <button onClick={onConnect}
        style={{
          fontFamily: FM, fontSize: 11, letterSpacing: 3, fontWeight: 700,
          color: C.cyan, background: C.cyanFaint,
          border: `1px solid ${C.borderHi}`, borderRadius: 4,
          padding: '12px 32px', cursor: 'pointer',
        }}>
        ◈ CONNECT WALLET
      </button>

      <div style={{ fontSize: 9, color: C.faint, letterSpacing: 1 }}>
        Phantom · Solflare · Backpack · and more
      </div>
    </div>
  );
}

/* ─── STATE: REVOKED ─────────────────────────────────────────────────────── */
function RevokedState({ info }: { info: AccessInfo }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: 20,
      animation: 'conFade 0.5s ease both',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        border: `1px solid rgba(255,51,85,0.4)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,51,85,0.06)',
        animation: 'conIn 0.4s ease both',
      }}>
        <span style={{ fontSize: 22, color: C.red }}>⚑</span>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FH, fontSize: 26, letterSpacing: 4, color: C.red, marginBottom: 6 }}>
          ACCESS REVOKED
        </div>
        <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, lineHeight: 1.7, maxWidth: 340 }}>
          Your access has been revoked by a ProtocolHub administrator
        </div>
      </div>

      <div style={{
        width: '100%', maxWidth: 480, padding: '18px 20px',
        border: 'rgba(255,51,85,0.2) 1px solid', borderRadius: 6,
        background: 'rgba(255,51,85,0.04)', fontFamily: FM,
      }}>
        {info.reason && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 8, color: 'rgba(255,51,85,0.5)', letterSpacing: 2, marginBottom: 4 }}>REASON</div>
            <div style={{ fontSize: 10, color: C.text }}>{info.reason}</div>
          </div>
        )}
        {info.serial && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 8, color: 'rgba(255,51,85,0.5)', letterSpacing: 2, marginBottom: 4 }}>REVOCATION SERIAL</div>
            <div style={{ fontSize: 10, color: C.red, letterSpacing: 1 }}>{info.serial}</div>
          </div>
        )}
        {info.revokedAt && (
          <div>
            <div style={{ fontSize: 8, color: 'rgba(255,51,85,0.5)', letterSpacing: 2, marginBottom: 4 }}>REVOKED</div>
            <div style={{ fontSize: 10, color: C.dim }}>{timeAgo(info.revokedAt)}</div>
          </div>
        )}
      </div>

      {info.appealEmail && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: C.faint, marginBottom: 8 }}>
            If you believe this was a mistake, you can file an appeal
          </div>
          <a
            href={`mailto:${info.appealEmail}?subject=Access Appeal — Serial: ${info.serial || 'N/A'}&body=Serial: ${info.serial || 'N/A'}%0AReason: ${info.reason || 'N/A'}%0A%0AYour message here...`}
            style={{
              fontFamily: FM, fontSize: 10, letterSpacing: 2,
              color: C.cyan, background: C.cyanFaint,
              border: `1px solid ${C.borderHi}`, borderRadius: 4,
              padding: '9px 24px', textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            ✉ FILE APPEAL
          </a>
        </div>
      )}
    </div>
  );
}

/* ─── STATE: GRACE PERIOD ────────────────────────────────────────────────── */
function GraceState({ info, price, solPrice, solUsd, onMint }: {
  info: AccessInfo; price?: PriceInfo; solPrice?: number; solUsd?: number; onMint: () => void;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 20, animation: 'conFade 0.5s ease both',
      padding: '32px 0',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        border: `1px solid rgba(255,170,0,0.4)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,170,0,0.06)',
      }}>
        <span style={{ fontSize: 22 }}>⏳</span>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FH, fontSize: 26, letterSpacing: 4, color: C.orange, marginBottom: 6 }}>
          GRACE PERIOD
        </div>
        <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, lineHeight: 1.7, maxWidth: 360 }}>
          Your NFT has expired but you're within the grace window.<br />
          Renew now to keep your original price lock.
        </div>
      </div>

      <div style={{
        width: '100%', maxWidth: 400, padding: '18px 20px',
        border: 'rgba(255,170,0,0.25) 1px solid', borderRadius: 6,
        background: 'rgba(255,170,0,0.04)', fontFamily: FM,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 8, color: 'rgba(255,170,0,0.5)', letterSpacing: 2, marginBottom: 4 }}>GRACE DAYS LEFT</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.orange }}>{info.graceDaysLeft ?? '—'}</div>
          </div>
          {info.originalPrice && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 8, color: 'rgba(255,170,0,0.5)', letterSpacing: 2, marginBottom: 4 }}>YOUR LOCKED PRICE</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>${info.originalPrice} USDC</div>
            </div>
          )}
        </div>
        <ProgressBar value={info.graceDaysLeft ?? 0} max={7} color={C.orange} />
        {info.graceEndsAt && (
          <div style={{ fontSize: 8, color: 'rgba(255,170,0,0.4)', marginTop: 6, letterSpacing: 1 }}>
            Grace ends {new Date(info.graceEndsAt).toLocaleDateString()}
          </div>
        )}
      </div>

      <button
        onClick={onMint}
        style={{
          fontFamily: FM, fontSize: 11, letterSpacing: 3, fontWeight: 700,
          color: '#000', background: C.orange,
          border: 'none', borderRadius: 4,
          padding: '12px 32px', cursor: 'pointer',
          boxShadow: `0 0 24px ${C.orange}44`,
          transition: 'all 0.2s',
        }}
      >
        ↺ RENEW NOW — ${info.originalPrice ?? '—'} USDC
      </button>
    </div>
  );
}

/* ─── MINT PANEL ─────────────────────────────────────────────────────────── */
// ↓↓↓ CHANGED: uses sendTransaction from wallet adapter so wallet popup fires
// ↓↓↓ USDC is debited immediately on confirm — goes straight to treasury wallet
// ↓↓↓ Backend builds the tx, frontend signs+sends, user pays USDC + gas in one popup
type MintStep = 'idle' | 'building' | 'signing' | 'confirming' | 'done';

function MintPanel({
  wallet, price, onSuccess,
}: {
  wallet: string; price: PriceInfo; onSuccess: () => void;
}) {
  const { sendTransaction } = useWallet();
  const { connection }      = useConnection();

  const [selectedTier, setSelectedTier] = useState<Tier>('bronze');
  const [step,         setStep]         = useState<MintStep>('idle');
  const [error,        setError]        = useState<string | null>(null);
  const [txSig,        setTxSig]        = useState<string | null>(null);

  const isBusy = step !== 'idle' && step !== 'done';

  async function handleMint() {
    setStep('building');
    setError(null);

    try {
      // Step 1 — Backend builds a transaction containing:
      //   • USDC SPL transfer  (user wallet → your treasury wallet)
      //   • NFT lazy mint instruction (Candy Machine)
      // It returns it serialised — it does NOT send it to chain.
      const buildRes = await fetch('/api/nft/build-mint-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, tier: selectedTier }),
      });
      const buildData = await buildRes.json();

      if (!buildData.transaction) {
        throw new Error(buildData.error || 'Could not prepare transaction');
      }

      // Step 2 — Deserialise the transaction the backend returned
      const tx = Transaction.from(Buffer.from(buildData.transaction, 'base64'));

      // Step 3 — Hand it to the wallet → THIS fires the confirm popup
      // The popup shows:
      //   • −$XX USDC  (to your treasury)
      //   • −~0.005 SOL  (Solana gas fee)
      //   • [Confirm] / [Reject]
      setStep('signing');
      const sig = await sendTransaction(tx, connection);

      // Step 4 — Wait for on-chain confirmation
      setStep('confirming');
      await connection.confirmTransaction(sig, 'confirmed');

      // Step 5 — Notify backend to record the mint against this wallet
      await fetch('/api/nft/confirm-mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, txSig: sig, tier: selectedTier }),
      });

      setTxSig(sig);
      setStep('done');
      onSuccess();

    } catch (err: any) {
      // User clicked Reject in wallet
      if (
        err?.message?.toLowerCase().includes('user rejected') ||
        err?.message?.toLowerCase().includes('rejected the request') ||
        err?.code === 4001
      ) {
        setError('Transaction cancelled — you rejected it in your wallet.');
      } else if (err?.message?.toLowerCase().includes('insufficient')) {
        setError('Insufficient USDC balance. Top up your wallet and try again.');
      } else {
        setError(err?.message || 'Something went wrong — please try again.');
      }
      setStep('idle');
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (step === 'done' && txSig) {
    return (
      <div style={{
        textAlign: 'center', padding: '32px 0',
        animation: 'conFade 0.5s ease both',
      }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>✓</div>
        <div style={{ fontFamily: FH, fontSize: 26, letterSpacing: 4, color: C.green, marginBottom: 8 }}>
          MINT SUCCESSFUL
        </div>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>Your ProtocolHub NFT is now active</div>
        <div style={{ fontSize: 9, color: C.faint, marginBottom: 16, fontFamily: FM }}>
          USDC payment confirmed on-chain
        </div>
        <a
          href={`https://solscan.io/tx/${txSig}`}
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 9, color: C.cyan, fontFamily: FM, letterSpacing: 1 }}
        >
          View on Solscan ↗
        </a>
      </div>
    );
  }

  // ── Mint UI ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'conFade 0.4s ease both' }}>

      {/* Tier selection */}
      <div>
        <div style={{ fontSize: 8, color: C.faint, letterSpacing: 3, marginBottom: 12, fontFamily: FM }}>
          SELECT TIER
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <TierCard
            tier="bronze"
            price={price.usdPrice}
            solPrice={price.solPrice}
            solUsd={price.solUsd}
            minted={price.minted}
            supply={2000}
            selected={selectedTier === 'bronze'}
            onSelect={() => setSelectedTier('bronze')}
          />
          <TierCard tier="silver" price={0} comingSoon />
          <TierCard tier="gold"   price={0} comingSoon />
        </div>
      </div>

      {/* What you get */}
      <div style={{
        padding: '16px 18px', border: `1px solid ${C.border}`, borderRadius: 6,
        background: C.bgCard, fontFamily: FM,
      }}>
        <div style={{ fontSize: 8, color: C.faint, letterSpacing: 3, marginBottom: 12 }}>◈ WHAT YOU GET</div>
        {[
          { icon: '◈', label: 'Full platform access', desc: 'All 4 panels — Network, Protocol, Explore, Search' },
          { icon: '↻', label: '30-day renewal', desc: 'Renew within grace period to keep your minted price' },
          { icon: '⬡', label: 'On-chain NFT', desc: 'Programmable NFT with 6% enforced royalties' },
          { icon: '★', label: 'Early access price', desc: `$${price.usdPrice} USDC for first 2,000 mints — then $70` },
        ].map((item, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, padding: '8px 0',
            borderBottom: i < 3 ? `1px solid ${C.border}` : 'none',
          }}>
            <span style={{ color: C.cyanDim, fontSize: 12, width: 16, flexShrink: 0 }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 10, color: C.text, marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 9, color: C.dim }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary + mint button */}
      <div style={{
        padding: '18px 20px', border: `1px solid ${C.borderHi}`, borderRadius: 6,
        background: 'rgba(0,180,255,0.04)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 8, color: C.faint, letterSpacing: 2, marginBottom: 4 }}>TOTAL</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.text, fontFamily: FM }}>
              ${price.usdPrice}
              <span style={{ fontSize: 11, color: C.cyan, marginLeft: 8, letterSpacing: 1 }}>USDC</span>
            </div>
            <div style={{ fontSize: 8, color: C.faint, marginTop: 3 }}>
              + ~0.005 SOL network fee
            </div>
          </div>
          <TierBadge tier={selectedTier} />
        </div>

        {/* Step indicator — shown while transaction is in progress */}
        {isBusy && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            padding: '8px 12px', borderRadius: 4,
            background: 'rgba(0,180,255,0.06)', border: `1px solid ${C.border}`,
            fontSize: 9, color: C.cyan, fontFamily: FM, letterSpacing: 1,
          }}>
            <Spinner size={10} />
            {step === 'building'   && 'Building your transaction...'}
            {step === 'signing'    && 'Approve the transaction in your wallet'}
            {step === 'confirming' && 'Confirming on Solana...'}
          </div>
        )}

        {error && (
          <div style={{
            padding: '8px 12px', marginBottom: 12,
            background: 'rgba(255,51,85,0.08)', border: '1px solid rgba(255,51,85,0.25)',
            borderRadius: 4, fontSize: 10, color: C.red, fontFamily: FM,
            animation: 'conShake 0.4s ease both',
          }}>
            ⚑ {error}
          </div>
        )}

        <button
          onClick={handleMint}
          disabled={isBusy}
          style={{
            width: '100%', fontFamily: FM, fontSize: 11, letterSpacing: 3, fontWeight: 700,
            color: isBusy ? C.dim : '#000',
            background: isBusy ? 'rgba(0,180,255,0.08)' : C.cyan,
            border: `1px solid ${isBusy ? C.border : C.cyan}`,
            borderRadius: 4, padding: '13px', cursor: isBusy ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: isBusy ? 'none' : `0 0 24px rgba(0,180,255,0.3)`,
            transition: 'all 0.2s',
          }}
        >
          {isBusy
            ? <><Spinner size={12} /> {step === 'signing' ? 'WAITING FOR WALLET...' : step === 'confirming' ? 'CONFIRMING...' : 'PREPARING...'}</>
            : '◈ MINT NFT'
          }
        </button>

        <div style={{ fontSize: 8, color: C.faint, textAlign: 'center', marginTop: 8, letterSpacing: 1 }}>
          Wallet signature required · USDC on Solana · No hidden fees
        </div>
      </div>
    </div>
  );
}


/* ─── POINTS CARD ────────────────────────────────────────────────────────── */
function PointsCard({ wallet, access, onRedeemSuccess }: {
  wallet: string;
  access: AccessInfo;
  onRedeemSuccess: () => void;
}) {
  const balance    = access.pointsBalance ?? 0;
  const total      = access.pointsTotal   ?? 0;
  const [redeeming, setRedeeming] = useState<'month' | 'page' | null>(null);
  const [msg,       setMsg]       = useState<{ text: string; ok: boolean } | null>(null);

  async function redeemMonth() {
    setRedeeming('month'); setMsg(null);
    try {
      const r    = await fetch('/api/points/redeem-month', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
      });
      const data = await r.json();
      if (data.success) {
        setMsg({ text: `✓ Free month added — ${data.pointsBalance} pts remaining`, ok: true });
        onRedeemSuccess();
      } else {
        setMsg({ text: data.error || 'Redemption failed', ok: false });
      }
    } catch { setMsg({ text: 'Network error', ok: false }); }
    setRedeeming(null);
  }

  async function redeemPage() {
    setRedeeming('page'); setMsg(null);
    try {
      const r    = await fetch('/api/points/burn-page-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, page: 'sniper' }),
      });
      const data = await r.json();
      if (data.success) {
        setMsg({ text: `✓ Sniper unlocked for 24hr — ${data.pointsBalance} pts remaining`, ok: true });
        onRedeemSuccess();
      } else {
        setMsg({ text: data.error || 'Unlock failed', ok: false });
      }
    } catch { setMsg({ text: 'Network error', ok: false }); }
    setRedeeming(null);
  }

  const canMonth = balance >= 500;
  const canPage  = balance >= 50;

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 6,
      background: C.bgCard, marginBottom: 16, overflow: 'hidden',
      animation: 'conFade 0.4s ease both',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>◈</span>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, color: C.text, fontWeight: 700 }}>LOYALTY POINTS</div>
            <div style={{ fontSize: 8, color: C.faint, marginTop: 1 }}>{total} earned all-time</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.cyan, fontFamily: FM, lineHeight: 1 }}>
            {balance.toLocaleString()}
          </div>
          <div style={{ fontSize: 7, color: C.faint, letterSpacing: 2, marginTop: 2 }}>PTS BALANCE</div>
        </div>
      </div>

      {/* Progress toward free month */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 8, color: C.faint, letterSpacing: 1 }}>FREE MONTH PROGRESS</span>
          <span style={{ fontSize: 8, color: canMonth ? C.green : C.dim }}>
            {Math.min(balance, 500)} / 500
          </span>
        </div>
        <div style={{ height: 4, background: 'rgba(0,180,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, (balance / 500) * 100)}%`, height: '100%',
            background: canMonth
              ? `linear-gradient(90deg, ${C.green}88, ${C.green})`
              : `linear-gradient(90deg, ${C.cyan}88, ${C.cyan})`,
            borderRadius: 2, transition: 'width 0.6s ease',
          }} />
        </div>
        {!canMonth && (
          <div style={{ fontSize: 8, color: C.faint, marginTop: 4 }}>
            {500 - balance} pts until free month · earn 100 per renewal
          </div>
        )}
      </div>

      {/* Redeem buttons */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={redeemMonth}
          disabled={!canMonth || redeeming === 'month'}
          style={{
            flex: 1, minWidth: 140, fontFamily: FM, fontSize: 9, letterSpacing: 2,
            color: canMonth ? '#000' : C.faint,
            background: canMonth ? C.green : 'rgba(0,255,136,0.05)',
            border: `1px solid ${canMonth ? C.green : 'rgba(0,255,136,0.1)'}`,
            borderRadius: 4, padding: '10px 12px', cursor: canMonth ? 'pointer' : 'not-allowed',
            boxShadow: canMonth ? `0 0 16px rgba(0,255,136,0.25)` : 'none',
            transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {redeeming === 'month' ? <><Spinner size={10} color={C.green} /> REDEEMING...</> : '📅 FREE MONTH — 500 PTS'}
        </button>

        <button
          onClick={redeemPage}
          disabled={!canPage || redeeming === 'page'}
          style={{
            flex: 1, minWidth: 140, fontFamily: FM, fontSize: 9, letterSpacing: 2,
            color: canPage ? '#000' : C.faint,
            background: canPage ? C.purple : 'rgba(153,102,255,0.05)',
            border: `1px solid ${canPage ? C.purple : 'rgba(153,102,255,0.1)'}`,
            borderRadius: 4, padding: '10px 12px', cursor: canPage ? 'pointer' : 'not-allowed',
            boxShadow: canPage ? `0 0 16px rgba(153,102,255,0.25)` : 'none',
            transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {redeeming === 'page' ? <><Spinner size={10} color={C.purple} /> UNLOCKING...</> : '🔓 SNIPER 24HR — 50 PTS'}
        </button>
      </div>

      {msg && (
        <div style={{
          margin: '0 16px 12px', padding: '8px 12px', borderRadius: 4, fontSize: 9,
          color: msg.ok ? C.green : C.red,
          background: msg.ok ? 'rgba(0,255,136,0.06)' : 'rgba(255,51,85,0.06)',
          border: `1px solid ${msg.ok ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,85,0.2)'}`,
          animation: 'conFade 0.3s ease both',
        }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

/* ─── ACTIVE VIEW (tabbed — status + history) ───────────────────────────── */
function ActiveView({ access, wallet, onDisconnect }: {
  access: AccessInfo; wallet: string; onDisconnect: () => void;
}) {
  const [tab,     setTab]     = useState<'status' | 'history'>('status');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'history') return;
    setLoading(true);
    fetch(`/api/nft/wallet-history/${wallet}`)
      .then(r => r.json())
      .then(d => setHistory(d.history || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [tab, wallet]);

  const eventColor = (e: string) => {
    if (e === 'MINT')    return C.cyan;
    if (e === 'RENEW')   return C.green;
    if (e === 'REVOKE')  return C.red;
    if (e === 'CLAIM')   return C.orange;
    if (e === 'RESTORE') return C.purple;
    return C.dim;
  };
  const eventIcon = (e: string) => {
    if (e === 'MINT')    return '◈';
    if (e === 'RENEW')   return '↻';
    if (e === 'REVOKE')  return '⚑';
    if (e === 'CLAIM')   return '⬡';
    if (e === 'RESTORE') return '✓';
    return '▸';
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px', fontFamily: FM, color: C.text }}>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}`,
      }}>
        <div>
          <div style={{ fontFamily: FH, fontSize: 20, letterSpacing: 4, color: C.text }}>
            PROTOCOL<span style={{ color: C.cyan }}>HUB</span>
          </div>
          <div style={{ fontSize: 8, color: C.faint, letterSpacing: 3, marginTop: 2 }}>NFT ACCESS TERMINAL</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LiveDot color={C.green} />
          <span style={{ fontSize: 9, color: C.dim }}>{wallet.slice(0, 6)}...{wallet.slice(-4)}</span>
          <button onClick={onDisconnect}
            style={{
              fontFamily: FM, fontSize: 8, letterSpacing: 1,
              color: C.faint, background: 'transparent',
              border: `1px solid ${C.border}`, borderRadius: 3,
              padding: '3px 8px', cursor: 'pointer',
            }}>DISCONNECT</button>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        padding: '14px 18px', border: '1px solid rgba(0,255,136,0.2)',
        borderRadius: 6, background: 'rgba(0,255,136,0.04)',
        animation: 'conFade 0.4s ease both',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '1px solid rgba(0,255,136,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,255,136,0.06)', fontSize: 16, color: C.green, flexShrink: 0,
        }}>✓</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: 2, marginBottom: 2 }}>
            ACCESS ACTIVE
          </div>
          <div style={{ fontSize: 9, color: C.dim }}>
            Your ProtocolHub NFT is valid — navigate to any panel
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, fontFamily: FM }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 7, color: 'rgba(0,255,136,0.4)', letterSpacing: 2, marginBottom: 3 }}>TIER</div>
            <TierBadge tier={access.tier ?? 'bronze'} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 7, color: 'rgba(0,255,136,0.4)', letterSpacing: 2, marginBottom: 3 }}>EXPIRES</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{access.daysLeft}d</div>
          </div>
          {access.mintNumber && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: 'rgba(0,255,136,0.4)', letterSpacing: 2, marginBottom: 3 }}>MINT #</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.cyan }}>#{access.mintNumber}</div>
            </div>
          )}
        </div>
      </div>

      <PointsCard wallet={wallet} access={access} onRedeemSuccess={() => {
        fetch(`/api/nft/check/${wallet}`)
          .then(r => r.json())
          .catch(() => {});
      }} />

      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
        {([
          { id: 'status',  label: '◈ MY NFT' },
          { id: 'history', label: '▸ HISTORY' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontFamily: FM, fontSize: 9, letterSpacing: 2, padding: '9px 18px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: tab === t.id ? C.cyan : C.dim,
            borderBottom: `2px solid ${tab === t.id ? C.cyan : 'transparent'}`,
            marginBottom: -1, transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'status' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'conFade 0.3s ease' }}>
          {[
            { label: 'WALLET',         value: wallet },
            { label: 'TIER',           value: (access.tier ?? 'bronze').toUpperCase() },
            { label: 'MINT ADDRESS',   value: access.mintAddress ?? '—' },
            { label: 'EXPIRES',        value: access.expiresAt ? new Date(access.expiresAt).toLocaleDateString() : '—' },
            { label: 'DAYS REMAINING', value: access.daysLeft != null ? `${access.daysLeft} days` : '—' },
            { label: 'ORIGINAL PRICE', value: access.originalPrice != null ? `$${access.originalPrice} USDC` : '—' },
            { label: 'SOURCE',         value: (access.source ?? 'nft').toUpperCase() },
          ].map((row, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', border: `1px solid ${C.border}`,
              borderRadius: 4, background: C.bgCard,
            }}>
              <span style={{ fontSize: 8, color: C.faint, letterSpacing: 2 }}>{row.label}</span>
              <span style={{ fontSize: 10, color: C.text, fontFamily: FM, wordBreak: 'break-all', textAlign: 'right', maxWidth: '60%' }}>
                {row.value}
              </span>
            </div>
          ))}

          {access.mintAddress && (
            <a href={`https://solscan.io/token/${access.mintAddress}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'block', textAlign: 'center', padding: '10px',
                border: `1px solid ${C.borderHi}`, borderRadius: 4,
                color: C.cyan, fontSize: 9, fontFamily: FM, letterSpacing: 2,
                textDecoration: 'none', background: C.cyanFaint,
              }}>
              VIEW ON SOLSCAN ↗
            </a>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div style={{ animation: 'conFade 0.3s ease' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40, gap: 10, color: C.dim }}>
              <Spinner /> <span style={{ fontSize: 10, letterSpacing: 2 }}>LOADING HISTORY...</span>
            </div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.faint, fontSize: 10 }}>
              No history found
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 15, top: 0, bottom: 0, width: 1,
                background: `linear-gradient(180deg, ${C.borderHi}, transparent)`,
              }} />
              {history.map((entry: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', gap: 16, marginBottom: 20,
                  animation: `conFade 0.2s ease ${Math.min(i, 15) * 0.04}s both`,
                }}>
                  <div style={{ flexShrink: 0, width: 30, display: 'flex', justifyContent: 'center' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: `${eventColor(entry.event)}12`,
                      border: `1px solid ${eventColor(entry.event)}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: eventColor(entry.event), zIndex: 1,
                      boxShadow: `0 0 10px ${eventColor(entry.event)}20`,
                    }}>
                      {eventIcon(entry.event)}
                    </div>
                  </div>
                  <div style={{ flex: 1, paddingTop: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: 2,
                          color: eventColor(entry.event),
                          padding: '2px 8px', borderRadius: 3,
                          background: `${eventColor(entry.event)}10`,
                          border: `1px solid ${eventColor(entry.event)}30`,
                        }}>{entry.event}</span>
                        {entry.price_usd && (
                          <span style={{ fontSize: 9, color: C.dim }}>${entry.price_usd} USDC</span>
                        )}
                      </div>
                      <span style={{ fontSize: 8, color: C.faint, fontFamily: FM }}>
                        {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                      </span>
                    </div>
                    {entry.detail && (
                      <div style={{ fontSize: 9, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>
                        {entry.detail}
                      </div>
                    )}
                    {entry.tx_sig && (
                      <a href={`https://solscan.io/tx/${entry.tx_sig}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 8, color: C.cyanDim, fontFamily: FM,
                          display: 'inline-block', marginTop: 4, textDecoration: 'none', letterSpacing: 1 }}>
                        {entry.tx_sig.slice(0, 14)}... ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ─── DETECT MOBILE ─────────────────────────────────────────────────────── */
const isMobile = typeof navigator !== 'undefined' &&
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/* ─── WALLET CONFIG ──────────────────────────────────────────────────────── */
const WALLETS = [
  {
    name: 'Phantom',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/phantom/icon.png',
    adapter: 'phantom',
    deepLink: (url: string) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
    installUrl: 'https://phantom.app',
  },
  {
    name: 'Solflare',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/solflare/icon.svg',
    adapter: 'solflare',
    deepLink: (url: string) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
    installUrl: 'https://solflare.com',
  },
  {
    name: 'Backpack',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/backpack/icon.png',
    adapter: 'backpack',
    deepLink: (url: string) => `https://backpack.app/browse/${encodeURIComponent(url)}`,
    installUrl: 'https://backpack.app',
  },
];

/* ─── WALLET BUTTON (header) ─────────────────────────────────────────────── */
function WalletButton({ onOpen }: { onOpen: () => void }) {
  const { wallet, publicKey, disconnect, connecting } = useWallet();
  const address = publicKey?.toBase58();

  if (connecting) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Spinner size={12} />
        <span style={{ fontSize: 9, color: C.dim, fontFamily: FM, letterSpacing: 1 }}>
          CONNECTING...
        </span>
        <button onClick={() => disconnect()}
          style={{
            fontFamily: FM, fontSize: 8, letterSpacing: 1,
            color: C.faint, background: 'transparent',
            border: `1px solid ${C.border}`, borderRadius: 3,
            padding: '4px 10px', cursor: 'pointer',
          }}>✕ CANCEL</button>
      </div>
    );
  }

  if (address) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <LiveDot color={C.green} />
        {wallet?.adapter?.icon && (
          <img src={wallet.adapter.icon} alt="" style={{ width: 14, height: 14, borderRadius: 3 }} />
        )}
        <span style={{ fontSize: 9, color: C.dim, fontFamily: FM }}>
          {address.slice(0, 4)}...{address.slice(-4)}
        </span>
        <button onClick={() => disconnect()}
          style={{
            fontFamily: FM, fontSize: 8, letterSpacing: 1,
            color: C.faint, background: 'transparent',
            border: `1px solid ${C.border}`, borderRadius: 3,
            padding: '3px 8px', cursor: 'pointer',
          }}>DISCONNECT</button>
      </div>
    );
  }

  return (
    <button onClick={onOpen}
      style={{
        fontFamily: FM, fontSize: 9, letterSpacing: 2,
        color: C.cyan, background: C.cyanFaint,
        border: `1px solid ${C.borderHi}`, borderRadius: 3,
        padding: '5px 14px', cursor: 'pointer',
      }}>
      CONNECT
    </button>
  );
}

/* ─── WALLET SELECTOR MODAL ──────────────────────────────────────────────── */
function WalletSelectorModal({ onClose, onSelected }: { onClose: () => void; onSelected: () => void }) {
  const { select, wallets, connecting, wallet: activeWallet, disconnect } = useWallet();
  const [selected, setSelected] = useState<string | null>(null);
  const [solflareExpanded, setSolflareExpanded] = useState(false);

  function handleSelect(w: typeof WALLETS[0]) {
    const encodedUrl    = encodeURIComponent(window.location.href);
    const encodedOrigin = encodeURIComponent(window.location.origin);

    if (w.name === 'Phantom') {
      if ((window as any).phantom?.solana) {
        const adapter = wallets.find(a => a.adapter.name.toLowerCase() === 'phantom');
        if (adapter) { setSelected(w.name); select(adapter.adapter.name as any); onSelected(); }
        return;
      }
      window.location.href = `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedOrigin}`;
      return;
    }

    if (w.name === 'Backpack') {
      if ((window as any).backpack?.solana) {
        const adapter = wallets.find(a => a.adapter.name.toLowerCase() === 'backpack');
        if (adapter) { setSelected(w.name); select(adapter.adapter.name as any); onSelected(); }
        return;
      }
      window.location.href = `https://backpack.app/browse/${encodedUrl}`;
      return;
    }

    const adapter = wallets.find(a => a.adapter.name.toLowerCase() === w.name.toLowerCase());
    if (adapter) { setSelected(w.name); select(adapter.adapter.name as any); onSelected(); }
    else window.open(w.installUrl, '_blank');
  }

  function handleBack() {
    if (selected) { disconnect(); setSelected(null); }
    else onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(6px)',
      animation: 'conIn 0.2s ease both',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#020408', border: `1px solid ${C.borderHi}`,
        borderRadius: 8, width: 360, maxWidth: '92vw',
        padding: '24px 20px', fontFamily: FM,
        animation: 'conFade 0.25s ease both',
        boxShadow: '0 0 60px rgba(0,180,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {selected && (
              <button onClick={handleBack}
                style={{
                  background: 'transparent', border: `1px solid ${C.border}`,
                  color: C.dim, borderRadius: 3, padding: '3px 8px',
                  cursor: 'pointer', fontSize: 10, fontFamily: FM,
                }}>← BACK</button>
            )}
            <div>
              <div style={{ fontSize: 11, letterSpacing: 3, color: C.text, fontWeight: 700 }}>
                {selected ? `CONNECTING TO ${selected.toUpperCase()}` : 'SELECT WALLET'}
              </div>
              {isMobile && !selected && (
                <div style={{ fontSize: 8, color: C.faint, marginTop: 3, letterSpacing: 1 }}>
                  Opens wallet app on mobile
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose}
            style={{
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.dim, borderRadius: 3, padding: '4px 8px',
              cursor: 'pointer', fontSize: 12, lineHeight: 1,
            }}>✕</button>
        </div>

        {selected && connecting ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <Spinner size={24} />
            </div>
            <div style={{ fontSize: 10, color: C.dim, letterSpacing: 2 }}>
              Waiting for {selected}...
            </div>
            <div style={{ fontSize: 9, color: C.faint, marginTop: 8 }}>
              {isMobile ? 'Check your wallet app' : 'Approve in your wallet extension'}
            </div>
            <button onClick={handleBack}
              style={{
                marginTop: 20, fontFamily: FM, fontSize: 9, letterSpacing: 2,
                color: C.dim, background: 'transparent',
                border: `1px solid ${C.border}`, borderRadius: 4,
                padding: '8px 20px', cursor: 'pointer',
              }}>← CHOOSE DIFFERENT WALLET</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {WALLETS.map((w) => {
              const detected = isMobile ? true :
                w.name === 'Phantom'  ? !!(window as any).phantom?.solana || !!(window as any).solana?.isPhantom :
                w.name === 'Solflare' ? !!(window as any).solflare :
                w.name === 'Backpack' ? !!(window as any).backpack?.solana || !!(window as any).xnft :
                false;

              return (
                <React.Fragment key={w.name}>
                {w.name === 'Solflare' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={() => setSolflareExpanded(v => !v)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '14px 16px', background: 'rgba(0,180,255,0.02)',
                        border: `1px solid ${solflareExpanded ? C.borderHi : C.border}`, borderRadius: 6,
                        cursor: 'pointer', transition: 'all 0.15s', width: '100%', textAlign: 'left',
                      }}
                    >
                      <img src={w.icon} alt={w.name}
                        style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: C.text, fontWeight: 600, marginBottom: 2 }}>Solflare</div>
                        <div style={{ fontSize: 8, letterSpacing: 1, color: C.faint }}>WEB EXTENSION + MOBILE APP</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
                        <span style={{ fontSize: 10, color: C.dim }}>{solflareExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {solflareExpanded && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 12, animation: 'conFade 0.2s ease both' }}>
                        <button onClick={() => {
                          const adapter = wallets.find(a => a.adapter.name.toLowerCase() === 'solflare');
                          if (adapter) { setSelected('Solflare'); select(adapter.adapter.name as any); onSelected(); }
                          else window.open('https://solflare.com', '_blank');
                        }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', background: 'rgba(0,180,255,0.02)',
                            border: `1px solid ${C.border}`, borderRadius: 5,
                            cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderHi; (e.currentTarget as HTMLElement).style.background = C.cyanFaint; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = 'rgba(0,180,255,0.02)'; }}
                        >
                          <span style={{ fontSize: 14 }}>🌐</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: C.text, marginBottom: 1 }}>Browser Extension</div>
                            <div style={{ fontSize: 8, color: C.faint, letterSpacing: 1 }}>
                              {!!(window as any).solflare ? '● DETECTED' : '○ NOT INSTALLED'}
                            </div>
                          </div>
                        </button>

                        <button onClick={() => {
                          const encodedUrl = encodeURIComponent(window.location.href);
                          window.location.href = `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodeURIComponent(window.location.origin)}`;
                        }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', background: 'rgba(0,180,255,0.02)',
                            border: `1px solid ${C.border}`, borderRadius: 5,
                            cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderHi; (e.currentTarget as HTMLElement).style.background = C.cyanFaint; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = 'rgba(0,180,255,0.02)'; }}
                        >
                          <span style={{ fontSize: 14 }}>📱</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: C.text, marginBottom: 1 }}>Mobile App</div>
                            <div style={{ fontSize: 8, color: C.faint, letterSpacing: 1 }}>OPENS IN SOLFLARE APP</div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button key={w.name} onClick={() => handleSelect(w)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px', background: 'rgba(0,180,255,0.02)',
                      border: `1px solid ${C.border}`, borderRadius: 6,
                      cursor: 'pointer', transition: 'all 0.15s', width: '100%', textAlign: 'left',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderHi; (e.currentTarget as HTMLElement).style.background = C.cyanFaint; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = 'rgba(0,180,255,0.02)'; }}
                  >
                    <img src={w.icon} alt={w.name}
                      style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: C.text, fontWeight: 600, marginBottom: 2 }}>{w.name}</div>
                      <div style={{ fontSize: 8, letterSpacing: 1, color: detected ? C.faint : 'rgba(255,51,85,0.5)' }}>
                        {isMobile ? 'TAP TO OPEN IN WALLET APP' : (detected ? '● DETECTED' : '○ NOT INSTALLED')}
                      </div>
                    </div>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: detected ? C.green : C.faint,
                      boxShadow: detected ? `0 0 6px ${C.green}` : 'none',
                    }} />
                  </button>
                )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 8, color: C.faint, textAlign: 'center', lineHeight: 1.6 }}>
          {isMobile
            ? 'On mobile, tap a wallet to open it directly in the wallet app'
            : 'New to Solana wallets? We recommend Phantom for beginners'}
        </div>
      </div>
    </div>
  );
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────────────────── */
export default function ConnectPanel() {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new BackpackWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint="https://api.mainnet-beta.solana.com">
      <WalletProvider wallets={wallets} autoConnect>
        <ConnectPanelInner />
      </WalletProvider>
    </ConnectionProvider>
  );
}

function ConnectPanelInner() {
  const { publicKey, disconnect, connecting } = useWallet();
  const [phantomDirectWallet, setPhantomDirectWallet] = useState<string | null>(null);
  const wallet = publicKey?.toBase58() ?? phantomDirectWallet ?? null;

  const [walletModal, setWalletModal] = useState(false);
  const [access,    setAccess]    = useState<AccessInfo | null>(null);
  const [price,     setPrice]     = useState<PriceInfo | null>(null);
  const [checking,  setChecking]  = useState(false);
  const [showMint,  setShowMint]  = useState(false);
  const [activeTab, setActiveTab] = useState<'mint' | 'renew' | 'claim'>('mint');

  const loadPrice = useCallback(async () => {
    try {
      const data = await cachedFetch<PriceInfo>('nft_price', async () => {
        const r = await fetch('/api/nft/price');
        return r.json();
      }, 60);
      setPrice(data);
    } catch {}
  }, []);

  const checkAccess = useCallback(async (w: string) => {
    setChecking(true);
    try {
      const r = await fetch(`/api/nft/check/${w}`);
      const data: AccessInfo = await r.json();
      setAccess(data);
      if (data.hasAccess) {
        setShowMint(false);
        (window as any).__walletPublicKey = w;
        localStorage.setItem('connectedWallet', w);
        window.dispatchEvent(new CustomEvent('wallet-connected', { detail: { wallet: w } }));
      }
    } catch {
      setAccess({ hasAccess: false, status: 'none' });
    }
    setChecking(false);
  }, []);

  useEffect(() => { loadPrice(); }, [loadPrice]);

  useEffect(() => {
    if (wallet) checkAccess(wallet);
    else setAccess(null);
  }, [wallet]);

  useEffect(() => {
    const phantom = (window as any).phantom?.solana;
    if (!phantom || wallet) return;

    async function tryPhantomDirect() {
      try {
        if (phantom.isConnected && phantom.publicKey) {
          const pk = phantom.publicKey.toString();
          setPhantomDirectWallet(pk);
          checkAccess(pk);
          return;
        }
        const resp = await phantom.connect();
        const pk = resp.publicKey.toString();
        setPhantomDirectWallet(pk);
        checkAccess(pk);
      } catch {}
    }

    tryPhantomDirect();

    phantom.on?.('accountChanged', (pk: any) => {
      if (pk) { setPhantomDirectWallet(pk.toString()); checkAccess(pk.toString()); }
      else { setPhantomDirectWallet(null); setAccess(null); }
    });
  }, []);

  function handleMintSuccess() {
    if (wallet) checkAccess(wallet);
  }

  if (access?.hasAccess && access.status === 'active') {
    return (
      <ActiveView
        access={access}
        wallet={wallet!}
        onDisconnect={() => {
          disconnect();
          setPhantomDirectWallet(null);
          setAccess(null);
          (window as any).phantom?.solana?.disconnect?.();
          (window as any).__walletPublicKey = null;
          localStorage.removeItem('connectedWallet');
          window.dispatchEvent(new CustomEvent('wallet-disconnected'));
        }}
      />
    );
  }

  return (
    <div style={{
      maxWidth: 680, margin: '0 auto', padding: '24px 16px',
      fontFamily: FM, color: C.text,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, paddingBottom: 16,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div>
          <div style={{ fontFamily: FH, fontSize: 20, letterSpacing: 4, color: C.text }}>
            PROTOCOL<span style={{ color: C.cyan }}>HUB</span>
          </div>
          <div style={{ fontSize: 8, color: C.faint, letterSpacing: 3, marginTop: 2 }}>NFT ACCESS TERMINAL</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {wallet && <LiveDot color={C.green} />}
          <WalletButton onOpen={() => setWalletModal(true)} />
        </div>
      </div>

      {/* Loading */}
      {(checking || connecting) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '60px 0', gap: 10, color: C.dim,
          animation: 'conIn 0.3s ease both',
        }}>
          <Spinner />
          <span style={{ fontSize: 9, letterSpacing: 3, animation: 'conBlink 1.2s step-end infinite' }}>
            {connecting ? 'CONNECTING...' : 'CHECKING ACCESS...'}
          </span>
        </div>
      )}

      {!checking && !connecting && !wallet && (
        <NoWalletState onConnect={() => setWalletModal(true)} />
      )}

      {!checking && wallet && access?.status === 'revoked' && (
        <RevokedState info={access} />
      )}

      {!checking && wallet && access?.status === 'grace' && price && (
        <GraceState
          info={access}
          price={price}
          solPrice={price.solPrice}
          solUsd={price.solUsd}
          onMint={() => setShowMint(true)}
        />
      )}

      {!checking && wallet && (access?.status === 'none' || access?.status === 'expired' || access?.status === 'gate_open') && (
        <>
          {access.status === 'expired' && (
            <div style={{
              padding: '10px 14px', marginBottom: 20,
              border: '1px solid rgba(255,170,0,0.25)', borderRadius: 4,
              background: 'rgba(255,170,0,0.04)', fontSize: 10, color: C.orange,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚑</span> Your NFT has expired and the grace period has passed — mint at current price
            </div>
          )}

          {access.status === 'gate_open' && (
            <div style={{
              padding: '10px 14px', marginBottom: 20,
              border: `1px solid ${C.borderHi}`, borderRadius: 4,
              background: C.cyanFaint, fontSize: 10, color: C.cyan,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <LiveDot /> Platform is currently open — mint an NFT to lock in early pricing
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
            {([
              { id: 'mint',  label: '◈ MINT NFT' },
              { id: 'claim', label: '⬡ CLAIM TRANSFER' },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{
                  fontFamily: FM, fontSize: 9, letterSpacing: 2,
                  color: activeTab === t.id ? C.cyan : C.dim,
                  background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${activeTab === t.id ? C.cyan : 'transparent'}`,
                  padding: '8px 16px', cursor: 'pointer',
                  marginBottom: -1, transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'mint' && price && (
            <MintPanel wallet={wallet} price={price} onSuccess={handleMintSuccess} />
          )}

          {activeTab === 'claim' && (
            <ClaimPanel wallet={wallet} onSuccess={handleMintSuccess} />
          )}
        </>
      )}

      {walletModal && (
        <WalletSelectorModal
          onClose={() => setWalletModal(false)}
          onSelected={() => setWalletModal(false)}
        />
      )}

      {/* Price info bar */}
      {price && !checking && wallet && access?.status !== 'revoked' && (
        <div style={{
          marginTop: 24, padding: '10px 14px',
          border: `1px solid ${C.border}`, borderRadius: 4,
          display: 'flex', gap: 20, flexWrap: 'wrap',
          fontSize: 9, color: C.faint, fontFamily: FM,
        }}>
          <span>SOL/USD: <span style={{ color: C.dim }}>${price.solUsd?.toFixed(0) ?? '—'}</span></span>
          <span>MINTED: <span style={{ color: C.cyan }}>{price.minted} / 2000</span></span>
          <span>REMAINING (EARLY): <span style={{ color: price.remaining < 200 ? C.red : C.dim }}>{price.remaining}</span></span>
          <span>CURRENT PRICE: <span style={{ color: C.text }}>${price.usdPrice} USDC</span></span>
        </div>
      )}
    </div>
  );
}

/* ─── CLAIM PANEL (secondary market) ────────────────────────────────────── */
function ClaimPanel({ wallet, onSuccess }: { wallet: string; onSuccess: () => void }) {
  const [mintAddress, setMintAddress] = useState('');
  const [claiming,    setClaiming]    = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState(false);

  async function handleClaim() {
    if (!mintAddress.trim()) { setError('Enter the NFT mint address'); return; }
    setClaiming(true); setError(null);
    try {
      const res = await fetch('/api/nft/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, mintAddress: mintAddress.trim() }),
      });
      const data = await res.json();
      if (data.success) { setSuccess(true); onSuccess(); }
      else setError(data.error || 'Claim failed');
    } catch { setError('Network error — please try again'); }
    setClaiming(false);
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', animation: 'conFade 0.5s ease both' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
        <div style={{ fontFamily: FH, fontSize: 22, letterSpacing: 4, color: C.green }}>CLAIM SUCCESSFUL</div>
        <div style={{ fontSize: 10, color: C.dim, marginTop: 8 }}>Access activated for your wallet</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'conFade 0.4s ease both' }}>
      <div style={{
        padding: '14px 16px', border: `1px solid ${C.border}`, borderRadius: 5,
        background: C.bgCard, fontSize: 10, color: C.dim, lineHeight: 1.7,
      }}>
        <div style={{ color: C.text, fontWeight: 700, marginBottom: 6 }}>⬡ SECONDARY MARKET CLAIM</div>
        If you purchased a ProtocolHub NFT on a secondary marketplace (Magic Eden, Tensor, etc.),
        enter the mint address below to activate access for your wallet.<br /><br />
        <span style={{ color: C.orange, fontSize: 9 }}>
          ⚑ Note: Price lock does not transfer. Renewal will be at current market price.
        </span>
      </div>

      <div>
        <div style={{ fontSize: 8, color: C.faint, letterSpacing: 2, marginBottom: 6 }}>NFT MINT ADDRESS</div>
        <input
          value={mintAddress} onChange={e => setMintAddress(e.target.value)}
          placeholder="Paste mint address from your wallet..."
          style={{
            width: '100%', background: C.bgCard, border: `1px solid ${C.border}`,
            borderRadius: 4, padding: '10px 12px', color: C.text, fontFamily: FM,
            fontSize: 10, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', background: 'rgba(255,51,85,0.08)',
          border: '1px solid rgba(255,51,85,0.25)', borderRadius: 4,
          fontSize: 10, color: C.red, animation: 'conShake 0.4s ease both',
        }}>
          ⚑ {error}
        </div>
      )}

      <button
        onClick={handleClaim} disabled={claiming || !mintAddress.trim()}
        style={{
          fontFamily: FM, fontSize: 11, letterSpacing: 3, fontWeight: 700,
          color: claiming ? C.dim : '#000', background: claiming ? C.cyanFaint : C.cyan,
          border: `1px solid ${claiming ? C.border : C.cyan}`, borderRadius: 4,
          padding: '12px', cursor: claiming ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: claiming ? 'none' : `0 0 20px rgba(0,180,255,0.25)`,
          transition: 'all 0.2s',
        }}
      >
        {claiming ? <><Spinner size={12} /> CLAIMING...</> : '⬡ CLAIM ACCESS'}
      </button>
    </div>
  );
}
