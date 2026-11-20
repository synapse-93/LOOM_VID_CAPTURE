import React, { useRef, useEffect } from 'react';
import {
  Terminal,
  Download,
  Box,
  Square,
  Clock,
  CheckCircle,
  Loader2,
  FileText,
} from 'lucide-react';
import { ScanProject } from '../lib/projectStore';
import { PIPELINE_STAGES } from '../lib/backgroundRunner';

interface PipelineViewportProps {
  project?: ScanProject | null;
  onOpen3DViewer: () => void;
  onCancelJob: (projectId: string) => void;
}

export const PipelineViewport: React.FC<PipelineViewportProps> = ({
  project,
  onOpen3DViewer,
  onCancelJob,
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal log
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [project?.logs]);

  if (!project) {
    return (
      <div className="w-full h-full bg-[#0C0D0F] flex flex-col items-center justify-center p-6 text-center select-none font-mono">
        <div className="w-12 h-12 rounded border border-[#262930] bg-[#131518] flex items-center justify-center text-[#8A909E] mb-3">
          <Clock className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-[#ECEEF2] uppercase tracking-wider mb-1">
          NO PIPELINE JOB ACTIVE
        </h3>
        <p className="text-xs text-[#8A909E] max-w-sm mb-4">
          Record a new 360° orbit scan or upload a video file to execute the LOOM reconstruction pipeline.
        </p>
      </div>
    );
  }

  const currentStageIndex = project.currentStageIndex || (project.status === 'COMPLETED' ? 8 : 1);
  const isRunning = project.status === 'RUNNING';
  const isCompleted = project.status === 'COMPLETED';

  // Export logs to txt file
  const handleExportLogs = () => {
    if (!project.logs) return;
    const logText = project.logs
      .map((l) => `[${l.timestamp}] [${l.stage}] ${l.message}`)
      .join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}_pipeline_logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download binary STL file if completed
  const handleDownloadStl = () => {
    if (!project.meshAssets || project.meshAssets.files.length === 0) return;
    const stlFile = project.meshAssets.files.find((f) => f.name.toLowerCase().endsWith('.stl')) || project.meshAssets.files[0];
    const blob = new Blob([stlFile.buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = stlFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full h-full bg-[#0C0D0F] flex flex-col justify-between select-none overflow-hidden font-mono">
      {/* Top 8-Stage Architecture Stepper Bar */}
      <div className="bg-[#131518] border-b border-[#262930] p-3">
        <div className="flex items-center justify-between mb-2 text-[11px] text-[#8A909E]">
          <span className="font-semibold text-[#ECEEF2] tracking-wider uppercase">
            RECONSTRUCTION STAGES (01 — 08)
          </span>
          <span className="tabular-nums">
            PROGRESS: {project.progressPercent || (isCompleted ? 100 : 0)}%
          </span>
        </div>

        {/* Stepper Grid (8 Stages) */}
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-1.5">
          {PIPELINE_STAGES.map((stg) => {
            const isStageDone = currentStageIndex > stg.index || isCompleted;
            const isStageCurrent = isRunning && currentStageIndex === stg.index;

            return (
              <div
                key={stg.id}
                className={`p-1.5 rounded border text-[10px] transition flex flex-col justify-between ${
                  isStageDone
                    ? 'bg-[#0C0D0F] border-[#10B981]/50 text-[#10B981]'
                    : isStageCurrent
                    ? 'bg-[#1A1D21] border-[#ECEEF2] text-[#ECEEF2]'
                    : 'bg-[#0C0D0F] border-[#262930] text-[#8A909E] opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">0{stg.index}</span>
                  {isStageDone ? (
                    <CheckCircle className="w-3 h-3 text-[#10B981]" />
                  ) : isStageCurrent ? (
                    <Loader2 className="w-3 h-3 text-[#ECEEF2] animate-spin" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#262930]" />
                  )}
                </div>
                <span className="truncate text-[9px] uppercase font-medium">{stg.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-Time Monospaced Terminal Log Stream */}
      <div className="flex-1 bg-[#0C0D0F] p-4 overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#262930] text-[11px] text-[#8A909E]">
          <span className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-[#10B981]" />
            COLMAP / SCREENED POISSON STDOUT
          </span>
          <span className="text-[10px]">TIMESTAMP: UTC ISO 8601</span>
        </div>

        <div className="flex-1 space-y-1 text-xs">
          {project.logs && project.logs.length > 0 ? (
            project.logs.map((log, index) => {
              const isErr = log.level === 'error';
              const isWarn = log.level === 'warn';
              const isSuccess = log.level === 'success';

              return (
                <div
                  key={index}
                  className="flex items-start gap-2 leading-relaxed hover:bg-[#131518] px-1 py-0.5 rounded transition"
                >
                  <span className="text-[#8A909E] shrink-0 text-[11px] tabular-nums">
                    [{log.timestamp}]
                  </span>
                  <span
                    className={`font-semibold shrink-0 text-[11px] ${
                      isErr
                        ? 'text-[#EF4444]'
                        : isWarn
                        ? 'text-[#F59E0B]'
                        : isSuccess
                        ? 'text-[#10B981]'
                        : 'text-[#8A909E]'
                    }`}
                  >
                    [{log.stage}]
                  </span>
                  <span
                    className={`break-words ${
                      isErr
                        ? 'text-[#EF4444]'
                        : isWarn
                        ? 'text-[#F59E0B]'
                        : isSuccess
                        ? 'text-[#ECEEF2]'
                        : 'text-[#ECEEF2]'
                    }`}
                  >
                    {log.message}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="text-[#8A909E] text-xs py-4 text-center">
              Waiting for pipeline stdout stream...
            </div>
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>

      {/* Bottom Action Footer Bar */}
      <div className="h-[52px] bg-[#131518] border-t border-[#262930] px-4 flex items-center justify-between">
        {/* Left Status Info */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[#8A909E]">STATUS:</span>
          <span
            className={`font-semibold px-2 py-0.5 rounded border text-[11px] ${
              isCompleted
                ? 'bg-[#10B981]/10 border-[#10B981] text-[#10B981]'
                : isRunning
                ? 'bg-[#ECEEF2]/10 border-[#ECEEF2] text-[#ECEEF2]'
                : 'bg-[#262930] border-[#262930] text-[#8A909E]'
            }`}
          >
            {project.status}
          </span>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={() => onCancelJob(project.id)}
              className="px-3 py-1.5 rounded border border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444]/10 transition flex items-center gap-1.5 text-xs"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              CANCEL JOB
            </button>
          )}

          <button
            onClick={handleExportLogs}
            className="px-3 py-1.5 rounded bg-[#0C0D0F] border border-[#262930] text-[#ECEEF2] hover:bg-[#1A1D21] transition flex items-center gap-1.5 text-xs"
          >
            <FileText className="w-3.5 h-3.5 text-[#8A909E]" />
            EXPORT LOGS (.TXT)
          </button>

          {isCompleted && (
            <>
              <button
                onClick={handleDownloadStl}
                className="px-3 py-1.5 rounded bg-[#1A1D21] border border-[#262930] text-[#ECEEF2] hover:bg-[#262930] transition flex items-center gap-1.5 text-xs"
              >
                <Download className="w-3.5 h-3.5 text-[#10B981]" />
                DOWNLOAD BINARY .STL
              </button>

              <button
                onClick={onOpen3DViewer}
                className="px-4 py-1.5 rounded bg-[#ECEEF2] text-[#0C0D0F] font-semibold hover:bg-white transition flex items-center gap-1.5 text-xs"
              >
                <Box className="w-3.5 h-3.5" />
                OPEN IN 3D VIEWER
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
