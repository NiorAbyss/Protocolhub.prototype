'use client';
// client/src/components/WalletGate.tsx
// Full access gate — wraps the entire dashboard.
// Screens: connect → checking → mint | revoked | expired → dashboard (children)

import { useState, useEffect } from 'react';
import { useWalletAccess } from '../hooks/useWalletAccess';

const FONT = '"IBM Plex Mono", "Courier New", monospace';

export default function WalletGate({ children }: { children: React.ReactNode }) {
  const {
    wallet, access, nftPrice, mintSim, connecting,
    mintState, mintError, hasProvider,
    connect, disconnect, simulateMint, executeMint, submitAppeal,
  } = useWalletAccess();

  if (access.status === 'active') return <>{children}</>;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:FONT, overflow:'hidden' }}>
      {/* Background effects */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(0,180,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.035) 1px,transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none' }} />
      <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,180,255,0.012) 2px,rgba(0,180,255,0.012) 4px)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle,rgba(0,80,255,0.04) 0%,transparent 70%)', pointerEvents:'none' }} />

      {/* Card */}
      <div style={{ position:'relative', width:460, background:'rgba(0,0,0,0.92)', border:'1px solid rgba(0,180,255,0.18)', borderRadius:16, padding:'40px 40px 32px', boxShadow:'0 0 80px rgba(0,150,255,0.08)' }}>
        <Logo />

        {access.status === 'loading'      && <LoadingScreen />}
        {access.status === 'disconnected' && <ConnectScreen connect={connect} connecting={connecting} hasProvider={hasProvider} />}
        {access.status === 'checking'     && <CheckingScreen wallet={wallet!} />}
        {access.status === 'none'         && (
          <MintScreen wallet={wallet!} nftPrice={nftPrice} mintSim={mintSim}
            mintState={mintState} mintError={mintError}
            onSimulate={() => simulateMint(wallet!)}
            onMint={executeMint} onDisconnect={disconnect} />
        )}
        {access.status === 'revoked'      && <RevokeScreen access={access} submitAppeal={submitAppeal} onDisconnect={disconnect} />}
        {access.status === 'expired'      && <ExpiredScreen access={access} nftPrice={nftPrice} onDisconnect={disconnect} />}
      </div>
    </div>
  );
}

/* ─── LOGO ─────────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <div style={{ textAlign:'center', marginBottom:32 }}>
      <div style={{ fontSize:9, letterSpacing:6, color:'rgba(0,180,255,0.3)', marginBottom:6 }}>◈ ◈ ◈</div>
      <div style={{ fontSize:22, fontWeight:700, color:'#0099ff', letterSpacing:3 }}>
        PROTOCOL<span style={{ color:'rgba(0,180,255,0.4)' }}>HUB</span>
      </div>
      <div style={{ fontSize:8, letterSpacing:4, color:'rgba(0,120,255,0.35)', marginTop:4 }}>WEB3 INTELLIGENCE TERMINAL</div>
    </div>
  );
}

/* ─── SCREENS ───────────────────────────────────────────────────────────── */
function LoadingScreen() {
  return (
    <div style={{ textAlign:'center', padding:'20px 0' }}>
      <Spinner />
      <div style={{ color:'rgba(0,180,255,0.4)', fontSize:10, letterSpacing:2, marginTop:12 }}>INITIALIZING...</div>
    </div>
  );
}

