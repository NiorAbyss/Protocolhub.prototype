import React, { useEffect, useState } from "react";

type PulseResponse = {
  success: boolean;
  solana: {
    price: number;
    mcap: number;
    tps: number;
  };
  whales: {
    id: string;
    symbol: string;
    usdValue: number;
    solAmount: number;
    wallet: string | null;
  }[];
  airdrops: {
    level: string;
    fee: number;
  }[];
  timestamp: string;
  error?: string;
};

export default function ExplorePanel(): JSX.Element {
  const [data, setData] = useState<PulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const sync = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/pulse", { signal: controller.signal });
        const json = (await res.json()) as PulseResponse;

        if (!json.success) throw new Error(json.error ?? "Pulse failed");
        setData(json);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message ?? "Fetch failed");
        }
      } finally {
        setLoading(false);
      }
    };

    sync();
    const interval = setInterval(sync, 60000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
        {error}
      </div>
    );
  }

  if (loading || !data) {
    return <div className="text-white/40">SYNCING NETWORK...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="MCAP" value={`$${(data.solana.mcap / 1e9).toFixed(2)}B`} />
        <Stat label="SOL PRICE" value={`$${data.solana.price.toFixed(2)}`} />
        <Stat label="TPS" value={data.solana.tps.toFixed(0)} />
      </div>

      <Section title="Whale Trades">
        {data.whales.map(w => (
          <Row key={w.id} left={w.symbol} right={`$${w.usdValue.toFixed(0)}`} />
        ))}
      </Section>

      <Section title="Priority Fees">
        {data.airdrops.map(a => (
          <Row key={a.level} left={a.level} right={`${a.fee}`} />
        ))}
      </Section>

      <div className="text-xs text-white/30 text-center">
        Last synced: {new Date(data.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
      <div className="text-xs text-white/40">{label}</div>
      <div className="text-lg font-bold text-cyan-400">{value}</div>
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
      <div className="text-xs text-white/60 mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span>{left}</span>
      <span className="text-cyan-400">{right}</span>
    </div>
  );
}
