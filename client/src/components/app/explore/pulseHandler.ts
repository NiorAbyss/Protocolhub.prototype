const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
const MIN_USD = 2000;

export async function getPulseData() {
  const timestamp = new Date().toISOString();

  const birdeyePromise = fetch(
    'https://public-api.birdeye.so/public/defi/token_trending?limit=50',
    {
      headers:  BIRDEYE_API_KEY ?  { 'X-API-KEY': BIRDEYE_API_KEY } : {},
      cache: 'no-store'
    }
  )
    .then((res) => res.json())
    .then((data) =>
      (data?. data ??  []).map((tx:  any) => ({
        id: tx.txHash || tx.signature,
        symbol: tx.symbol || 'SOL',
        usdValue: Number(tx.amountUsd ??  0),
        solAmount: Number(tx.amount ?? 0),
        timestamp:  tx.blockTime,
        wallet: tx.from || tx.wallet || tx.owner || null
      }))
    )
    .then((trades) => trades.filter((tx) => tx.usdValue >= MIN_USD))
    .catch(() => []);

  const heliusPromise = fetch(
    `https://api.helius.xyz/v1/searchAssets?api-key=${HELIUS_API_KEY}&addresses[]=${SOL_ADDRESS}`,
    { cache: 'no-store' }
  )
    .then((res) => res.json())
    .then((data) =>
      (data?.assets ?? []).map((a: any, idx: number) => ({
        id: a.id || `airdrop-${idx}`,
        priorityFee: a.priorityFee ?? 0,
        priorityFeeLevel: a.priorityFeeLevel || 'N/A',
        stage: a.stage ??  a.status ?? 'unknown',
        raw: a
      }))
    )
    .catch(() => []);

  const coingeckoPromise = fetch('https://api.coingecko.com/api/v3/coins/solana', {
    headers: COINGECKO_API_KEY ? { 'x-cg-pro-api-key': COINGECKO_API_KEY } :  {},
    cache: 'no-store'
  })
    .then((res) => res.json())
    .then((data) => {
      const marketData = data?.market_data ??  {};
      return {
        price: Number(marketData?.current_price?. usd ?? 0),
        mcap: Number(marketData?.market_cap?.usd ?? 0)
      };
    })
    .catch(() => ({ price: 0, mcap:  0 }));

  const solanaRpcPromise = fetch('https://api.mainnet-beta.solana.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getRecentPerformanceSamples',
      params: [1]
    }),
    cache: 'no-store'
  })
    .then((res) => res.json())
    .then((json) => {
      const samples = json?.result ?? [];
      if (! samples || samples.length === 0) return { tps: 0 };
      const s = samples[0];
      const numTx = Number(s. numTransactions ?? 0);
      const secs = Number(s.samplePeriodSecs ?? 1);
      const tps = secs > 0 ? numTx / secs : 0;
      return { tps };
    })
    .catch(() => ({ tps: 0 }));

  const [birdeyeResult, heliusResult, coingeckoResult, solRpcResult] =
    await Promise.allSettled([
      birdeyePromise,
      heliusPromise,
      coingeckoPromise,
      solanaRpcPromise
    ]);

  const whales = birdeyeResult.status === 'fulfilled' ? birdeyeResult.value : [];
  const airdrops = heliusResult. status === 'fulfilled' ? heliusResult.value : [];
  const cg = coingeckoResult.status === 'fulfilled' ? coingeckoResult.value : { price: 0, mcap:  0 };
  const rpc = solRpcResult.status === 'fulfilled' ? solRpcResult.value : { tps: 0 };

  const tokens = (() => {
    try {
      const trades:  any[] = Array.isArray(whales) ? whales : [];
      const agg: Record<string, { symbol: string; totalUsd: number; count: number }> = {};
      trades.forEach((t) => {
        const sym = (t. symbol || 'SOL').toUpperCase();
        if (!agg[sym]) agg[sym] = { symbol:  sym, totalUsd: 0, count: 0 };
        agg[sym].totalUsd += Number(t.usdValue ?? 0);
        agg[sym].count += 1;
      });
      return Object.values(agg)
        .sort((a, b) => b.totalUsd - a.totalUsd)
        .slice(0, 10);
    } catch (e) {
      return [];
    }
  })();

  const funding = (() => {
    try {
      const trades: any[] = Array.isArray(whales) ? whales : [];
      const wallets = new Set<string>();
      trades.forEach((t) => {
        if (t.wallet) wallets.add(String(t.wallet));
      });
      return { realWallets: wallets.size };
    } catch (e) {
      return { realWallets: 0 };
    }
  })();

  const responseData = {
    success: true,
    solana: {
      mcap: Number(cg.mcap ??  0),
      price: Number(cg.price ?? 0),
      tps: Number(rpc.tps ?? 0)
    },
    whales,
    airdrops,
    tokens,
    funding,
    timestamp
  };

  // 🔍 DEBUG LOG - Check what's being returned
  console.log('📡 PULSE_API_RESPONSE:', {
    birdeyeStatus: birdeyeResult.status,
    heliusStatus:  heliusResult.status,
    coingeckoStatus: coingeckoResult.status,
    solanaRpcStatus: solRpcResult. status,
    whalesCount: whales.length,
    airdropsCount: airdrops.length,
    tokensCount: tokens. length,
    realWallets: funding.realWallets,
    solanaPrice: responseData.solana.price,
    solanaMcap: responseData.solana.mcap,
    solanaTps: responseData.solana.tps
  });

  return responseData;
}