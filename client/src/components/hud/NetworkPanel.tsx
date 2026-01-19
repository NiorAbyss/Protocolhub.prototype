import React from 'react';

// PROTOTYPE DATA: Fixed for Bronze Tier Showcase
const MOCK_WHALES = [
  { m: '14,200 SOL', d: 'Raydium LP', s: 'INBOUND', t: '1m', id: 1 },
  { m: '5.2M USDC', d: 'Jupiter Aggregator', s: 'STABLE', t: '4m', id: 2 },
  { m: '8,100 SOL', d: 'Private Wallet', s: 'OUTBOUND', t: '9m', id: 3 },
  { m: '2,500 SOL', d: 'Meteora DLMM', s: 'INBOUND', t: '15m', id: 4 },
  { m: '450k JUP', d: 'Binance Cold', s: 'OUTBOUND', t: '22m', id: 5 }
];

const MOCK_BUYS = [
  { t: '$VINE', v: '42k' }, { t: '$NUTS', v: '28k' }, { t: '$WIF', v: '19k' },
  { t: '$POPCAT', v: '15k' }, { t: '$BONK', v: '12k' }
];

export default function NetworkPanel({ selectedTokens, toggleToken }: any) {
  return (
    <div className="text-cyan-400 font-mono space-y-6">
      {/* 1. SELECTION CONSOLE */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white border-b border-cyan-900/50 pb-1">
          Active Bronze Selection ({selectedTokens.length}/5)
        </h2>
        <div className="grid grid-cols-5 gap-1.5">
          {['VINE', 'NUTS', 'WIF', 'POPCAT', 'BONK', 'MEW', 'BOME', 'MYRO'].map((id) => (
            <button key={id} onClick={() => toggleToken(id)}
              className={`py-2 text-[8px] border font-bold transition-all ${
                selectedTokens.includes(id) ? 'border-cyan-500 bg-cyan-500/20 text-white shadow-[0_0_10px_rgba(0,242,255,0.2)]' : 'border-white/5 bg-black/40 text-gray-700'
              }`}
            >
              ${id}
            </button>
          ))}
        </div>
      </section>

      {/* 2. WHALE INTELLIGENCE FEED */}
      <section className="space-y-3">
        <div className="flex justify-between border-b border-cyan-900/50 pb-1">
          <h2 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white">Whale Flow Destination</h2>
          <span className="text-[7px] text-cyan-600 animate-pulse uppercase">Live Feed Simulation</span>
        </div>
        <div className="space-y-1.5">
          {MOCK_WHALES.map(item => (
            <div key={item.id} className="flex justify-between items-center p-3 bg-white/[0.02] border border-white/5 text-[9px]">
              <div>
                <span className="text-white font-bold block">{item.m}</span>
                <span className="text-[7px] text-cyan-700 uppercase">TO: {item.d}</span>
              </div>
              <div className="text-right">
                <span className={`block font-bold ${item.s === 'INBOUND' ? 'text-green-500' : 'text-red-500'}`}>{item.s}</span>
                <span className="text-[7px] text-gray-700 italic">{item.t} ago</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. NEW WALLET ANALYTICS */}
      <section className="p-3 border border-dashed border-cyan-900/40 bg-cyan-500/[0.02] rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-[8px] uppercase text-gray-600 block mb-1">New Wallet Seed Avg</span>
            <span className="text-lg text-white font-bold tracking-widest">0.45 SOL</span>
          </div>
          <div className="text-right">
            <span className="text-[8px] text-gray-700 block mb-1 uppercase tracking-widest">Growth Vector</span>
            <span className="text-[9px] text-green-500/70 font-bold animate-pulse uppercase">Organic Retail</span>
          </div>
        </div>
      </section>
    </div>
  );
}
