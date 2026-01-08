import React, { useState, useEffect } from 'react';

export default function NetworkPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'WHALES' | 'AIRDROPS'>('WHALES');
  const [dynamicData, setDynamicData] = useState<any>(null);
  const [pinnedItems, setPinnedItems] = useState<string[]>([]);

  useEffect(() => {
    const fetchIntel = async () => {
      try {
        const res = await fetch('/api/pulse');
        const data = await res.json();
        if (data.success) setDynamicData(data);
      } catch (err) { console.error("ON_CHAIN_SYNC_ERROR"); }
    };
    fetchIntel();
    const interval = setInterval(fetchIntel, 30000);
    return () => clearInterval(interval);
  }, []);

  const togglePin = (id: string) => {
    setPinnedItems(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      return prev.length < 5 ? [...prev, id] : prev;
    });
  };

  // Strictly uses real data from the backend
  const rawList = activeSubTab === 'WHALES' ? (dynamicData?.whales || []) : [];
  
  const sortedList = [...rawList].sort((a, b) => {
    const aP = pinnedItems.includes(a.id) ? 1 : 0;
    const bP = pinnedItems.includes(b.id) ? 1 : 0;
    return bP - aP;
  });

  if (!dynamicData) {
    return <div className="text-[10px] text-white/20 animate-pulse text-center py-20">ESTABLISHING_LIVE_FEED...</div>;
  }

  return (
    <div className="space-y-4 font-mono text-white p-4">
      <div className="flex gap-4 border-b border-white/10 pb-2 text-[10px]">
        {['WHALES', 'AIRDROPS'].map(tab => (
          <button key={tab} onClick={() => setActiveSubTab(tab as any)} 
            className={activeSubTab === tab ? "text-cyan-400" : "text-white/40"}>
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {sortedList.length === 0 ? (
          <div className="text-[10px] text-red-500/50 text-center py-10">NO_LIVE_DATA_DETECTED</div>
        ) : (
          sortedList.map((item: any) => (
            <div key={item.id} className={`flex justify-between p-3 rounded border ${pinnedItems.includes(item.id) ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/5 bg-white/5'}`}>
              <div className="flex items-center gap-2">
                <button onClick={() => togglePin(item.id)}>{pinnedItems.includes(item.id) ? '★' : '☆'}</button>
                <span className="text-xs font-bold">{item.name || item.address.slice(0,6)}</span>
              </div>
              <span className="text-[9px] text-cyan-500/60 uppercase">{item.signal || "ACTIVE"}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
