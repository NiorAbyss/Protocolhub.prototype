

import React, { useState, useEffect } from 'react';

export default function App() {
  const [isActive, setIsActive] = useState(false);
  const [battery, setBattery] = useState(100);
  const [isCooling, setIsCooling] = useState(false);

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

  // Function to show feedback when buttons are clicked
  const handleAction = (name: string) => {
    alert(`SYSTEM: ${name} module is currently offline. Initializing connection...`);
  };

  const btnBase: React.CSSProperties = { 
    position: 'absolute', top: '3.3%', height: '7%', zIndex: 20, 
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
        @keyframes twinkle { 
          0%, 100% { opacity: 0.3; transform: scale(1); } 
          50% { opacity: 1; transform: scale(1.5); filter: blur(1px); } 
        }
        @keyframes aura { 
          0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.95); filter: blur(15px); } 
          50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.05); filter: blur(25px); } 
        }
        .star { position: absolute; width: 3px; height: 3px; background: white; border-radius: 50%; box-shadow: 0 0 8px #fff; }
        .nav-btn:active, .search-btn:active { transform: scale(0.98); background: rgba(0, 242, 255, 0.1); }
      `}</style>

      {/* GLOWING STARS */}
      {[...Array(25)].map((_, i) => (
        <div key={i} className="star" style={{ top: Math.random() * 100 + '%', left: Math.random() * 100 + '%', animation: `twinkle ${2 + Math.random() * 3}s infinite` }} />
      ))}

      <div style={{ position: 'relative', width: '100%', height: 'auto', aspectRatio: '16 / 9', maxWidth: '100vw', maxHeight: '100vh', zIndex: 10 }}>
        <img src="/background.jpg" alt="HUD" style={{ width: '100%', height: '100%', display: 'block' }} />

        {/* CORE EFFECT */}
        {isActive && (
          <div style={{ position: 'absolute', top: '50.5%', left: '50%', width: '14%', aspectRatio: '1/1', borderRadius: '50%', background: 'radial-gradient(circle, #fff 0%, #00f2ff 50%, transparent 75%)', animation: 'aura 3s infinite', zIndex: 5 }} />
        )}

        {/* NAVIGATION BUTTONS WITH ACTIONS */}
        <button onClick={() => handleAction('NETWORK')} className="nav-btn" style={{...btnBase, left: '21.5%', width: '11%'}} />
        <button onClick={() => handleAction('PROTOCOL')} className="nav-btn" style={{...btnBase, left: '33.5%', width: '11%'}} />
        <button onClick={() => handleAction('ABOUT')} className="nav-btn" style={{...btnBase, left: '55.3%', width: '9%'}} />
        <button onClick={() => handleAction('CONNECT')} className="nav-btn" style={{...btnBase, left: '65.2%', width: '10.5%'}} />

        {/* 3D SEARCH BUTTON */}
        <button 
          onClick={() => handleAction('SEARCH')}
          className="search-btn"
          style={{ 
            position: 'absolute', top: '3.6%', left: '75.8%', width: '3.2vw', height: '3.2vw', borderRadius: '50%', zIndex: 25,
            background: 'rgba(255, 255, 255, 0.05)', borderTop: '2px solid rgba(0, 242, 255, 0.6)', borderLeft: '2px solid rgba(0, 242, 255, 0.6)', 
            borderRight: '2px solid rgba(0,0,0,0.8)', borderBottom: '2px solid rgba(0,0,0,0.8)',
            boxShadow: '0 0 10px rgba(0, 242, 255, 0.3)', cursor: 'pointer'
          }} 
        />

        {/* CENTER TOGGLE */}
        <button onClick={() => !isCooling && setIsActive(!isActive)} style={{ position: 'absolute', top: '42%', left: '42%', width: '16%', height: '18%', background: 'transparent', border: 'none', zIndex: 30 }} />

        {/* EXPLORE GLASS */}
        <button onClick={() => handleAction('EXPLORE')} className="nav-btn" style={{ ...btnBase, top: 'auto', bottom: '6.4%', left: '50%', transform: 'translateX(-50%)', width: '12%', height: '5%' }} />
      </div>
    </div>
  );
}
