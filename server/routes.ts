import { type Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import axios from "axios";

/* ===================================================== */
/* Pulse Cache Types                                     */
/* ===================================================== */

type PulseCache = {
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
  funding: {
    realWallets: number;
    botWallets: number;
    burnedWallets: number;
  };
  timestamp: string;
};

/* ===================================================== */
/* In-Memory Single-Flight Cache                          */
/* ===================================================== */

let CACHE: PulseCache | null = null;
let LAST_FETCH = 0;
let IN_FLIGHT: Promise<PulseCache> | null = null;

const CACHE_TTL = 30_000;

/* ===================================================== */
/* Normalizers                                           */
/* ===================================================== */

function normalizePriorityFees(levels: any) {
  if (!levels || typeof levels !== "object") return [];
  return Object.entries(levels).map(([level, fee]) => ({
    level,
    fee: Number(fee) || 0,
  }));
}

function normalizeWhales(raw: any[]) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((w, i) => ({
    id: w.txHash || w.id || `whale-${i}`,
    symbol: w.symbol || "UNKNOWN",
    usdValue: Number(w.usdValue || w.valueUsd || 0),
    solAmount: Number(w.solAmount || 0),
    wallet: w.owner || null,
  }));
}

/* ===================================================== */
/* Wallet Intelligence (Heuristic-Based)                  */
/* ===================================================== */

function analyzeWalletActivity(transactions: any[]) {
  let realWallets = 0;
  let botWallets = 0;

  for (const tx of transactions) {
    const isBotLike =
      tx.priorityFee > 50_000 ||       // excessive fee spam
      tx.txCount > 25 ||               // burst behavior
      tx.isProgram === true;           // programmatic wallet

    if (isBotLike) botWallets++;
    else realWallets++;
  }

  return {
    realWallets,
    botWallets,
    burnedWallets: botWallets, // burned = filtered out
  };
}

/* ===================================================== */
/* Single-Flight Fetcher                                  */
/* ===================================================== */

async function fetchPulseOnce(): Promise<PulseCache> {
  const now = Date.now();

  if (CACHE && now - LAST_FETCH < CACHE_TTL) return CACHE;
  if (IN_FLIGHT) return IN_FLIGHT;

  IN_FLIGHT = (async () => {
    try {
      const [birdeyeRes, heliusRes, cgRes] = await Promise.all([
        axios.get("https://public-api.birdeye.so/v1/solana/networks", {
          headers: { "X-API-KEY": process.env.BIRDEYE_API_KEY || "" },
        }).catch(err => {
          console.error("BIRDEYE_ERROR:", err.response?.status, err.response?.data);
          return { data: { data: [] } };
        }),

        axios.post(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || ""}`, {
          jsonrpc: "2.0",
          id: "pulse",
          method: "getPriorityFeeEstimate",
          params: [{
            accountKeys: ["JUP6LkbZbjS1jKKccwgws655K6L3GEzS6LYVsbYwbq3"],
            options: { includeAllPriorityFeeLevels: true }
          }]
        }).catch(err => {
          console.error("HELIUS_ERROR:", err.response?.status, err.response?.data);
          return { data: { result: {} } };
        }),

        axios.get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
          .catch(() => ({ data: { solana: { usd: 0 } } }))
      ]);

      const birdeye = birdeyeRes.data;
      const helius = heliusRes.data;
      const coingecko = cgRes.data;

      const whales = normalizeWhales(birdeye?.data ?? []);
      const funding = analyzeWalletActivity(
        (birdeye?.data ?? []).map((w: any) => ({
          priorityFee: w.priorityFee || 0,
          txCount: w.txCount || 1,
          isProgram: w.isProgram || false,
        }))
      );

      const payload: PulseCache = {
        success: true,
        solana: {
          price: coingecko?.solana?.usd ?? 0,
          mcap: birdeye?.data?.totalMarketCap ?? 0,
          tps: birdeye?.data?.tps ?? 0,
        },
        whales,
        airdrops: normalizePriorityFees(
          helius?.result?.priorityFeeLevels
        ),
        funding,
        timestamp: new Date().toISOString(),
      };

      CACHE = payload;
      LAST_FETCH = Date.now();
      return payload;
    } finally {
      IN_FLIGHT = null;
    }
  })();

  return IN_FLIGHT;
}

/* ===================================================== */
/* Routes                                                */
/* ===================================================== */

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get(api.posts.list.path, async (_req, res) => {
    res.json(await storage.getPosts());
  });

  app.get(api.posts.get.path, async (req, res) => {
    const post = await storage.getPostBySlug(req.params.slug);
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(post);
  });

  app.post(api.posts.create.path, async (req, res) => {
    try {
      const input = api.posts.create.input.parse(req.body);
      res.status(201).json(await storage.createPost(input));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.get("/api/pulse", async (_req, res) => {
    try {
      res.json(await fetchPulseOnce());
    } catch {
      res.status(503).json({ success: false });
    }
  });

  return httpServer;
}
