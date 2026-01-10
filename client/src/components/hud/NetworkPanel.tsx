import React, { useEffect, useState } from "react";

/* ===================================================== */
/* Types (Aligned with backend pulse cache)               */
/* ===================================================== */

type PulseResponse = {
  success: boolean;
  whales: {
    id: string;
    symbol: string;
    usdValue: number;
  }[];
  airdrops: {
    level: string;
    fee: number;
  }[];
  funding: {
    realWallets: number;
    botWallets: number;
    burnedWallets: number;
  };
  solana: {
    price: number;
  };
};

type Tab = "WHALES" | "AIRDROPS" | "FUNDING";

/* ===================================================== */
/* Component                                             */
/* ===================================================== */

export default function NetworkPanel() {
  const [activeSubTab, setActiveSubTab] = useState<Tab>("WHALES");
  const [searchTerm, setSearchTerm] = useState("");
  const [data, setData] = useState<PulseResponse | null>(null);
  const [loading, setLoading] = useState(true);

  /* ===================================================== */
  /* Data Sync (shared backend cache, safe polling)        */
  /* ===================================================== */

  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      try {
        const res = await fetch("/api/pulse");
        const json = (await res.json()) as PulseResponse;
        if (mounted && json.success) {
          setData(json);
        }
      } catch (err) {
        console.error("NETWORK_PANEL_SYNC_FAILED", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    sync();
    const interval = setInterval(sync, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  /* ===================================================== */
  /* Derived Lists (NO UI SHAPE CHANGES)                   */
  /* ===================================================== */

  const whales =
    data?.whales.map(w => ({
      id: w.id,
      name: w.symbol,
      signal: `$${w.usdValue.toFixed(0)}`,
    })) ?? [];

  const airdrops =
    data?.airdrops.map(a => ({
      id: a.level,
      name: `Priority Fee (${a.level})`,
      signal: `${a.fee}`,
    })) ?? [];

  /* ===================================================== */
  /* Render                                                */
  /* ===================================================== */

  return (
    <div className="space-y-6 font-mono text-white p-4">
      {/* HEADER */}
      <header className="border-b border-cyan-500/20 pb-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-cyan-400 italic">
          Terminal_Intel
        </h2>
        <input
          type="text"
          placeholder="[ SEARCH... ]"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-white/[0.03] border border-cyan-500/20 rounded-lg px-3 py-1 text-[10px] w-32 outline-none focus:border-cyan-500"
        />
      </header>

      {/* TABS */}
      <div className="flex gap-4 border-b border-white/5 pb-2">
        {(["WHALES", "AIRDROPS", "FUNDING"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`text-[10px] tracking-widest ${
              activeSubTab === tab
                ? "text-cyan-400"
                : "text-white/20"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div className="space-y-2 min-h-[200px]">
        {loading ? (
          <div className="text-[10px] text-white/20 animate-pulse py-10 text-center uppercase">
            Establishing_Pulse_Sync...
          </div>
        ) : activeSubTab === "FUNDING" && data?.funding ? (
          /* ===================================================== */
          /* FUNDING PANEL (NEW — NO LAYOUT CHANGE)                */
          /* ===================================================== */
          <div className="space-y-3">
            <StatRow
              label="Real Wallets"
              value={data.funding.realWallets}
              color="text-green-400"
            />
            <StatRow
              label="Bot Wallets"
              value={data.funding.botWallets}
              color="text-amber-400"
            />
            <StatRow
              label="Burned Wallets"
              value={data.funding.burnedWallets}
              color="text-red-400"
            />
          </div>
        ) : (
          /* ===================================================== */
          /* WHALES / AIRDROPS (UNCHANGED VISUALLY)                */
          /* ===================================================== */
          (activeSubTab === "WHALES" ? whales : airdrops)
            .filter(item =>
              item.name.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .map(item => (
              <div
                key={item.id}
                className="w-full p-4 rounded-xl border flex justify-between items-center bg-white/[0.03] border-white/10"
              >
                <span className="text-xs font-bold uppercase tracking-wider">
                  {item.name}
                </span>
                <span className="text-[9px] text-cyan-500/60 uppercase">
                  {item.signal}
                </span>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

/* ===================================================== */
/* Small Helper Component (UI-consistent)                 */
/* ===================================================== */

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="w-full p-4 rounded-xl border flex justify-between items-center bg-white/[0.03] border-white/10">
      <span className="text-xs font-bold uppercase tracking-wider">
        {label}
      </span>
      <span className={`text-sm font-bold ${color}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}
