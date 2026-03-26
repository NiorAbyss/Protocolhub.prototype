// client/src/lib/aiScoring.ts
// Rule-based AI scoring engine.
// Returns a 0–100 score, label, colour, confidence, signal list, and disclaimer.
// Called client-side — no API needed. Pure deterministic rules.
// LunarCrush removed — adapters now cover CoinGecko, DexScreener,
// Alternative.me Fear & Greed, Solana Chain, Validators, Whale, Audit.

export type ScoreLabel = 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'CAUTION' | 'SELL' | 'HIGH RISK';
export type ScoreColor = '#00ff88' | '#00ccff' | '#aaaaaa' | '#ffaa00' | '#ff6600' | '#ff3355';
export type SignalCategory = 'RISK' | 'PRICE' | 'VOLUME' | 'LIQUIDITY' | 'SOCIAL' | 'CHAIN' | 'ONCHAIN';

export interface AiScore {
  score:               number;       // 0–100 internal score
  label:               ScoreLabel;
  color:               ScoreColor;
  bar:                 number;       // 0–100 for progress bar
  confidence:          number;       // 0–100 — how many rule buckets fired vs possible
  signals:             Signal[];     // up to 6 bullet reasons, grouped by category
  disclaimer:          string;
  direction:           'BUY' | 'SELL' | 'NEUTRAL';
  directionConfidence: number;       // 50–100 — how sure the AI is of the direction
}

export interface Signal {
  text:     string;
  positive: boolean;
  category: SignalCategory;
  weight:   number;         // absolute delta this signal contributed
}

export interface CoinInput {
  // Price
  priceChange1h?:    number;   // % e.g. 2.5 or -4.1
  priceChange24h?:   number;
  priceChange7d?:    number;

  // Volume
  volume24h?:        number;   // USD
  volumeChange?:     number;   // % vs prev 24h

  // Market structure
  liquidity?:        number;   // USD pool liquidity
  marketCap?:        number;   // USD
  fdv?:              number;   // fully diluted valuation

  // Social
  socialVolume?:     number;   // raw count
  socialSentiment?:  number;   // -1 to +1
  fearGreedIndex?:   number;   // 0–100 from Alternative.me

  // On-chain
  txCount24h?:       number;
  whaleActivity?:    'high' | 'medium' | 'low' | null;
  holderGrowth?:     number;   // % change
  buyPressure?:      number;   // 0–100, % of txns that are buys

  // Chain health (Solana)
  tps?:              number;   // live TPS
  avgTps?:           number;   // 15-sample average
  priorityFeeP75?:   number;   // microLamports
  epochProgress?:    number;   // 0–100%
  delinquentPct?:    number;   // % of validators delinquent
  nakamotoCoeff?:    number;   // decentralisation score