function ConnectScreen({ connect, connecting, hasProvider }: { connect:()=>void; connecting:boolean; hasProvider:boolean }) {
  return (
    <div>
      <Label>ACCESS REQUIRED</Label>
      <p style={{ color:'rgba(0,150,255,0.55)', fontSize:11, lineHeight:1.7, marginBottom:28, textAlign:'center' }}>
        ProtocolHub is a token-gated intelligence terminal.<br />Connect your Solana wallet to verify access.
      </p>
      <Btn onClick={connect} disabled={connecting}>
        {connecting ? <><Spinner small /> CONNECTING...</> : '◈  CONNECT WALLET'}
      </Btn>
      {!hasProvider && (
        <p style={{ color:'rgba(255,120,0,0.5)', fontSize:9, textAlign:'center', marginTop:14, letterSpacing:1 }}>
          No wallet detected — Phantom will open in a new tab.
        </p>
      )}
      <div style={{ display:'flex', justifyContent:'center', gap:16, marginTop:24 }}>
        {['Phantom','Solflare'].map(w => <div key={w} style={{ color:'rgba(0,120,255,0.3)', fontSize:9, letterSpacing:1 }}>◎ {w.toUpperCase()}</div>)}
      </div>
      <Hr />
      <Row label="ACCESS TYPE"  value="NFT PASS — SOLANA" />
      <Row label="DURATION"     value="30 DAYS / MINT" />
      <Row label="EARLY PRICE"  value="$30 (first 2,000 mints)" />
    </div>
  );
}

function CheckingScreen({ wallet }: { wallet:string }) {
  return (
    <div style={{ textAlign:'center', padding:'10px 0 20px' }}>
      <Spinner />
      <div style={{ color:'rgba(0,180,255,0.4)', fontSize:10, letterSpacing:2, marginTop:12, marginBottom:8 }}>SCANNING WALLET</div>
      <WalletPill wallet={wallet} />
    </div>
  );
}

function MintScreen({ wallet, nftPrice, mintSim, mintState, mintError, onSimulate, onMint, onDisconnect }: any) {
  const [started, setStarted] = useState(false);
  useEffect(() => { if (!started) { setStarted(true); onSimulate(); } }, []);

  const busy    = ['signing','confirming','simulating'].includes(mintState);
  const success = mintState === 'success';

  return (
    <div>
      <Label>NO ACCESS PASS FOUND</Label>
      <WalletPill wallet={wallet} onDisconnect={onDisconnect} />

      <div style={{ marginTop:18, marginBottom:18 }}>
        <Row label="STATUS"       value="NOT MINTED" negative />
        <Row label="PASS TYPE"    value="BRONZE — 30 DAYS" />
        {nftPrice && <>
          <Row label="PRICE"        value={`$${nftPrice.usdPrice} (${nftPrice.solPrice} SOL)`} />
          <Row label="REMAINING"    value={`${nftPrice.remaining.toLocaleString()} / 2,000 EARLY`} />
          <Row label="NETWORK FEE"  value={mintSim ? `~${mintSim.estimatedFeeSol.toFixed(5)} SOL ($${mintSim.estimatedFeeUsd.toFixed(2)})` : '…calculating'} />
          {mintSim && <Row label="TOTAL COST" value={`~${mintSim.totalSol.toFixed(4)} SOL ($${mintSim.totalUsd.toFixed(2)})`} />}
        </>}
      </div>

      {mintError && (
        <div style={{ color:'#ff3355', fontSize:9, letterSpacing:1, textAlign:'center', marginBottom:14, padding:'8px 12px', border:'1px solid rgba(255,51,85,0.2)', borderRadius:6, background:'rgba(255,51,85,0.05)' }}>
          ⚑ {mintError}
        </div>
      )}

      {success ? (
        <div style={{ textAlign:'center', padding:'12px 0' }}>
          <div style={{ color:'#0099ff', fontSize:13, letterSpacing:2, marginBottom:6 }}>◈ ACCESS GRANTED</div>
          <div style={{ color:'rgba(0,180,255,0.4)', fontSize:9, letterSpacing:1 }}>Loading dashboard...</div>
        </div>
      ) : (
        <Btn onClick={onMint} disabled={busy || !mintSim}>
          {mintState==='simulating'  && <><Spinner small /> ESTIMATING FEES...</>}
          {mintState==='signing'     && <><Spinner small /> WAITING FOR SIGNATURE...</>}
          {mintState==='confirming'  && <><Spinner small /> CONFIRMING ON-CHAIN...</>}
          {mintState==='idle'        && '◈  MINT ACCESS PASS'}
          {mintState==='error'       && '↺  RETRY MINT'}
        </Btn>
      )}
      <div style={{ color:'rgba(0,100,255,0.3)', fontSize:8, textAlign:'center', marginTop:12, letterSpacing:0.5, lineHeight:1.6 }}>
        By minting you agree this pass is non-transferable and expires after 30 days. All sales are final.
      </div>
    </div>
  );
}

