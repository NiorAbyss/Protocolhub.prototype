import React, { useState, useEffect } from 'react';
import PanelWrapper from './components/shared/PanelWrapper';
import AboutPanel from './components/hud/AboutPanel';
import ProtocolPanel from './components/hud/ProtocolPanel';
import ConnectPanel from './components/hud/ConnectPanel';
import ExplorePanel from './components/hud/ExplorePanel';
import SearchPanel from './components/hud/SearchPanel';
import NetworkPanel from './components/hud/NetworkPanel'; // PLUGGED IN

const DATES = {
  BETA_START: new Date('2026-02-15T00:00:00Z').getTime(),
  BETA_END: new Date('2026-02-17T00:00:00Z').getTime(),
  FINAL_LAUNCH: new Date('2026-03-15T00:00:00Z').getTime()
};

export default function App() {
  const [isActive, setIsActive] = useState(false);
  const [battery, setBattery] = useState(100);
  const [isCooling, setIsCooling] = useState(false);
  const [activeTab, setActiveTab] = useState('NONE');
  // --- PERSISTENCE & SUBSCRIPTION STATE ---
  const [selectedTokens, setSelectedTokens] = useState(() => {
    const saved = localStorage.getItem('ph_tokens');
    return saved ? JSON.parse(saved) : [];
  });

  const [subscriptionExpiry, setSubscriptionExpiry] = useState(() => {
    const saved = localStorage.getItem('ph_expiry');
    return saved ? parseInt(saved) : 0; 
  });

  // --- SCROLL LOCK LOGIC ---
  useEffect(() => {
    if (activeTab !== 'NONE') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [activeTab]);

  // --- AUTO-SAVE TO MEMORY ---
  useEffect(() => {
    localStorage.setItem('ph_tokens', JSON.stringify(selectedTokens));
    localStorage.setItem('ph_expiry', subscriptionExpiry.toString());
  }, [selectedTokens, subscriptionExpiry]);
  // --- MASTER PULSE STATE ---
  // Stores the bundled data from Birdeye, DexScreener, Helius, and CoinGecko
  const [liveStats, setLiveStats] = useState<any>(null);

  // --- PULSE LISTENER ---
  // Connects the HUD to the shared /api/pulse every 60 seconds
  useEffect(() => {
    const fetchPulse = async () => {
      try {
        const res = await fetch('/api/pulse');
        const data = await res.json();
        if (data.success) {
          setLiveStats(data.solana);
        }
      } catch (err) {
        console.error("Pulse_Connection_Lost");
      }
    };

    fetchPulse(); // Initial ping
    const interval = setInterval(fetchPulse, 60000); // 1-minute credit shield
    return () => clearInterval(interval);
  }, []);

  const now = Date.now();
  const isBetaWindow = now >= DATES.BETA_START && now <= DATES.BETA_END;
  const isHardLockdown = now > DATES.BETA_END && now < DATES.FINAL_LAUNCH;
  const isLive = now >= DATES.FINAL_LAUNCH;

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

  const handleAction = (name: string) => {
    if (isHardLockdown && name !== 'ABOUT') {
      setActiveTab('LOCKDOWN');
      return;
    }
    setActiveTab(name);
  };

  const btnBase: React.CSSProperties = { 
    position: 'absolute', top: '3.3%', height: '7%', zIndex: 60,
    background: 'rgba(255, 255, 255, 0.02)', 
    borderTop: '1.5px solid rgba(0, 242, 252, 0.4)', 
    borderLeft: '1.5px solid rgba(0, 242, 255, 0.4)', 
    borderRight: '2px solid black', borderBottom: '2px solid black',
    cursor: 'pointer'
  };

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', margin: 0, padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes twinkle { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); filter: blur(1px); } }
        @keyframes aura { 0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.95); filter: blur(15px); } 50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.05); filter: blur(25px); } }
        .star { position: absolute; width: 3px; height: 3px; background: white; border-radius: 50%; box-shadow: 0 0 8px #fff; }
        .nav-btn:active, .search-btn:active { transform: scale(0.98); background: rgba(0, 242, 255, 0.1); }
      `}</style>

      {[...Array(25)].map((_, i) => (
        <div key={i} className="star" style={{ top: Math.random() * 100 + '%', left: Math.random() * 100 + '%', animation: `twinkle ${2 + Math.random() * 3}s infinite` }} />
      ))}

      <div style={{ position: 'relative', width: '100%', height: 'auto', aspectRatio: '16 / 9', maxWidth: '100vw', maxHeight: '100vh', zIndex: 10 }}>
        <img src="/background.jpg" alt="HUD" style={{ width: '100%', height: '100%', display: 'block' }} />

        {isActive && (
          <div style={{ position: 'absolute', top: '50.5%', left: '50%', width: '14%', aspectRatio: '1/1', borderRadius: '50%', background: 'radial-gradient(circle, #fff 0%, #00f2ff 50%, transparent 75%)', animation: 'aura 3s infinite', zIndex: 5 }} />
        )}

        <button onClick={() => handleAction('NETWORK')} className="nav-btn" style={{...btnBase, left: '21.5%', width: '11%'}} />
        <button onClick={() => handleAction('PROTOCOL')} className="nav-btn" style={{...btnBase, left: '33.5%', width: '11%'}} />
        <button onClick={() => handleAction('ABOUT')} className="nav-btn" style={{...btnBase, left: '55.3%', width: '9%'}} />
        <button onClick={() => handleAction('CONNECT')} className="nav-btn" style={{...btnBase, left: '65.2%', width: '10.5%'}} />

        <button 
          onClick={() => handleAction('SEARCH')}
          className="search-btn"
          style={{ 
            position: 'absolute', top: '3.6%', left: '75.8%', width: '3.2vw', height: '3.2vw', borderRadius: '50%', zIndex: 65,
            background: 'rgba(255, 255, 255, 0.05)', borderTop: '2px solid rgba(0, 242, 255, 0.6)', borderLeft: '2px solid rgba(0, 242, 255, 0.6)', 
            borderRight: '2px solid rgba(0,0,0,0.8)', borderBottom: '2px solid rgba(0,0,0,0.8)',
            boxShadow: '0 0 10px rgba(0, 242, 255, 0.3)', cursor: 'pointer'
          }} 
        />

        <button onClick={() => { if(!isCooling) setIsActive(!isActive); setActiveTab('NONE'); }} style={{ position: 'absolute', top: '42%', left: '42%', width: '16%', height: '18%', background: 'transparent', border: 'none', zIndex: 30 }} />

        <button 
          onClick={() => handleAction('EXPLORE')} 
          style={{ position: 'absolute', bottom: '6.4%', left: '50%', transform: 'translateX(-50%)', width: '12%', height: '5%', background: 'transparent', border: 'none', zIndex: 60, cursor: 'pointer' }} 
        />

        {/* --- ALL 6 PANELS ARE NOW CONNECTED --- */}
<PanelWrapper active={activeTab === 'NETWORK'} onClose={() => setActiveTab('NONE')}>
  <NetworkPanel 
    selectedTokens={selectedTokens} 
    setSelectedTokens={setSelectedTokens} 
  />
</PanelWrapper>
<PanelWrapper active={activeTab === 'ABOUT'} onClose={() => setActiveTab('NONE')}><AboutPanel /></PanelWrapper>
        <PanelWrapper active={activeTab === 'PROTOCOL'} onClose={() => setActiveTab('NONE')}><ProtocolPanel /></PanelWrapper>
        <PanelWrapper active={activeTab === 'CONNECT'} onClose={() => setActiveTab('NONE')}><ConnectPanel /></PanelWrapper>
        <PanelWrapper active={activeTab === 'EXPLORE'} onClose={() => setActiveTab('NONE')}><ExplorePanel /></PanelWrapper>
        <PanelWrapper active={activeTab === 'SEARCH'} onClose={() => setActiveTab('NONE')}><SearchPanel /></PanelWrapper>

        {activeTab === 'LOCKDOWN' && (
          <div className="absolute inset-0 flex items-center justify-center z-[100] pointer-events-none">
             <div className="bg-black/90 backdrop-blur-2xl p-10 border border-red-500 rounded-xl text-center pointer-events-auto">
                <h2 className="text-red-500 font-mono font-bold tracking-[0.4em] mb-4 uppercase">System Blackout</h2>
                <p className="text-gray-400 font-mono text-xs uppercase tracking-widest leading-loose">Institutional Access Restricted. Resuming: March 15</p>
                <button onClick={() => setActiveTab('NONE')} className="mt-8 px-6 py-2 border border-cyan-900 text-cyan-500 text-[10px] uppercase">Acknowledge</button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
