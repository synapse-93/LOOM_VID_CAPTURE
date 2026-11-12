import React from 'react';
import { Camera, Box, Server, QrCode, HelpCircle, Sparkles } from 'lucide-react';

export type AppTab = 'capture' | 'inspector' | 'loom-bridge';

interface NavbarProps {
  currentTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onOpenQrModal: () => void;
  onOpenGuideModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  onOpenQrModal,
  onOpenGuideModal,
}) => {
  return (
    <header className="h-16 bg-[#12161f] border-b border-[#1e2430] px-4 md:px-6 flex items-center justify-between z-30 select-none">
      {/* Brand Identity */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#00e599] flex items-center justify-center shadow-lg shadow-[#00e599]/10">
          <Sparkles className="w-4 h-4 text-[#090b0e]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm tracking-wider text-[#f1f5f9]">LOOM</span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#00e599]/10 text-[#00e599] border border-[#00e599]/20 font-semibold">
              Capture Studio
            </span>
          </div>
          <span className="text-[10px] text-[#94a3b8] font-mono hidden sm:block">
            Computer-Vision Guided 3D Photogrammetry
          </span>
        </div>
      </div>

      {/* Center Tab Navigation */}
      <nav className="flex items-center gap-1 bg-[#090b0e] p-1 rounded-xl border border-[#1e2430]">
        <button
          onClick={() => onTabChange('capture')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
            currentTab === 'capture'
              ? 'bg-[#181e2b] text-[#00e599] shadow-sm'
              : 'text-[#94a3b8] hover:text-[#f1f5f9]'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Capture</span>
        </button>

        <button
          onClick={() => onTabChange('inspector')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
            currentTab === 'inspector'
              ? 'bg-[#181e2b] text-[#00e599] shadow-sm'
              : 'text-[#94a3b8] hover:text-[#f1f5f9]'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          <span>3D Inspector</span>
        </button>

        <button
          onClick={() => onTabChange('loom-bridge')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
            currentTab === 'loom-bridge'
              ? 'bg-[#181e2b] text-[#00e599] shadow-sm'
              : 'text-[#94a3b8] hover:text-[#f1f5f9]'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>LOOM Bridge</span>
        </button>
      </nav>

      {/* Right Auxiliary Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenQrModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#090b0e] border border-[#1e2430] hover:border-[#00e599]/40 text-xs font-mono text-[#94a3b8] hover:text-[#f1f5f9] transition"
          title="Mobile Companion QR Code"
        >
          <QrCode className="w-3.5 h-3.5 text-[#00e599]" />
          <span className="hidden md:inline">Pair Mobile</span>
        </button>

        <button
          onClick={onOpenGuideModal}
          className="p-2 rounded-lg bg-[#090b0e] border border-[#1e2430] hover:border-[#00e599]/40 text-[#94a3b8] hover:text-[#00e599] transition"
          title="Capture Guidelines"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

