import React, { useState, useEffect } from 'react';
import { getSolanaPrice } from './api';
import './index.css';

export default function App() {
  // 1. ALL STATES (Combined Design + Price Logic)
  const [isActive, setIsActive] = useState(false);
  const [battery, setBattery] = useState(100);
  const [isCooling, setIsCooling] = useState(false);
  const [solPrice, setSolPrice] = useState<number | string>("---");

  // 2. LIVE PRICE ENGINE (Updates every 60s)
  useEffect(() => {
    const updatePrice = async () => {
      const price = await getSolanaPrice();
      if (price) setSolPrice(price);
    };
    updatePrice();
    const interval = setInterval(updatePrice, 60000); 
    return () => clearInterval(interval);
  }, []);

  // 3. HUD BATTERY LOGIC
  useEffect(() => {
    let interval: any;
    if (isActive && battery > 0) {
      interval = setInterval(() => setBattery(b => Math.max(0, b - 1.66)), 1000);
    } else if (!isActive && battery < 100 && !isCooling) {
      interval = setInterval(() => setBattery(b => Math.min(100, b + 1)), 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, battery, isCooling]);

  // 4. THE FULL VISUAL HUD
  return (
    <div className="hud-container">
      {/* TOP BAR: LIVE DATA */}
      <div className="flex justify-between p-4 border-b border-cyan-500/30 bg-black/40">
        <div className="text-cyan-400 font-mono text-xs tracking-widest">
          SYSTEM_READY: {isActive ? "ACTIVE" : "STANDBY"}
        </div>
        <div className="text-cyan-400 font-mono text-xs">
          SOL_MARKET: <span className="text-white">${solPrice}</span>
        </div>
      </div>

      {/* CENTER: POWER UNIT */}
      <div className="flex flex-col items-center justify-center flex-1 space-y-8 p-6">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div className={`absolute inset-0 rounded-full border-4 border-cyan-500/20 ${isActive ? 'animate-pulse' : ''}`} />
          <div className="text-6xl font-bold text-cyan-400 font-mono">
            {Math.round(battery)}%
          </div>
        </div>

        {/* CONTROLS */}
        <button 
          onClick={() => setIsActive(!isActive)}
          className={`px-12 py-4 rounded-none border-2 font-bold tracking-tighter transition-all ${
            isActive 
            ? "bg-cyan-500 text-black border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.5)]" 
            : "bg-transparent text-cyan-500 border-cyan-500/50 hover:bg-cyan-500/10"
          }`}
        >
          {isActive ? "DEACTIVATE PROTOCOL" : "INITIALIZE HUD"}
        </button>
      </div>

      {/* FOOTER: DIAGNOSTICS */}
      <div className="p-4 bg-cyan-900/10 border-t border-cyan-500/20">
        <div className="grid grid-cols-2 gap-4 text-[10px] font-mono text-cyan-700">
          <div>LATENCY: 24ms</div>
          <div>CORE_TEMP: {isActive ? "42°C" : "28°C"}</div>
        </div>
      </div>
    </div>
  );
}
