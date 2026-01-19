import React from 'react';

export default function ExplorePanel() {
  return (
    <div className="text-cyan-400 font-mono space-y-8">
      {/* TOP 5 AIRDROP OPPORTUNITIES */}
      <section className="space-y-4">
        <h2 className="text-[11px] font-bold tracking-[0.4em] uppercase text-white border-b border-cyan-900/50 pb-2">
          Top 5 Airdrop Claims
        </h2>
        <div className="space-y-2">
          {[
            { n: 'JUPITER S2', s: 'ACTIVE', r: 'High' },
            { n: 'DRIFT PROTOCOL', s: 'STAKING', r: 'Med' },
            { n: 'KAMINO LEND', s: 'SNAPSHOT', r: 'High' },
            { n: 'PARCL R3', s: 'PENDING', r: 'Med' },
            { n: 'TENSOR SEASON', s: 'ACTIVE', r: 'High' },
          ].map((drop, i) => (
            <div key={i} className="flex justify-between p-3 bg-white/[0.02] border border-white/5 text-[9px]">
              <span className="text-white font-bold">{drop.n}</span>
              <span className="text-cyan-500 uppercase">{drop.s}</span>
              <span className="text-gray-500">REWARD: {drop.r}</span>
            </div>
          ))}
        </div>
      </section>

      {/* TOP 5 GLOBAL MEME SENTIMENT */}
      <section className="space-y-4">
        <h2 className="text-[11px] font-bold tracking-[0.4em] uppercase text-white border-b border-cyan-900/50 pb-2">
          Global Meme Pulse (Top 5)
        </h2>
        <div className="grid grid-cols-1 gap-2">
          {[
            { t: '$WIF', s: 'BULLISH', p: '98%' },
            { t: '$POPCAT', s: 'ACCUMULATE', p: '72%' },
            { t: '$BONK', s: 'BULLISH', p: '85%' },
            { t: '$MEW', s: 'BULLISH', p: '91%' },
            { t: '$BOME', s: 'VOLATILE', p: '44%' },
          ].map((meme, i) => (
            <div key={i} className="flex justify-between items-center p-3 bg-cyan-500/5 border border-cyan-500/10">
              <span className="text-xs font-bold text-white tracking-widest">{meme.t}</span>
              <div className="text-right">
                <span className="text-[8px] block text-cyan-600 uppercase mb-1">{meme.s}</span>
                <span className="text-[10px] text-green-500 font-bold">{meme.p} STRENGTH</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
