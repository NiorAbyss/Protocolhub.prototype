import { useState, useEffect, useRef, CSSProperties, Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PanelWrapper from './components/shared/PanelWrapper';
import AboutPanel from './components/hud/AboutPanel';
import ProtocolPanel from './components/hud/ProtocolPanel';
import ConnectPanel from './components/hud/ConnectPanel';
import ExplorePanel from './components/hud/ExplorePanel';
import SearchPanel from './components/hud/SearchPanel';
import NetworkPanel from './components/hud/NetworkPanel';
import AdminDashboard from './pages/AdminDashboard.jsx';
import PremiumAura from './components/hud/PremiumAura';
import { trackPanel } from './lib/useAnalytics';

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: any) {
    return { error: err?.message || String(err) };
  }
  componentDidCatch(err: any, info: any) {
    console.error('[ProtocolHub crash]', err, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          background: '#000', color: '#ff3355', fontFamily: 'IBM Plex Mono, monospace',
          padding: 32, minHeight: '100vh', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }}>
          <div style={{ color: '#00b4ff', fontSize: 16, marginBottom: 16, letterSpacing: 2 }}>
            ◈ PROTOCOLHUB — RENDER ERROR
          </div>
          <div style={{ color: '#ff3355', marginBottom: 12 }}>ERROR: {this.state.error}</div>
          <div style={{ color: '#555', fontSize: 11 }}>Check the browser console for full stack trace.</div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 24, background: '#00b4ff', color: '#000', border: 'none', padding: '8px 20px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, cursor: 'pointer' }}
          >
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── GATED PANEL LIST ───────────────────────────────────────────────────────*/
const GATED: Record<string, boolean> = {
  NETWORK:  true,
  PROTOCOL: true,
  EXPLORE:  true,
  SEARCH:   true,
};

function getConnectedWallet(): string | null {
  return (
    (window as any).__walletPublicKey    ||
    (window as any).__phantomWallet      ||
    localStorage.getItem('connectedWallet') ||
    null
  );
}

/* ─── GATE MESSAGE TOAST ─────────────────────────────────────────────────── */
function GateToast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999, fontFamily: '"IBM Plex Mono","Courier New",monospace',
      padding: '10px 20px', borderRadius: 6,
      border: '1px solid rgba(255,51,85,0.4)',
      background: 'rgba(0,0,0,0.92)',
      boxShadow: '0 0 20px rgba(255,51,85,0.2)',
      display: 'flex', alignItems: 'center', gap: 10, minWidth: 260,
      animation: 'fadeInUp 0.2s ease',
    }}>
      <span style={{ fontSize: 14 }}>🔒</span>
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#ff3355', marginBottom: 2 }}>GATE ACTIVE</div>
        <div style={{ fontSize: 9, color: 'rgba(200,220,240,0.75)' }}>{msg}</div>
      </div>
      <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✕</button>
    </div>
  );
}

// ─── STARS — memoised so they don't re-randomise on every render ──────────────
const STARS = Array.from({ length: 25 }, (_, i) => ({
  id: i,
  top:      Math.random() * 100,
  left:     Math.random() * 100,
  duration: 2 + Math.random() * 3,
}));

