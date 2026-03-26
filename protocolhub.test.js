/**
 * ProtocolHub — k6 Load Test
 * ─────────────────────────────────────────────────────
 * Run with gate OFF in admin dashboard — no wallet needed.
 *
 * GITHUB ACTIONS:  push this file + the workflow yml
 * RESULTS:         GitHub → Actions tab → your workflow run
 *
 * Stages:
 *   0–1 min  : ramp to 100 users  (normal load)
 *   1–4 min  : hold 100
 *   4–5 min  : ramp to 500        (stress)
 *   5–6 min  : hold 500
 *   6–7 min  : ramp to 1000       (breaking point)
 *   7–8 min  : hold 1000
 *   8–9 min  : ramp down to 0
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ─── CONFIG ──────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://YOUR-REPLIT-URL.replit.dev';

// ─── CUSTOM METRICS ──────────────────────────────────
const rateLimitHits = new Counter('rate_limit_hits');
const apiErrors     = new Counter('api_errors');
const cacheHits     = new Counter('cache_hits');
const cacheMisses   = new Counter('cache_misses');
const successRate   = new Rate('success_rate');
const panelLoadTime = new Trend('panel_load_time', true);

// ─── LOAD STAGES ─────────────────────────────────────
export const options = {
  stages: [
    { duration: '1m', target: 100  },
    { duration: '3m', target: 100  },
    { duration: '1m', target: 500  },
    { duration: '1m', target: 500  },
    { duration: '1m', target: 1000 },
    { duration: '1m', target: 1000 },
    { duration: '1m', target: 0    },
  ],
  thresholds: {
    http_req_duration:              ['p(95)<2000'],
    'http_req_duration{type:panel}':['p(99)<5000'],
    http_req_failed:                ['rate<0.01'],
    success_rate:                   ['rate>0.99'],
  },
};

// ─── HELPERS ─────────────────────────────────────────
function get(path, tags = {}) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { 'Accept': 'application/json' },
    tags,
  });

  if (res.status === 429) rateLimitHits.add(1);
  if (res.status >= 500)  apiErrors.add(1);

  try {
    const body = JSON.parse(res.body);
    if (body?.cached === true)  cacheHits.add(1);
    if (body?.cached === false) cacheMisses.add(1);
  } catch {}

  successRate.add(res.status < 400 || res.status === 429);
  return res;
}

// ─── MAIN SCENARIO ───────────────────────────────────
export default function () {
  const roll = Math.random();

  // 40% — Network panel
  if (roll < 0.40) {
    group('Network Panel', () => {
      const start = Date.now();
      const r = get('/api/network/intel', { type: 'panel' });
      check(r, { 'intel 200': res => res.status === 200 || res.status === 429 });
      panelLoadTime.add(Date.now() - start);
      sleep(1);
      get('/api/network/chain',      { type: 'panel' });
      get('/api/network/validators', { type: 'panel' });
      sleep(Math.random() * 2);
    });

  // 25% — Explore panel
  } else if (roll < 0.65) {
    group('Explore Panel', () => {
      const start = Date.now();
      const r = get('/api/explore/news', { type: 'panel' });
      check(r, { 'news 200': res => res.status === 200 || res.status === 429 });
      panelLoadTime.add(Date.now() - start);
      sleep(1);
      get('/api/explore/yields', { type: 'panel' });
      sleep(Math.random() * 2);
    });

  // 20% — Protocol panel
  } else if (roll < 0.85) {
    group('Protocol Panel', () => {
      const start = Date.now();
      get('/api/protocol/whale-tracker', { type: 'panel' });
      get('/api/protocol/market-hype',   { type: 'panel' });
      panelLoadTime.add(Date.now() - start);
      sleep(Math.random() * 2);
    });

  // 10% — Gate + NFT config (lightweight)
  } else if (roll < 0.95) {
    group('Gate + Config', () => {
      const r1 = get('/api/gate/status');
      const r2 = get('/api/nft/config');
      const r3 = get('/api/nft/price');
      check(r1, { 'gate 200': res => res.status === 200 });
      check(r2, { 'config 200': res => res.status === 200 });
      sleep(1);
    });

  // 5% — Auth brute force (rate limiter should kick in)
  } else {
    group('Auth Stress', () => {
      const r = http.post(`${BASE_URL}/api/auth/login`,
        JSON.stringify({ password: 'wrongpassword' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      check(r, { 'bad login rejected': res => res.status === 401 || res.status === 429 });
      sleep(1);
    });
  }

  sleep(Math.random() * 1.5);
}
