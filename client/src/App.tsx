import React, { useState, useEffect } from 'react';
import { getSolanaPrice } from './api';
import './App.css';

export default function App() {
  // 1. ALL STATES (Old HUD + New Price)
  const [isActive, setIsActive] = useState(false);
  const [battery, setBattery] = useState(100);
  const [isCooling, setIsCooling] = useState(false);
  const [solPrice, setSolPrice] = useState<number | string>("---");

  // 2. NEW PRICE LOGIC (Bronze Tier)
  useEffect(() => {
    const updatePrice = async () => {
      const price = await getSolanaPrice();
      if (price) setSolPrice(price);
    };
    updatePrice();
    const interval = setInterval(updatePrice, 60000); 
    return () => clearInterval(interval);
  }, []);

  // 3. EXISTING BATTERY LOGIC
  useEffect(() => {
    let interval: any;
    if (isActive && battery > 0) {
      interval = setInterval(() => setBattery(b => Math.max(0, b - 1.66)), 1000);
    } else if (!isActive && battery < 100 && !isCooling) {
      interval = setInterval(() => setBattery(b => Math.min(100, b + 1)), 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, battery, isCooling]);

  // 4. THE VISUAL HUD (Return Block)
  return (
    <div className="hud-container">
      {/* Search for your static price tag below and replace it with {solPrice} */}
      <div className="price-tag">SOL: ${solPrice}</div>
      
      {/* ... Rest of your cool design goes here ... */}
    </div>
  );
}
