import React from 'react';
import { Layers } from 'lucide-react';

interface PipelineStage {
  id: string;
  name: string;
  input: string;
  algorithm: string;
  output: string;
  budget: string;
  status: 'DETERMINISTIC' | 'GPU_ACCELERATED';
}

const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: '01',
    name: 'Keyframe Laplacian Culling',
    input: '10 Mbps MP4/WebM Video (30 fps)',
    algorithm: 'Discrete 3x3 Laplacian Variance thresholding (σ² >= 85) + 60% overlap step',
    output: '68–90 Culled Keyframe PNGs',
    budget: '~1.8s (CPU)',
    status: 'DETERMINISTIC',
  },
  {
    id: '02',
    name: 'CUDA SIFT & Ceres BA',
    input: 'Culled Keyframe Images',
    algorithm: 'GPU SIFT feature descriptors + Ceres Levenberg-Marquardt Bundle Adjustment',
    output: 'Sparse Tie Cloud + Camera Poses',
    budget: '~4.5s (CUDA)',
    status: 'GPU_ACCELERATED',
  },
  {
    id: '03',
    name: 'PatchMatch MVS Depth Fusion',
    input: 'Sparse Poses + Keyframes',
    algorithm: 'Multi-View Stereo photometric depth map computation & normal consistency fusion',
    output: 'Dense Fused Point Cloud (1.8M pts)',
    budget: '~8.0s (CUDA)',
    status: 'GPU_ACCELERATED',
  },
  {
    id: '04',
    name: 'Camera-Centroid RANSAC Alignment',
    input: 'Dense Cloud + Poses',
    algorithm: 'Camera-Centroid estimation + Ground Plane RANSAC fitting to Z = 0.000 mm',
    output: 'Z-Aligned Coordinate Space',
    budget: '~0.6s (CPU)',
    status: 'DETERMINISTIC',
  },
  {
    id: '05',
    name: 'Screened Depth-10 Poisson Meshing',
    input: 'Z-Aligned Point Cloud',
    algorithm: 'Octree Depth-10 Screened Poisson Surface Reconstruction with Dirichlet bounds',
    output: 'Watertight Manifold Triangle Mesh',
    budget: '~3.2s (CPU)',
    status: 'DETERMINISTIC',
  },
  {
    id: '06',
    name: 'Mapbox-Earcut Planar Base Capping',
    input: 'Raw Poisson Mesh',
    algorithm: 'Planar boundary contour polygonization via robust Mapbox-Earcut triangulation',
    output: 'Flat Print-Plate Bottom Facet',
    budget: '~0.4s (CPU)',
    status: 'DETERMINISTIC',
  },
  {
    id: '07',
    name: 'Printability Gate & Slicing Check',
    input: 'Capped Watertight Mesh',
    algorithm: 'Manifoldness audit, non-manifold edge zeroing, Euler characteristic verification',
    output: 'Calibrated Metric Model (target_mm)',
    budget: '~0.5s (CPU)',
    status: 'DETERMINISTIC',
  },
  {
    id: '08',
    name: 'Export Watertight STL & G-code',
    input: 'Verified Metric Mesh',
    algorithm: 'Little-endian IEEE 754 Binary STL synthesis + PrusaSlicer/Cura CLI profile',
    output: 'Binary .STL & Print Manifest',
    budget: '~0.2s (I/O)',
    status: 'DETERMINISTIC',
  },
];

export const PipelineSpec: React.FC = () => {
  return (
    <div className="h-[calc(100vh-48px)] bg-[#0C0D0F] overflow-y-auto p-6 font-mono text-xs select-none">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="border border-[#262930] rounded-md p-4 bg-[#131518] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-4 h-4 text-[#ECEEF2]" />
              <span className="font-bold text-sm tracking-tight text-[#ECEEF2]">
                LOOM // DETERMINISTIC VIDEO-TO-3D-PRINT PIPELINE SPEC
              </span>
            </div>
            <p className="text-[#8A909E] text-xs">
              End-to-end 8-stage photogrammetry reconstruction architecture with guaranteed metric scale.
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-[#8A909E] block">TARGET LATENCY</span>
            <span className="text-[#10B981] font-bold text-sm">&lt; 20 SECONDS</span>
          </div>
        </div>

        {/* 8-Stage Pipeline Specification Table */}
        <div className="border border-[#262930] rounded-md overflow-hidden bg-[#131518]">
          <div className="p-3 border-b border-[#262930] bg-[#1A1D21] flex items-center justify-between">
            <span className="font-semibold text-[#ECEEF2] text-xs tracking-wider uppercase">
              PIPELINE EXECUTION STAGES (COLMAP + OPEN3D + SCREENED POISSON)
            </span>
            <span className="text-[11px] text-[#8A909E]">8 STAGES SEQUENTIAL</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#262930] bg-[#0C0D0F] text-[#8A909E] text-[10px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-12">#</th>
                  <th className="py-2.5 px-3">Stage Name</th>
                  <th className="py-2.5 px-3">Input Data</th>
                  <th className="py-2.5 px-3">Algorithm / Core Kernel</th>
                  <th className="py-2.5 px-3">Output Data</th>
                  <th className="py-2.5 px-3 text-right">Compute Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262930] text-[11px]">
                {PIPELINE_STAGES.map((stage) => (
                  <tr key={stage.id} className="hover:bg-[#1A1D21]/50 transition">
                    <td className="py-3 px-3 text-[#8A909E] font-bold">{stage.id}</td>
                    <td className="py-3 px-3 font-medium text-[#ECEEF2]">
                      <div>{stage.name}</div>
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded border uppercase font-medium mt-0.5 inline-block ${
                          stage.status === 'GPU_ACCELERATED'
                            ? 'border-[#F97316]/30 text-[#F97316] bg-[#F97316]/10'
                            : 'border-[#10B981]/30 text-[#10B981] bg-[#10B981]/10'
                        }`}
                      >
                        {stage.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[#8A909E]">{stage.input}</td>
                    <td className="py-3 px-3 text-[#ECEEF2] font-mono text-[10px] leading-relaxed">
                      {stage.algorithm}
                    </td>
                    <td className="py-3 px-3 text-[#ECEEF2]">{stage.output}</td>
                    <td className="py-3 px-3 text-right text-[#8A909E] font-semibold tabular-nums">
                      {stage.budget}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Local CLI Command Reference */}
        <div className="border border-[#262930] rounded-md p-4 bg-[#131518] space-y-2">
          <span className="text-[11px] text-[#8A909E] uppercase tracking-wider font-semibold block">
            HEADLESS EXECUTION INTERFACE (LOCAL / HPC WORKER)
          </span>
          <p className="text-xs text-[#8A909E]">
            Scans captured in the web studio can be processed locally via LOOM's automated Python CLI:
          </p>
          <div className="p-3 border border-[#262930] bg-[#0C0D0F] rounded text-[11px] text-[#ECEEF2] font-mono break-all select-all">
            .venv/bin/python scripts/demo.py --video ~/Downloads/loom_scan.mp4 --turbo --target-length 200.0 --export-stl
          </div>
        </div>
      </div>
    </div>
  );
};

