import axios from "axios";
import { type Express } from "express";

/* ===================================================== */
/* GLOBAL CACHE (single ping shared across users)         */
/* ===================================================== */

let cachedPulse: any = null;
let lastPulseFetch = 0;
const PULSE_TTL = 30_000;

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
      const res = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
        {
          jsonrpc: "2.0",
          id: key,
          method: "getTokenSupply",
          params: [mint],
        },
        {
          headers: { "Content-Type": "application/json" },
        }
      ).catch(err => {
        console.error(`HELIUS_ERROR [${key}]:`, err.response?.status, err.response?.data);
        throw err;
      });
      
      return {
        asset: key,
        supply: Number(res.data.result?.value?.uiAmount || 0),
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

export function registerPulseRoute(app: Express) {
  app.get("/api/pulse", async (_req, res) => {
    const now = Date.now();

    if (cachedPulse && now - lastPulseFetch < PULSE_TTL) {
      return res.json(cachedPulse);
    }

    try {
      const [cgRes, rwaSupplies, liquidity] = await Promise.all([
        axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`).then(r => r.data),
        fetchRwaSupplies(),
        fetchLiquidityImbalance(),
      ]);

      const solPrice = cgRes?.solana?.usd ?? 0;

      const etf = computeEtfAbsorption({
        dailyInflowUSD: 765_000_000,
        solPrice,
      });

      cachedPulse = {
        success: true,
        solana: {
          price: solPrice,
          tvlUSD: 4_200_000_000,
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
    } catch (err: any) {
      console.error("PULSE_PROTOCOL_FAILURE", err.response?.status, err.response?.data || err.message);
      res.json(cachedPulse ?? { success: false });
    }
  });
}
