// client/src/components/hud/PremiumAura.tsx
// Layered premium aura — Gold + Cyan
// Layer 1: Soft core glow
// Layer 2: Canvas particle field (50 particles orbiting + drifting)
// Layer 3: Plasma rings (3 rings, opposite rotations, color shift)
// Layer 4: Pulse waves (emit every 3s, expand + fade)
// Layer 5: Battery-reactive inner ring (cyan → orange → red)
// Pure CSS + single canvas — zero libraries, zero performance hit

import { useEffect, useRef } from 'react';

interface Props {
  battery: number;   // 0–100
  active:  boolean;
}

// ── Color palette ─────────────────────────────────────────────
const CYAN   = '#00f2ff';
const CYAN2  = '#00b4ff';
const GOLD   = '#f7c948';
const GOLD2  = '#f0a500';
const GOLD3  = '#ffd700';

// Battery level → ring color
function batteryColor(b: number): string {
  if (b > 60) return CYAN;
  if (b > 30) return GOLD;
  if (b > 10) return '#ffaa00';
  return '#ff3355';
}

// ── Keyframes injected once ────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('aura-premium-kf')) {
  const s = document.createElement('style');
  s.id = 'aura-premium-kf';
  s.textContent = `
    @keyframes aura-core {
      0%,100% { opacity:0.80; transform:translate(-50%,-50%) scale(0.92); filter:blur(14px); }
      50%      { opacity:1.00; transform:translate(-50%,-50%) scale(1.08); filter:blur(20px); }
    }
    @keyframes aura-core-gold {
      0%,100% { opacity:0.55; transform:translate(-50%,-50%) scale(0.88); filter:blur(16px); }
      50%      { opacity:0.80; transform:translate(-50%,-50%) scale(1.12); filter:blur(24px); }
    }
    @keyframes ring-cw {
      from { transform: translate(-50%,-50%) rotate(0deg);   }
      to   { transform: translate(-50%,-50%) rotate(360deg); }
    }
    @keyframes ring-ccw {
      from { transform: translate(-50%,-50%) rotate(0deg);    }
      to   { transform: translate(-50%,-50%) rotate(-360deg); }
    }
    @keyframes ring-fade {
      0%   { opacity:0;    transform:translate(-50%,-50%) scale(0.5); }
      15%  { opacity:0.55; transform:translate(-50%,-50%) scale(0.9); }
      100% { opacity:0;    transform:translate(-50%,-50%) scale(2.2); }
    }
    @keyframes ring-fade-2 {
      0%   { opacity:0;    transform:translate(-50%,-50%) scale(0.5); }
      15%  { opacity:0.35; transform:translate(-50%,-50%) scale(0.9); }
      100% { opacity:0;    transform:translate(-50%,-50%) scale(2.0); }
    }
    @keyframes inner-pulse {
      0%,100% { opacity:0.7; box-shadow: 0 0 8px 2px var(--ring-color); }
      50%      { opacity:1.0; box-shadow: 0 0 16px 4px var(--ring-color); }
    }
  `;
  document.head.appendChild(s);
}

// ── Particle system ────────────────────────────────────────────
interface Particle {
  angle:   number;
  radius:  number;
  speed:   number;
  size:    number;
  opacity: number;
  drift:   number;
  hue:     number;   // 0=cyan, 1=gold
}

function initParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    angle:   Math.random() * Math.PI * 2,
    radius:  30 + Math.random() * 55,
    speed:   (Math.random() * 0.004 + 0.001) * (Math.random() > 0.5 ? 1 : -1),
    size:    Math.random() * 1.4 + 0.4,
    opacity: Math.random() * 0.5 + 0.15,
    drift:   (Math.random() - 0.5) * 0.12,
    hue:     Math.random() > 0.4 ? 0 : 1,   // 60% cyan, 40% gold
  }));
}

function ParticleCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>(initParticles(50));
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SIZE = 200;
    canvas.width  = SIZE;
    canvas.height = SIZE;
    const cx = SIZE / 2;
    const cy = SIZE / 2;

    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);

      if (!active) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      particles.current.forEach(p => {
        // Update
        p.angle  += p.speed;
        p.radius += p.drift * 0.05;
        if (p.radius > 90) { p.radius = 30; p.opacity = Math.random() * 0.4 + 0.1; }
        if (p.radius < 20) { p.radius = 30; }

        // Draw
        const x = cx + Math.cos(p.angle) * p.radius;
        const y = cy + Math.sin(p.angle) * p.radius;

        const color = p.hue === 0
          ? `rgba(0, 242, 255, ${p.opacity})`
          : `rgba(247, 201, 72, ${p.opacity})`;

        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = color;

        // Soft glow
        ctx.shadowBlur  = 6;
        ctx.shadowColor = p.hue === 0 ? CYAN : GOLD;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 200, height: 200,
        pointerEvents: 'none',
        opacity: active ? 1 : 0,
        transition: 'opacity 0.8s ease',
      }}
    />
  );
}

