import rateLimit from "express-rate-limit";

/* ===================================================== */
/* GLOBAL CACHE (single ping shared across users)         */
/* ===================================================== */

let cachedPulse: any = null;
let lastPulseFetch = 0;
const PULSE_TTL = 30_000;

/* ===================================================== */
/* RATE LIMITER                                           */
/* ===================================================== */

export const pulseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

/* ===================================================== */
/* HELPERS                                                */
/* ===================================================== */

async function fetchRwaSupplies() {
  const mints = {
    USDY: "USDY_MINT_ADDRESS",
    BUIDL: "BUIDL_MINT_ADDRESS",
  };

  const results = await Promise.allSettled(
    Object.entries(mints).map(async ([key, mint]) => {
      const res = await fetch(
        `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: key,
            method: "getTokenSupply",
            params: [mint],
          }),
        }
      );
      const json = await res.json();
      return {
        asset: key,
        supply: Number(json.result?.value?.uiAmount || 0),
      };
    })
  );

  return results
    .filter(r => r.status === "fulfilled")
    .map(r => (r as PromiseFulfilledResult<any>).value);
}

function computeEtfAbsorption({
  dailyInflowUSD,
  solPrice,
}: {
  dailyInflowUSD: number;
  solPrice: number;
}) {
  const solAbsorbed = dailyInflowUSD / solPrice;
  return {
    dailyInflowUSD,
    solAbsorbed,
  };
}

async function fetchLiquidityImbalance() {
  // Placeholder until SDK install — still institutional logic
  return {
    eliteSectorShare: 0.34,
    retailSectorShare: 0.66,
    surgeDetected: true,
  };
}

/* ===================================================== */
/* MAIN PULSE ROUTE                                       */
/* ===================================================== */

app.get("/api/pulse", pulseLimiter, async (_req, res) => {
  const now = Date.now();

  if (cachedPulse && now - lastPulseFetch < PULSE_TTL) {
    return res.json(cachedPulse);
  }

  try {
    const results = await Promise.allSettled([
      fetch(`https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`)
        .then(r => r.json()),
      fetchRwaSupplies(),
      fetchLiquidityImbalance(),
    ]);

    const solPrice =
      results[0].status === "fulfilled"
        ? results[0].value.solana.usd
        : 0;

    const rwaSupplies =
      results[1].status === "fulfilled"
        ? results[1].value
        : [];

    const liquidity =
      results[2].status === "fulfilled"
        ? results[2].value
        : null;

    const etf = computeEtfAbsorption({
      dailyInflowUSD: 765_000_000,
      solPrice,
    });

    cachedPulse = {
      success: true,
      solana: {
        price: solPrice,
        tvlUSD: 4_200_000_000, // can be replaced later
      },
      protocol: {
        rwaSupplies,
        etf,
        liquidity,
      },
      timestamp: new Date().toISOString(),
    };

    lastPulseFetch = now;
    res.json(cachedPulse);
  } catch (err) {
    console.error("PULSE_PROTOCOL_FAILURE", err);
    res.json(cachedPulse ?? { success: false });
  }
});
