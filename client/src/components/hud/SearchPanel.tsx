import React from 'react';

export default function SearchPanel() {
  return (
    <div className="text-cyan-400 font-mono space-y-8">
      {/* HEADER */}
      <section>
        <h2 className="text-lg font-bold tracking-[0.3em] uppercase border-b border-cyan-900 pb-2 mb-6">
          Terminal Query
        </h2>
        
        {/* INPUT AREA */}
        <div className="relative group">
          <input 
            type="text" 
            placeholder="INPUT CONTRACT OR ASSET ID..." 
            className="w-full bg-black/40 border border-cyan-500/30 p-5 text-xs tracking-[0.2em] outline-none focus:border-cyan-500 transition-all text-white placeholder:text-cyan-900"
            autoFocus
          />
          <div className="absolute right-4 top-5 text-[10px] text-cyan-500 font-bold animate-pulse">
            READY_
          </div>
        </div>
      </section>

      {/* QUICK FILTERS / TAGS */}
      <section className="space-y-3">
        <span className="text-[10px] uppercase tracking-widest text-gray-500">Institutional Filters:</span>
        <div className="flex gap-3">
          {['RWA', 'DEPIN', 'SOL-LST', 'STABLES'].map((tag) => (
            <button key={tag} className="px-3 py-1 border border-cyan-900 text-[9px] hover:border-cyan-500 hover:bg-cyan-500/5 transition-colors cursor-pointer uppercase">
              {tag}
            </button>
          ))}
        </div>
      </section>

      {/* SYSTEM STATUS FOOTER */}
      <div className="pt-4 border-t border-cyan-900/30">
        <p className="text-[9px] text-cyan-700 leading-relaxed uppercase tracking-tighter">
          Note: Query engine currently limited to verified Bronze Tier assets. 
          Full mainnet indexing resumes March 15.
        </p>
      </div>
    </div>
  );
}
