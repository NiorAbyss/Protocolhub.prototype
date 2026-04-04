import { ReactNode } from 'react';

interface PanelWrapperProps {
  children: ReactNode;
  active: boolean;
  onClose: () => void;
}

export default function PanelWrapper({ children, active, onClose }: PanelWrapperProps) {
  if (!active) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 md:p-8 pointer-events-auto"
      onClick={handleBackdropClick}
    >
      <div 
        className="relative w-full max-w-5xl h-[85vh] bg-white/[0.02] border border-cyan-500/30 rounded-[2rem] backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose} 
          className="absolute top-6 right-8 text-cyan-500/50 hover:text-cyan-400 font-mono text-xs tracking-widest z-50 transition-colors"
        >
          [ X ]
        </button>

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