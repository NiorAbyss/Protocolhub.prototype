// client/src/components/AiScoreBadge.tsx
// Drop under any coin row across all panels.
// Shows: BUY · 79% / SELL · 90% / NEUTRAL · 64%
// Expandable drawer with grouped signal breakdown.

import { useState, useEffect, useRef } from 'react';
import { type AiScore, type SignalCategory } from '@/lib/aiScoring';

/* ─── KEYFRAMES injected once ────────────────────────────────────────────── */
if (typeof document !== 'undefined' && !document.getElementById('ai-badge-kf')) {
  const s = document.createElement('style');
  s.id = 'ai-badge-kf';
  s.textContent = `
    @keyframes aiBadgeGlow  { 0%,100%{opacity:1;} 50%{opacity:0.5;} }
    @keyframes aiBadgePop   { from{transform:scale(0.85);opacity:0;} to{transform:scale(1);opacity:1;} }
    @keyframes aiBadgeSlide { from{opacity:0;transform:translateY(-4px);} to{opacity:1;transform:translateY(0);} }
  `;
  document.head.appendChild(s);
}

const FM = '"IBM Plex Mono","Courier New",monospace';

const DIR_COLOR = {
  BUY:     '#00ff88',
  SELL:    '#ff3355',
  NEUTRAL: 'rgba(170,170,170,0.75)',
} as const;

const CAT_LABEL: Record<SignalCategory, string> = {
  RISK:      '⚠ RISK',
  PRICE:     '◈ PRICE',
  VOLUME:    '⬡ VOLUME',
  LIQUIDITY: '◎ LIQUIDITY',
  SOCIAL:    '◉ SOCIAL',
  CHAIN:     '⬡ CHAIN',
  ONCHAIN:   '◈ ON-CHAIN',
};

/* ─── ANIMATED COUNT-UP ──────────────────────────────────────────────────── */
function useCountUp(target: number, duration = 500): number {
  const [val, setVal] = useState(0);
  const raf   = useRef<number>(0);
  const start = useRef<number>(0);
  const from  = useRef<number>(0);

  useEffect(() => {
    from.current  = val;
    start.current = performance.now();
    const animate = (now: number) => {
      const t     = Math.min((now - start.current) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(from.current + (target - from.current) * eased));
      if (t < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);

  return val;
}

/* ─── CONFIDENCE BAR ─────────────────────────────────────────────────────── */
function ConfBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: 32, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{
        height: '100%', borderRadius: 2,
        width: `${pct}%`,
        background: color,
        transition: 'width 0.6s ease',
      }} />
    </div>
  );
}

