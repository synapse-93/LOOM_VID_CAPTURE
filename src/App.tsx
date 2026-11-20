import React, { useState, useEffect } from 'react';
import { QrCode, Check, Copy, X } from 'lucide-react';
import QRCode from 'qrcode';
import { CaptureStudio } from './components/CaptureStudio';
import { StlInspector } from './components/StlInspector';
import { PipelineSpec } from './components/PipelineSpec';

export type ActiveTab = 'capture' | 'inspector' | 'spec';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('capture');

  // Mobile QR Modal State
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      setCurrentUrl(url);

      QRCode.toDataURL(url, {
        width: 240,
        margin: 2,
        color: {
          dark: '#0C0D0F',
          light: '#ECEEF2',
        },
      })
        .then((dataUri) => setQrDataUrl(dataUri))
        .catch((err) => console.error('[App] Failed to generate QR code:', err));
    }
  }, [isQrModalOpen]);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0C0D0F] text-[#ECEEF2] flex flex-col font-sans select-none overflow-hidden">
      {/* 48px Precision Industrial Top Header Bar */}
      <header className="h-[48px] bg-[#131518] border-b border-[#262930] px-4 flex items-center justify-between z-30">
        {/* Left: Brand Identification */}
        <div className="flex items-center">
          <span className="font-mono font-medium tracking-widest text-sm text-[#ECEEF2]">
            LOOM
          </span>
          <span className="text-[#8A909E] mx-1.5 font-mono text-xs">/</span>
          <span className="font-mono text-xs text-[#8A909E]">VID_CAPTURE</span>
        </div>

        {/* Center: Segmented Navigation Tab Bar */}
        <nav className="border border-[#262930] rounded bg-[#0C0D0F] p-0.5 flex items-center gap-0.5 font-mono text-xs">
          <button
            onClick={() => setActiveTab('capture')}
            className={`px-3 py-1 rounded transition ${
              activeTab === 'capture'
                ? 'bg-[#1A1D21] text-[#ECEEF2] border border-[#262930] font-medium'
                : 'text-[#8A909E] hover:text-[#ECEEF2]'
            }`}
          >
            01 CAPTURE STUDIO
          </button>
          <button
            onClick={() => setActiveTab('inspector')}
            className={`px-3 py-1 rounded transition ${
              activeTab === 'inspector'
                ? 'bg-[#1A1D21] text-[#ECEEF2] border border-[#262930] font-medium'
                : 'text-[#8A909E] hover:text-[#ECEEF2]'
            }`}
          >
            02 STL INSPECTOR
          </button>
          <button
            onClick={() => setActiveTab('spec')}
            className={`px-3 py-1 rounded transition ${
              activeTab === 'spec'
                ? 'bg-[#1A1D21] text-[#ECEEF2] border border-[#262930] font-medium'
                : 'text-[#8A909E] hover:text-[#ECEEF2]'
            }`}
          >
            03 PIPELINE SPEC
          </button>
        </nav>

        {/* Right: Mobile QR & Status Pill */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsQrModalOpen(true)}
            className="border border-[#262930] rounded px-2.5 py-1 font-mono text-xs text-[#ECEEF2] hover:bg-[#1A1D21] transition flex items-center gap-1.5"
            title="Open on Smartphone Camera via QR"
          >
            <QrCode className="w-3.5 h-3.5 text-[#8A909E]" />
            <span className="hidden sm:inline">MOBILE QR</span>
          </button>

          <span className="font-mono text-[11px] text-[#8A909E] px-2 py-0.5 border border-[#262930] rounded bg-[#0C0D0F]">
            MODE: STANDALONE
          </span>
        </div>
      </header>

      {/* Main Workstation View Area */}
      <main className="flex-1 relative overflow-hidden bg-[#0C0D0F]">
        {activeTab === 'capture' && <CaptureStudio />}
        {activeTab === 'inspector' && <StlInspector />}
        {activeTab === 'spec' && <PipelineSpec />}
      </main>

      {/* High-Contrast Industrial QR Code Modal */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0C0D0F]/90 flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-[#131518] border border-[#262930] rounded-md p-5 relative flex flex-col items-center text-center font-mono">
            <button
              onClick={() => setIsQrModalOpen(false)}
              className="absolute top-3 right-3 p-1 rounded hover:bg-[#1A1D21] text-[#8A909E] hover:text-[#ECEEF2] transition"
            >
              <X className="w-4 h-4" />
            </button>

            <span className="text-[10px] text-[#8A909E] uppercase tracking-wider block mb-1">
              OPTICAL HANDOFF
            </span>
            <h3 className="text-sm font-semibold text-[#ECEEF2] mb-1">OPEN ON PHONE</h3>
            <p className="text-[11px] text-[#8A909E] mb-4 leading-relaxed">
              Scan with iOS Safari or Android Chrome for hardware sensor capture.
            </p>

            {/* High-Contrast QR Code container */}
            <div className="p-2.5 bg-[#ECEEF2] border border-[#262930] rounded mb-4">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Capture QR Code" className="w-48 h-48 block" />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-xs text-[#0C0D0F]">
                  GENERATING...
                </div>
              )}
            </div>

            {/* URL Copy Button */}
            <div className="w-full flex items-center gap-1.5 bg-[#0C0D0F] border border-[#262930] rounded p-1">
              <span className="text-[10px] text-[#8A909E] truncate flex-1 pl-2 text-left">
                {currentUrl}
              </span>
              <button
                onClick={handleCopyUrl}
                className="px-2.5 py-1 rounded bg-[#1A1D21] hover:bg-[#262930] text-[10px] text-[#ECEEF2] transition flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'COPIED' : 'COPY'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
