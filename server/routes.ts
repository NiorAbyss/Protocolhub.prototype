import { type Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

async function seed() {
  const existing = await storage.getPosts();
  if (existing.length === 0) {
    await storage.createPost({
      title: "Welcome to the Starter Template",
      slug: "welcome-starter",
      excerpt: "This is a fullstack starter template with React, Vite, and Express.",
      content: "This template provides a solid foundation for building fullstack applications. It includes a database, API routes, and a modern frontend setup.",
    });
    await storage.createPost({
      title: "Building Modern Apps",
      slug: "building-modern-apps",
      excerpt: "Learn how to build scalable applications with modern tools.",
      content: "We use Drizzle ORM for type-safe database interactions, Zod for validation, and TanStack Query for efficient data fetching.",
    });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed data on startup
  seed();

  app.get(api.posts.list.path, async (req, res) => {
    const posts = await storage.getPosts();
    res.json(posts);
  });

  app.get(api.posts.get.path, async (req, res) => {
    const post = await storage.getPostBySlug(req.params.slug);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.json(post);
  });

  app.post(api.posts.create.path, async (req, res) => {
    try {
      const input = api.posts.create.input.parse(req.body);
      const post = await storage.createPost(input);
      res.status(201).json(post);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Pulse route
  app.get("/api/pulse", async (_req, res) => {
    try {
      // Graceful degradation: allSettled prevents a single key failure from locking the HUD
      const results = await Promise.allSettled([
        // Birdeye API using process.env.BIRDEYE_API_KEY for network data.
        fetch(`https://public-api.birdeye.so/v1/solana/networks`, {
          headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY || '' }
        }).then(r => r.json()),
        // Helius RPC using process.env.HELIUS_API_KEY for transaction logic.
        fetch(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "my-id",
            method: "getPriorityFeeEstimate",
            params: [{
              "accountKeys": ["JUP6LkbZbjS1jKKccwgws655K6L3GEzS6LYVsbYwbq3"],
              "options": { "includeAllPriorityFeeLevels": true }
            }]
          })
        }).then(r => r.json()),
        // CoinGecko API using process.env.COINGECKO_API_KEY for SOL price data.
        fetch(`https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&x_cg_demo_api_key=${process.env.COINGECKO_API_KEY || ''}`)
          .then(r => r.json()),
      ]);

      const birdeye = results[0].status === 'fulfilled' ? (results[0].value as any) : { data: [] };
      const helius = results[1].status === 'fulfilled' ? (results[1].value as any) : { result: { priorityFeeLevels: [] } };
      const coingecko = results[2].status === 'fulfilled' ? (results[2].value as any) : { solana: { usd: 0 } };

      res.json({
        success: true, 
        whales: Array.isArray(birdeye.data) ? birdeye.data : [],
        airdrops: (helius.result && Array.isArray(helius.result.priorityFeeLevels)) ? helius.result.priorityFeeLevels : [],
        price: coingecko.solana?.usd || 0,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Pulse_Route_Failure:", error);
      res.json({ success: true, whales: [], airdrops: [], price: 0 });
    }
  });

  return httpServer;
}
