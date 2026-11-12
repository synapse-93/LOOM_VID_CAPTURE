import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Smartphone, Copy, Check, X, ShieldCheck } from 'lucide-react';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({ isOpen, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      setCurrentUrl(url);

      QRCode.toDataURL(url, {
        width: 280,
        margin: 2,
        color: {
          dark: '#00e599',
          light: '#12161f',
        },
      })
        .then((dataUri) => setQrDataUrl(dataUri))
        .catch((err) => console.error('QR code generation error:', err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090b0e]/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#12161f] border border-[#1e2430] rounded-2xl p-6 shadow-2xl relative flex flex-col items-center text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9] transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-xl bg-[#00e599]/10 border border-[#00e599]/20 flex items-center justify-center mb-3">
          <Smartphone className="w-6 h-6 text-[#00e599]" />
        </div>

        <h3 className="text-lg font-bold text-[#f1f5f9] mb-1">Scan to Open on Smartphone</h3>
        <p className="text-xs text-[#94a3b8] max-w-xs mb-5">
          Scan with your iPhone or Android camera to use high-resolution rear sensors and hardware gyroscopes.
        </p>

        {/* QR Code Container */}
        <div className="p-3 bg-[#12161f] border-2 border-[#1e2430] rounded-2xl shadow-inner mb-5">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Capture Studio QR Code" className="w-56 h-56 rounded-lg" />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-xs font-mono text-[#94a3b8]">
              Generating QR...
            </div>
          )}
        </div>

        {/* Security / WebRTC badge */}
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#00e599] bg-[#00e599]/5 px-3 py-1 rounded-full border border-[#00e599]/20 mb-4">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Vercel Zero-Config HTTPS Ready</span>
        </div>

        {/* Direct Link Copy */}
        <div className="w-full flex items-center gap-2 bg-[#090b0e] border border-[#1e2430] rounded-lg p-1.5 pl-3">
          <span className="text-xs font-mono text-[#94a3b8] truncate flex-1 text-left">{currentUrl}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#1e2430] hover:bg-[#283244] text-xs font-mono text-[#f1f5f9] transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#00e599]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
