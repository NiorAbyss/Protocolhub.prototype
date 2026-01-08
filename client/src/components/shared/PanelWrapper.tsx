import React from 'react';

interface PanelWrapperProps {
  children: React.ReactNode;
  active: boolean;
  onClose: () => void;
}

export default function PanelWrapper({ children, active, onClose }: PanelWrapperProps) {
  if (!active) return null;

  return (
    // Fixed inset-0 locks the wrapper to the screen so the HUD doesn't scroll
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 md:p-8 pointer-events-auto">
      
      {/* The Glass Container: bg-white/[0.02] + backdrop-blur-xl as per rules */}
      <div className="relative w-full max-w-5xl h-[85vh] bg-white/[0.02] border border-cyan-500/30 rounded-[2rem] backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Institutional Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-6 right-8 text-cyan-500/50 hover:text-cyan-400 font-mono text-xs tracking-widest z-50 transition-colors"
        >
          [ ESC_CLOSE ]
        </button>

        {/* The HUD Content Area: 
            This is the only part that scrolls. 
            Custom scrollbar styling ensures it looks like a terminal.
        */}
        <div className="flex-1 overflow-y-auto p-8 md:p-12 
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-cyan-500/20 
          [&::-webkit-scrollbar-thumb]:rounded-full 
          hover:[&::-webkit-scrollbar-thumb]:bg-cyan-500/40">
          
          <div className="min-h-full">
            {children}
          </div>
          
        </div>
      </div>
    </div>
  );
}
