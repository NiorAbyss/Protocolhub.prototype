import React from 'react';

export default function ExplorePanel() {
  const TRENDS = [
    { title: 'SKR_TOKEN_GENESIS', date: 'JAN 21', risk: 'MED', gist: 'Solana Mobile S2 snapshot completion. 30% supply locked for Genesis stakers.' },
    { title: 'RWA_TREASURY_EXPANSION', date: 'FEB 02', risk: 'LOW', gist: 'BlackRock BUIDL expansion to Solana mainnet. Expected $200M liquidity injection.' },
    { title: 'JUPUARY_26_VOTE', date: 'JAN 30', risk: 'LOW', gist: 'Jupiter DAO vote on ASR (Active Staking Rewards) extension for Q1 2026.' }
  ];

  return (
    <div className="space-y-10 font-mono text-white">
      <header className="border-b border-cyan-500/20 pb-4">
        <h2 className="text-2xl font-bold text-cyan-400 tracking-tighter uppercase italic">Ecosystem_Alpha</h2>
        <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Institutional_Intelligence_Feed // 2026</p>
      </header>

      {/* ALPHA CARDS */}
      <div className="space-y-4">
        {TRENDS.map((t) => (
          <div key={t.title} className="group relative p-6 bg-white/[0.02] border border-white/10 rounded-2xl hover:border-cyan-500/40 transition-all overflow-hidden">
            {/* Background Glow Effect */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-[50px] group-hover:bg-cyan-500/10 transition-all" />
            
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs font-bold text-cyan-400 tracking-widest uppercase">
                {t.title}
              </span>
              <span className="text-[9px] text-white/30 border border-white/10 px-2 py-0.5 rounded uppercase">
                DUE: {t.date}
              </span>
            </div>
            
            <p className="text-xs text-white/70 leading-relaxed max-w-[90%]">
              {t.gist}
            </p>

            <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[9px] uppercase tracking-widest">
              <span className="text-white/20">Risk_Level: <span className={t.risk === 'MED' ? 'text-yellow-500' : 'text-green-500'}>{t.risk}</span></span>
              <button className="text-cyan-500/60 hover:text-cyan-400 underline underline-offset-4">Read_Whitepaper</button>
            </div>
          </div>
        ))}
      </div>

      {/* SECTOR RADAR */}
      <section className="p-6 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
        <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] mb-4">Sector_Radar_Heatmap</h3>
        <div className="grid grid-cols-3 gap-2">
          {['DePIN', 'RWA', 'AI_AGENTS'].map(sector => (
            <div key={sector} className="p-3 bg-black/20 rounded-lg border border-white/5 text-center">
              <div className="text-[9px] text-white/40 mb-1">{sector}</div>
              <div className="text-xs font-bold text-green-500">+12.4%</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
