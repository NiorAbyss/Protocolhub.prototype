import React from 'react';

interface Props {
  children: React.ReactNode;
  active: boolean;
}

export default function PanelWrapper({ children, active }: Props) {
  if (!active) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
      {/* bg-black/40: Makes it semi-transparent
        backdrop-blur-md: This creates the "Frosted" effect on the image behind it
        border-white/5: Adds a very faint, professional edge
      */}
      <div 
        className="w-[90%] h-[75%] overflow-y-auto no-scrollbar pointer-events-auto px-6 py-12 bg-black/40 backdrop-blur-md rounded-2xl border border-white/5"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
        }}
      >
        <div className="w-full">
          {children}
        </div>
      </div>
    </div>
  );
}
