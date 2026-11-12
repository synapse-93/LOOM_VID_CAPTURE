import React from 'react';
import { X, Compass, Sun, Eye, Layers } from 'lucide-react';

interface CaptureGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CaptureGuideModal: React.FC<CaptureGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#090b0e]/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#12161f] border border-[#1e2430] rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9] transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono uppercase text-[#00e599] font-semibold">Photogrammetry Guide</span>
        </div>
        <h3 className="text-lg font-bold text-[#f1f5f9] mb-4">LOOM 3D Capture Best Practices</h3>

        <div className="space-y-4 text-xs">
          {/* Rule 1: Orbit Cadence */}
          <div className="bg-[#090b0e] border border-[#1e2430] rounded-xl p-3.5">
            <div className="flex items-center gap-2 font-semibold text-[#f1f5f9] mb-1">
              <Compass className="w-4 h-4 text-[#00e599]" />
              <span>1. Consistent 360° Orbital Cadence</span>
            </div>
            <p className="text-[#94a3b8] leading-relaxed">
              Walk smoothly around the object at a steady 30 to 45 seconds per full revolution. Sudden bursts or shaking trigger motion blur warnings in the CV engine.
            </p>
          </div>

          {/* Rule 2: Multi-Tier Elevation */}
          <div className="bg-[#090b0e] border border-[#1e2430] rounded-xl p-3.5">
            <div className="flex items-center gap-2 font-semibold text-[#f1f5f9] mb-1">
              <Layers className="w-4 h-4 text-[#00e599]" />
              <span>2. Multi-Tier Elevation Passes</span>
            </div>
            <p className="text-[#94a3b8] leading-relaxed">
              For complete watertight 3D models with undercuts, execute 2 or 3 orbital loops:
            </p>
            <ul className="mt-2 space-y-1 font-mono text-[11px] text-[#94a3b8]">
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00e599]" />
                <span className="text-[#f1f5f9]">Low Tier (~15°):</span> Captures vertical sides and base margins.
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00e599]" />
                <span className="text-[#f1f5f9]">Mid Tier (~45°):</span> Primary photogrammetry reconstruction angle.
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00e599]" />
                <span className="text-[#f1f5f9]">High Tier (~75°):</span> Captures top surfaces and bores.
              </li>
            </ul>
          </div>

          {/* Rule 3: Lighting & Glare */}
          <div className="bg-[#090b0e] border border-[#1e2430] rounded-xl p-3.5">
            <div className="flex items-center gap-2 font-semibold text-[#f1f5f9] mb-1">
              <Sun className="w-4 h-4 text-[#f59e0b]" />
              <span>3. Diffuse Lighting (Minimize Specular Highlights)</span>
            </div>
            <p className="text-[#94a3b8] leading-relaxed">
              Direct point lights create specular reflections that shift across surfaces as the camera moves, violating the Lambertian assumption of SfM/MVS. Use soft diffuse ambient illumination.
            </p>
          </div>

          {/* Rule 4: Overlap and Background */}
          <div className="bg-[#090b0e] border border-[#1e2430] rounded-xl p-3.5">
            <div className="flex items-center gap-2 font-semibold text-[#f1f5f9] mb-1">
              <Eye className="w-4 h-4 text-[#00e599]" />
              <span>4. 60–80% Visual Overlap & Surface Texture</span>
            </div>
            <p className="text-[#94a3b8] leading-relaxed">
              Place smooth, featureless objects on a newspaper or textured mat. The SIFT feature matcher requires rich contrast to compute 3D tie points.
            </p>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-[#1e2430] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#00e599] text-[#090b0e] font-bold text-xs"
          >
            Got it, Let's Scan
          </button>
        </div>
      </div>
    </div>
  );
};
