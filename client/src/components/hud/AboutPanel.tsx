import React from 'react';

export default function AboutPanel() {
  return (
    <div className="space-y-10 text-white/80 font-mono text-sm leading-relaxed">
      {/* SECTION 1: EXECUTIVE SUMMARY */}
      <section>
        <h2 className="text-cyan-400 text-xl font-bold tracking-[0.3em] uppercase mb-4">
          01_EXECUTIVE_SUMMARY
        </h2>
        <p>
          ProtocolHub is a specialized decentralized terminal engineered for the 2026 Solana ETF era. 
          As the ecosystem transitions toward institutional adoption, the "signal-to-noise" ratio has 
          collapsed. ProtocolHub restores clarity by tracking **Real-World Asset (RWA)** growth 
          and identifying high-fidelity liquidity flows before they hit mainstream retail.
        </p>
      </section>

      {/* SECTION 2: THE PROBLEM (ANTI-BOT) */}
      <section className="p-6 bg-white/[0.03] border-l-2 border-cyan-500/50">
        <h3 className="text-white font-bold uppercase mb-2">The Seed-Funding Paradox</h3>
        <p className="text-xs text-white/60">
          In 2025, over 80% of new Solana tokens were sybil-farmed. ProtocolHub filters these by 
          tracking the **$0.45 SOL Organic Seed Average**. By identifying wallets funded through 
          centralized exchange bridges rather than burner-to-burner chains, we isolate genuine 
          community growth from bot-driven hype.
        </p>
      </section>

      {/* SECTION 3: CORE UTILITIES */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-cyan-400/80 uppercase text-xs font-bold mb-2">Whale_Intelligence</h4>
          <p className="text-[11px]">
            Live tracking of 5 institutional "Whale" entities and 5 private custom wallets. 
            Monitor liquidation imbalances and private seed-round exits in real-time.
          </p>
        </div>
        <div>
          <h4 className="text-cyan-400/80 uppercase text-xs font-bold mb-2">RWA_Dashboard</h4>
          <p className="text-[11px]">
            Solana is nearing **$1B in tokenized U.S. Treasuries**. We provide a direct lens 
            into ETF flow divergences and institutional RWA migration.
          </p>
        </div>
      </section>

      {/* SECTION 4: THE ACCESS KEY (NFT) */}
      <section>
        <h2 className="text-cyan-400 text-xl font-bold tracking-[0.3em] uppercase mb-4">
          02_ACCESS_PROTOCOL
        </h2>
        <p>
          Access to the ProtocolHub terminal is managed via a **USD-pegged Utility NFT**. 
          To ensure economic stability regardless of SOL volatility, access is priced at:
        </p>
        <ul className="mt-4 space-y-2 border-t border-white/10 pt-4">
          <li className="flex justify-between">
            <span>Early Adopter (First 2k)</span>
            <span className="text-cyan-400">$30/MO</span>
          </li>
          <li className="flex justify-between">
            <span>Standard Institutional Access</span>
            <span className="text-cyan-400">$50/MO</span>
          </li>
        </ul>
      </section>
      
      <div className="pt-10 text-[10px] text-white/20 uppercase tracking-widest text-center">
        Dubai Regulatory Framework // ProtocolHub v1.0.4-Beta
      </div>
    </div>
  );
}
