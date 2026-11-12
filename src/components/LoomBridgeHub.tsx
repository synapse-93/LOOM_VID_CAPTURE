import React, { useState, useEffect } from 'react';
import {
  Server,
  CheckCircle2,
  Terminal,
  Box,
  Settings,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { loomBridge } from '../services/loomBridge';
import { LoomReconstructionJob } from '../types/capture';

interface LoomBridgeHubProps {
  onOpenInspector: () => void;
}

export const LoomBridgeHub: React.FC<LoomBridgeHubProps> = ({ onOpenInspector }) => {
  const [jobs, setJobs] = useState<LoomReconstructionJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [backendUrl, setBackendUrl] = useState(loomBridge.getConfig().backendUrl);
  const [apiKey, setApiKey] = useState(loomBridge.getConfig().apiKey || '');
  const [simulationFallback, setSimulationFallback] = useState(loomBridge.getConfig().enableSimulationFallback);
  const [featureQuality, setFeatureQuality] = useState(loomBridge.getConfig().defaultFeatureQuality);
  const [showConfig, setShowConfig] = useState(false);

  // Poll active jobs
  useEffect(() => {
    const updateJobs = () => {
      const allJobs = loomBridge.getAllJobs();
      setJobs(allJobs);
      if (!selectedJobId && allJobs.length > 0) {
        setSelectedJobId(allJobs[0].jobId);
      }
    };

    updateJobs();
    const interval = setInterval(updateJobs, 1000);
    return () => clearInterval(interval);
  }, [selectedJobId]);

  const selectedJob = jobs.find((j) => j.jobId === selectedJobId) || jobs[0];

  const handleSaveConfig = () => {
    loomBridge.setConfig({
      backendUrl,
      apiKey,
      enableSimulationFallback: simulationFallback,
      defaultFeatureQuality: featureQuality,
    });
    setShowConfig(false);
  };

  // Launch a demo job if none exists
  const handleLaunchSampleJob = async () => {
    const dummyVideo = new Blob(['sample-video-bytes'], { type: 'video/mp4' });
    const bundle = loomBridge.prepareCaptureBundle(dummyVideo, {
      id: `sample_${Date.now()}`,
      timestamp: new Date().toISOString(),
      durationSeconds: 30,
      resolution: { width: 1920, height: 1080 },
      fps: 60,
      targetBitrateMbps: 10.0,
      actualBitrateMbps: 9.8,
      fileSizeBytes: 37_000_000,
      mimeType: 'video/mp4',
      preset: 'single-30',
      telemetrySummary: {
        avgSharpness: 142,
        minSharpness: 88,
        avgTexture: 48,
        maxGlare: 0.9,
        blurFramePercentage: 2,
        glareFramePercentage: 1,
        orbitCoveragePercent: 100,
        qualityRating: 'EXCELLENT',
      },
      deviceInfo: {
        userAgent: 'LOOM Capture Studio Browser',
        cameraLabel: 'Integrated 4K Sensor',
        hasGyro: true,
      },
      samples: [],
    });

    const newJob = await loomBridge.submitReconstructionJob(bundle);
    setSelectedJobId(newJob.jobId);
  };

  return (
    <div className="w-full h-[calc(100vh-4rem)] bg-[#090b0e] flex flex-col lg:flex-row overflow-hidden select-none">
      {/* Left Sidebar: Job Queue & Adapter Settings */}
      <div className="w-full lg:w-80 bg-[#12161f] border-r border-[#1e2430] flex flex-col h-full">
        <div className="p-4 border-b border-[#1e2430] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#00e599]" />
            <span className="text-xs font-semibold text-[#f1f5f9] tracking-wider uppercase">LOOM Bridge Pipeline</span>
          </div>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-1.5 rounded hover:bg-[#1e2430] text-[#94a3b8] hover:text-[#00e599] transition"
            title="Bridge Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Configuration Drawer */}
        {showConfig ? (
          <div className="p-4 bg-[#090b0e] border-b border-[#1e2430] space-y-3 text-xs">
            <div>
              <label className="text-[10px] uppercase font-mono text-[#94a3b8] block mb-1">LOOM API Endpoint</label>
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                className="w-full bg-[#12161f] border border-[#1e2430] rounded px-2.5 py-1.5 text-[#f1f5f9] font-mono focus:border-[#00e599] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-mono text-[#94a3b8] block mb-1">LOOM Auth API Key</label>
              <input
                type="password"
                value={apiKey}
                placeholder="Optional for local simulation"
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-[#12161f] border border-[#1e2430] rounded px-2.5 py-1.5 text-[#f1f5f9] font-mono focus:border-[#00e599] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-mono text-[#94a3b8] block mb-1">Feature Quality (SfM)</label>
              <select
                value={featureQuality}
                onChange={(e) => setFeatureQuality(e.target.value as 'fast' | 'high' | 'ultra')}
                className="w-full bg-[#12161f] border border-[#1e2430] rounded px-2.5 py-1.5 text-[#f1f5f9] font-mono focus:border-[#00e599] outline-none"
              >
                <option value="fast">Fast (Reduced Keyframes)</option>
                <option value="high">High (Standard SIFT)</option>
                <option value="ultra">Ultra (SuperPoint 4K)</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#94a3b8]">Simulate Pipeline Worker</span>
              <input
                type="checkbox"
                checked={simulationFallback}
                onChange={(e) => setSimulationFallback(e.target.checked)}
                className="accent-[#00e599]"
              />
            </div>
            <div className="pt-2 flex gap-2">
              <button
                onClick={handleSaveConfig}
                className="flex-1 py-1.5 bg-[#00e599] text-[#090b0e] font-bold rounded text-xs"
              >
                Save Config
              </button>
              <button
                onClick={() => setShowConfig(false)}
                className="px-3 py-1.5 bg-[#181e2b] text-[#94a3b8] rounded text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {/* Job Queue List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#94a3b8]">Active Queue ({jobs.length})</span>
            <button
              onClick={handleLaunchSampleJob}
              className="text-[10px] font-mono text-[#00e599] hover:underline"
            >
              + Test Scan Job
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="text-center py-12 px-4 border border-dashed border-[#1e2430] rounded-xl text-xs text-[#94a3b8]">
              <Cpu className="w-8 h-8 text-[#94a3b8]/40 mx-auto mb-2" />
              <p>No captures queued.</p>
              <p className="text-[11px] mt-1 text-[#94a3b8]/60">Record a 10 Mbps scan in Capture Studio to trigger reconstruction.</p>
            </div>
          ) : (
            jobs.map((job) => (
              <div
                key={job.jobId}
                onClick={() => setSelectedJobId(job.jobId)}
                className={`p-3 rounded-xl border cursor-pointer transition text-xs ${
                  selectedJob?.jobId === job.jobId
                    ? 'bg-[#181e2b] border-[#00e599]/50'
                    : 'bg-[#090b0e] border-[#1e2430] hover:border-[#1e2430]/80'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[#f1f5f9] text-[11px] font-semibold truncate max-w-[130px]">
                    {job.captureId}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      job.status === 'ready'
                        ? 'bg-[#00e599]/10 text-[#00e599]'
                        : 'bg-[#f59e0b]/10 text-[#f59e0b]'
                    }`}
                  >
                    {job.status === 'ready' ? 'READY' : `${job.progress}%`}
                  </span>
                </div>
                <div className="text-[11px] text-[#94a3b8] truncate mb-2">{job.currentStageName}</div>
                {/* Progress bar */}
                <div className="w-full h-1 bg-[#1e2430] rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      job.status === 'ready' ? 'bg-[#00e599]' : 'bg-[#f59e0b]'
                    }`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content: Selected Job Reconstruction Pipeline Visualizer */}
      <div className="flex-1 h-full overflow-y-auto p-6 flex flex-col gap-6">
        {selectedJob ? (
          <>
            {/* Header Status Card */}
            <div className="bg-[#12161f] border border-[#1e2430] rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#00e599]/10 text-[#00e599] border border-[#00e599]/20">
                    LOOM Reconstruction Pipeline
                  </span>
                  <span className="text-xs font-mono text-[#94a3b8]">{selectedJob.jobId}</span>
                </div>
                <h2 className="text-xl font-bold text-[#f1f5f9]">{selectedJob.currentStageName}</h2>
                <p className="text-xs text-[#94a3b8] mt-1">
                  Target: Screened Poisson Surface Mesh • SIFT / SuperPoint 4K matching
                </p>
              </div>

              {selectedJob.status === 'ready' ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={onOpenInspector}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00e599] text-[#090b0e] font-bold text-xs hover:bg-[#00e599]/90 transition"
                  >
                    <Box className="w-4 h-4" />
                    <span>Inspect STL in 3D</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-mono text-[#f59e0b]">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Photogrammetry...</span>
                </div>
              )}
            </div>

            {/* Pipeline Stage Timeline */}
            <div className="bg-[#12161f] border border-[#1e2430] rounded-2xl p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-4">
                Pipeline Stages
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {[
                  { id: 'extract', name: '1. Saliency Frames', minProgress: 15 },
                  { id: 'sfm', name: '2. Sparse SfM', minProgress: 40 },
                  { id: 'mvs', name: '3. Dense MVS', minProgress: 65 },
                  { id: 'meshing', name: '4. Poisson Mesh', minProgress: 85 },
                  { id: 'texture', name: '5. Texture Bake', minProgress: 95 },
                  { id: 'ready', name: '6. Ready & STL', minProgress: 100 },
                ].map((st) => {
                  const isDone = selectedJob.progress >= st.minProgress;
                  const isCurrent =
                    selectedJob.progress < st.minProgress &&
                    selectedJob.progress >= st.minProgress - 25;

                  return (
                    <div
                      key={st.id}
                      className={`p-3 rounded-xl border text-xs flex flex-col justify-between min-h-[75px] transition ${
                        isDone
                          ? 'bg-[#00e599]/5 border-[#00e599]/30 text-[#00e599]'
                          : isCurrent
                          ? 'bg-[#f59e0b]/5 border-[#f59e0b]/40 text-[#f59e0b]'
                          : 'bg-[#090b0e] border-[#1e2430] text-[#94a3b8]'
                      }`}
                    >
                      <span className="font-mono text-[11px] font-semibold">{st.name}</span>
                      <div className="flex items-center justify-between text-[10px] mt-2">
                        <span>{isDone ? 'COMPLETE' : isCurrent ? 'RUNNING' : 'PENDING'}</span>
                        {isDone && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stage Logs Terminal */}
            <div className="bg-[#090b0e] border border-[#1e2430] rounded-2xl p-4 flex flex-col flex-1">
              <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[#1e2430] text-xs font-mono text-[#94a3b8]">
                <Terminal className="w-4 h-4 text-[#00e599]" />
                <span>LOOM Pipeline Worker Stdout</span>
              </div>
              <div className="flex-1 font-mono text-xs text-[#94a3b8] space-y-1.5 overflow-y-auto max-h-72">
                {selectedJob.stageLogs.map((log, idx) => (
                  <div key={idx} className="flex gap-2 leading-relaxed">
                    <span className="text-[#00e599] select-none">&gt;</span>
                    <span className="text-[#f1f5f9]">{log}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <Cpu className="w-12 h-12 text-[#94a3b8]/30 mb-3" />
            <h3 className="text-base font-bold text-[#f1f5f9] mb-1">No Active LOOM Session</h3>
            <p className="text-xs text-[#94a3b8] max-w-sm mb-4">
              Capture a 360° orbit with computer-vision guidance to generate a high-density 3D mesh.
            </p>
            <button
              onClick={handleLaunchSampleJob}
              className="px-4 py-2 rounded-lg bg-[#00e599] text-[#090b0e] text-xs font-bold"
            >
              Run Pipeline Simulation
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
