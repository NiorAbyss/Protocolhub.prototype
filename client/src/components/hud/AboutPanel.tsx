import React from 'react';

export default function AboutPanel() {
  return (
    <div className="text-cyan-400 font-mono space-y-10">
      {/* SECTION 1: REGULATORY */}
      <section>
        <h2 className="text-lg font-bold tracking-[0.3em] uppercase border-b border-cyan-900 pb-2 mb-4">
          Institutional Mandate
        </h2>
        <p className="text-sm leading-relaxed text-gray-400">
          ProtocolHub is engineered for high-net-worth traders, operating within the 
          <span className="text-white"> Dubai Virtual Asset Regulatory Authority (VARA)</span> framework. 
          Our mission is to provide low-noise, actionable on-chain intelligence.
        </p>
      </section>

      {/* SECTION 2: VISION */}
      <section>
        <h2 className="text-lg font-bold tracking-[0.3em] uppercase border-b border-cyan-900 pb-2 mb-4">
          Network Expansion
        </h2>
        <p className="text-sm leading-relaxed text-gray-400">
          Phase 1 focuses on the stabilization of the Bronze Intelligence Tier. 
          We are currently scaling infrastructure to support our first 6,000 institutional partners.
        </p>
      </section>
      
      <div className="pt-4">
        <span className="text-[10px] text-cyan-700 uppercase tracking-[0.5em]">
          Status: Operational // Dubai Hub
        </span>
      </div>
    </div>
  );
}
