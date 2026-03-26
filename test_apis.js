import axios from 'axios';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env vars
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const apis = [
  {
    name: 'LunarCrush (Primary)',
    key: process.env.L_CRUSH_A,
    url: 'https://lunarcrush.com/api4/public/coins/list/v2?sort=social_volume_global&limit=1',
    headers: { 'Authorization': process.env.L_CRUSH_A },
  },
  {
    name: 'LunarCrush (Backup)',
    key: process.env.L_CRUSH_B,
    url: 'https://lunarcrush.com/api4/public/coins/list/v2?sort=social_volume_global&limit=1',
    headers: { 'Authorization': process.env.L_CRUSH_B },
  },
  {
    name: 'Dune Analytics (Primary)',
    key: process.env.D_API_A,
    url: `https://api.dune.com/api/v1/query/${process.env.DUNE_SOCIAL_QUERY_ID || '3571780'}/results?limit=1`,
    headers: { 'X-Dune-API-Key': process.env.D_API_A },
  },
  {
    name: 'Dune Analytics (Backup)',
    key: process.env.D_API_B,
    url: `https://api.dune.com/api/v1/query/${process.env.DUNE_SOCIAL_QUERY_ID || '3571780'}/results?limit=1`,
    headers: { 'X-Dune-API-Key': process.env.D_API_B },
  },
  {
    name: 'Birdeye',
    key: process.env.BIRD_API,
    url: 'https://public-api.birdeye.so/defi/v3/token/trade-data/single?address=So11111111111111111111111111111111111111112&limit=1',
    headers: { 'X-API-KEY': process.env.BIRD_API },
  },
  {
    name: 'Helius',
    key: process.env.HELIUS_API,
    url: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API}`,
    method: 'POST',
    data: { jsonrpc: '2.0', id: 1, method: 'getBlockHeight' },
  },
  {
    name: 'CoinGecko',
    key: process.env.COINGECKO_API_KEY,
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    method: 'GET',
  },
];

async function testApi(api) {
  if (!api.key) {
    return { name: api.name, status: 'MISSING_KEY', code: null, time: 0 };
  }

  const start = Date.now();
  try {
    const config = {
      url: api.url,
      method: api.method || 'GET',
      headers: api.headers || {},
      timeout: 5000,
    };
    if (api.data) config.data = api.data;

    const response = await axios(config);
    const time = Date.now() - start;
    return { name: api.name, status: 'OK', code: response.status, time };
  } catch (e) {
    const time = Date.now() - start;
    return { 
      name: api.name, 
      status: 'FAILED', 
      code: e.response?.status || 'NO_RESPONSE',
      message: e.response?.statusText || e.message,
      time 
    };
  }
}

console.log('\n=== API KEY STATUS CHECK ===\n');
const results = await Promise.all(apis.map(testApi));

results.forEach(r => {
  const status = r.status === 'OK' ? '✅' : r.status === 'MISSING_KEY' ? '⚠️' : '❌';
  console.log(`${status} ${r.name}`);
  console.log(`   Status: ${r.status}`);
  if (r.code) console.log(`   Code: ${r.code}`);
  if (r.message) console.log(`   Error: ${r.message}`);
  console.log(`   Time: ${r.time}ms\n`);
});

const working = results.filter(r => r.status === 'OK').length;
const failed = results.filter(r => r.status === 'FAILED').length;
const missing = results.filter(r => r.status === 'MISSING_KEY').length;

console.log(`\n=== SUMMARY ===`);
console.log(`Working: ${working} | Failed: ${failed} | Missing Keys: ${missing}\n`);
