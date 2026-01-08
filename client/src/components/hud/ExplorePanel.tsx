import React, { useEffect, useState } from 'react';

export default function ExplorePanel() {
  const [pulse, setPulse] = useState<any>(null);

  useEffect(() => {
    const sync = async () => {
      const res = await fetch('/api/pulse');
      const json = await res.json();
      if (json.success) setPulse(json.solana);
    };
    sync();
    const interval = setInterval(sync, 60000); // 1-minute shared-ping
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-[10px] text-white/40 uppercase">Global_MCAP</div>
          <div className="text-lg font-bold text-cyan-400">
            {pulse ? `$${(pulse.mcap / 1e9).toFixed(2)}B` : "SYNCING..."}
          </div>
        </div>
        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
          <div className="text-[10px] text-white/40 uppercase">Real_Time_TPS</div>
          <div className="text-lg font-bold text-white">
            {pulse ? pulse.tps.toFixed(0) : "---"}
          </div>
        </div>
      </div>
      {/* Narrative news feed below... */}
    </div>
  );
}