// ─── MAIN HUD ─────────────────────────────────────────────────────────────────
function HUD() {
  const [isActive, setIsActive]     = useState(false);
  const [battery,  setBattery]      = useState(100);
  const [isCooling, setIsCooling]   = useState(false);
  const [activeTab, setActiveTab]   = useState('NONE');
  const [gateMsg,   setGateMsg]     = useState<string | null>(null);

  const gateCache   = useRef<{ live: boolean; checkedAt: number } | null>(null);
  const accessCache = useRef<{ wallet: string; hasAccess: boolean; checkedAt: number } | null>(null);

  const [features, setFeatures] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadFlags = async () => {
      try {
        const r = await fetch('/api/features');
        const d = await r.json();
        setFeatures(d);
      } catch {}
    };
    loadFlags();
    const t = setInterval(loadFlags, 60_000);
    return () => clearInterval(t);
  }, []);

  const [selectedTokens, setSelectedTokens] = useState(() => {
    try {
      const saved = localStorage.getItem('ph_tokens');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [subscriptionExpiry, setSubscriptionExpiry] = useState(() => {
    try {
      const saved = localStorage.getItem('ph_expiry');
      return saved ? parseInt(saved) : 0;
    } catch { return 0; }
  });

  useEffect(() => {
    document.body.style.overflow = activeTab !== 'NONE' ? 'hidden' : 'unset';
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem('ph_tokens', JSON.stringify(selectedTokens));
      localStorage.setItem('ph_expiry', subscriptionExpiry.toString());
    } catch {}
  }, [selectedTokens, subscriptionExpiry]);

  const [liveStats, setLiveStats] = useState<any>(null);
  useEffect(() => {
    const fetchPulse = async () => {
      try {
        const res = await fetch('/api/pulse');
        const data = await res.json();
        if (data.success) setLiveStats(data.solana);
      } catch {}
    };
    fetchPulse();
    const interval = setInterval(fetchPulse, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval: any;
    if (isActive && battery > 0) {
      interval = setInterval(() => setBattery(b => Math.max(0, b - 1.66)), 1000);
    } else if (!isActive && battery < 100 && !isCooling) {
      interval = setInterval(() => setBattery(b => Math.min(100, b + 1)), 1000);
    }
    if (battery <= 0 && isActive) {
      setIsActive(false);
      setIsCooling(true);
      setTimeout(() => setIsCooling(false), 20000);
    }
    return () => clearInterval(interval);
  }, [isActive, battery, isCooling]);

  const handleAction = async (name: string) => {
    if (!GATED[name]) {
      setActiveTab(name);
      trackPanel(name.toLowerCase());
      return;
    }

    try {
      const now = Date.now();
      let gateLive = false;

      if (gateCache.current && now - gateCache.current.checkedAt < 30_000) {
        gateLive = gateCache.current.live;
      } else {
        const r = await fetch('/api/gate/status');
        const d = await r.json();
        gateLive = !!d.gateLive;
        gateCache.current = { live: gateLive, checkedAt: now };
      }

      if (!gateLive) {
        setActiveTab(name);
        return;
      }

      const wallet = getConnectedWallet();
      if (!wallet) {
        setGateMsg('Connect your wallet in the CONNECT panel to access this.');
        setActiveTab('CONNECT');
        return;
      }

      let hasAccess = false;
      if (
        accessCache.current &&
        accessCache.current.wallet === wallet &&
        now - accessCache.current.checkedAt < 60_000
      ) {
        hasAccess = accessCache.current.hasAccess;
      } else {
        const r2 = await fetch(`/api/nft/check/${wallet}`);
        const d2 = await r2.json();
        hasAccess = !!d2.hasAccess;
        accessCache.current = { wallet, hasAccess, checkedAt: now };
      }

      if (!hasAccess) {
        setGateMsg('You need a Protocol Genesis NFT to access this panel.');
        setActiveTab('CONNECT');
        return;
      }

      setActiveTab(name);
      trackPanel(name.toLowerCase());

    } catch {
      setActiveTab(name);
    }
  };

  useEffect(() => {
    const reset = () => { accessCache.current = null; gateCache.current = null; };
    window.addEventListener('wallet-connected',    reset);
    window.addEventListener('wallet-disconnected', reset);
    return () => {
      window.removeEventListener('wallet-connected',    reset);
      window.removeEventListener('wallet-disconnected', reset);
    };
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/gate/status');
        const d = await r.json();
        const gateLive = !!d.gateLive;
        gateCache.current = { live: gateLive, checkedAt: Date.now() };
        if (!gateLive) return;
        const wallet = getConnectedWallet();
        if (!wallet) { setActiveTab('NONE'); return; }
        const r2 = await fetch(`/api/nft/check/${wallet}`);
        const d2  = await r2.json();
        if (!d2.hasAccess) { setActiveTab('NONE'); accessCache.current = null; }
      } catch {}
    };
    const t = setInterval(poll, 30_000);
    return () => clearInterval(t);
  }, []);

  const toggleToken = (id: string) => {
    setSelectedTokens((prev: string[]) =>
      prev.includes(id)
        ? prev.filter((t: string) => t !== id)
        : prev.length < 5 ? [...prev, id] : prev
    );
  };

  const btnBase: CSSProperties = {
    position: 'absolute', top: '3.3%', height: '7%', zIndex: 60,
    background: 'rgba(255, 255, 255, 0.02)',
    borderTop: '1.5px solid rgba(0, 242, 252, 0.4)',
    borderLeft: '1.5px solid rgba(0, 242, 255, 0.4)',
    borderRight: '2px solid black', borderBottom: '2px solid black',
    cursor: 'pointer',
  };

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', margin: 0, padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes twinkle   { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); filter: blur(1px); } }
        @keyframes fadeInUp  { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .star { position: absolute; width: 3px; height: 3px; background: white; border-radius: 50%; box-shadow: 0 0 8px #fff; }
        .nav-btn:active, .search-btn:active { transform: scale(0.98); background: rgba(0, 242, 255, 0.1); }
      `}</style>

      {STARS.map(s => (
        <div key={s.id} className="star" style={{ top: s.top + '%', left: s.left + '%', animation: `twinkle ${s.duration}s infinite` }} />
      ))}

      <div style={{ position: 'relative', width: '100%', height: 'auto', aspectRatio: '16 / 9', maxWidth: '100vw', maxHeight: '100vh', zIndex: 10 }}>
        <img src="/background.jpg" alt="HUD" style={{ width: '100%', height: '100%', display: 'block' }} />

        <PremiumAura active={isActive} battery={battery} />

        <button onClick={() => handleAction('NETWORK')}  className="nav-btn" style={{ ...btnBase, left: '21.5%', width: '11%' }} />
        <button onClick={() => handleAction('PROTOCOL')} className="nav-btn" style={{ ...btnBase, left: '33.5%', width: '11%' }} />
        <button onClick={() => handleAction('ABOUT')}    className="nav-btn" style={{ ...btnBase, left: '55.3%', width: '9%' }} />
        <button onClick={() => handleAction('CONNECT')}  className="nav-btn" style={{ ...btnBase, left: '65.2%', width: '10.5%' }} />

        <button
          onClick={() => handleAction('SEARCH')}
          className="search-btn"
          style={{
            position: 'absolute', top: '3.6%', left: '75.8%', width: '3.2vw', height: '3.2vw', borderRadius: '50%', zIndex: 65,
            background: 'rgba(255, 255, 255, 0.05)', borderTop: '2px solid rgba(0, 242, 255, 0.6)', borderLeft: '2px solid rgba(0, 242, 255, 0.6)',
            borderRight: '2px solid rgba(0,0,0,0.8)', borderBottom: '2px solid rgba(0,0,0,0.8)',
            boxShadow: '0 0 10px rgba(0, 242, 255, 0.3)', cursor: 'pointer',
          }}
        />

        <button
          onClick={() => { if (!isCooling) setIsActive(!isActive); setActiveTab('NONE'); }}
          style={{ position: 'absolute', top: '42%', left: '42%', width: '16%', height: '18%', background: 'transparent', border: 'none', zIndex: 30 }}
        />

        <button
          onClick={() => handleAction('EXPLORE')}
          style={{ position: 'absolute', bottom: '6.4%', left: '50%', transform: 'translateX(-50%)', width: '12%', height: '5%', background: 'transparent', border: 'none', zIndex: 60, cursor: 'pointer' }}
        />

        <PanelWrapper active={activeTab === 'NETWORK'}  onClose={() => setActiveTab('NONE')}>
          <NetworkPanel selectedTokens={selectedTokens} toggleToken={toggleToken} features={features} />
        </PanelWrapper>
        <PanelWrapper active={activeTab === 'ABOUT'}    onClose={() => setActiveTab('NONE')}><AboutPanel /></PanelWrapper>
        <PanelWrapper active={activeTab === 'PROTOCOL'} onClose={() => setActiveTab('NONE')}><ProtocolPanel features={features} /></PanelWrapper>
        <PanelWrapper active={activeTab === 'CONNECT'}  onClose={() => setActiveTab('NONE')}><ConnectPanel /></PanelWrapper>
        <PanelWrapper active={activeTab === 'EXPLORE'}  onClose={() => setActiveTab('NONE')}><ExplorePanel features={features} /></PanelWrapper>
        <PanelWrapper active={activeTab === 'SEARCH'}   onClose={() => setActiveTab('NONE')}><SearchPanel /></PanelWrapper>
      </div>

      {gateMsg && <GateToast msg={gateMsg} onClose={() => setGateMsg(null)} />}
    </div>
  );
}

// ─── ROOT WITH ROUTER ─────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/*"     element={<HUD />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
