import React from 'react';

export default function ProtocolPanel() {
  return (
    <div className="text-cyan-400 font-mono space-y-6">
      <h2 className="text-xl font-bold tracking-[0.2em] uppercase border-b border-cyan-900 pb-2">
        RWA Partner Directory
      </h2>

      {/* PARTNER 1: ONDO */}
      <div className="bg-white/5 border border-cyan-500/20 p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-white font-bold tracking-widest text-lg">ONDO</span>
          <span className="text-[10px] bg-cyan-900/50 px-2 py-0.5 border border-cyan-500/30">ACTIVE</span>
        </div>
        <p className="text-xs text-gray-400 italic">
          Gist: Institutional-grade treasury yield on-chain. High liquidity retention and low volatility risk.
        </p>
      </div>

      {/* PARTNER 2: PARCL */}
      <div className="bg-white/5 border border-cyan-500/20 p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-white font-bold tracking-widest text-lg">PARCL</span>
          <span className="text-[10px] bg-cyan-900/50 px-2 py-0.5 border border-cyan-500/30">MONITORING</span>
        </div>
        <p className="text-xs text-gray-400 italic">
          Gist: Real estate index exposure. Significant TVL growth observed in Dubai and Miami markets.
        </p>
      </div>

      {/* TEASER FOR SILVER TIER */}
      <div className="opacity-30 pointer-events-none border-dashed border border-gray-700 p-4">
        <span className="text-[10px] text-gray-500">SILVER TIER - LOCKED DATA</span>
      </div>
    </div>
  );
}
