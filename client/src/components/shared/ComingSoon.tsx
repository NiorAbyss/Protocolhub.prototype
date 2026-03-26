// client/src/components/shared/ComingSoon.tsx
// Overlay shown when a feature flag is 'coming_soon'
// Transparent — does not break parent layout

import { useEffect } from 'react';

const FM = '"IBM Plex Mono","Courier New",monospace';
const FH = '"Bebas Neue","Impact",sans-serif';

interface Props {
  featureName: string;
  description?: string;
  panel?: string;
}

export default function ComingSoon({ featureName, description, panel }: Props) {
  return (
    <div style={{
      position:       'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            20,
      background:     'rgba(2,4,10,0.96)',
      backdropFilter: 'blur(10px)',
      zIndex:         20,
      padding:        32,
    }}>

      {/* Icon */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        border: '1px solid rgba(0,180,255,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,180,255,0.05)', fontSize: 28,
      }}>
        ⚙
      </div>

      {/* Panel badge */}
      {panel && (
        <div style={{
          fontSize: 7, color: 'rgba(0,180,255,0.5)',
          border: '1px solid rgba(0,180,255,0.15)',
          borderRadius: 3, padding: '2px 10px',
          fontFamily: FM, letterSpacing: 3,
        }}>
          {panel.toUpperCase()} PANEL
        </div>
      )}

      {/* Feature name */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: FH, fontSize: 24, letterSpacing: 4,
          color: 'rgba(200,220,240,0.9)', marginBottom: 8,
        }}>
          {featureName}
        </div>
        {description && (
          <div style={{
            fontSize: 9, color: 'rgba(150,180,210,0.5)',
            fontFamily: FM, lineHeight: 1.7, maxWidth: 320,
            textAlign: 'center',
          }}>
            {description}
          </div>
        )}
      </div>

      {/* Coming soon badge */}
      <div style={{
        padding: '10px 28px',
        border: '1px solid rgba(0,180,255,0.2)',
        borderRadius: 6,
        background: 'rgba(0,180,255,0.05)',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 14, fontFamily: FH, letterSpacing: 4,
          color: '#00b4ff',
        }}>
          COMING SOON
        </div>
        <div style={{
          fontSize: 7, color: 'rgba(150,180,210,0.4)',
          fontFamily: FM, marginTop: 4, letterSpacing: 1,
        }}>
          This feature will be unlocked by the platform owner
        </div>
      </div>

      {/* Animated scan line */}
      <div style={{
        position: 'absolute', left: 0, right: 0,
        height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,180,255,0.3), transparent)',
        animation: 'cssScan 3s ease-in-out infinite',
      }} />

      <style>{`
        @keyframes cssScan {
          0%   { top: 20%; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 80%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
