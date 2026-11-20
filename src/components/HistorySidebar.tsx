import React from 'react';
import {
  Camera,
  Upload,
  Layers,
  Box,
  Trash2,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { ScanProject } from '../lib/projectStore';

interface HistorySidebarProps {
  projects: ScanProject[];
  selectedProjectId: string | null;
  onSelectProject: (project: ScanProject) => void;
  onDeleteProject: (projectId: string) => void;
  onNewCapture: () => void;
  onOpenUpload: () => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  projects,
  selectedProjectId,
  onSelectProject,
  onDeleteProject,
  onNewCapture,
  onOpenUpload,
}) => {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const getSourceIcon = (sourceType: ScanProject['sourceType'], format?: string) => {
    if (format === 'mlp' || sourceType === 'MLP_PROJECT') {
      return <Layers className="w-3.5 h-3.5 text-[#10B981]" />;
    }
    if (sourceType === 'CAMERA') {
      return <Camera className="w-3.5 h-3.5 text-[#ECEEF2]" />;
    }
    if (sourceType === 'SAMPLE') {
      return <Box className="w-3.5 h-3.5 text-[#8A909E]" />;
    }
    return <Upload className="w-3.5 h-3.5 text-[#8A909E]" />;
  };

  const getFormatBadge = (project: ScanProject) => {
    if (project.meshAssets?.format === 'mlp' || project.sourceType === 'MLP_PROJECT') {
      return <span className="px-1.5 py-0.2 rounded bg-[#10B981]/15 text-[#10B981] font-semibold text-[9px]">MLP</span>;
    }
    if (project.meshAssets?.format === 'stl' || project.sourceType === 'SAMPLE') {
      return <span className="px-1.5 py-0.2 rounded bg-[#0C0D0F] border border-[#262930] text-[#ECEEF2] text-[9px]">STL</span>;
    }
    if (project.meshAssets?.format === 'ply') {
      return <span className="px-1.5 py-0.2 rounded bg-[#0C0D0F] border border-[#262930] text-[#ECEEF2] text-[9px]">PLY</span>;
    }
    if (project.sourceType === 'CAMERA') {
      return <span className="px-1.5 py-0.2 rounded bg-[#0C0D0F] border border-[#262930] text-[#8A909E] text-[9px]">CAM</span>;
    }
    return <span className="px-1.5 py-0.2 rounded bg-[#0C0D0F] border border-[#262930] text-[#8A909E] text-[9px]">FILE</span>;
  };

  return (
    <aside className="w-[260px] h-full bg-[#131518] border-r border-[#262930] flex flex-col justify-between font-mono select-none z-10 shrink-0">
      {/* Top Header & New Action Buttons */}
      <div className="p-3 border-b border-[#262930]">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] text-[#8A909E] font-medium tracking-wider uppercase">
            PROJECT QUEUE
          </span>
          <span className="px-1.5 py-0.2 rounded bg-[#0C0D0F] border border-[#262930] text-[10px] text-[#ECEEF2] tabular-nums">
            {projects.length}
          </span>
        </div>

        {/* Action Buttons Row */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={onNewCapture}
            className="py-1.5 px-2 rounded bg-[#ECEEF2] text-[#0C0D0F] text-[11px] font-semibold hover:bg-white transition flex items-center justify-center gap-1"
          >
            <Plus className="w-3 h-3" />
            CAPTURE
          </button>
          <button
            onClick={onOpenUpload}
            className="py-1.5 px-2 rounded bg-[#1A1D21] border border-[#262930] text-[#ECEEF2] text-[11px] hover:bg-[#262930] transition flex items-center justify-center gap-1"
          >
            <Upload className="w-3 h-3 text-[#8A909E]" />
            IMPORT
          </button>
        </div>
      </div>

      {/* Project Queue List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {projects.map((proj) => {
          const isSelected = proj.id === selectedProjectId;
          const isRunning = proj.status === 'RUNNING';
          const isNeedsMesh = proj.status === 'NEEDS_MESH';
          const isCompleted = proj.status === 'COMPLETED';

          return (
            <div
              key={proj.id}
              onClick={() => onSelectProject(proj)}
              className={`p-2 rounded border cursor-pointer transition group flex flex-col justify-between ${
                isSelected
                  ? 'bg-[#1A1D21] border-[#ECEEF2]/40 text-[#ECEEF2]'
                  : 'bg-[#131518] border-[#262930] hover:border-[#8A909E]/50 text-[#8A909E] hover:text-[#ECEEF2]'
              }`}
            >
              {/* Top Row: Format & Status */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {getSourceIcon(proj.sourceType, proj.meshAssets?.format)}
                  {getFormatBadge(proj)}
                </div>

                <div className="flex items-center gap-1">
                  {isRunning && (
                    <span className="flex items-center gap-1 text-[10px] text-[#ECEEF2]">
                      <Loader2 className="w-2.5 h-2.5 animate-spin text-[#10B981]" />
                      {proj.progressPercent || 0}%
                    </span>
                  )}
                  {isNeedsMesh && (
                    <span className="flex items-center gap-1 text-[10px] text-[#F59E0B]">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      NEEDS MESH
                    </span>
                  )}
                  {isCompleted && (
                    <CheckCircle className="w-2.5 h-2.5 text-[#10B981]" />
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProject(proj.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#EF4444]/20 text-[#EF4444] transition ml-1"
                    title="Delete project"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Middle Row: Name */}
              <div className="text-xs font-medium text-[#ECEEF2] truncate mb-1">
                {proj.name}
              </div>

              {/* Bottom Row: Details & Timestamp */}
              <div className="flex items-center justify-between text-[10px] text-[#8A909E]">
                <span>
                  {proj.metrics?.triangles
                    ? `${proj.metrics.triangles.toLocaleString()} tris`
                    : proj.sourceType === 'CAMERA'
                    ? `${proj.durationSec || 45}s video`
                    : 'Awaiting mesh'}
                </span>
                <span className="tabular-nums">{formatTime(proj.createdAt)}</span>
              </div>
            </div>
          );
        })}

        {projects.length === 0 && (
          <div className="text-center py-8 text-xs text-[#8A909E]">
            No projects in database.
          </div>
        )}
      </div>

      {/* Bottom Storage Footprint Telemetry */}
      <div className="p-3 border-t border-[#262930] text-[10px] text-[#8A909E] flex items-center justify-between">
        <span>INDEXEDDB STORAGE</span>
        <span className="text-[#10B981] font-semibold">PERSISTENT</span>
      </div>
    </aside>
  );
};

