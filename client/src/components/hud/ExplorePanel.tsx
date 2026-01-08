import React, { useState, useEffect } from 'react';

export default function ExplorePanel() {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      const res = await fetch('/api/pulse');
      const data = await res.json();
      if (data.success) setMetrics(data.solana);
    };
    fetchMetrics();
    const timer = setInterval(fetchMetrics, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-4 font-mono text-white">
      <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
        <div className="text-[9px] text-white/30 uppercase tracking-widest">Global_MCAP</div>
        <div className="text-xl font-bold text-white">${metrics ? (metrics.mcap / 1e9).toFixed(2) + 'B' : 'SYNCING...'}</div>
      </div>
      <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
        <div className="text-[9px] text-white/30 uppercase tracking-widest">Real_Time_TPS</div>
        <div className="text-xl font-bold text-green-500">{metrics ? metrics.tps.toFixed(0) : '---'}</div>
      </div>
      <div className="col-span-2 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
        <div className="text-[9px] text-white/30 uppercase tracking-widest">24H_Volume</div>
        <div className="text-lg font-bold">${metrics ? (metrics.volume24h / 1e6).toFixed(1) + 'M' : '---'}</div>
      </div>
    </div>
  );
}
