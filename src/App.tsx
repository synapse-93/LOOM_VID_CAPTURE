import React, { useState, useEffect } from 'react';
import { Camera, Box, Smartphone, Server, Check, X, Copy, RefreshCw } from 'lucide-react';
import QRCode from 'qrcode';
import { GuidedScanner } from './components/GuidedScanner';
import { StlInspector } from './components/StlInspector';
import {
  getStoredLoomEndpoint,
  saveLoomEndpoint,
  checkLoomHealth,
} from './lib/loomBridge';

export type MainTab = 'scanner' | 'inspector';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MainTab>('scanner');

  // QR Modal State
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // LOOM Worker Settings Popover State
  const [isLoomPopoverOpen, setIsLoomPopoverOpen] = useState(false);
  const [loomUrlInput, setLoomUrlInput] = useState('');
  const [workerHealth, setWorkerHealth] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');

  // Load initial URL and LOOM endpoint
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentUrl(window.location.href);
      setLoomUrlInput(getStoredLoomEndpoint());
    }
  }, []);

  // Generate QR code when modal opens
  useEffect(() => {
    if (isQrModalOpen && currentUrl) {
      QRCode.toDataURL(currentUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: '#00e599',
          light: '#12161f',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('[App] Failed to generate QR code:', err));
    }
  }, [isQrModalOpen, currentUrl]);

  // Test LOOM worker connection health
  const handleTestConnection = async () => {
    if (!loomUrlInput.trim()) {
      setWorkerHealth('offline');
      return;
    }
    setWorkerHealth('checking');
    const isHealthy = await checkLoomHealth(loomUrlInput);
    setWorkerHealth(isHealthy ? 'online' : 'offline');
  };

  // Save LOOM endpoint
  const handleSaveEndpoint = () => {
    saveLoomEndpoint(loomUrlInput);
    setIsLoomPopoverOpen(false);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#090b0e] text-[#f1f5f9] flex flex-col font-sans selection:bg-[#00e599]/30 selection:text-[#00e599]">
      {/* Top Navigation Bar */}
      <header className="h-16 bg-[#12161f] border-b border-[#1e2430] px-4 md:px-6 flex items-center justify-between z-30 select-none">
        {/* Brand Title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#00e599] flex items-center justify-center shadow-md shadow-[#00e599]/20">
            <span className="font-mono font-black text-xs text-[#090b0e]">3D</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm tracking-wider text-[#f1f5f9] font-mono">
              LOOM <span className="text-[#94a3b8] font-normal">//</span> CAPTURE STUDIO
            </span>
            <span className="hidden sm:inline text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#00e599]/10 text-[#00e599] border border-[#00e599]/20 font-bold">
              10 Mbps CV
            </span>
          </div>
        </div>

        {/* View Tabs */}
        <nav className="flex items-center gap-1 bg-[#090b0e] p-1 rounded-xl border border-[#1e2430]">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-mono font-medium transition ${
              activeTab === 'scanner'
                ? 'bg-[#181e2b] text-[#00e599] shadow-sm'
                : 'text-[#94a3b8] hover:text-[#f1f5f9]'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Guided Scanner</span>
          </button>

          <button
            onClick={() => setActiveTab('inspector')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-mono font-medium transition ${
              activeTab === 'inspector'
                ? 'bg-[#181e2b] text-[#00e599] shadow-sm'
                : 'text-[#94a3b8] hover:text-[#f1f5f9]'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>STL Inspector</span>
          </button>
        </nav>

        {/* Right Aux Controls: QR Phone Handoff & LOOM Worker Settings */}
        <div className="flex items-center gap-2 relative">
          {/* Open on Phone (QR) */}
          <button
            onClick={() => setIsQrModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#090b0e] border border-[#1e2430] hover:border-[#00e599]/50 text-xs font-mono text-[#f1f5f9] transition"
            title="Open on Smartphone Camera via QR"
          >
            <Smartphone className="w-3.5 h-3.5 text-[#00e599]" />
            <span className="hidden md:inline">Open on Phone</span>
          </button>

          {/* LOOM Worker Settings Toggle */}
          <button
            onClick={() => setIsLoomPopoverOpen(!isLoomPopoverOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition ${
              loomUrlInput
                ? 'bg-[#00e599]/10 text-[#00e599] border-[#00e599]/30'
                : 'bg-[#090b0e] border-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9]'
            }`}
            title="Configure LOOM GPU Worker Endpoint"
          >
            <Server className="w-3.5 h-3.5" />
            <span className="hidden md:inline">LOOM Worker</span>
          </button>

          {/* LOOM Worker Settings Popover */}
          {isLoomPopoverOpen && (
            <div className="absolute top-12 right-0 w-80 bg-[#12161f] border border-[#1e2430] rounded-xl p-4 shadow-2xl z-50 flex flex-col gap-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-[#1e2430] pb-2">
                <span className="font-bold text-[#f1f5f9]">LOOM Backend Endpoint</span>
                <button
                  onClick={() => setIsLoomPopoverOpen(false)}
                  className="p-1 rounded hover:bg-[#1e2430] text-[#94a3b8]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <label className="text-[10px] text-[#94a3b8] block mb-1 uppercase">Worker API URL</label>
                <input
                  type="text"
                  placeholder="http://localhost:8000"
                  value={loomUrlInput}
                  onChange={(e) => {
                    setLoomUrlInput(e.target.value);
                    setWorkerHealth('idle');
                  }}
                  className="w-full bg-[#090b0e] border border-[#1e2430] focus:border-[#00e599] rounded px-3 py-2 text-[#f1f5f9] outline-none text-xs"
                />
              </div>

              {/* Status indicator */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#94a3b8]">Status:</span>
                {workerHealth === 'checking' && (
                  <span className="text-[#f59e0b] flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Pinging...
                  </span>
                )}
                {workerHealth === 'online' && (
                  <span className="text-[#00e599] font-bold">ONLINE (Connected)</span>
                )}
                {workerHealth === 'offline' && (
                  <span className="text-[#f59e0b] font-medium">OFFLINE (Standalone Simulation)</span>
                )}
                {workerHealth === 'idle' && (
                  <span className="text-[#94a3b8]">{loomUrlInput ? 'Unverified' : 'Standalone Mode'}</span>
                )}
              </div>

              <div className="flex gap-2 pt-1 border-t border-[#1e2430]">
                <button
                  onClick={handleTestConnection}
                  disabled={workerHealth === 'checking'}
                  className="flex-1 py-1.5 rounded bg-[#181e2b] hover:bg-[#222c3d] text-[#f1f5f9] border border-[#1e2430] transition text-center"
                >
                  Test Connection
                </button>
                <button
                  onClick={handleSaveEndpoint}
                  className="flex-1 py-1.5 rounded bg-[#00e599] text-[#090b0e] font-bold hover:bg-[#00e599]/90 transition text-center"
                >
                  Save URL
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 relative overflow-hidden">
        {activeTab === 'scanner' && (
          <GuidedScanner
            onOpenInspector={() => setActiveTab('inspector')}
            onOpenPhoneQr={() => setIsQrModalOpen(true)}
          />
        )}

        {activeTab === 'inspector' && <StlInspector />}
      </main>

      {/* Scannable Phone QR Handoff Modal */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#090b0e]/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#12161f] border border-[#1e2430] rounded-2xl p-6 shadow-2xl relative flex flex-col items-center text-center">
            <button
              onClick={() => setIsQrModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9] transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-xl bg-[#00e599]/10 border border-[#00e599]/20 flex items-center justify-center mb-3">
              <Smartphone className="w-6 h-6 text-[#00e599]" />
            </div>

            <h3 className="text-base font-bold text-[#f1f5f9] mb-1">Open on Smartphone Camera</h3>
            <p className="text-xs text-[#94a3b8] mb-4 leading-relaxed">
              Scan with iOS or Android camera app to launch Guided Capture Studio with rear sensors over HTTPS.
            </p>

            {/* QR Image Container */}
            <div className="p-3 bg-[#12161f] border-2 border-[#1e2430] rounded-2xl mb-4 shadow-inner">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Capture Studio QR Code" className="w-56 h-56 rounded-lg" />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-xs font-mono text-[#94a3b8]">
                  Generating QR...
                </div>
              )}
            </div>

            {/* Direct Copy URL */}
            <div className="w-full flex items-center gap-2 bg-[#090b0e] border border-[#1e2430] rounded-lg p-1.5 pl-3">
              <span className="text-xs font-mono text-[#94a3b8] truncate flex-1 text-left">{currentUrl}</span>
              <button
                onClick={handleCopyUrl}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#1e2430] hover:bg-[#283244] text-xs font-mono text-[#f1f5f9] transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#00e599]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
