import React from 'react';

export default function ProtocolPanel() {
  return (
    <div className="text-cyan-400 font-mono space-y-6">
      <h2 className="text-[11px] font-bold tracking-[0.4em] uppercase text-white border-b border-cyan-900/50 pb-2">
        Protocol Safety Shield
      </h2>
      
      {/* MOCK AUDIT SEARCH */}
      <div className="space-y-2">
        <span className="text-[9px] text-gray-500 uppercase">Input Token Mint Address</span>
        <div className="flex gap-2">
          <input disabled placeholder="6uS97Y3pD7XkS2..." className="flex-1 bg-black/40 border border-white/10 p-2 text-[10px] outline-none" />
          <button className="px-4 bg-cyan-500/20 border border-cyan-500/40 text-[9px] uppercase">Audit</button>
        </div>
      </div>

      {/* PROTOTYPE AUDIT RESULTS */}
      <section className="space-y-2">
        <h3 className="text-[9px] text-cyan-700 uppercase">Recent Audit Result: $SAMPLE</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-green-500/5 border border-green-500/20 rounded">
            <span className="text-[8px] block text-green-500 uppercase mb-1">Liquidity Lock</span>
            <span className="text-[10px] text-white font-bold tracking-widest">VERIFIED (99.0%)</span>
          </div>
          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded">
            <span className="text-[8px] block text-red-500 uppercase mb-1">Mint Function</span>
            <span className="text-[10px] text-white font-bold tracking-widest">ENABLED (DANGER)</span>
          </div>
        </div>
      </section>

      {/* UTILITY QUICK ACTIONS */}
      <button className="w-full p-4 border border-dashed border-cyan-900 hover:bg-cyan-500/5 transition-all flex justify-between items-center group">
        <span className="text-[10px] uppercase text-white group-hover:text-cyan-400">Launch Revoke.cash Dashboard</span>
        <span className="text-cyan-900 text-[8px] group-hover:text-cyan-500">[ REDIRECT_AUTH ]</span>
      </button>
    </div>
  );
}
