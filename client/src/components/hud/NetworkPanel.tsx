import React, { useState, useEffect } from 'react';

export default function NetworkPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'WHALES' | 'AIRDROPS' | 'FUNDING'>('WHALES');
  const [searchTerm, setSearchTerm] = useState("");
  // Initialize as empty object so we can check keys safely
  const [dynamicData, setDynamicData] = useState<any>({}); 
  const [isLoading, setIsLoading] = useState(true); // Add specific loading state
  
  // Persistence for pinned items
  const [pinnedWhales, setPinnedWhales] = useState<string[]>([]);
  const [pinnedAirdrops, setPinnedAirdrops] = useState<string[]>([]);

  useEffect(() => {
    // 1. Restore local storage
    const savedWhales = JSON.parse(localStorage.getItem('ph_pinned_whales') || '[]');
    const savedAirdrops = JSON.parse(localStorage.getItem('ph_pinned_airdrops') || '[]');
    setPinnedWhales(savedWhales);
    setPinnedAirdrops(savedAirdrops);

    const fetchIntel = async () => {
      try {
        // DEBUG: Check what headers are required. 
        // If your API needs a key, uncomment the headers section below.
        const res = await fetch('/api/pulse', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                // 'x-api-key': 'YOUR_API_KEY_HERE', // <--- UNCOMMENT IF NEEDED
            }
        });

        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);

        const data = await res.json();
        console.log("API DATA RECEIVED:", data); // <--- CHECK CONSOLE FOR THIS

        // Handle different data shapes (direct vs nested)
        const validData = data.data || data; 
        
        setDynamicData(validData);
      } catch (err) { 
        console.error("ON_CHAIN_SYNC_FAILED:", err);
        // Fallback mock data so panel isn't empty during testing
        setDynamicData({
            whales: [{ id: 'mock-1', name: 'MOCK WHALE (API DOWN)', signal: '$5.00M' }],
            airdrops: [{ priorityFeeLevel: 'MOCK DATA', priorityFee: 15000 }]
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchIntel();
    
    // Optional: Set up an interval to refresh data every 30s
    const interval = setInterval(fetchIntel, 30000);
    return () => clearInterval(interval);
  }, []);

  const togglePin = (id: string) => {
    if (activeSubTab === 'WHALES') {
      const updated = pinnedWhales.includes(id) 
        ? pinnedWhales.filter(i => i !== id) 
        : pinnedWhales.length < 5 ? [...pinnedWhales, id] : pinnedWhales;
      setPinnedWhales(updated);
      localStorage.setItem('ph_pinned_whales', JSON.stringify(updated));
    } else if (activeSubTab === 'AIRDROPS') {
      const updated = pinnedAirdrops.includes(id) 
        ? pinnedAirdrops.filter(i => i !== id) 
        : pinnedAirdrops.length < 5 ? [...pinnedAirdrops, id] : pinnedAirdrops;
      setPinnedAirdrops(updated);
      localStorage.setItem('ph_pinned_airdrops', JSON.stringify(updated));
    }
  };

  const currentPins = activeSubTab === 'WHALES' ? pinnedWhales : pinnedAirdrops;
  
  // Safe extraction with optional chaining
  // Looks for data in dynamicData OR dynamicData.data to be safe
  const rawWhales = Array.isArray(dynamicData?.whales) ? dynamicData.whales : [];
  const rawAirdrops = Array.isArray(dynamicData?.airdrops) ? dynamicData.airdrops : [];

  const rawList = activeSubTab === 'WHALES' 
    ? rawWhales.map((w: any) => ({
        id: w.id || w.address || `whale-${Math.random()}`,
        name: w.name || w.symbol || 'Unknown Whale',
        signal: w.signal || (w.liquidity ? `$${(w.liquidity / 1e6).toFixed(2)}M` : '0.00M')
      })) 
    : rawAirdrops.map((a: any, idx: number) => ({
        id: `airdrop-${idx}`,
        name: `Priority Fee: ${a.priorityFeeLevel || 'N/A'}`,
        signal: a.priorityFee ? `${(a.priorityFee / 1e6).toFixed(6)} SOL` : '0.000000 SOL'
      }));

  if (activeSubTab === 'FUNDING' && dynamicData?.price) {
    rawList.push({
      id: 'sol-price',
      name: 'SOLANA PRICE',
      signal: `$${Number(dynamicData.price).toFixed(2)} USD`
    });
  }

  // SORT: Pinned items stay at top
  const sortedAndFiltered = [...rawList]
    .sort((a, b) => (currentPins.includes(b.id) ? 1 : 0) - (currentPins.includes(a.id) ? 1 : 0))
    .filter((item: any) => (item.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()));

  return (
    <div className="space-y-6 font-mono text-white p-4">
      {/* HEADER */}
      <header className="border-b border-cyan-500/20 pb-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-cyan-400 italic">Terminal_Intel</h2>
        <input 
          type="text" 
          placeholder="[ SEARCH... ]"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)} 
          className="bg-white/[0.03] border border-cyan-500/20 rounded-lg px-3 py-1 text-[10px] w-32 outline-none focus:border-cyan-500"
        />
      </header>

      {/* TABS */}
      <div className="flex gap-4 border-b border-white/5 pb-2">
        {['WHALES', 'AIRDROPS', 'FUNDING'].map((tab) => (
          <button 
            key={tab} 
            onClick={() => setActiveSubTab(tab as any)} 
            className={`text-[10px] tracking-widest ${activeSubTab === tab ? 'text-cyan-400' : 'text-white/20'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div className="space-y-2 min-h-[200px]">
        {isLoading ? (
          <div className="text-[10px] text-white/20 animate-pulse py-10 text-center uppercase">Establishing_Pulse_Sync...</div>
        ) : sortedAndFiltered.length === 0 ? (
          <div className="text-[10px] text-white/10 text-center py-10">
            NO_DATA_AVAILABLE <br/>
            <span className="text-[8px] text-red-500/50">CHECK API CONNECTION OR KEYS</span>
          </div>
        ) : (
          sortedAndFiltered.map((item: any) => (
            <div key={item.id} className={`w-full p-4 rounded-xl border flex justify-between items-center bg-white/[0.03] ${currentPins.includes(item.id) ? 'border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.1)]' : 'border-white/10'}`}>
              <div className="flex items-center gap-3">
                <button onClick={() => togglePin(item.id)} className="text-xs transition-transform active:scale-125">
                  {currentPins.includes(item.id) ? '★' : '☆'}
                </button>
                <span className="text-xs font-bold uppercase tracking-wider">{item.name}</span>
              </div>
              <span className="text-[9px] text-cyan-500/60 uppercase">{item.signal || item.date}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}