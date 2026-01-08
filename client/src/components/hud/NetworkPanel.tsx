import React, { useState, useEffect } from 'react';

export default function NetworkPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'WHALES' | 'AIRDROPS' | 'FUNDING'>('WHALES');
  const [searchTerm, setSearchTerm] = useState("");
  const [dynamicData, setDynamicData] = useState<any>({
    success: false,
    whales: [],
    airdrops: [],
    price: 0
  });

  const [pinnedWhales, setPinnedWhales] = useState<string[]>([]);
  const [pinnedAirdrops, setPinnedAirdrops] = useState<string[]>([]);

  useEffect(() => {
    // Restore pins from localStorage
    const savedWhales = JSON.parse(localStorage.getItem('ph_pinned_whales') || '[]');
    const savedAirdrops = JSON.parse(localStorage.getItem('ph_pinned_airdrops') || '[]');
    setPinnedWhales(savedWhales);
    setPinnedAirdrops(savedAirdrops);

    // Fetch backend data
    const fetchIntel = async () => {
      try {
        const res = await fetch('/api/pulse');
        const data = await res.json();
        if (data && data.success) {
          setDynamicData(data);
        }
      } catch (err) {
        console.error("ON_CHAIN_SYNC_FAILED", err);
      }
    };

    fetchIntel();
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

  // -----------------------------
  // Safe extraction from backend
  // -----------------------------
  const whaleSource = dynamicData?.whales ?? [];
  const airdropSource = dynamicData?.airdrops ?? [];

  const rawList: any[] =
    activeSubTab === 'WHALES'
      ? whaleSource.map((w: any) => ({
          id: w.id || `whale-${Math.random()}`,
          name: w.symbol || 'Unknown Whale',
          signal: `$${(w.usdValue || 0).toLocaleString()}`
        }))
      : activeSubTab === 'AIRDROPS'
      ? airdropSource.map((a: any, idx: number) => ({
          id: a.id || `airdrop-${idx}`,
          name: `Priority Fee: ${a.priorityFeeLevel || 'N/A'}`,
          signal: `${a.priorityFee ?? 0} SOL`
        }))
      : [];

  if (activeSubTab === 'FUNDING' && dynamicData?.price != null) {
    rawList.push({
      id: 'sol-price',
      name: 'SOLANA PRICE',
      signal: `$${Number(dynamicData.price).toFixed(2)} USD`
    });
  }

  const sortedAndFiltered = [...rawList]
    .sort(
      (a, b) =>
        (currentPins.includes(b.id) ? 1 : 0) -
        (currentPins.includes(a.id) ? 1 : 0)
    )
    .filter((item: any) =>
      (item.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div className="space-y-6 font-mono text-white p-4">
      <header className="border-b border-cyan-500/20 pb-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-cyan-400 italic">
          Terminal_Intel
        </h2>
        <input
          type="text"
          placeholder="[ SEARCH... ]"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-white/[0.03] border border-cyan-500/20 rounded-lg px-3 py-1 text-[10px] w-32 outline-none focus:border-cyan-500"
        />
      </header>

      <div className="flex gap-4 border-b border-white/5 pb-2">
        {['WHALES', 'AIRDROPS', 'FUNDING'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab as any)}
            className={`text-[10px] tracking-widest ${
              activeSubTab === tab ? 'text-cyan-400' : 'text-white/20'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-2 min-h-[200px]">
        {!dynamicData ? (
          <div className="text-[10px] text-white/20 animate-pulse py-10 text-center uppercase">
            Establishing_Pulse_Sync...
          </div>
        ) : sortedAndFiltered.length === 0 ? (
          <div className="text-[10px] text-cyan-500/40 text-center py-10 uppercase">
            LIVE_FEED_ACTIVE — AWAITING_EVENTS
          </div>
        ) : (
          sortedAndFiltered.map((item: any) => (
            <div
              key={item.id}
              className={`w-full p-4 rounded-xl border flex justify-between items-center bg-white/[0.03] ${
                currentPins.includes(item.id)
                  ? 'border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                  : 'border-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => togglePin(item.id)}
                  className="text-xs transition-transform active:scale-125"
                >
                  {currentPins.includes(item.id) ? '★' : '☆'}
                </button>
                <span className="text-xs font-bold uppercase tracking-wider">
                  {item.name}
                </span>
              </div>
              <span className="text-[9px] text-cyan-500/60 uppercase">
                {item.signal}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
