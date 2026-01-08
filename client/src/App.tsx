import React, { useState, useEffect } from 'react';
import PanelWrapper from './components/shared/PanelWrapper';
import AboutPanel from './components/hud/AboutPanel';
import ProtocolPanel from './components/hud/ProtocolPanel';
import ConnectPanel from './components/hud/ConnectPanel';

// --- THE CALENDAR BRAIN (Does not change visuals) ---
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

  // --- ACCESS LOGIC ---
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
    // If we are in Hard Lockdown, we stop them from opening panels
    if (isHardLockdown && name !== 'ABOUT') {
      alert("SYSTEM STATUS: SECURED. ACCESS RESTRICTED UNTIL MARCH 15.");
      return;
    }
    setActiveTab(name);
  };

  const btnBase: React.CSSProperties = { 
    position: 'absolute', top: '3.3%', height: '7%', zIndex: 60,
    background: 'rgba(255, 255, 255, 0.02)', 
    borderTop: '1.5px solid rgba(0, 242, 255, 0.4)', 
    borderLeft: '1.5px solid rgba(0, 242, 255, 0.4)', 
    borderRight: '2px solid black', borderBottom: '2px solid black',
    boxShadow: 'inset 1px 1px 3px rgba(255,255,255,0.1)',
    cursor: 'pointer'
  };

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', margin: 0, padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes twinkle { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); filter: blur(1px); } }
        @keyframes aura { 0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.95); filter: blur(15px); } 50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.05); filter: blur(25px); } }
        .star { position: absolute; width: 3px; height: 3px; background: white; border-radius: 50%; box-shadow: 0 0 8px #fff; }
        .nav-btn:active { transform: scale(0.98); background: rgba(0, 242, 255, 0.1); }
      `}</style>

      {/* STARS - UNTOUCHED */}
      {[...Array(25)].map((_, i) => (
        <div key={i} className="star" style={{ top: Math.random() * 100 + '%', left: Math.random() * 100 + '%', animation: `twinkle ${2 + Math.random() * 3}s infinite` }} />
      ))}

      <div style={{ position: 'relative', width: '100%', height: 'auto', aspectRatio: '16 / 9', maxWidth: '100vw', maxHeight: '100vh', zIndex: 10 }}>
        <img src="/background.jpg" alt="HUD" style={{ width: '100%', height: '100%', display: 'block' }} />

        {/* CORE EFFECT - UNTOUCHED */}
        {isActive && (
          <div style={{ position: 'absolute', top: '50.5%', left: '50%', width: '14%', aspectRatio: '1/1', borderRadius: '50%', background: 'radial-gradient(circle, #fff 0%, #00f2ff 50%, transparent 75%)', animation: 'aura 3s infinite', zIndex: 5 }} />
        )}

        {/* BUTTONS - POSITIONS UNTOUCHED */}
        <button onClick={() => handleAction('NETWORK')} className="nav-btn" style={{...btnBase, left: '21.5%', width: '11%'}} />
        <button onClick={() => handleAction('PROTOCOL')} className="nav-btn" style={{...btnBase, left: '33.5%', width: '11%'}} />
        <button onClick={() => handleAction('ABOUT')} className="nav-btn" style={{...btnBase, left: '55.3%', width: '9%'}} />
        <button onClick={() => handleAction('CONNECT')} className="nav-btn" style={{...btnBase, left: '65.2%', width: '10.5%'}} />

        {/* CENTER TOGGLE - UNTOUCHED */}
        <button onClick={() => { if(!isCooling) setIsActive(!isActive); setActiveTab('NONE'); }} style={{ position: 'absolute', top: '42%', left: '42%', width: '16%', height: '18%', background: 'transparent', border: 'none', zIndex: 30 }} />

        {/* PANELS - ONLY SHOW IF ACCESS IS GRANTED */}
        <PanelWrapper active={activeTab === 'ABOUT'}>
          <AboutPanel />
        </PanelWrapper>

        {/* Protocol & Connect only show if not in lockdown or if it's the Beta */}
        <PanelWrapper active={activeTab === 'PROTOCOL' && (isBetaWindow || isLive)}>
          <ProtocolPanel />
        </PanelWrapper>

        <PanelWrapper active={activeTab === 'CONNECT' && (isBetaWindow || isLive)}>
          <ConnectPanel />
        </PanelWrapper>

        {/* LOCKDOWN OVERLAY (Only shows if they click during lockdown) */}
        {isHardLockdown && activeTab !== 'NONE' && activeTab !== 'ABOUT' && (
          <div className="absolute inset-0 flex items-center justify-center z-[100] pointer-events-none">
             <div className="bg-black/80 backdrop-blur-xl p-8 border border-red-500/50 rounded-xl text-center pointer-events-auto">
                <h2 className="text-red-500 font-mono font-bold tracking-[0.4em] mb-4 uppercase">System Blackout</h2>
                <p className="text-gray-400 font-mono text-xs uppercase tracking-widest">Resuming Operations: March 15</p>
                <button onClick={() => setActiveTab('NONE')} className="mt-6 text-[10px] text-cyan-500 underline uppercase tracking-[0.2em]">Close</button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
