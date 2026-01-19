import React from 'react';

export default function ConnectPanel() {
  return (
    <div className="text-cyan-400 font-mono space-y-10">
      {/* IDENTITY SECTION */}
      <section>
        <h2 className="text-lg font-bold tracking-[0.3em] uppercase border-b border-cyan-900 pb-2 mb-6">
          Identity / Wallet
        </h2>
        <div className="bg-white/5 border border-cyan-500/20 p-6 flex flex-col items-center">
          <div className="w-12 h-12 rounded-full border border-cyan-500/40 mb-4 flex items-center justify-center opacity-30 text-white">
            ?
          </div>
          <span className="text-[10px] text-gray-500 uppercase tracking-widest mb-4 font-bold">
            No Wallet Connected
          </span>
          
          <button className="w-full py-3 border border-cyan-500 bg-cyan-500/5 hover:bg-cyan-500/20 text-xs font-bold uppercase tracking-[0.2em] transition-all">
            Connect Wallet
          </button>
        </div>
      </section>

      {/* INSTITUTIONAL MOCKUP SLIDER */}
      <section className="pt-4">
        <div className="opacity-20 pointer-events-none">
          <span className="text-[9px] uppercase tracking-[0.3em] mb-2 block">Funding Threshold (Gold Tier Only)</span>
          <div className="h-1 bg-cyan-900 rounded-full w-full relative">
            <div className="absolute left-0 top-0 h-full w-1/4 bg-cyan-500 shadow-[0_0_8px_#06b6d4]" />
          </div>
          <div className="flex justify-between mt-2 text-[8px]">
            <span>$0</span>
            <span>$1,000+</span>
          </div>
        </div>
      </section>
    </div>
  );
}
