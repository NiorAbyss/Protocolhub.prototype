import React, { useState, useEffect } from 'react';
import { getSolanaPrice } from './api';
import './index.css';

export default function App() {
  const [isActive, setIsActive] = useState(false);
  const [battery, setBattery] = useState(100);
  const [isCooling, setIsCooling] = useState(false);
  const [solPrice, setSolPrice] = useState<number | string>("---");

  useEffect(() => {
    const updatePrice = async () => {
      const price = await getSolanaPrice();
      if (price) setSolPrice(price);
    };
    updatePrice();
    const interval = setInterval(updatePrice, 60000); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval: any;
    if (isActive && battery > 0) {
      interval = setInterval(() => setBattery(b => Math.max(0, b - 1.66)), 1000);
    } else if (!isActive && battery < 100 && !isCooling) {
      interval = setInterval(() => setBattery(b => Math.min(100, b + 1)), 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, battery, isCooling]);

  return (
    <div className="hud-container min-h-screen bg-black flex flex-col items-center justify-center p-4">
      {/* HEADER SECTION: No new lines added */}
      <div className="w-full max-w-md flex justify-between mb-8 px-2 font-mono text-[10px] tracking-[0.2em]">
        <div className="text-cyan-800 uppercase">
          PROTOCOL: <span className="text-cyan-400">{isActive ? "ACTIVE" : "STANDBY"}</span>
        </div>
        <div className="text-cyan-800 uppercase text-right">
          {/* We swapped the static "STABLE" text for the live price variable */}
          NETWORK: <span className="text-cyan-400">${solPrice}</span>
        </div>
      </div>

      {/* CENTER: Your original neon battery display */}
      <div className="relative w-64 h-64 flex items-center justify-center mb-12">
        <div className={`absolute inset-0 rounded-full border-2 border-cyan-500/20 ${isActive ? 'animate-pulse' : ''}`} />
        <div className="text-7xl font-bold text-cyan-400 font-mono tracking-tighter">
          {Math.round(battery)}%
        </div>
      </div>

      {/* BUTTON: Your original initialize button */}
      <button 
        onClick={() => setIsActive(!isActive)}
        className={`px-10 py-4 border-2 font-mono font-bold tracking-[0.3em] transition-all duration-500 ${
          isActive 
          ? "bg-cyan-500 text-black border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.6)]" 
          : "bg-transparent text-cyan-500 border-cyan-500/30 hover:border-cyan-400"
        }`}
      >
        {isActive ? "SHUTDOWN" : "INITIALIZE"}
      </button>

      {/* FOOTER: Original diagnostic layout */}
      <div className="mt-12 w-full max-w-xs flex justify-around font-mono text-[8px] text-cyan-900/50 uppercase tracking-widest">
        <div>LATENCY: 14MS</div>
        <div>CORE_TEMP: {isActive ? "44°C" : "29°C"}</div>
      </div>
    </div>
  );
}