function RevokeScreen({ access, submitAppeal, onDisconnect }: any) {
  const [mode,    setMode]    = useState<'info'|'appeal'>('info');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const send = async () => {
    if (message.trim().length < 20) { setError('Message too short — please explain your situation.'); return; }
    setSending(true); setError('');
    const res = await submitAppeal(message.trim());
    setSending(false);
    if (res.success) setSent(true); else setError('Failed to submit — please try again.');
  };

  return (
    <div>
      <Label negative>ACCESS REVOKED</Label>
      <WalletPill wallet={access.wallet} onDisconnect={onDisconnect} />

      {mode === 'info' && <>
        <div style={{ marginTop:16, marginBottom:18 }}>
          <Row label="STATUS"     value="REVOKED" negative />
          <Row label="REASON"     value={access.reason || 'Not specified'} />
          <Row label="REVOKED AT" value={access.revokedAt ? new Date(access.revokedAt).toLocaleDateString() : '—'} />
        </div>
        <p style={{ color:'rgba(0,130,255,0.45)', fontSize:10, lineHeight:1.7, marginBottom:20, textAlign:'center' }}>
          Your access has been revoked by an administrator.<br />If you believe this is an error, submit an appeal.
        </p>
        <Btn onClick={() => setMode('appeal')}>SUBMIT APPEAL</Btn>
      </>}

      {mode === 'appeal' && !sent && <>
        <div style={{ marginTop:16 }}>
          <div style={{ color:'rgba(0,150,255,0.4)', fontSize:9, letterSpacing:2, marginBottom:8 }}>APPEAL MESSAGE</div>
          <textarea value={message} onChange={e=>setMessage(e.target.value)}
            placeholder="Explain why your access should be restored..."
            style={{ width:'100%', height:100, resize:'none', background:'rgba(0,60,120,0.08)', border:'1px solid rgba(0,150,255,0.2)', borderRadius:8, padding:'10px 12px', color:'rgba(0,180,255,0.8)', fontFamily:FONT, fontSize:11, outline:'none', boxSizing:'border-box' }} />
          {error && <div style={{ color:'#ff3355', fontSize:9, marginTop:6 }}>⚑ {error}</div>}
        </div>
        <div style={{ display:'flex', gap:10, marginTop:14 }}>
          <SecBtn onClick={() => setMode('info')}>BACK</SecBtn>
          <Btn onClick={send} disabled={sending}>{sending ? <><Spinner small /> SENDING...</> : 'SUBMIT APPEAL'}</Btn>
        </div>
      </>}

      {mode === 'appeal' && sent && (
        <div style={{ textAlign:'center', padding:'20px 0' }}>
          <div style={{ color:'#0099ff', fontSize:12, letterSpacing:2, marginBottom:8 }}>◈ APPEAL SUBMITTED</div>
          <div style={{ color:'rgba(0,150,255,0.4)', fontSize:10, lineHeight:1.7 }}>
            Your appeal has been received.<br />You will be contacted at {access.appealEmail || 'the admin email'}.
          </div>
        </div>
      )}
    </div>
  );
}

function ExpiredScreen({ access, nftPrice, onDisconnect }: any) {
  return (
    <div>
      <Label>PASS EXPIRED</Label>
      <WalletPill wallet={access.wallet} onDisconnect={onDisconnect} />
      <div style={{ marginTop:16, marginBottom:18 }}>
        <Row label="STATUS"     value="EXPIRED" negative />
        <Row label="TIER"       value={access.tier?.toUpperCase() || 'BRONZE'} />
        <Row label="EXPIRED AT" value={access.expiredAt ? new Date(access.expiredAt).toLocaleDateString() : '—'} />
        {nftPrice && <Row label="RENEW PRICE" value={`$${nftPrice.usdPrice} (${nftPrice.solPrice} SOL) — 30 days`} />}
      </div>
      <p style={{ color:'rgba(0,130,255,0.45)', fontSize:10, lineHeight:1.7, marginBottom:20, textAlign:'center' }}>
        Your access pass has expired. Mint a new pass to restore access for another 30 days.
      </p>
      <Btn onClick={() => window.location.reload()}>◈  RENEW ACCESS PASS</Btn>
    </div>
  );
}

