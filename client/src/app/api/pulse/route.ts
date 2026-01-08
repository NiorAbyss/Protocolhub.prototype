import { NextResponse } from 'next/server';

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY!;
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;

const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
const MIN_USD = 2000;

export async function GET() {
  const timestamp = new Date().toISOString();

  // -----------------------------
  // 1️⃣ Birdeye: Trending whales
  // -----------------------------
  const birdeyePromise = fetch(
    'https://public-api.birdeye.so/public/defi/token_trending?limit=50',
    {
      headers: { 'X-API-KEY': BIRDEYE_API_KEY },
      cache: 'no-store'
    }
  )
    .then((res) => res.json())
    .then((data) =>
      (data?.data ?? []).map((tx: any) => ({
        id: tx.txHash || tx.signature,
        symbol: tx.symbol || 'SOL',
        usdValue: tx.amountUsd || 0,
        solAmount: tx.amount || 0,
        timestamp: tx.blockTime
      }))
    )
    .then((trades) => trades.filter((tx) => tx.usdValue >= MIN_USD))
    .catch(() => []);

  // -----------------------------
  // 2️⃣ Helius: Airdrop eligibility / priority fees
  // -----------------------------
  const heliusPromise = fetch(
    `https://api.helius.xyz/v1/searchAssets?api-key=${HELIUS_API_KEY}&addresses[]=${SOL_ADDRESS}`,
    { cache: 'no-store' }
  )
    .then((res) => res.json())
    .then((data) =>
      (data?.assets ?? []).map((a: any, idx: number) => ({
        id: a.id || `airdrop-${idx}`,
        priorityFee: a.priorityFee ?? 0,
        priorityFeeLevel: a.priorityFeeLevel || 'N/A'
      }))
    )
    .catch(() => []);

  // -----------------------------
  // 3️⃣ CoinGecko: SOL price
  // -----------------------------
  const coingeckoPromise = fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    {
      headers: COINGECKO_API_KEY
        ? { 'x-cg-pro-api-key': COINGECKO_API_KEY }
        : {},
      cache: 'no-store'
    }
  )
    .then((res) => res.json())
    .then((data) => data?.solana?.usd ?? 0)
    .catch(() => 0);

  // -----------------------------
  // Execute all in parallel
  // -----------------------------
  const [birdeyeResult, heliusResult, solPrice] = await Promise.allSettled([
    birdeyePromise,
    heliusPromise,
    coingeckoPromise
  ]);

  return NextResponse.json({
    success: true,
    whales: birdeyeResult.status === 'fulfilled' ? birdeyeResult.value : [],
    airdrops: heliusResult.status === 'fulfilled' ? heliusResult.value : [],
    price: solPrice.status === 'fulfilled' ? solPrice.value : 0,
    timestamp
  });
}
