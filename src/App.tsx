import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  QrCode,
  Copy,
  Check,
  X,
  Cpu,
  Loader2,
  FileVideo,
  Layers,
  Box,
  Camera,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  ScanProject,
  ensurePreSeeded,
  saveProject,
  deleteProject,
} from './lib/projectStore';
import { backgroundRunner } from './lib/backgroundRunner';
import { FrameTelemetry } from './lib/cvGuidance';
import { HistorySidebar } from './components/HistorySidebar';
import { CaptureViewport } from './components/CaptureViewport';
import { UploadViewport } from './components/UploadViewport';
import { PipelineViewport } from './components/PipelineViewport';
import { CadViewer3D } from './components/CadViewer3D';
import { InspectorRail } from './components/InspectorRail';
import { PipelineDrawer } from './components/PipelineDrawer';

export type WorkstationMode = 'CAMERA' | 'UPLOAD' | 'PIPELINE' | '3D VIEWER';

export const App: React.FC = () => {
  const [mode, setMode] = useState<WorkstationMode>('3D VIEWER');
  const [projects, setProjects] = useState<ScanProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Background Runner Active Job state
  const [activeJob, setActiveJob] = useState<{ id: string; stageName: string; percent: number } | null>(null);

  // Live Telemetry from Camera
  const [liveTelemetry, setLiveTelemetry] = useState<FrameTelemetry | null>(null);
  const [orbitSectors, setOrbitSectors] = useState<number>(0);

  // Drawers & Modals
  const [isSpecDrawerOpen, setIsSpecDrawerOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // 1. Initialize IndexedDB & Pre-Seeded Projects
  const loadDatabase = useCallback(async () => {
    try {
      const seeded = await ensurePreSeeded();
      setProjects(seeded);
      if (seeded.length > 0 && !selectedProjectId) {
        setSelectedProjectId(seeded[0].id);
      }
    } catch (err) {
      console.error('[App] Database init error:', err);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadDatabase();
  }, [loadDatabase]);

  // Selected Project instance
  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId) || (projects.length > 0 ? projects[0] : null);
  }, [projects, selectedProjectId]);

  // 2. Mobile QR Code generation
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

  // Copy current URL
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // 3. Handle Completed Camera Capture
  const handleCaptureComplete = async (result: {
    blob: Blob;
    mimeType: string;
    extension: 'mp4' | 'webm';
    sizeBytes: number;
    durationSec: number;
  }) => {
    const now = Date.now();
    const newProject: ScanProject = {
      id: `proj-cam-${now}`,
      name: `Capture_Orbit_${new Date(now).toISOString().slice(11, 19).replace(/:/g, '')}.${result.extension}`,
      createdAt: now,
      sourceType: 'CAMERA',
      status: 'QUEUED',
      durationSec: result.durationSec,
      fileSize: result.sizeBytes,
      videoBlob: result.blob,
      progressPercent: 0,
      logs: [
        {
          timestamp: '00:00:00.000',
          stage: 'CAMERA_INGEST',
          message: `Recorded ${result.durationSec.toFixed(1)}s 360° orbit capture (${(result.sizeBytes / (1024 * 1024)).toFixed(1)} MB ${result.mimeType})`,
          level: 'success',
        },
      ],
    };

    await saveProject(newProject);
    setProjects((prev) => [newProject, ...prev]);
    setSelectedProjectId(newProject.id);
    setMode('PIPELINE');

    // Launch Background 8-Stage Reconstruction
    startBackgroundPipeline(newProject);
  };

  // 4. Handle Uploaded Video
  const handleVideoUploaded = async (file: File) => {
    const now = Date.now();
    const newProject: ScanProject = {
      id: `proj-vid-${now}`,
      name: file.name,
      createdAt: now,
      sourceType: 'UPLOAD',
      status: 'QUEUED',
      fileSize: file.size,
      progressPercent: 0,
      logs: [
        {
          timestamp: '00:00:00.000',
          stage: 'FILE_INGEST',
          message: `Uploaded local video file: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`,
          level: 'info',
        },
      ],
    };

    await saveProject(newProject);
    setProjects((prev) => [newProject, ...prev]);
    setSelectedProjectId(newProject.id);
    setMode('PIPELINE');

    // Launch Background 8-Stage Reconstruction
    startBackgroundPipeline(newProject);
  };

  // 5. Handle Uploaded CAD project (.mlp / .stl / .ply / .obj)
  const handleCadProjectLoaded = (project: ScanProject) => {
    setProjects((prev) => {
      const filtered = prev.filter((p) => p.id !== project.id);
      return [project, ...filtered];
    });
    setSelectedProjectId(project.id);
    setMode('3D VIEWER');
  };

  // 6. Execute Background Reconstruction Job
  const startBackgroundPipeline = (project: ScanProject) => {
    setActiveJob({ id: project.id, stageName: 'KEYFRAME_SELECTION', percent: 0 });

    const unsubscribe = backgroundRunner.subscribe(project.id, (updated) => {
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setActiveJob({
        id: updated.id,
        stageName: updated.currentStageName || 'PROCESSING',
        percent: updated.progressPercent || 0,
      });

      if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
        setActiveJob(null);
        unsubscribe();
      }
    });

    backgroundRunner.startJob(project);
  };

  // 7. Delete Project
  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId);
    setProjects((prev) => {
      const remaining = prev.filter((p) => p.id !== projectId);
      if (selectedProjectId === projectId) {
        setSelectedProjectId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
  };

  return (
    <div className="min-h-screen bg-[#0C0D0F] text-[#ECEEF2] flex flex-col font-sans select-none overflow-hidden">
      {/* 44px Precision Industrial Top Header Bar */}
      <header className="h-[44px] bg-[#131518] border-b border-[#262930] px-4 flex items-center justify-between z-30 shrink-0">
        {/* Left: Brand Identification */}
        <div className="flex items-center">
          <span className="font-mono font-bold tracking-widest text-xs text-[#ECEEF2]">
            LOOM
          </span>
          <span className="text-[#8A909E] mx-1.5 font-mono text-xs">/</span>
          <span className="font-mono text-xs text-[#8A909E]">WORKSTATION</span>
        </div>

        {/* Center: 4-Mode Workstation Segmented Switcher */}
        <nav className="border border-[#262930] rounded bg-[#0C0D0F] p-0.5 flex items-center gap-0.5 font-mono text-xs">
          <button
            onClick={() => setMode('CAMERA')}
            className={`px-3 py-1 rounded transition flex items-center gap-1.5 ${
              mode === 'CAMERA'
                ? 'bg-[#1A1D21] text-[#ECEEF2] border border-[#262930] font-medium'
                : 'text-[#8A909E] hover:text-[#ECEEF2]'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>01 CAMERA</span>
          </button>

          <button
            onClick={() => setMode('UPLOAD')}
            className={`px-3 py-1 rounded transition flex items-center gap-1.5 ${
              mode === 'UPLOAD'
                ? 'bg-[#1A1D21] text-[#ECEEF2] border border-[#262930] font-medium'
                : 'text-[#8A909E] hover:text-[#ECEEF2]'
            }`}
          >
            <FileVideo className="w-3.5 h-3.5" />
            <span>02 UPLOAD</span>
          </button>

          <button
            onClick={() => setMode('PIPELINE')}
            className={`px-3 py-1 rounded transition flex items-center gap-1.5 ${
              mode === 'PIPELINE'
                ? 'bg-[#1A1D21] text-[#ECEEF2] border border-[#262930] font-medium'
                : 'text-[#8A909E] hover:text-[#ECEEF2]'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>03 PIPELINE</span>
          </button>

          <button
            onClick={() => setMode('3D VIEWER')}
            className={`px-3 py-1 rounded transition flex items-center gap-1.5 ${
              mode === '3D VIEWER'
                ? 'bg-[#1A1D21] text-[#ECEEF2] border border-[#262930] font-medium'
                : 'text-[#8A909E] hover:text-[#ECEEF2]'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>04 3D VIEWER</span>
          </button>
        </nav>

        {/* Right: Active Job Indicator & Spec / QR Buttons */}
        <div className="flex items-center gap-2">
          {/* Background Running Job Status Pill */}
          {activeJob && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#10B981]/10 border border-[#10B981]/40 text-[#10B981] font-mono text-[11px]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="font-semibold uppercase truncate max-w-[140px]">
                {activeJob.stageName}
              </span>
              <span className="tabular-nums">({activeJob.percent}%)</span>
            </div>
          )}

          {/* Pipeline Spec Slide-Over Button */}
          <button
            onClick={() => setIsSpecDrawerOpen(true)}
            className="border border-[#262930] rounded px-2.5 py-1 font-mono text-xs text-[#8A909E] hover:text-[#ECEEF2] hover:bg-[#1A1D21] transition flex items-center gap-1"
            title="Open LOOM 8-Stage Architecture Spec"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PIPELINE SPEC</span>
          </button>

          {/* Phone QR Button */}
          <button
            onClick={() => setIsQrModalOpen(true)}
            className="border border-[#262930] rounded px-2.5 py-1 font-mono text-xs text-[#ECEEF2] hover:bg-[#1A1D21] transition flex items-center gap-1.5"
            title="Open on Smartphone Camera via QR"
          >
            <QrCode className="w-3.5 h-3.5 text-[#8A909E]" />
            <span className="hidden sm:inline">PHONE QR</span>
          </button>
        </div>
      </header>

      {/* Main Unified 3-Pane Workstation Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Pane 1 (Left 260px): Project History & Queue Dock */}
        <HistorySidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={(proj) => {
            setSelectedProjectId(proj.id);
            if (proj.status === 'RUNNING' || proj.status === 'QUEUED') {
              setMode('PIPELINE');
            } else if (proj.status === 'COMPLETED' || proj.status === 'NEEDS_MESH') {
              setMode('3D VIEWER');
            }
          }}
          onDeleteProject={handleDeleteProject}
          onNewCapture={() => setMode('CAMERA')}
          onOpenUpload={() => setMode('UPLOAD')}
        />

        {/* Pane 2 (Center Viewport): Primary Mode Canvas */}
        <main className="flex-1 relative overflow-hidden bg-[#0C0D0F]">
          {mode === 'CAMERA' && (
            <CaptureViewport
              onCaptureComplete={handleCaptureComplete}
              onSwitchToUpload={() => setMode('UPLOAD')}
              onTelemetryUpdate={(telem, sectors) => {
                setLiveTelemetry(telem);
                setOrbitSectors(sectors);
              }}
            />
          )}

          {mode === 'UPLOAD' && (
            <UploadViewport
              onVideoUploaded={handleVideoUploaded}
              onCadProjectLoaded={handleCadProjectLoaded}
            />
          )}

          {mode === 'PIPELINE' && (
            <PipelineViewport
              project={selectedProject}
              onOpen3DViewer={() => setMode('3D VIEWER')}
              onCancelJob={(id) => backgroundRunner.cancel(id)}
            />
          )}

          {mode === '3D VIEWER' && (
            <CadViewer3D
              project={selectedProject}
              onProjectUpdated={(updated) => {
                setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
              }}
              onOpenUpload={() => setMode('UPLOAD')}
            />
          )}
        </main>

        {/* Pane 3 (Right 300px): Contextual Inspector Rail */}
        <InspectorRail
          mode={mode}
          project={selectedProject}
          liveTelemetry={liveTelemetry}
          orbitSectors={orbitSectors}
        />
      </div>

      {/* Slide-Over Pipeline Architecture Spec Drawer */}
      <PipelineDrawer
        isOpen={isSpecDrawerOpen}
        onClose={() => setIsSpecDrawerOpen(false)}
      />

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
                className="px-2 py-1 rounded bg-[#1A1D21] hover:bg-[#262930] text-[#ECEEF2] text-[10px] transition flex items-center gap-1"
              >
                {copiedUrl ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
                {copiedUrl ? 'COPIED' : 'COPY'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
