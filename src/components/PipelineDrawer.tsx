import React from 'react';
import { X, Layers, Cpu } from 'lucide-react';
import { PIPELINE_STAGES } from '../lib/backgroundRunner';

interface PipelineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PipelineDrawer: React.FC<PipelineDrawerProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#0C0D0F]/80 flex justify-end font-mono select-none">
      <div className="w-full max-w-xl bg-[#131518] border-l border-[#262930] h-full flex flex-col justify-between overflow-y-auto">
        {/* Drawer Header */}
        <div className="p-4 border-b border-[#262930] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#10B981]" />
            <h2 className="text-sm font-semibold text-[#ECEEF2] uppercase tracking-wider">
              LOOM PIPELINE SPECIFICATION
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#8A909E] hover:text-[#ECEEF2] hover:bg-[#1A1D21] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 8-Stage Architecture Table */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <p className="text-xs text-[#8A909E] leading-relaxed">
            LOOM implements a deterministic, metric-calibrated 8-stage photogrammetry reconstruction engine
            producing slicer-ready watertight binary STL and MeshLab Project (.mlp) assets.
          </p>

          <div className="space-y-3">
            {PIPELINE_STAGES.map((stage) => (
              <div
                key={stage.id}
                className="p-3 rounded bg-[#0C0D0F] border border-[#262930] space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#10B981]">0{stage.index}</span>
                    <span className="font-semibold text-[#ECEEF2]">{stage.name}</span>
                  </div>
                  <span className="text-[10px] text-[#8A909E] px-1.5 py-0.2 rounded bg-[#131518] border border-[#262930]">
                    STAGE {stage.index}/8
                  </span>
                </div>

                <p className="text-[11px] text-[#8A909E] leading-relaxed">
                  {stage.description}
                </p>

                <div className="pt-1 flex items-center justify-between text-[10px] border-t border-[#1A1D21]">
                  <span className="text-[#8A909E]">TOLERANCE / THRESHOLD:</span>
                  <span className="text-[#ECEEF2] font-semibold">{stage.tolerance}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Mathematical Foundations Note */}
          <div className="p-3 rounded bg-[#1A1D21] border border-[#262930] text-[11px] space-y-1">
            <span className="text-[#ECEEF2] font-semibold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#10B981]" />
              WATERTIGHT MANIFOLD GUARANTEE
            </span>
            <p className="text-[#8A909E] leading-relaxed">
              Every mesh exported by LOOM satisfies the 2-manifold Euler characteristic (χ = V - E + F = 2)
              with bottom planar snapping to Z = 0.000 mm, ensuring immediate printability in Cura, PrusaSlicer,
              Formlabs PreForm, and Bambu Studio without slicer repair warnings.
            </p>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-[#262930] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-[#ECEEF2] text-[#0C0D0F] font-semibold hover:bg-white transition text-xs"
          >
            DISMISS SPECIFICATION
          </button>
        </div>
      </div>
    </div>
  );
};