/* ─── ATOMS ─────────────────────────────────────────────────────────────── */
function Label({ children, negative }: { children: React.ReactNode; negative?: boolean }) {
  return (
    <div style={{ textAlign:'center', fontSize:9, letterSpacing:3, color: negative ? 'rgba(255,51,85,0.5)' : 'rgba(0,180,255,0.4)', marginBottom:16, borderBottom:`1px solid ${negative ? 'rgba(255,51,85,0.1)' : 'rgba(0,150,255,0.08)'}`, paddingBottom:12 }}>
      {children}
    </div>
  );
}

function Row({ label, value, negative }: { label:string; value:string; negative?:boolean }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid rgba(0,100,255,0.06)' }}>
      <span style={{ color:'rgba(0,120,255,0.35)', fontSize:9, letterSpacing:1 }}>{label}</span>
      <span style={{ color: negative ? '#ff3355' : 'rgba(0,180,255,0.7)', fontSize:9, letterSpacing:1, fontWeight:600 }}>{value}</span>
    </div>
  );
}

function WalletPill({ wallet, onDisconnect }: { wallet:string; onDisconnect?:()=>void }) {
  const short = wallet ? `${wallet.slice(0,4)}...${wallet.slice(-4)}` : '';
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 14px', border:'1px solid rgba(0,150,255,0.12)', borderRadius:6, background:'rgba(0,80,200,0.06)', marginBottom:4 }}>
      <span style={{ fontSize:10, color:'rgba(0,180,255,0.6)', letterSpacing:1 }}>◎ {short}</span>
      {onDisconnect && (
        <button onClick={onDisconnect} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(0,100,255,0.35)', fontSize:8, letterSpacing:1, padding:0 }}>
          DISCONNECT
        </button>
      )}
    </div>
  );
}

function Btn({ onClick, disabled, children }: { onClick:()=>void; disabled?:boolean; children:React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width:'100%', padding:'13px 0', background: disabled ? 'rgba(0,50,100,0.2)' : 'rgba(0,100,255,0.12)', border:`1px solid ${disabled ? 'rgba(0,100,255,0.1)' : 'rgba(0,180,255,0.3)'}`, borderRadius:8, color: disabled ? 'rgba(0,100,255,0.3)' : '#0099ff', fontFamily:FONT, fontSize:11, letterSpacing:3, fontWeight:700, cursor: disabled ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
      {children}
    </button>
  );
}

function SecBtn({ onClick, children }: { onClick:()=>void; children:React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ flex:1, padding:'11px 0', background:'transparent', border:'1px solid rgba(0,100,255,0.12)', borderRadius:8, color:'rgba(0,100,255,0.4)', fontFamily:FONT, fontSize:9, letterSpacing:2, cursor:'pointer' }}>
      {children}
    </button>
  );
}

function Hr() {
  return <div style={{ borderTop:'1px solid rgba(0,100,255,0.07)', margin:'18px 0' }} />;
}

function Spinner({ small }: { small?: boolean }) {
  const size = small ? 10 : 18;
  return (
    <span style={{ display:'inline-block', width:size, height:size, border:'1px solid rgba(0,150,255,0.15)', borderTop:'1px solid rgba(0,180,255,0.7)', borderRadius:'50%', animation:'wg-spin 0.7s linear infinite' }} />
  );
}

// Inject keyframe once
if (typeof document !== 'undefined' && !document.getElementById('wg-spin')) {
  const s = document.createElement('style');
  s.id = 'wg-spin';
  s.textContent = '@keyframes wg-spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}