// ── Main component ─────────────────────────────────────────────
export default function PremiumAura({ battery, active }: Props) {
  const ringColor = batteryColor(battery);

  if (!active) return null;

  return (
    <div style={{
      position:      'absolute',
      top:           '50.5%',
      left:          '50%',
      transform:     'translate(-50%, -50%)',  // center on the orb
      width:         '14%',
      aspectRatio:   '1/1',
      pointerEvents: 'none',
      zIndex:        5,
    }}>

      {/* ── Layer 1a: Core cyan glow ── */}
      <div style={{
        position:   'absolute', top: '50%', left: '50%',
        width:      '130%', height: '130%',
        transform:  'translate(-50%,-50%)',
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(0,242,255,0.85) 0%, rgba(0,180,255,0.45) 40%, rgba(0,100,255,0.15) 65%, transparent 80%)`,
        animation:  'aura-core 3s ease-in-out infinite',
        filter:     'blur(4px)',
      }} />

      {/* ── Layer 1b: Core gold glow (offset timing) ── */}
      <div style={{
        position:   'absolute', top: '50%', left: '50%',
        width:      '150%', height: '150%',
        transform:  'translate(-50%,-50%)',
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(247,201,72,0.65) 0%, rgba(240,165,0,0.30) 35%, rgba(247,150,0,0.10) 60%, transparent 75%)`,
        animation:  'aura-core-gold 4.5s ease-in-out infinite',
        animationDelay: '-1.5s',
        filter:     'blur(5px)',
      }} />

      {/* ── Layer 2: Particles ── */}
      <ParticleCanvas active={active} />

      {/* ── Layer 3a: Plasma ring CW (cyan, thin) ── */}
      <div style={{
        position:     'absolute', top: '50%', left: '50%',
        transform:    'translate(-50%,-50%)',
        width:        '130%', height: '130%',
        borderRadius: '50%',
        border:       `1.5px solid rgba(0, 242, 255, 0.55)`,
        boxShadow:    `0 0 16px rgba(0,242,255,0.35), inset 0 0 12px rgba(0,242,255,0.15)`,
        animation:    'ring-cw 12s linear infinite',
        // Broken ring effect
        backgroundImage: `conic-gradient(rgba(0,242,255,0.35) 0deg, transparent 40deg, transparent 180deg, rgba(0,242,255,0.18) 220deg, transparent 260deg, transparent 360deg)`,
      }} />

      {/* ── Layer 3b: Plasma ring CCW (gold, slightly larger) ── */}
      <div style={{
        position:     'absolute', top: '50%', left: '50%',
        transform:    'translate(-50%,-50%)',
        width:        '155%', height: '155%',
        borderRadius: '50%',
        border:       `1.5px solid rgba(247, 201, 72, 0.50)`,
        boxShadow:    `0 0 18px rgba(247,201,72,0.30), inset 0 0 14px rgba(247,201,72,0.12)`,
        animation:    'ring-ccw 18s linear infinite',
        backgroundImage: `conic-gradient(rgba(247,201,72,0.28) 0deg, transparent 60deg, transparent 200deg, rgba(247,201,72,0.15) 260deg, transparent 300deg, transparent 360deg)`,
      }} />

      {/* ── Layer 3c: Outer slow ring (mixed) ── */}
      <div style={{
        position:     'absolute', top: '50%', left: '50%',
        transform:    'translate(-50%,-50%)',
        width:        '185%', height: '185%',
        borderRadius: '50%',
        border:       `1px solid rgba(0, 180, 255, 0.30)`,
        animation:    'ring-cw 28s linear infinite',
        backgroundImage: `conic-gradient(rgba(0,180,255,0.15) 0deg, transparent 30deg, rgba(247,201,72,0.10) 180deg, transparent 210deg, transparent 360deg)`,
      }} />

      {/* ── Layer 4a: Pulse wave 1 ── */}
      <div style={{
        position:     'absolute', top: '50%', left: '50%',
        transform:    'translate(-50%,-50%)',
        width:        '100%', height: '100%',
        borderRadius: '50%',
        border:       `2px solid rgba(0, 242, 255, 0.80)`,
        animation:    'ring-fade 3s ease-out infinite',
      }} />

      {/* ── Layer 4b: Pulse wave 2 (gold, offset) ── */}
      <div style={{
        position:     'absolute', top: '50%', left: '50%',
        transform:    'translate(-50%,-50%)',
        width:        '100%', height: '100%',
        borderRadius: '50%',
        border:       `2px solid rgba(247, 201, 72, 0.70)`,
        animation:    'ring-fade-2 3s ease-out infinite',
        animationDelay: '1.5s',
      }} />

      {/* ── Layer 5: Battery-reactive inner ring ── */}
      <div style={{
        position:     'absolute', top: '50%', left: '50%',
        transform:    'translate(-50%,-50%)',
        width:        '72%', height: '72%',
        borderRadius: '50%',
        border:       `1.5px solid ${ringColor}`,
        opacity:      0.75,
        // @ts-ignore — CSS var
        '--ring-color': ringColor,
        animation:    'inner-pulse 2s ease-in-out infinite',
        transition:   'border-color 1s ease',
      } as any} />

    </div>
  );
}