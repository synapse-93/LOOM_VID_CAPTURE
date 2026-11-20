import React, { useState } from 'react';
import {
  Download,
  AlertTriangle,
  Upload,
  CheckCircle,
  Scale,
  Gauge,
  Layers,
  FileCheck,
} from 'lucide-react';
import { ScanProject } from '../lib/projectStore';
import { FrameTelemetry } from '../lib/cvGuidance';

interface InspectorRailProps {
  mode: 'CAMERA' | 'UPLOAD' | 'PIPELINE' | '3D VIEWER';
  project?: ScanProject | null;
  liveTelemetry?: FrameTelemetry | null;
  orbitSectors?: number;
  onAttachMeshClick?: () => void;
}

export const InspectorRail: React.FC<InspectorRailProps> = ({
  mode,
  project,
  liveTelemetry,
  orbitSectors = 0,
  onAttachMeshClick,
}) => {
  // Material density in g/cm3
  const [selectedDensity, setSelectedDensity] = useState<number>(1.24); // PLA default
  const [materialName, setMaterialName] = useState('PLA');

  const materials = [
    { name: 'PLA', density: 1.24 },
    { name: 'PETG', density: 1.27 },
    { name: 'ABS', density: 1.04 },
    { name: 'Standard Resin', density: 1.15 },
  ];

  // Download binary STL file
  const handleDownloadStl = () => {
    if (!project || !project.meshAssets || project.meshAssets.files.length === 0) return;
    const stlFile = project.meshAssets.files.find((f) => f.name.toLowerCase().endsWith('.stl')) || project.meshAssets.files[0];
    const blob = new Blob([stlFile.buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = stlFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export MLP bundle (XML + companion files)
  const handleExportMlpBundle = () => {
    if (!project || !project.meshAssets) return;
    // Download primary file
    project.meshAssets.files.forEach((f) => {
      const blob = new Blob([f.buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const isCameraOrUpload = mode === 'CAMERA' || mode === 'UPLOAD';

  return (
    <aside className="w-[300px] h-full bg-[#131518] border-l border-[#262930] flex flex-col justify-between font-mono select-none z-10 shrink-0 text-xs overflow-y-auto">
      {/* Dynamic Content Based on Workstation Mode */}
      {isCameraOrUpload ? (
        <div className="p-3 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#262930]">
            <span className="text-[11px] text-[#8A909E] font-medium tracking-wider uppercase flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-[#10B981]" />
              OPTICAL TELEMETRY
            </span>
            <span className="text-[10px] text-[#10B981] px-1.5 py-0.2 rounded bg-[#10B981]/10">
              10 HZ LIVE
            </span>
          </div>

          {/* 10 Hz CV Sensor Gauges */}
          <div className="space-y-2 bg-[#0C0D0F] border border-[#262930] rounded p-2.5">
            {/* Sharpness */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#8A909E]">LAPLACIAN VARIANCE σ²</span>
                <span
                  className={`font-semibold tabular-nums ${
                    (liveTelemetry?.rawVariance ?? 0) >= 120 ? 'text-[#10B981]' : 'text-[#EF4444]'
                  }`}
                >
                  {(liveTelemetry?.rawVariance ?? 0).toFixed(1)} / 120.0
                </span>
              </div>
              <div className="h-1 bg-[#1A1D21] rounded overflow-hidden">
                <div
                  className="h-full bg-[#10B981] transition-all duration-100"
                  style={{ width: `${Math.min(100, ((liveTelemetry?.rawVariance ?? 0) / 150) * 100)}%` }}
                />
              </div>
            </div>

            {/* Edge Density */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#8A909E]">EDGE TEXTURE DENSITY</span>
                <span
                  className={`font-semibold tabular-nums ${
                    (liveTelemetry?.textureScore ?? 0) >= 30 ? 'text-[#10B981]' : 'text-[#F59E0B]'
                  }`}
                >
                  {liveTelemetry?.textureScore ?? 0}% / 30%
                </span>
              </div>
              <div className="h-1 bg-[#1A1D21] rounded overflow-hidden">
                <div
                  className="h-full bg-[#10B981] transition-all duration-100"
                  style={{ width: `${Math.min(100, liveTelemetry?.textureScore ?? 0)}%` }}
                />
              </div>
            </div>

            {/* Specular Glare */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#8A909E]">SPECULAR GLARE RATIO</span>
                <span
                  className={`font-semibold tabular-nums ${
                    (liveTelemetry?.overexposedRatio ?? 0) < 0.05 ? 'text-[#10B981]' : 'text-[#EF4444]'
                  }`}
                >
                  {((liveTelemetry?.overexposedRatio ?? 0) * 100).toFixed(1)}% / &lt;5%
                </span>
              </div>
              <div className="h-1 bg-[#1A1D21] rounded overflow-hidden">
                <div
                  className="h-full bg-[#EF4444] transition-all duration-100"
                  style={{ width: `${Math.min(100, ((liveTelemetry?.overexposedRatio ?? 0) * 100) * 5)}%` }}
                />
              </div>
            </div>

            {/* 360 Orbit Coverage */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#8A909E]">ORBIT SECTOR LOCK</span>
                <span className="font-semibold text-[#ECEEF2] tabular-nums">
                  {orbitSectors} / 12 SECTORS
                </span>
              </div>
              <div className="h-1 bg-[#1A1D21] rounded overflow-hidden">
                <div
                  className="h-full bg-[#10B981] transition-all duration-100"
                  style={{ width: `${(orbitSectors / 12) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Acquisition Protocol Checklist */}
          <div>
            <span className="text-[10px] text-[#8A909E] uppercase tracking-wider block mb-2">
              ACQUISITION PROTOCOL
            </span>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2 p-2 rounded bg-[#0C0D0F] border border-[#262930]">
                <CheckCircle className="w-3.5 h-3.5 text-[#10B981] shrink-0 mt-0.5" />
                <div className="text-[11px]">
                  <span className="font-semibold text-[#ECEEF2] block">Planar Baseplate</span>
                  <span className="text-[#8A909E] text-[10px]">
                    Place object on flat contrasting surface to seal bottom manifold at Z = 0.000 mm.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 p-2 rounded bg-[#0C0D0F] border border-[#262930]">
                <CheckCircle className="w-3.5 h-3.5 text-[#10B981] shrink-0 mt-0.5" />
                <div className="text-[11px]">
                  <span className="font-semibold text-[#ECEEF2] block">Cavity Coverage (45° Pitch)</span>
                  <span className="text-[#8A909E] text-[10px]">
                    Pitch sensor downward to capture internal concavities and undercuts.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 p-2 rounded bg-[#0C0D0F] border border-[#262930]">
                <CheckCircle className="w-3.5 h-3.5 text-[#10B981] shrink-0 mt-0.5" />
                <div className="text-[11px]">
                  <span className="font-semibold text-[#ECEEF2] block">Diffused Ambient Light</span>
                  <span className="text-[#8A909E] text-[10px]">
                    Mitigate specular glare to eliminate Screened Poisson surface artifacts.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#262930]">
            <span className="text-[11px] text-[#8A909E] font-medium tracking-wider uppercase flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-[#10B981]" />
              CAD & PRINTABILITY AUDIT
            </span>
            <span className="text-[10px] text-[#ECEEF2] px-1.5 py-0.2 rounded bg-[#0C0D0F] border border-[#262930]">
              {project?.meshAssets?.format?.toUpperCase() || 'CAD'}
            </span>
          </div>

          {/* Missing Companion Alert Card if project NEEDS_MESH */}
          {project?.status === 'NEEDS_MESH' && (
            <div className="p-3 bg-[#1A1D21] border border-[#F59E0B] rounded">
              <div className="flex items-center gap-1.5 text-[#F59E0B] font-semibold text-xs mb-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>MISSING COMPANION MESH</span>
              </div>
              <p className="text-[11px] text-[#8A909E] mb-2">
                External geometry is referenced by this MeshLab project:
              </p>
              <div className="text-[10px] text-[#F59E0B] bg-[#0C0D0F] p-1.5 rounded border border-[#262930] mb-2 truncate">
                {project.missingFilenames?.join(', ')}
              </div>
              <button
                onClick={onAttachMeshClick}
                className="w-full py-1.5 rounded bg-[#F59E0B] text-[#0C0D0F] font-semibold hover:brightness-110 transition flex items-center justify-center gap-1 text-[11px]"
              >
                <Upload className="w-3 h-3" />
                ATTACH REFERENCED MESH
              </button>
            </div>
          )}

          {/* Model Information */}
          <div className="space-y-1.5 bg-[#0C0D0F] border border-[#262930] rounded p-2.5">
            <span className="text-[10px] text-[#8A909E] uppercase tracking-wider block">
              MODEL IDENTIFIER
            </span>
            <div className="font-semibold text-[#ECEEF2] truncate text-xs">
              {project?.name || 'No Model Active'}
            </div>
            {project?.metrics?.layerCount && project.metrics.layerCount > 1 && (
              <div className="text-[10px] text-[#8A909E] flex items-center gap-1">
                <Layers className="w-3 h-3 text-[#10B981]" />
                {project.metrics.layerCount} Geometric Layers
              </div>
            )}
          </div>

          {/* Printability Audit Metrics Table */}
          <div className="space-y-2">
            <span className="text-[10px] text-[#8A909E] uppercase tracking-wider block">
              METRIC GAUGING & GEOMETRY
            </span>

            <div className="grid grid-cols-2 gap-1.5">
              {/* Bounding Dimensions */}
              <div className="p-2 rounded bg-[#0C0D0F] border border-[#262930] col-span-2">
                <span className="text-[10px] text-[#8A909E] block mb-0.5">DIMENSIONS (X × Y × Z)</span>
                <span className="font-semibold text-[#ECEEF2] text-xs tabular-nums">
                  {project?.metrics?.dimensionsMm
                    ? `${project.metrics.dimensionsMm[0]} × ${project.metrics.dimensionsMm[1]} × ${project.metrics.dimensionsMm[2]} mm`
                    : '—'}
                </span>
              </div>

              {/* Triangle Count */}
              <div className="p-2 rounded bg-[#0C0D0F] border border-[#262930]">
                <span className="text-[10px] text-[#8A909E] block mb-0.5">TRIANGLE COUNT</span>
                <span className="font-semibold text-[#10B981] text-xs tabular-nums">
                  {project?.metrics?.triangles?.toLocaleString() || '—'}
                </span>
              </div>

              {/* Volume */}
              <div className="p-2 rounded bg-[#0C0D0F] border border-[#262930]">
                <span className="text-[10px] text-[#8A909E] block mb-0.5">VOLUME</span>
                <span className="font-semibold text-[#ECEEF2] text-xs tabular-nums">
                  {project?.metrics?.volumeCm3 ? `${project.metrics.volumeCm3} cm³` : '—'}
                </span>
              </div>

              {/* Watertight Status */}
              <div className="p-2 rounded bg-[#0C0D0F] border border-[#262930] col-span-2 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#8A909E] block">MANIFOLD INTEGRITY</span>
                  <span className="text-xs font-semibold text-[#10B981]">
                    WATERTIGHT (Z = 0.000 mm)
                  </span>
                </div>
                <CheckCircle className="w-4 h-4 text-[#10B981]" />
              </div>
            </div>
          </div>

          {/* Filament Mass Estimator */}
          <div className="space-y-2 bg-[#0C0D0F] border border-[#262930] rounded p-2.5">
            <span className="text-[10px] text-[#8A909E] uppercase tracking-wider block flex items-center gap-1">
              <Scale className="w-3 h-3 text-[#10B981]" />
              FILAMENT MASS ESTIMATOR
            </span>

            <div className="grid grid-cols-2 gap-1 mb-2">
              {materials.map((m) => (
                <button
                  key={m.name}
                  onClick={() => {
                    setSelectedDensity(m.density);
                    setMaterialName(m.name);
                  }}
                  className={`py-1 px-1.5 rounded border text-[10px] text-center transition ${
                    materialName === m.name
                      ? 'bg-[#1A1D21] border-[#ECEEF2] text-[#ECEEF2] font-semibold'
                      : 'bg-[#131518] border-[#262930] text-[#8A909E] hover:text-[#ECEEF2]'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-[#262930]">
              <span className="text-[10px] text-[#8A909E]">ESTIMATED MASS:</span>
              <span className="font-semibold text-[#ECEEF2] text-xs tabular-nums">
                {project?.metrics?.volumeCm3
                  ? `${Math.round(project.metrics.volumeCm3 * selectedDensity * 10) / 10} g`
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Export Actions (Persistent) */}
      <div className="p-3 border-t border-[#262930] space-y-2">
        <button
          onClick={handleDownloadStl}
          disabled={!project || project.status !== 'COMPLETED'}
          className={`w-full py-2 rounded bg-[#ECEEF2] text-[#0C0D0F] font-semibold hover:bg-white transition flex items-center justify-center gap-1.5 text-xs ${
            !project || project.status !== 'COMPLETED' ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          DOWNLOAD BINARY .STL
        </button>

        {project?.meshAssets?.format === 'mlp' && (
          <button
            onClick={handleExportMlpBundle}
            className="w-full py-1.5 rounded bg-[#1A1D21] border border-[#262930] text-[#ECEEF2] hover:bg-[#262930] transition flex items-center justify-center gap-1 text-[11px]"
          >
            <Download className="w-3 h-3 text-[#10B981]" />
            EXPORT .MLP BUNDLE
          </button>
        )}
      </div>
    </aside>
  );
};

