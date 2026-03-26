// client/src/components/shared/GateGuard.tsx
// Wraps all 4 main panels.
// On mount: fetches /api/gate/status
//   → gate off  → renders children freely
//   → gate on   → checks /api/nft/check/:wallet
//     → valid   → renders children (passes X-Wallet header via axios interceptor)
//     → invalid → renders full-screen gate blocker
//
// Usage in App.tsx:
//   import GateGuard from './components/GateGuard';
//   <GateGuard>
//     {activePanel === 'network'  && <NetworkPanel  />}
//     {activePanel === 'protocol' && <ProtocolPanel />}
//     {activePanel === 'explore'  && <ExplorePanel  />}
//     {activePanel === 'search'   && <SearchPanel   />}
//   </GateGuard>
//
// The guard also injects X-Wallet into every fetch() call automatically
// so panel API routes pass the requireGate middleware on the backend.

import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';

/* ─── FONTS / KEYFRAMES ──────────────────────────────────────────────────── */
if (typeof document !== 'undefined' && !document.getElementById('gate-guard-kf')) {
  const s = document.createElement('style');
  s.id = 'gate-guard-kf';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Bebas+Neue&display=swap');
    @keyframes ggPulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
    @keyframes ggSpin  { to { transform: rotate(360deg); } }
    @keyframes ggFadeIn{ from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:translateY(0);} }
    @keyframes ggGlow  { 0%,100%{box-shadow:0 0 20px rgba(0,180,255,0.15);} 50%{box-shadow:0 0 40px rgba(0,180,255,0.35);} }
  `;
  document.head.appendChild(s);
}

const FM = '"IBM Plex Mono","Courier New",monospace';
const FH = '"Bebas Neue","Impact",sans-serif';
const C = {
  cyan:      '#00b4ff',
  cyanFaint: 'rgba(0,180,255,0.07)',
  border:    'rgba(0,180,255,0.12)',
  green:     '#00ff88',
  red:       '#ff3355',
  orange:    '#ffaa00',
  dim:       'rgba(150,180,210,0.40)',
  text:      'rgba(200,220,240,0.85)',
};

/* ─── WALLET CONTEXT ─────────────────────────────────────────────────────── */
// GateGuard reads the connected wallet from window.__phantomWallet or
// window.__walletPublicKey — set whichever your ConnectPanel uses.
// Also checks localStorage key 'connectedWallet' as fallback.
function getConnectedWallet(): string | null {
  return (
    (window as any).__walletPublicKey     ||
    (window as any).__phantomWallet       ||
    localStorage.getItem('connectedWallet') ||
    null
  );
}

/* ─── FETCH INTERCEPTOR ──────────────────────────────────────────────────── */
// Monkey-patch global fetch to inject X-Wallet header on all /api/ calls
// so the backend requireGate middleware can validate access.
let _fetchPatched = false;
function patchFetch(wallet: string) {
  if (_fetchPatched) return;
  _fetchPatched = true;
  const _origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.startsWith('/api/')) {
      const headers = new Headers((init?.headers as HeadersInit) || {});
      const w = getConnectedWallet() || wallet;
      if (w) headers.set('X-Wallet', w);
      return _origFetch(input, { ...init, headers });
    }
    return _origFetch(input, init);
  };
}

/* ─── TYPES ──────────────────────────────────────────────────────────────── */
type GateState = 'loading' | 'open' | 'blocked_no_wallet' | 'blocked_no_nft' | 'blocked_expired' | 'blocked_revoked' | 'allowed';

/* ─── GATE BLOCKER UI ────────────────────────────────────────────────────── */
function GateBlocker({ state, onRetry, onDismiss }: { state: GateState; onRetry: () => void; onDismiss?: () => void }) {
  const isNoWallet  = state === 'blocked_no_wallet';
  const isExpired   = state === 'blocked_expired';
  const isRevoked   = state === 'blocked_revoked';

  const title   = isNoWallet ? 'WALLET REQUIRED'
                : isExpired  ? 'ACCESS EXPIRED'
                : isRevoked  ? 'ACCESS REVOKED'
                : 'NFT REQUIRED';

  const msg     = isNoWallet ? 'Connect your wallet to access ProtocolHub.'
                : isExpired  ? 'Your NFT access has expired. Renew to continue.'
                : isRevoked  ? 'Your access has been revoked. Contact support via the Connect panel.'
                : 'You need a ProtocolHub NFT to access this platform.';

  const sub     = isNoWallet ? 'Use the CONNECT panel to connect Phantom or any Solana wallet.'
                : isExpired  ? 'Visit the CONNECT panel to renew your subscription.'
                : isRevoked  ? null
                : 'Mint or claim an NFT from the CONNECT panel to unlock access.';

  return (
    <div style={{
      position:       'fixed',
      inset:          0,
      zIndex:         9999,
      background:     'rgba(0,0,0,0.97)',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      fontFamily:     FM,
      animation:      'ggFadeIn 0.35s ease',
    }}>
      {/* Subtle background grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03,
        backgroundImage: 'linear-gradient(rgba(0,180,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,180,255,0.5) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        position:    'relative',
        maxWidth:    380,
        width:       '90%',
        padding:     '36px 32px',
        border:      `1px solid ${C.border}`,
        borderRadius: 10,
        background:  'rgba(4,8,16,0.95)',
        textAlign:   'center',
        animation:   'ggGlow 3s ease-in-out infinite',
      }}>

        {/* Lock icon */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 20px',
          background: `${C.cyan}0d`, border: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24,
        }}>
          {isRevoked ? '⛔' : '🔒'}
        </div>

        {/* Title */}
        <div style={{
          fontFamily:    FH,
          fontSize:      28,
          letterSpacing: 4,
          color:         C.cyan,
          marginBottom:  10,
        }}>
          {title}
        </div>

        {/* Gate badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 3, marginBottom: 18,
          border: `1px solid ${C.red}44`, background: `${C.red}0d`,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, boxShadow: `0 0 6px ${C.red}`, animation: 'ggPulse 2s infinite', display: 'inline-block' }} />
          <span style={{ fontSize: 8, letterSpacing: 2, color: C.red, fontWeight: 700 }}>GATE ACTIVE</span>
        </div>

        {/* Message */}
        <div style={{ fontSize: 11, color: C.text, lineHeight: 1.7, marginBottom: 8 }}>{msg}</div>
        {sub && <div style={{ fontSize: 9, color: C.dim, lineHeight: 1.6, marginBottom: 24 }}>{sub}</div>}

        {/* CTA — opens Connect panel */}
        <button
          onClick={onDismiss}
          disabled={!onDismiss}
          style={{
            width: '100%', padding: '10px 14px', marginBottom: 12,
            border: `1px solid ${C.cyan}44`, borderRadius: 6,
            background: C.cyanFaint, cursor: onDismiss ? 'pointer' : 'default',
            fontSize: 10, color: C.cyan, fontFamily: FM, letterSpacing: 2, fontWeight: 700,
          }}>
          → OPEN CONNECT PANEL
        </button>
        <div style={{ fontSize: 8, color: C.dim, lineHeight: 1.6, marginBottom: 16 }}>
          {isNoWallet ? 'Connect your wallet to verify NFT access.' : isExpired ? 'Renew your NFT subscription to continue.' : 'Mint or claim a ProtocolHub NFT to unlock access.'}
        </div>

        {/* Retry button */}
        <button
          onClick={onRetry}
          style={{
            width:        '100%',
            padding:      '9px',
            borderRadius: 5,
            border:       `1px solid ${C.cyan}44`,
            background:   C.cyanFaint,
            color:        C.cyan,
            fontSize:     9,
            letterSpacing: 2,
            fontWeight:   700,
            cursor:       'pointer',
            fontFamily:   FM,
          }}>
          ↻ CHECK ACCESS AGAIN
        </button>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 20, fontSize: 7, color: 'rgba(255,255,255,0.1)', letterSpacing: 1 }}>
        PROTOCOLHUB · NFT-GATED ACCESS
      </div>
    </div>
  );
}

/* ─── LOADING SCREEN ─────────────────────────────────────────────────────── */
function GateLoading() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: FM,
    }}>
      <div style={{ width: 18, height: 18, border: `1px solid rgba(0,180,255,0.15)`, borderTop: `1px solid ${C.cyan}`, borderRadius: '50%', animation: 'ggSpin 0.8s linear infinite', marginBottom: 14 }} />
      <div style={{ fontSize: 8, letterSpacing: 3, color: C.dim }}>VERIFYING ACCESS</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GATE GUARD
   ═══════════════════════════════════════════════════════════════════════════ */
interface GateGuardProps {
  children:   React.ReactNode;
  onDismiss?: () => void;  // called when user clicks "Go to Connect panel"
}

export default function GateGuard({ children, onDismiss }: GateGuardProps) {
  const [state,   setState]   = useState<GateState>('loading');
  const checkCount = useRef(0);

  const check = useCallback(async () => {
    setState('loading');
    checkCount.current++;

    try {
      // 1. Is the gate even on?
      const gateRes  = await fetch('/api/gate/status');
      const gateData = await gateRes.json();

      if (!gateData.gateLive) {
        setState('open');    // gate off — let everyone in
        return;
      }

      // 2. Gate is live — do we have a wallet?
      const wallet = getConnectedWallet();
      if (!wallet) {
        setState('blocked_no_wallet');
        return;
      }

      // 3. Check NFT access
      const accessRes  = await fetch(`/api/nft/check/${wallet}`);
      const accessData = await accessRes.json();

      if (accessData.hasAccess) {
        patchFetch(wallet);  // inject X-Wallet header into all future fetches
        setState('allowed');
        return;
      }

      // Map status to block state
      if (accessData.status === 'expired')  { setState('blocked_expired'); return; }
      if (accessData.status === 'revoked')  { setState('blocked_revoked'); return; }
      setState('blocked_no_nft');

    } catch {
      // Network error — fail open (don't lock out on server error)
      setState('open');
    }
  }, []);

  // Check on mount + re-check every 60s (catches wallet connect/disconnect)
  useEffect(() => {
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [check]);

  // Listen for wallet connect events from ConnectPanel
  useEffect(() => {
    const handler = () => check();
    window.addEventListener('wallet-connected', handler);
    window.addEventListener('wallet-disconnected', handler);
    return () => {
      window.removeEventListener('wallet-connected', handler);
      window.removeEventListener('wallet-disconnected', handler);
    };
  }, [check]);

  if (state === 'loading') return <GateLoading />;

  if (state === 'open' || state === 'allowed') {
    return <>{children}</>;
  }

  return <GateBlocker state={state} onRetry={check} onDismiss={onDismiss} />;
}