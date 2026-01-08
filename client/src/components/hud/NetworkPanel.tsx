import React, { useState } from 'react';

interface NetworkPanelProps {
  selectedTokens: any[];
  setSelectedTokens: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function NetworkPanel({ selectedTokens, setSelectedTokens }: NetworkPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'WHALES' | 'AIRDROPS' | 'FUNDING'>('WHALES');
  const [searchTerm, setSearchTerm] = useState("");

  // LARGE DATA POOLS (Scale these as much as you want)
  const WHALE_POOL = [
    { id: 'W1', name: 'Jump_Capital', activity: 'SOL_Accumulation', signal: 'Strong' },
    { id: 'W2', name: 'Wintermute', activity: 'LP_Migration', signal: 'Neutral' },
    { id: 'W3', name: 'FalconX', activity: 'RWA_Diversification', signal: 'Strong' },
    { id: 'W4', name: 'Helius_Labs', activity: 'RPC_Peak_Volume', signal: 'Neutral' },
    { id: 'W5', name: 'Amber_Group', activity: 'ETF_Arbitrage', signal: 'High' },
    { id: 'W6', name: 'GSR_Markets', activity: 'Market_Making', signal: 'Neutral' },
    { id: 'W7', name: 'Robot_Ventures', activity: 'Seed_Deployment', signal: 'Strong' },
  ];

  const AIRDROP_ALPHA = [
    { id: 'A1', name: 'SKR_TOKEN', date: 'JAN 21', gist: 'Solana_Mobile_S2' },
    { id: 'A2', name: 'METEORA', date: 'FEB 2026', gist: 'Dynamic_LPs' },
    { id: 'A3', name: 'JUPUARY', date: 'JAN 30', gist: 'Staking_Rewards' },
    { id: 'A4', name: 'PARCL_V2', date: 'MAR 2026', gist: 'RWA_Property_Index' },
    { id: 'A5', name: 'DRIFT_PHASE2', date: 'FEB 2026', gist: 'DEX_Incentives' },
  ];

  // SEARCH FILTER LOGIC
  const currentPool = activeSubTab === 'WHALES' ? WHALE_POOL : AIRDROP_ALPHA;
  const filteredList = currentPool.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (item: any) => {
    const isSelected = selectedTokens.find(t => t.id === item.id);
    if (isSelected) {
      setSelectedTokens(prev => prev.filter(t => t.id !== item.id));
    } else if (selectedTokens.length < 5) {
      setSelectedTokens(prev => [...prev, item]);
    }
  };

  return (
    <div className="space-y-6 font-mono text-white">
      {/* HEADER WITH SEARCH BAR */}
      <header className="border-b border-cyan-500/20 pb-4 space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-cyan-400 tracking-tighter uppercase italic">Terminal_Intel</h2>
            <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Bronze_Tier // 5_Slot_Limit</p>
          </div>
          <input 
            type="text" 
            placeholder="[ SEARCH_DATABASE... ]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-white/[0.03] border border-cyan-500/20 rounded-lg px-4 py-2 text-[10px] w-48 focus:border-cyan-500 outline-none transition-all placeholder:text-white/20"
          />
        </div>
      </header>

      {/* SUB-NAV */}
      <div className="flex gap-6 border-b border-white/5 pb-2">
        {['WHALES', 'AIRDROPS', 'FUNDING'].map((tab) => (
          <button 
            key={tab}
            onClick={() => {setActiveSubTab(tab as any); setSearchTerm("");}}
            className={`text-[10px] tracking-[0.2em] transition-all uppercase ${activeSubTab === tab ? 'text-cyan-400 border-b border-cyan-400' : 'text-white/20 hover:text-white/50'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* SCROLLABLE GRID AREA */}
      <div className="h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
        {activeSubTab !== 'FUNDING' ? (
          <div className="grid grid-cols-1 gap-2">
            {filteredList.map(item => {
              const isSelected = selectedTokens.find(t => t.id === item.id);
              return (
                <button 
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`p-4 rounded-xl border flex justify-between items-center transition-all ${isSelected ? 'bg-cyan-500/20 border-cyan-500' : 'bg-white/[0.03] border-white/10 hover:border-white/20'}`}
                >
                  <div className="text-left">
                    <div className="text-xs font-bold uppercase">{item.name}</div>
                    <div className="text-[9px] text-white/40 italic">{item.activity || item.gist}</div>
                  </div>
                  <div className="text-[9px] text-cyan-500/60 uppercase">{item.signal || item.date}</div>
                </button>
              );
            })}
            {filteredList.length === 0 && (
              <div className="text-[10px] text-white/20 uppercase text-center py-10 tracking-[0.3em]">No_Matching_Entries_Found</div>
            )}
          </div>
        ) : (
          /* FUNDING TAB - Remains static */
          <div className="p-6 bg-white/[0.03] border border-white/10 rounded-2xl space-y-4">
             <div className="flex justify-between items-center"><span className="text-xs text-white/40 uppercase">Organic_Seed</span><span className="text-cyan-400 font-bold">0.45 SOL</span></div>
             <p className="text-[10px] text-white/60 leading-relaxed uppercase">// ANTI-BOT PROTOCOL ENGAGED</p>
          </div>
        )}
      </div>

      {/* PERSISTENT FOOTER COUNTER */}
      <footer className="pt-4 border-t border-white/5 flex justify-between items-center">
        <span className="text-[10px] text-white/40 uppercase">Targets_Locked: {selectedTokens.length} / 5</span>
        <div className="flex gap-1.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`w-3 h-1 rounded-full ${i < selectedTokens.length ? 'bg-cyan-500 shadow-[0_0_8px_#06b6d4]' : 'bg-white/10'}`} />
          ))}
        </div>
      </footer>
    </div>
  );
}