/* ─── PROPS ──────────────────────────────────────────────────────────────── */
interface Props {
  score:     AiScore;
  compact?:  boolean;
  prevScore?: number;
  showConf?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BADGE
   ═══════════════════════════════════════════════════════════════════════════ */
export default function AiScoreBadge({ score, compact = false, prevScore, showConf }: Props) {
  const [expanded, setExpanded] = useState(false);
  const animConf = useCountUp(score.directionConfidence);

  const dir      = score.direction;
  const dirColor = DIR_COLOR[dir];
  const isGlow   = dir === 'BUY' && score.directionConfidence >= 80
                || dir === 'SELL' && score.directionConfidence >= 80;

  const delta = prevScore !== undefined ? score.score - prevScore : null;

  const grouped = score.signals.reduce<Record<string, typeof score.signals>>((acc, sig) => {
    if (!acc[sig.category]) acc[sig.category] = [];
    acc[sig.category].push(sig);
    return acc;
  }, {});

  return (
    <div style={{ fontFamily: FM, display: 'inline-block' }}>

      {/* ── PILL ──────────────────────────────────────────────────────── */}
      <div
        onClick={() => !compact && setExpanded(e => !e)}
        style={{
          display:    'inline-flex',
          alignItems: 'center',
          gap:        5,
          cursor:     compact ? 'default' : 'pointer',
          userSelect: 'none',
          animation:  'aiBadgePop 0.2s ease',
        }}
      >
        {/* Main signal pill */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          compact ? 4 : 6,
          padding:      compact ? '2px 7px' : '4px 10px',
          border:       `1px solid ${dirColor}44`,
          borderRadius: 4,
          background:   `${dirColor}0d`,
          boxShadow:    isGlow ? `0 0 12px ${dirColor}22` : 'none',
          animation:    isGlow ? 'aiBadgeGlow 2.5s ease-in-out infinite' : 'none',
        }}>
          {/* Direction label */}
          <span style={{
            fontSize:    compact ? 8 : 9,
            fontWeight:  700,
            color:       dirColor,
            letterSpacing: 2,
          }}>
            {dir}
          </span>

          {/* Separator */}
          <span style={{ fontSize: 8, color: `${dirColor}55` }}>·</span>

          {/* Confidence % with count-up */}
          <span style={{
            fontSize:   compact ? 10 : 12,
            fontWeight: 700,
            color:      dirColor,
            minWidth:   compact ? 22 : 26,
            textAlign:  'right',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {animConf}%
          </span>
        </div>

        {/* Confidence bar (non-compact only) */}
        {!compact && <ConfBar pct={score.directionConfidence} color={dirColor} />}

        {/* Delta */}
        {delta !== null && delta !== 0 && (
          <span style={{
            fontSize: 7, fontWeight: 700,
            color:      delta > 0 ? '#00ff88' : '#ff3355',
            padding:    '1px 4px',
            borderRadius: 3,
            background: delta > 0 ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,85,0.08)',
          }}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}

        {/* Expand chevron */}
        {!compact && (
          <span style={{
            fontSize:   9,
            color:      expanded ? dirColor : 'rgba(255,255,255,0.18)',
            transform:  expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s, color 0.2s',
          }}>▾</span>
        )}
      </div>

      {/* ── EXPANDED DRAWER ───────────────────────────────────────────── */}
      {expanded && !compact && (
        <div style={{
          marginTop:    6,
          padding:      '12px 14px',
          border:       `1px solid ${dirColor}22`,
          borderRadius: 6,
          background:   'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          minWidth:     230,
          animation:    'aiBadgeSlide 0.18s ease',
        }}>

          {/* Direction header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 32, fontWeight: 700, color: dirColor,
                lineHeight: 1, letterSpacing: 3,
                textShadow: `0 0 20px ${dirColor}44`,
              }}>
                {dir}
              </div>
              <div style={{
                fontSize: 20, fontWeight: 700, color: dirColor,
                letterSpacing: 1, marginTop: 2,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {animConf}%
              </div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', marginTop: 3, letterSpacing: 2 }}>
                CONFIDENCE
              </div>
            </div>

            <div style={{ flex: 1 }}>
              {/* Confidence bar full */}
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${score.directionConfidence}%`,
                  background: `linear-gradient(90deg, ${dirColor}66, ${dirColor})`,
                  transition: 'width 0.6s ease',
                  boxShadow: `0 0 8px ${dirColor}44`,
                }} />
              </div>
              {/* Rule confidence */}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>RULES FIRED</span>
                <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)' }}>{score.confidence}%</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden', marginTop: 3 }}>
                <div style={{ height: '100%', width: `${score.confidence}%`, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }} />
              </div>
            </div>
          </div>

          {/* Signals */}
          {score.signals.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9 }}>No signals fired</div>
          ) : (
            Object.entries(grouped).map(([cat, sigs]) => (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 7, letterSpacing: 2, color: 'rgba(255,255,255,0.18)', marginBottom: 4 }}>
                  {CAT_LABEL[cat as SignalCategory] ?? cat}
                </div>
                {sigs.map((sig, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 8, color: sig.positive ? '#00ff88' : '#ff3355', flexShrink: 0, marginTop: 1 }}>
                      {sig.positive ? '▲' : '▼'}
                    </span>
                    <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                      {sig.text}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 7, flexShrink: 0,
                      color: sig.positive ? 'rgba(0,255,136,0.35)' : 'rgba(255,51,85,0.35)' }}>
                      {sig.positive ? '+' : '-'}{sig.weight}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}

          {/* Disclaimer */}
          <div style={{
            marginTop: 8, paddingTop: 6,
            borderTop: '1px solid rgba(255,255,255,0.05)',
            fontSize: 7, color: 'rgba(255,255,255,0.12)',
            letterSpacing: 0.3, lineHeight: 1.5,
          }}>
            ⚠ {score.disclaimer}
          </div>
        </div>
      )}
    </div>
  );
}