  // Contract risk
  riskScore?:        number;   // 0–100, higher = more risk
  isHoneypot?:       boolean;
  hasProxyContract?: boolean;
  mintable?:         boolean;
  topHolderPct?:     number;   // % held by top 10 wallets
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN SCORING FUNCTION
   ═══════════════════════════════════════════════════════════════════════════ */
export function scoreAsset(input: CoinInput): AiScore {
  let score = 50;
  const signals: Signal[] = [];
  let bucketsFired = 0;        // confidence tracking
  const TOTAL_BUCKETS = 12;    // how many rule groups exist

  // ── 1. HARD OVERRIDES ────────────────────────────────────────────────
  if (input.isHoneypot) {
    return buildScore(0, 100, [{ text: 'Honeypot contract — cannot sell tokens', positive: false, category: 'RISK', weight: 100 }]);
  }

  // ── 2. CONTRACT RISK ─────────────────────────────────────────────────
  if (input.riskScore !== undefined) {
    bucketsFired++;
    if      (input.riskScore >= 80) { score -= 35; signals.push({ text: 'Critical contract risk score detected',     positive: false, category: 'RISK', weight: 35 }); }
    else if (input.riskScore >= 50) { score -= 15; signals.push({ text: 'Elevated contract risk — audit flagged',    positive: false, category: 'RISK', weight: 15 }); }
    else if (input.riskScore >= 25) { score -=  5; signals.push({ text: 'Minor contract risk flags present',         positive: false, category: 'RISK', weight: 5  }); }
    else                            { score +=  8; signals.push({ text: 'Contract audit passed cleanly',              positive: true,  category: 'RISK', weight: 8  }); }
  }

  if (input.topHolderPct !== undefined) {
    bucketsFired++;
    if      (input.topHolderPct > 70) { score -= 22; signals.push({ text: `Top 10 wallets hold ${input.topHolderPct.toFixed(0)}% — extreme concentration`, positive: false, category: 'RISK', weight: 22 }); }
    else if (input.topHolderPct > 50) { score -= 12; signals.push({ text: `Top 10 wallets hold ${input.topHolderPct.toFixed(0)}% of supply`,               positive: false, category: 'RISK', weight: 12 }); }
    else if (input.topHolderPct < 20) { score +=  8; signals.push({ text: 'Well distributed token supply',                                                  positive: true,  category: 'RISK', weight: 8  }); }
  }

  if (input.mintable)         { score -= 10; signals.push({ text: 'Mintable contract — unlimited inflation risk', positive: false, category: 'RISK', weight: 10 }); bucketsFired++; }
  if (input.hasProxyContract) { score -=  6; signals.push({ text: 'Proxy contract — logic can be upgraded',       positive: false, category: 'RISK', weight: 6  }); bucketsFired++; }

  // FDV vs MCap sanity check — huge FDV relative to mcap = heavy unlock pressure
  if (input.fdv && input.marketCap && input.marketCap > 0) {
    const fdvRatio = input.fdv / input.marketCap;
    if (fdvRatio > 20) { score -= 8; signals.push({ text: `FDV is ${fdvRatio.toFixed(0)}x market cap — heavy unlock risk`, positive: false, category: 'RISK', weight: 8 }); bucketsFired++; }
    else if (fdvRatio < 2) { score += 4; bucketsFired++; }
  }

  // ── 3. PRICE ACTION ──────────────────────────────────────────────────
  const p24 = input.priceChange24h ?? 0;
  const p7d  = input.priceChange7d  ?? 0;
  const p1h  = input.priceChange1h  ?? 0;

  bucketsFired++;
  if      (p24 > 20)  { score += 14; signals.push({ text: `+${p24.toFixed(1)}% in 24h — explosive momentum`,   positive: true,  category: 'PRICE', weight: 14 }); }
  else if (p24 > 10)  { score += 10; signals.push({ text: `+${p24.toFixed(1)}% in 24h — strong momentum`,      positive: true,  category: 'PRICE', weight: 10 }); }
  else if (p24 > 4)   { score +=  5; signals.push({ text: `+${p24.toFixed(1)}% in 24h — positive trend`,        positive: true,  category: 'PRICE', weight: 5  }); }
  else if (p24 < -25) { score -= 16; signals.push({ text: `${p24.toFixed(1)}% in 24h — capitulation selling`,  positive: false, category: 'PRICE', weight: 16 }); }
  else if (p24 < -12) { score -= 10; signals.push({ text: `${p24.toFixed(1)}% in 24h — heavy selling pressure`, positive: false, category: 'PRICE', weight: 10 }); }
  else if (p24 < -5)  { score -=  5; signals.push({ text: `${p24.toFixed(1)}% in 24h — downward pressure`,      positive: false, category: 'PRICE', weight: 5  }); }

  bucketsFired++;
  if      (p7d > 40 && p24 > 0) { score +=  8; signals.push({ text: 'Sustained weekly uptrend with daily confirmation',  positive: true,  category: 'PRICE', weight: 8 }); }
  else if (p7d > 15 && p24 > 0) { score +=  4; signals.push({ text: 'Weekly trend aligns with daily momentum',           positive: true,  category: 'PRICE', weight: 4 }); }
  else if (p7d < -35)            { score -= 10; signals.push({ text: 'Prolonged weekly downtrend',                        positive: false, category: 'PRICE', weight: 10 }); }
  else if (p7d < -15)            { score -=  5; signals.push({ text: 'Weekly trend negative',                             positive: false, category: 'PRICE', weight: 5  }); }

  // 1h momentum — small nudge, no signal text (too noisy)
  if (p1h >  4) score += 5;
  if (p1h < -4) score -= 5;
  if (p1h >  2) score += 2;
  if (p1h < -2) score -= 2;

  // ── 4. MOMENTUM CONVERGENCE BONUS ────────────────────────────────────
  // When 1h + 24h + 7d all point same direction — strong trend confirmation
  if (input.priceChange1h !== undefined && input.priceChange24h !== undefined && input.priceChange7d !== undefined) {
    bucketsFired++;
    const allUp   = p1h > 0 && p24 > 0 && p7d > 0;
    const allDown = p1h < 0 && p24 < 0 && p7d < 0;
    if      (allUp   && p24 > 5)  { score += 8; signals.push({ text: '1h · 24h · 7d all green — trend convergence confirmed', positive: true,  category: 'PRICE', weight: 8 }); }
    else if (allDown && p24 < -5) { score -= 8; signals.push({ text: '1h · 24h · 7d all red — multi-timeframe downtrend',    positive: false, category: 'PRICE', weight: 8 }); }
    // Divergence (1h reverting against 7d trend) — possible reversal signal
    else if (p1h > 2 && p7d < -10) { score += 3; signals.push({ text: 'Short-term bounce against weekly downtrend',          positive: true,  category: 'PRICE', weight: 3 }); }
    else if (p1h < -2 && p7d > 10) { score -= 3; signals.push({ text: 'Hourly pullback in weekly uptrend',                   positive: false, category: 'PRICE', weight: 3 }); }
  }

  // ── 5. VOLATILITY PENALTY ─────────────────────────────────────────────
  // Extreme swing without sustained direction = instability, not opportunity
  const absSwing = Math.abs(p24);
  if (absSwing > 40 && Math.abs(p7d) < 10) {
    score -= 6;
    signals.push({ text: `Extreme 24h swing (${p24 > 0 ? '+' : ''}${p24.toFixed(0)}%) without weekly direction — high volatility risk`, positive: false, category: 'PRICE', weight: 6 });
    bucketsFired++;
  }

  // ── 6. VOLUME ─────────────────────────────────────────────────────────
  const vol      = input.volume24h ?? 0;
  const mcap     = input.marketCap ?? 0;
  const volChange = input.volumeChange ?? 0;

  bucketsFired++;
  if      (vol > 100_000_000)                       { score += 10; signals.push({ text: 'Exceptional 24h volume — institutional-level activity',   positive: true,  category: 'VOLUME', weight: 10 }); }
  else if (vol > 20_000_000)                        { score +=  7; signals.push({ text: 'Very high 24h volume — strong market participation',      positive: true,  category: 'VOLUME', weight: 7  }); }
  else if (vol > 5_000_000)                         { score +=  4; signals.push({ text: 'Healthy 24h trading volume',                              positive: true,  category: 'VOLUME', weight: 4  }); }
  else if (vol < 50_000 && mcap > 1_000_000)        { score -= 12; signals.push({ text: 'Critically low volume relative to market cap',            positive: false, category: 'VOLUME', weight: 12 }); }
  else if (vol < 200_000 && mcap > 5_000_000)       { score -=  7; signals.push({ text: 'Low volume — thin market, easy to manipulate',            positive: false, category: 'VOLUME', weight: 7  }); }

  // Vol/MCap ratio — smart money signal
  if (vol > 0 && mcap > 0) {
    const ratio = vol / mcap;
    bucketsFired++;
    if      (ratio > 0.5)  { score +=  7; signals.push({ text: `Vol/MCap ratio ${(ratio * 100).toFixed(0)}% — extremely active market`,    positive: true,  category: 'VOLUME', weight: 7 }); }
    else if (ratio > 0.15) { score +=  3; signals.push({ text: `Vol/MCap ratio ${(ratio * 100).toFixed(0)}% — healthy turnover`,           positive: true,  category: 'VOLUME', weight: 3 }); }
    else if (ratio < 0.01) { score -=  6; signals.push({ text: `Vol/MCap ratio ${(ratio * 100).toFixed(1)}% — illiquid, stale market`,     positive: false, category: 'VOLUME', weight: 6 }); }
  }

  bucketsFired++;
  if      (volChange > 200) { score += 10; signals.push({ text: `Volume surge +${volChange.toFixed(0)}% vs prior 24h — breakout signal`, positive: true,  category: 'VOLUME', weight: 10 }); }
  else if (volChange > 80)  { score +=  6; signals.push({ text: `Volume up +${volChange.toFixed(0)}% vs prior 24h`,                      positive: true,  category: 'VOLUME', weight: 6  }); }
  else if (volChange < -70) { score -=  8; signals.push({ text: 'Volume collapsing — interest fading',                                    positive: false, category: 'VOLUME', weight: 8  }); }
  else if (volChange < -40) { score -=  4; signals.push({ text: 'Volume declining — weakening momentum',                                  positive: false, category: 'VOLUME', weight: 4  }); }

  // ── 7. BUY PRESSURE ──────────────────────────────────────────────────
  if (input.buyPressure !== undefined) {
    bucketsFired++;
    if      (input.buyPressure > 65) { score += 7; signals.push({ text: `${input.buyPressure.toFixed(0)}% of transactions are buys — strong demand`,  positive: true,  category: 'VOLUME', weight: 7 }); }
    else if (input.buyPressure > 55) { score += 3; signals.push({ text: `${input.buyPressure.toFixed(0)}% buy ratio — slight demand edge`,             positive: true,  category: 'VOLUME', weight: 3 }); }
    else if (input.buyPressure < 35) { score -= 7; signals.push({ text: `${input.buyPressure.toFixed(0)}% buy ratio — selling pressure dominates`,     positive: false, category: 'VOLUME', weight: 7 }); }
    else if (input.buyPressure < 45) { score -= 3; signals.push({ text: `${input.buyPressure.toFixed(0)}% buy ratio — slight sell bias`,               positive: false, category: 'VOLUME', weight: 3 }); }
  }

  // ── 8. LIQUIDITY ─────────────────────────────────────────────────────
  const liq = input.liquidity ?? 0;
  if (liq > 0) {
    bucketsFired++;
    if      (liq > 5_000_000)  { score +=  8; signals.push({ text: `Deep liquidity ($${fmt(liq)}) — low slippage for large trades`, positive: true,  category: 'LIQUIDITY', weight: 8  }); }
    else if (liq > 500_000)    { score +=  4; }
    else if (liq < 10_000)     { score -= 14; signals.push({ text: `Dangerously low liquidity ($${fmt(liq)}) — extreme slippage risk`, positive: false, category: 'LIQUIDITY', weight: 14 }); }
    else if (liq < 50_000)     { score -=  8; signals.push({ text: `Thin liquidity ($${fmt(liq)}) — use limit orders`,                positive: false, category: 'LIQUIDITY', weight: 8  }); }
    else if (liq < 150_000)    { score -=  4; signals.push({ text: `Low liquidity ($${fmt(liq)}) — watch slippage`,                   positive: false, category: 'LIQUIDITY', weight: 4  }); }
  }

  // ── 9. SOCIAL / SENTIMENT ────────────────────────────────────────────
  const sentiment = input.socialSentiment ?? 0;
  const socialVol = input.socialVolume    ?? 0;

  if (input.socialSentiment !== undefined) {
    bucketsFired++;
    if      (sentiment > 0.65) { score +=  8; signals.push({ text: 'Strong positive social sentiment signal',     positive: true,  category: 'SOCIAL', weight: 8 }); }
    else if (sentiment > 0.35) { score +=  4; signals.push({ text: 'Moderately positive social sentiment',        positive: true,  category: 'SOCIAL', weight: 4 }); }
    else if (sentiment < -0.5) { score -=  9; signals.push({ text: 'Strongly negative social sentiment trending', positive: false, category: 'SOCIAL', weight: 9 }); }
    else if (sentiment < -0.2) { score -=  5; signals.push({ text: 'Negative social sentiment detected',          positive: false, category: 'SOCIAL', weight: 5 }); }
  }

  if (socialVol > 0) {
    bucketsFired++;
    if   (socialVol > 50_000) { score += 6; signals.push({ text: `Viral social volume (${fmt(socialVol)} mentions)`, positive: true, category: 'SOCIAL', weight: 6 }); }
    else if (socialVol > 10_000) { score += 3; signals.push({ text: `High social volume — trending topic`,               positive: true, category: 'SOCIAL', weight: 3 }); }
  }

  // ── 10. FEAR & GREED (macro context) ─────────────────────────────────
  if (input.fearGreedIndex !== undefined) {
    bucketsFired++;
    const fng = input.fearGreedIndex;
    if      (fng >= 80) { score -= 6; signals.push({ text: `Fear & Greed at ${fng} (EXTREME GREED) — market overheated`, positive: false, category: 'SOCIAL', weight: 6 }); }
    else if (fng >= 65) { score += 4; signals.push({ text: `Fear & Greed at ${fng} (GREED) — bullish macro environment`,  positive: true,  category: 'SOCIAL', weight: 4 }); }
    else if (fng >= 45) { score += 2; }  // neutral — small boost
    else if (fng <= 20) { score += 7; signals.push({ text: `Fear & Greed at ${fng} (EXTREME FEAR) — potential buy zone`,  positive: true,  category: 'SOCIAL', weight: 7 }); }
    else if (fng <= 35) { score -= 4; signals.push({ text: `Fear & Greed at ${fng} (FEAR) — risk-off environment`,        positive: false, category: 'SOCIAL', weight: 4 }); }
  }

  // ── 11. ON-CHAIN ─────────────────────────────────────────────────────
  if (input.whaleActivity) {
    bucketsFired++;
    const isUp = p24 >= 0;
    if      (input.whaleActivity === 'high')   { score += isUp ? 7 : -7; signals.push({ text: `High whale wallet activity — ${isUp ? 'accumulation' : 'distribution'} signal`, positive: isUp, category: 'ONCHAIN', weight: 7 }); }
    else if (input.whaleActivity === 'medium') { score += isUp ? 3 : -3; }
  }

  if (input.holderGrowth !== undefined) {
    bucketsFired++;
    if      (input.holderGrowth > 10) { score +=  8; signals.push({ text: `Holder count growing +${input.holderGrowth.toFixed(1)}% — strong adoption`,       positive: true,  category: 'ONCHAIN', weight: 8 }); }
    else if (input.holderGrowth > 3)  { score +=  4; signals.push({ text: `Holders growing +${input.holderGrowth.toFixed(1)}%`,                              positive: true,  category: 'ONCHAIN', weight: 4 }); }
    else if (input.holderGrowth < -8) { score -= 10; signals.push({ text: `Holder count declining ${input.holderGrowth.toFixed(1)}% — distribution in progress`, positive: false, category: 'ONCHAIN', weight: 10 }); }
    else if (input.holderGrowth < -3) { score -=  5; signals.push({ text: 'Holders declining — weakening community',                                          positive: false, category: 'ONCHAIN', weight: 5  }); }
  }

  if ((input.txCount24h ?? 0) > 0) {
    bucketsFired++;
    if      ((input.txCount24h ?? 0) > 50_000) { score +=  8; signals.push({ text: `${fmt(input.txCount24h!)} txns/24h — extremely high on-chain activity`, positive: true,  category: 'ONCHAIN', weight: 8 }); }
    else if ((input.txCount24h ?? 0) > 10_000) { score +=  5; signals.push({ text: `${fmt(input.txCount24h!)} txns/24h — high on-chain activity`,           positive: true,  category: 'ONCHAIN', weight: 5 }); }
    else if ((input.txCount24h ?? 0) > 2_000)  { score +=  2; }
  }

  // ── 12. SOLANA CHAIN HEALTH ──────────────────────────────────────────
  if (input.tps !== undefined || input.avgTps !== undefined) {
    bucketsFired++;
    const tps = input.avgTps ?? input.tps ?? 0;
    if      (tps > 3500) { score +=  8; signals.push({ text: `Solana TPS ${tps.toFixed(0)} — network healthy, fast execution`,     positive: true,  category: 'CHAIN', weight: 8 }); }
    else if (tps > 2000) { score +=  4; signals.push({ text: `Solana TPS ${tps.toFixed(0)} — good network conditions`,             positive: true,  category: 'CHAIN', weight: 4 }); }
    else if (tps < 400)  { score -= 12; signals.push({ text: `Solana TPS only ${tps.toFixed(0)} — network degraded, delay risk`,   positive: false, category: 'CHAIN', weight: 12 }); }
    else if (tps < 1000) { score -=  5; signals.push({ text: `Solana TPS ${tps.toFixed(0)} — congested, use high priority fee`,    positive: false, category: 'CHAIN', weight: 5  }); }
  }

  if (input.priorityFeeP75 !== undefined) {
    bucketsFired++;
    const fee = input.priorityFeeP75;
    if      (fee < 1_000)   { score +=  5; signals.push({ text: 'Priority fees low — cheap to transact right now',          positive: true,  category: 'CHAIN', weight: 5 }); }
    else if (fee > 200_000) { score -=  8; signals.push({ text: 'Priority fees very high — network congested, costly txns', positive: false, category: 'CHAIN', weight: 8 }); }
    else if (fee > 50_000)  { score -=  4; signals.push({ text: 'Priority fees elevated — moderate congestion',             positive: false, category: 'CHAIN', weight: 4 }); }
  }

  if (input.delinquentPct !== undefined) {
    bucketsFired++;
    if      (input.delinquentPct > 10) { score -= 15; signals.push({ text: `${input.delinquentPct.toFixed(1)}% validators delinquent — network instability`, positive: false, category: 'CHAIN', weight: 15 }); }
    else if (input.delinquentPct > 5)  { score -=  7; signals.push({ text: `${input.delinquentPct.toFixed(1)}% validators delinquent — watch closely`,       positive: false, category: 'CHAIN', weight: 7  }); }
    else if (input.delinquentPct < 1)  { score +=  5; signals.push({ text: 'Validator network healthy — <1% delinquent',                                     positive: true,  category: 'CHAIN', weight: 5  }); }
  }

  if (input.nakamotoCoeff !== undefined) {
    bucketsFired++;
    if      (input.nakamotoCoeff >= 30) { score +=  6; signals.push({ text: `Nakamoto coefficient ${input.nakamotoCoeff} — strong decentralisation`, positive: true,  category: 'CHAIN', weight: 6 }); }
    else if (input.nakamotoCoeff < 19)  { score -=  8; signals.push({ text: `Nakamoto coefficient only ${input.nakamotoCoeff} — centralisation risk`, positive: false, category: 'CHAIN', weight: 8 }); }
  }

  // ── CONFIDENCE ───────────────────────────────────────────────────────
  const confidence = Math.min(100, Math.round((bucketsFired / TOTAL_BUCKETS) * 100));

  return buildScore(score, confidence, signals);
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUILD FINAL SCORE OBJECT
   ═══════════════════════════════════════════════════════════════════════════ */
function buildScore(rawScore: number, confidence: number, signals: Signal[]): AiScore {
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Sort by absolute weight descending, take top 6
  const sorted = [...signals].sort((a, b) => b.weight - a.weight).slice(0, 6);

  let label: ScoreLabel;
  let color: ScoreColor;

  if      (score >= 75) { label = 'STRONG BUY'; color = '#00ff88'; }
  else if (score >= 60) { label = 'BUY';         color = '#00ccff'; }
  else if (score >= 45) { label = 'NEUTRAL';     color = '#aaaaaa'; }
  else if (score >= 32) { label = 'CAUTION';     color = '#ffaa00'; }
  else if (score >= 18) { label = 'SELL';        color = '#ff6600'; }
  else                  { label = 'HIGH RISK';   color = '#ff3355'; }

  // ── Direction + confidence ────────────────────────────────────────────
  // BUY  zone: score 58–100 → directionConfidence 50–100%
  // SELL zone: score  0–42  → directionConfidence 50–100%
  // NEUTRAL  : score 43–57  → directionConfidence = rule confidence
  let direction: 'BUY' | 'SELL' | 'NEUTRAL';
  let directionConfidence: number;

  if (score >= 58) {
    direction           = 'BUY';
    directionConfidence = Math.round(50 + ((score - 58) / 42) * 50);
  } else if (score <= 42) {
    direction           = 'SELL';
    directionConfidence = Math.round(50 + ((42 - score) / 42) * 50);
  } else {
    direction           = 'NEUTRAL';
    directionConfidence = confidence; // use rule-firing confidence for neutral
  }

  directionConfidence = Math.max(50, Math.min(100, directionConfidence));

  return {
    score,
    label,
    color,
    bar:                score,
    confidence,
    signals:            sorted,
    disclaimer:         'AI signal is rule-based, not financial advice. Always DYOR.',
    direction,
    directionConfidence,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}


/* ═══════════════════════════════════════════════════════════════════════════
   CONVENIENCE ADAPTERS — one per data source across all panels
   ═══════════════════════════════════════════════════════════════════════════ */

// ── CoinGecko markets endpoint (/api/network/intel → markets array) ────────
export function scoreFromCoinGecko(coin: any, fearGreedIndex?: number): AiScore {
  const vol      = coin.total_volume    ?? 0;
  const mcap     = coin.market_cap      ?? 0;
  const volPrev  = coin.total_volume_previous ?? 0;
  return scoreAsset({
    priceChange1h:   coin.price_change_percentage_1h_in_currency,
    priceChange24h:  coin.price_change_percentage_24h,
    priceChange7d:   coin.price_change_percentage_7d_in_currency,
    volume24h:       vol,
    volumeChange:    volPrev > 0 ? ((vol - volPrev) / volPrev) * 100 : undefined,
    marketCap:       mcap,
    fearGreedIndex,
  });
}

// ── DexScreener pair object (/api/network/flows → solPairs.pairs[]) ─────────
export function scoreFromDexScreener(pair: any): AiScore {
  const buys  = pair.txns?.h24?.buys  ?? 0;
  const sells = pair.txns?.h24?.sells ?? 0;
  const total = buys + sells;
  return scoreAsset({
    priceChange1h:  pair.priceChange?.h1,
    priceChange24h: pair.priceChange?.h24,
    volume24h:      pair.volume?.h24,
    liquidity:      pair.liquidity?.usd,
    txCount24h:     total,
    buyPressure:    total > 0 ? (buys / total) * 100 : undefined,
    volumeChange:   pair.volume?.h24 && pair.volume?.h6
      ? ((pair.volume.h24 - pair.volume.h6 * 4) / (pair.volume.h6 * 4)) * 100
      : undefined,
  });
}

// ── Alternative.me Fear & Greed index (/api/network/intel → fng) ────────────
export function scoreFromFearGreed(fngValue: number): AiScore {
  return scoreAsset({ fearGreedIndex: fngValue });
}

// ── Solana chain data (/api/network/chain) ───────────────────────────────────
export function scoreFromSolanaChain(chain: {
  avgTps?:          number;
  liveTps?:         number;
  priorityFeeP75?:  number;
  epochProgress?:   number;
}): AiScore {
  return scoreAsset({
    tps:             chain.liveTps,
    avgTps:          chain.avgTps,
    priorityFeeP75:  chain.priorityFeeP75,
    epochProgress:   chain.epochProgress,
  });
}

// ── Solana validators (/api/network/validators) ──────────────────────────────
export function scoreFromValidators(data: {
  delinquentPct:  number;
  nakamotoCoeff:  number;
}): AiScore {
  return scoreAsset({
    delinquentPct: data.delinquentPct,
    nakamotoCoeff: data.nakamotoCoeff,
  });
}

// ── Whale transaction (/api/network/whales items[]) ──────────────────────────
export function scoreFromWhale(whale: any): AiScore {
  const usd = whale.amountUsd ?? whale.usdValue ?? 0;
  return scoreAsset({
    volume24h:      usd,
    buyPressure:    whale.side === 'BUY' ? 70 : 30,
    whaleActivity:  usd > 500_000 ? 'high' : usd > 100_000 ? 'medium' : 'low',
    priceChange24h: whale.priceChange24h ?? 0,
  });
}

// ── GoPlus contract audit (/api/protocol/audit) ──────────────────────────────
export function scoreFromAudit(audit: any): AiScore {
  return scoreAsset({
    riskScore:        audit.riskScore,
    isHoneypot:       audit.flags?.find((f: any) => f.label === 'Honeypot')?.value,
    hasProxyContract: audit.flags?.find((f: any) => f.label === 'Proxy Contract')?.value,
    mintable:         audit.flags?.find((f: any) => f.label === 'Mint Function')?.value,
    topHolderPct:     audit.metadata?.topHolderConcentration,
  });
}

// ── CoinGecko trending item (/api/network/intel → trending.coins[]) ──────────
export function scoreFromTrending(item: any, fearGreedIndex?: number): AiScore {
  const c = item.item ?? item;
  return scoreAsset({
    priceChange24h: c.data?.price_change_percentage_24h?.usd ?? 0,
    volume24h:      c.data?.total_volume   ?? 0,
    marketCap:      c.data?.market_cap     ?? 0,
    fearGreedIndex,
  });
}