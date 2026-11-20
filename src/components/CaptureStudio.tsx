import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Upload,
  Download,
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { analyzeFrame, FrameTelemetry, CV_CANVAS_WIDTH, CV_CANVAS_HEIGHT } from '../lib/cvGuidance';
import { CameraRecorderService, RecorderResult } from '../lib/cameraRecorder';

export const CaptureStudio: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cvCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const recorderServiceRef = useRef<CameraRecorderService>(new CameraRecorderService());
  const localFileObjectUrlRef = useRef<string | null>(null);

  // Acquisition Protocol Checklist (Section A)
  const [checklist, setChecklist] = useState({
    baseplate: false,
    cavities: false,
    cameraAngle: false,
  });

  // Camera & Mode State
  const [cameraMode, setCameraMode] = useState<'live' | 'local_file'>('live');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Optical Telemetry (Section B)
  const [telemetry, setTelemetry] = useState<FrameTelemetry>({
    sharpnessScore: 0,
    rawVariance: 0,
    textureScore: 0,
    overexposedRatio: 0,
    status: 'OPTIMAL',
    code: 'SYS_LOCKED',
    guidance: 'OPTICAL LOCK — MAINTAIN STEADY ORBIT',
    statusColor: '#8A909E',
  });

  // Scan Parameters (Section C)
  const [orbitDurationSec, setOrbitDurationSec] = useState<45 | 60>(45);
  const [targetPrintLengthMm, setTargetPrintLengthMm] = useState<number>(200);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Post-Capture Export Card (Section D)
  const [completedResult, setCompletedResult] = useState<{
    result: RecorderResult;
    url: string;
    avgSharpness: number;
    avgTexture: number;
    passed: boolean;
    timestampName: string;
  } | null>(null);

  const [copiedCli, setCopiedCli] = useState(false);

  // Speech synthesis cooldown (max 1 spoken alert per 4s)
  const lastSpokenTimeRef = useRef(0);
  const lastSpokenTextRef = useRef('');
  const telemetryHistoryRef = useRef<Array<{ sharpness: number; texture: number }>>([]);

  // Initialize Camera
  const startLiveCamera = useCallback(async () => {
    setCameraError(null);
    setCameraMode('live');

    if (localFileObjectUrlRef.current) {
      URL.revokeObjectURL(localFileObjectUrlRef.current);
      localFileObjectUrlRef.current = null;
    }

    CameraRecorderService.releaseStream(activeStreamRef.current);

    try {
      const { stream } = await CameraRecorderService.initRearCamera();
      activeStreamRef.current = stream;
      recorderServiceRef.current.setStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.loop = false;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: unknown) {
      const error = err as Error;
      setCameraError(error.message);
    }
  }, []);

  useEffect(() => {
    startLiveCamera();
    return () => {
      CameraRecorderService.releaseStream(activeStreamRef.current);
      if (localFileObjectUrlRef.current) {
        URL.revokeObjectURL(localFileObjectUrlRef.current);
      }
    };
  }, [startLiveCamera]);

  // Voice Guidance (SpeechSynthesis)
  const triggerVoiceGuidance = useCallback(
    (text: string) => {
      if (!soundEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const now = Date.now();
      if (now - lastSpokenTimeRef.current < 4000) return;
      if (lastSpokenTextRef.current === text && now - lastSpokenTimeRef.current < 8000) return;

      lastSpokenTimeRef.current = now;
      lastSpokenTextRef.current = text;

      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.volume = 0.85;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Speech API blocked or unavailable
      }
    },
    [soundEnabled]
  );

  // 10 Hz Optical Telemetry Inspection Loop
  useEffect(() => {
    if (!cvCanvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = CV_CANVAS_WIDTH;
      canvas.height = CV_CANVAS_HEIGHT;
      cvCanvasRef.current = canvas;
    }

    const intervalId = window.setInterval(() => {
      if (!videoRef.current || !cvCanvasRef.current) return;
      const tel = analyzeFrame(videoRef.current, cvCanvasRef.current);
      setTelemetry(tel);

      if (isRecording) {
        telemetryHistoryRef.current.push({
          sharpness: tel.sharpnessScore,
          texture: tel.textureScore,
        });

        if (tel.status !== 'OPTIMAL') {
          triggerVoiceGuidance(tel.guidance);
        }
      }
    }, 100);

    return () => clearInterval(intervalId);
  }, [isRecording, triggerVoiceGuidance]);

  // Handle Local Video File Upload (Testing fallback)
  const handleLoadLocalVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    CameraRecorderService.releaseStream(activeStreamRef.current);
    activeStreamRef.current = null;
    setCameraError(null);
    setCameraMode('local_file');

    if (localFileObjectUrlRef.current) {
      URL.revokeObjectURL(localFileObjectUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    localFileObjectUrlRef.current = url;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.loop = true;
      videoRef.current.play().catch(() => {});
    }
  };

  // Recording Controls
  const handleStartCapture = () => {
    telemetryHistoryRef.current = [];
    setElapsedMs(0);
    setCompletedResult(null);

    const started = recorderServiceRef.current.startRecording((ms) => {
      setElapsedMs(ms);
      if (ms >= orbitDurationSec * 1000) {
        handleStopCapture();
      }
    });

    if (started) {
      setIsRecording(true);
      if (soundEnabled) {
        triggerVoiceGuidance('RECORDING ENGAGED. MAINTAIN STEADY ORBIT.');
      }
    }
  };

  const handleStopCapture = async () => {
    if (!recorderServiceRef.current.isRecording()) return;
    try {
      const result = await recorderServiceRef.current.stopRecording();
      setIsRecording(false);

      const history = telemetryHistoryRef.current;
      const avgSharpness = history.length
        ? Math.round(history.reduce((a, b) => a + b.sharpness, 0) / history.length)
        : telemetry.sharpnessScore;
      const avgTexture = history.length
        ? Math.round(history.reduce((a, b) => a + b.texture, 0) / history.length)
        : telemetry.textureScore;

      const passed = avgSharpness >= 45 && result.durationSec >= 20;

      const now = new Date();
      const YYYY = now.getFullYear();
      const MM = String(now.getMonth() + 1).padStart(2, '0');
      const DD = String(now.getDate()).padStart(2, '0');
      const HH = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const timestampName = `loom_scan_${YYYY}${MM}${DD}_${HH}${mm}.${result.extension}`;

      const previewUrl = URL.createObjectURL(result.blob);
      setCompletedResult({
        result,
        url: previewUrl,
        avgSharpness,
        avgTexture,
        passed,
        timestampName,
      });

      if (soundEnabled) {
        triggerVoiceGuidance(passed ? 'OPTICAL AUDIT PASS' : 'OPTICAL AUDIT FAILED. RETAKE REQUIRED.');
      }
    } catch (err) {
      console.error('[CaptureStudio] Stop capture error:', err);
    }
  };

  // Download Recorded Video
  const handleDownload = () => {
    if (!completedResult) return;
    const a = document.createElement('a');
    a.href = completedResult.url;
    a.download = completedResult.timestampName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Copy CLI Handoff Command
  const cliCommand = `.venv/bin/python scripts/demo.py --video ~/Downloads/${
    completedResult?.timestampName || 'loom_scan.mp4'
  } --turbo --target-length ${targetPrintLengthMm.toFixed(1)} --export-stl`;

  const handleCopyCli = () => {
    navigator.clipboard.writeText(cliCommand);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  // Orbit ring calculations
  const orbitProgress = Math.min(100, Math.round((elapsedMs / (orbitDurationSec * 1000)) * 100));
  const activeSector = Math.floor((orbitProgress / 100) * 12);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] h-[calc(100vh-48px)] bg-[#0C0D0F] select-none overflow-hidden">
      {/* LEFT OPTICAL VIEWPORT */}
      <div className="bg-[#08090A] relative flex items-center justify-center overflow-hidden border-b lg:border-b-0 border-[#262930]">
        {/* Mandated playsInline, muted, autoPlay */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover select-none pointer-events-none"
        />

        {/* Top-Left Mode & Local Video Loader */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
          <label className="border border-[#262930] bg-[#131518] hover:bg-[#1A1D21] text-[#ECEEF2] text-xs font-mono px-2.5 py-1.5 rounded flex items-center gap-1.5 cursor-pointer transition">
            <Upload className="w-3.5 h-3.5 text-[#8A909E]" />
            <span>{cameraMode === 'local_file' ? 'FILE LOADED' : 'LOAD LOCAL VIDEO'}</span>
            <input
              type="file"
              accept="video/mp4,video/webm"
              onChange={handleLoadLocalVideo}
              className="hidden"
            />
          </label>

          {cameraMode === 'local_file' && (
            <button
              onClick={startLiveCamera}
              className="border border-[#262930] bg-[#131518] hover:bg-[#1A1D21] text-[#8A909E] hover:text-[#ECEEF2] text-xs font-mono px-2 py-1.5 rounded flex items-center gap-1 transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>LIVE CAM</span>
            </button>
          )}
        </div>

        {/* Camera Permission / Error Fallback */}
        {cameraError && cameraMode === 'live' && (
          <div className="absolute inset-0 bg-[#0C0D0F]/95 z-30 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded border border-[#EF4444] bg-[#131518] flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-[#EF4444]" />
            </div>
            <div className="font-mono text-xs uppercase tracking-wider text-[#EF4444] font-medium mb-1">
              OPTICAL SENSOR FAULT
            </div>
            <p className="text-xs font-mono text-[#8A909E] max-w-sm mb-5 leading-relaxed">
              {cameraError}
            </p>
            <div className="flex gap-2">
              <button
                onClick={startLiveCamera}
                className="border border-[#262930] bg-[#ECEEF2] text-[#0C0D0F] hover:bg-[#FFFFFF] text-xs font-mono px-4 py-2 rounded font-medium transition"
              >
                RE-INITIALIZE
              </button>
            </div>
          </div>
        )}

        {/* MINIMALIST SVG OPTICAL RETICLE */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Thin 1px Center Crosshair */}
          <g stroke="#8A909E" strokeWidth="1" opacity="0.45">
            <line x1="480" y1="500" x2="520" y2="500" />
            <line x1="500" y1="480" x2="500" y2="520" />
            <circle cx="500" cy="500" r="3" fill="none" />
          </g>

          {/* 60% Framing Corner Brackets (Bounds: 200, 200 to 800, 800) */}
          <g
            stroke={telemetry.statusColor}
            strokeWidth="2"
            fill="none"
            strokeLinecap="square"
            className="transition-colors duration-200"
          >
            {/* Top-Left */}
            <path d="M 240 200 L 200 200 L 200 240" />
            {/* Top-Right */}
            <path d="M 760 200 L 800 200 L 800 240" />
            {/* Bottom-Left */}
            <path d="M 240 800 L 200 800 L 200 760" />
            {/* Bottom-Right */}
            <path d="M 760 800 L 800 800 L 800 760" />
          </g>

          {/* Thin 2px Circular 12-Sector Orbit Progress Ring (Radius: 430, Center: 500, 500) */}
          <g>
            {Array.from({ length: 12 }).map((_, idx) => {
              const startAngleDeg = idx * 30 - 90;
              const isFilled = idx <= activeSector && isRecording;

              const r = 430;
              const radStart = ((startAngleDeg + 3) * Math.PI) / 180;
              const radEnd = ((startAngleDeg + 27) * Math.PI) / 180;
              const x1 = 500 + r * Math.cos(radStart);
              const y1 = 500 + r * Math.sin(radStart);
              const x2 = 500 + r * Math.cos(radEnd);
              const y2 = 500 + r * Math.sin(radEnd);

              return (
                <path
                  key={idx}
                  d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                  fill="none"
                  stroke={isFilled ? '#10B981' : '#262930'}
                  strokeWidth="2"
                  strokeLinecap="square"
                  className="transition-colors duration-200"
                />
              );
            })}
          </g>
        </svg>

        {/* Viewport Bottom Status Bar: Exact Coaching Output */}
        <div className="absolute bottom-3 inset-x-3 z-20 flex justify-center pointer-events-none">
          <div className="bg-[#131518] border border-[#262930] px-3.5 py-1.5 rounded flex items-center gap-2.5 font-mono text-xs text-[#ECEEF2]">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: telemetry.statusColor }}
            />
            <span className="font-medium tracking-tight">[{telemetry.code}]</span>
            <span className="text-[#8A909E]">—</span>
            <span className="tracking-tight text-[#ECEEF2]">{telemetry.guidance}</span>
          </div>
        </div>
      </div>

      {/* RIGHT TELEMETRY & CONTROL RAIL */}
      <div className="bg-[#131518] border-l border-[#262930] flex flex-col justify-between p-4 overflow-y-auto font-mono text-xs gap-5">
        <div className="flex flex-col gap-5">
          {/* Section A — Acquisition Protocol */}
          <div className="border border-[#262930] rounded-md p-3 bg-[#0C0D0F]">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#262930]">
              <span className="text-[11px] text-[#8A909E] uppercase tracking-wider font-semibold">
                SEC_A // ACQUISITION PROTOCOL
              </span>
              <span className="text-[10px] text-[#8A909E]">3 CHECKS</span>
            </div>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer text-[#ECEEF2] hover:text-[#FFFFFF] transition">
                <input
                  type="checkbox"
                  checked={checklist.baseplate}
                  onChange={(e) => setChecklist({ ...checklist, baseplate: e.target.checked })}
                  className="accent-[#10B981] w-3.5 h-3.5 mt-0.5 rounded cursor-pointer"
                />
                <span className={checklist.baseplate ? 'text-[#ECEEF2]' : 'text-[#8A909E]'}>
                  Textured baseplate placed under subject
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-[#ECEEF2] hover:text-[#FFFFFF] transition">
                <input
                  type="checkbox"
                  checked={checklist.cavities}
                  onChange={(e) => setChecklist({ ...checklist, cavities: e.target.checked })}
                  className="accent-[#10B981] w-3.5 h-3.5 mt-0.5 rounded cursor-pointer"
                />
                <span className={checklist.cavities ? 'text-[#ECEEF2]' : 'text-[#8A909E]'}>
                  Hollow cavities filled / rigid silhouette
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-[#ECEEF2] hover:text-[#FFFFFF] transition">
                <input
                  type="checkbox"
                  checked={checklist.cameraAngle}
                  onChange={(e) => setChecklist({ ...checklist, cameraAngle: e.target.checked })}
                  className="accent-[#10B981] w-3.5 h-3.5 mt-0.5 rounded cursor-pointer"
                />
                <span className={checklist.cameraAngle ? 'text-[#ECEEF2]' : 'text-[#8A909E]'}>
                  Fixed zoom & 35°–45° downward elevation
                </span>
              </label>
            </div>
          </div>

          {/* Section B — Live 10 Hz Optical Telemetry */}
          <div className="border border-[#262930] rounded-md p-3 bg-[#0C0D0F]">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#262930]">
              <span className="text-[11px] text-[#8A909E] uppercase tracking-wider font-semibold">
                SEC_B // OPTICAL TELEMETRY (10 Hz)
              </span>
              <span
                className="text-[10px] px-1.5 py-0.2 rounded border uppercase font-medium"
                style={{
                  borderColor: `${telemetry.statusColor}40`,
                  color: telemetry.statusColor,
                  backgroundColor: `${telemetry.statusColor}10`,
                }}
              >
                {telemetry.status}
              </span>
            </div>

            {/* Sharpness (Laplacian) */}
            <div className="mb-3">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#8A909E]">SHARPNESS (LAPLACIAN)</span>
                <span className="text-[#ECEEF2] font-semibold tabular-nums">
                  {telemetry.sharpnessScore} <span className="text-[#8A909E]">/ 100</span>
                </span>
              </div>
              <div className="w-full h-1 bg-[#1A1D21] rounded overflow-hidden">
                <div
                  className="h-full transition-all duration-150"
                  style={{
                    width: `${telemetry.sharpnessScore}%`,
                    backgroundColor: telemetry.sharpnessScore >= 50 ? '#10B981' : '#EF4444',
                  }}
                />
              </div>
            </div>

            {/* Texture (Sobel) */}
            <div className="mb-3">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#8A909E]">TEXTURE (SOBEL)</span>
                <span className="text-[#ECEEF2] font-semibold tabular-nums">
                  {telemetry.textureScore} <span className="text-[#8A909E]">/ 100</span>
                </span>
              </div>
              <div className="w-full h-1 bg-[#1A1D21] rounded overflow-hidden">
                <div
                  className="h-full transition-all duration-150"
                  style={{
                    width: `${telemetry.textureScore}%`,
                    backgroundColor: telemetry.textureScore >= 22 ? '#10B981' : '#F59E0B',
                  }}
                />
              </div>
            </div>

            {/* Glare Ratio */}
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-[#8A909E]">GLARE RATIO</span>
              <span
                className={`font-semibold tabular-nums ${
                  telemetry.overexposedRatio > 0.18 ? 'text-[#EF4444]' : 'text-[#ECEEF2]'
                }`}
              >
                {(telemetry.overexposedRatio * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Section C — Scan Parameters & Controls */}
          <div className="border border-[#262930] rounded-md p-3 bg-[#0C0D0F]">
            <div className="pb-2 mb-3 border-b border-[#262930] flex items-center justify-between">
              <span className="text-[11px] text-[#8A909E] uppercase tracking-wider font-semibold">
                SEC_C // SCAN PARAMETERS
              </span>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="text-[#8A909E] hover:text-[#ECEEF2] transition"
                title={soundEnabled ? 'Voice Guidance On' : 'Voice Guidance Muted'}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[#10B981]" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Orbit Target duration toggle */}
            <div className="mb-3">
              <span className="text-[10px] text-[#8A909E] uppercase block mb-1.5">ORBIT TARGET</span>
              <div className="grid grid-cols-2 gap-1.5 bg-[#131518] p-1 border border-[#262930] rounded">
                <button
                  type="button"
                  disabled={isRecording}
                  onClick={() => setOrbitDurationSec(45)}
                  className={`py-1 rounded text-center transition ${
                    orbitDurationSec === 45
                      ? 'bg-[#1A1D21] text-[#ECEEF2] border border-[#262930] font-medium'
                      : 'text-[#8A909E] hover:text-[#ECEEF2]'
                  }`}
                >
                  45s (68 FRAMES)
                </button>
                <button
                  type="button"
                  disabled={isRecording}
                  onClick={() => setOrbitDurationSec(60)}
                  className={`py-1 rounded text-center transition ${
                    orbitDurationSec === 60
                      ? 'bg-[#1A1D21] text-[#ECEEF2] border border-[#262930] font-medium'
                      : 'text-[#8A909E] hover:text-[#ECEEF2]'
                  }`}
                >
                  60s (90 FRAMES)
                </button>
              </div>
            </div>

            {/* Target Print Length */}
            <div>
              <span className="text-[10px] text-[#8A909E] uppercase block mb-1.5">
                TARGET PRINT LENGTH (METRIC CALIBRATION)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="10"
                  max="1000"
                  step="1"
                  value={targetPrintLengthMm}
                  onChange={(e) => setTargetPrintLengthMm(Number(e.target.value) || 200)}
                  disabled={isRecording}
                  className="flex-1 bg-[#131518] border border-[#262930] focus:border-[#ECEEF2] outline-none text-[#ECEEF2] px-2.5 py-1.5 rounded tabular-nums"
                />
                <span className="text-[#8A909E] font-mono text-xs">mm</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Trigger & Post-Capture Section */}
        <div className="flex flex-col gap-3">
          {/* Active Recording / Start Button */}
          {isRecording ? (
            <button
              onClick={handleStopCapture}
              className="w-full py-2.5 rounded bg-[#F97316] hover:bg-[#EA580C] text-[#0C0D0F] font-mono font-bold tracking-wider text-xs transition"
            >
              STOP CAPTURE ({Math.floor(elapsedMs / 1000)}s / {orbitDurationSec}s)
            </button>
          ) : (
            <button
              onClick={handleStartCapture}
              className="w-full py-2.5 rounded bg-[#ECEEF2] hover:bg-[#FFFFFF] text-[#0C0D0F] font-mono font-medium tracking-wider text-xs transition"
            >
              START CAPTURE (10 Mbps)
            </button>
          )}

          {/* Section D — Post-Capture Export Card */}
          {completedResult && (
            <div className="border border-[#262930] rounded-md p-3 bg-[#0C0D0F] flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#262930]">
                <span className="text-[11px] text-[#8A909E] uppercase font-semibold">
                  SEC_D // ACQUISITION AUDIT
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                    completedResult.passed
                      ? 'border-[#10B981]/40 text-[#10B981] bg-[#10B981]/10'
                      : 'border-[#EF4444]/40 text-[#EF4444] bg-[#EF4444]/10'
                  }`}
                >
                  {completedResult.passed ? 'PASS (READY)' : 'RETAKE REQUIRED'}
                </span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                <div className="p-1.5 border border-[#262930] rounded bg-[#131518]">
                  <span className="text-[#8A909E] block">DURATION</span>
                  <span className="text-[#ECEEF2] font-semibold">{completedResult.result.durationSec}s</span>
                </div>
                <div className="p-1.5 border border-[#262930] rounded bg-[#131518]">
                  <span className="text-[#8A909E] block">AVG SHARP</span>
                  <span
                    className={`font-semibold ${
                      completedResult.avgSharpness >= 45 ? 'text-[#10B981]' : 'text-[#EF4444]'
                    }`}
                  >
                    {completedResult.avgSharpness}
                  </span>
                </div>
                <div className="p-1.5 border border-[#262930] rounded bg-[#131518]">
                  <span className="text-[#8A909E] block">AVG TEXTURE</span>
                  <span className="text-[#ECEEF2] font-semibold">{completedResult.avgTexture}%</span>
                </div>
              </div>

              {/* Primary Download Button */}
              <button
                onClick={handleDownload}
                className="w-full py-2 rounded bg-[#ECEEF2] hover:bg-[#FFFFFF] text-[#0C0D0F] font-mono font-medium text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>DOWNLOAD .{completedResult.result.extension.toUpperCase()}</span>
              </button>

              {/* CLI Command Box */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-[#8A909E] mb-1">
                  <span>LOCAL LOOM CLI PIPELINE:</span>
                  <button
                    onClick={handleCopyCli}
                    className="hover:text-[#ECEEF2] flex items-center gap-1 text-[#8A909E]"
                  >
                    {copiedCli ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCli ? 'COPIED' : 'COPY'}</span>
                  </button>
                </div>
                <div className="p-2 border border-[#262930] bg-[#131518] rounded text-[10px] text-[#8A909E] font-mono break-all select-all">
                  {cliCommand}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
