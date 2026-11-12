import React, { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Play,
  Square,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertTriangle,
  Download,
  UploadCloud,
  ChevronRight,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { analyzeFrame, FrameTelemetry, CV_CANVAS_WIDTH, CV_CANVAS_HEIGHT } from '../lib/cvGuidance';
import { CameraRecorderService, RecorderResult } from '../lib/cameraRecorder';
import {
  getStoredLoomEndpoint,
  downloadCaptureLocally,
  submitToLoomWorker,
} from '../lib/loomBridge';

interface GuidedScannerProps {
  onOpenInspector: () => void;
  onOpenPhoneQr: () => void;
}

export const GuidedScanner: React.FC<GuidedScannerProps> = ({ onOpenInspector }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cvCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const recorderServiceRef = useRef<CameraRecorderService>(new CameraRecorderService());

  // Pre-flight checklist state
  const [checklist, setChecklist] = useState({
    baseplate: false,
    centered: false,
    cameraAngle: false,
  });

  // Camera & CV Telemetry
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<FrameTelemetry>({
    sharpnessScore: 0,
    rawVariance: 0,
    textureScore: 0,
    overexposedRatio: 0,
    status: 'OPTIMAL',
    headline: 'STARTING CAMERA',
    instruction: 'Allow camera permissions to begin scanning',
    statusColor: '#94a3b8',
  });

  // Orbit duration preset: 45s Turbo vs 60s High-Detail
  const [orbitDurationSec, setOrbitDurationSec] = useState<45 | 60>(45);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordedBytes, setRecordedBytes] = useState(0);

  // Completed Capture Review Modal State
  const [completedResult, setCompletedResult] = useState<{
    result: RecorderResult;
    url: string;
    avgSharpness: number;
    avgTexture: number;
    passed: boolean;
  } | null>(null);

  // Upload to LOOM GPU worker state
  const [isUploadingToLoom, setIsUploadingToLoom] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [loomDone, setLoomDone] = useState(false);

  // Throttle voice speech synthesis (max 1 alert every 4 seconds)
  const lastSpokenTimeRef = useRef(0);
  const lastSpokenMessageRef = useRef('');

  // Sample accumulator for post-capture scorecard
  const telemetryHistoryRef = useRef<Array<{ sharpness: number; texture: number }>>([]);

  // Initialize Camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    CameraRecorderService.releaseStream(activeStreamRef.current);

    try {
      const { stream } = await CameraRecorderService.initRearCamera();
      activeStreamRef.current = stream;
      recorderServiceRef.current.setStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: unknown) {
      const error = err as Error;
      setCameraError(error.message);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      CameraRecorderService.releaseStream(activeStreamRef.current);
    };
  }, [startCamera]);

  // Voice speech synthesis coach
  const speakInstruction = useCallback(
    (message: string) => {
      if (!soundEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const now = Date.now();
      if (now - lastSpokenTimeRef.current < 4000) return; // 4s cooldown
      if (lastSpokenMessageRef.current === message && now - lastSpokenTimeRef.current < 8000) return;

      lastSpokenTimeRef.current = now;
      lastSpokenMessageRef.current = message;

      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 1.1;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Speech API not allowed in current context
      }
    },
    [soundEnabled]
  );

  // 10 Hz Real-Time Computer Vision Loop
  useEffect(() => {
    // Create dedicated offscreen canvas
    if (!cvCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = CV_CANVAS_WIDTH;
      c.height = CV_CANVAS_HEIGHT;
      cvCanvasRef.current = c;
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
          speakInstruction(tel.headline);
        }
      }
    }, 100); // 100ms = 10 Hz

    return () => clearInterval(intervalId);
  }, [isRecording, speakInstruction]);

  // Start recording
  const handleStartCapture = () => {
    telemetryHistoryRef.current = [];
    setElapsedMs(0);
    setRecordedBytes(0);
    setCompletedResult(null);

    const started = recorderServiceRef.current.startRecording((ms, bytes) => {
      setElapsedMs(ms);
      setRecordedBytes(bytes);

      // Auto stop when 360 orbit target duration reached
      if (ms >= orbitDurationSec * 1000) {
        handleStopCapture();
      }
    });

    if (started) {
      setIsRecording(true);
      if (soundEnabled) {
        speakInstruction('Recording started. Walk steady orbit.');
      }
    }
  };

  // Stop recording
  const handleStopCapture = async () => {
    if (!recorderServiceRef.current.isRecording()) return;
    try {
      const result = await recorderServiceRef.current.stopRecording();
      setIsRecording(false);

      const history = telemetryHistoryRef.current;
      const avgSharpness = history.length
        ? Math.round(history.reduce((acc, h) => acc + h.sharpness, 0) / history.length)
        : telemetry.sharpnessScore;
      const avgTexture = history.length
        ? Math.round(history.reduce((acc, h) => acc + h.texture, 0) / history.length)
        : telemetry.textureScore;

      // Pass criteria: avgSharpness >= 45 and duration >= 20s
      const passed = avgSharpness >= 45 && result.durationSec >= 20;

      if (passed) {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#00e599', '#38bdf8', '#f59e0b'],
        });
        if (soundEnabled) speakInstruction('Capture complete. Quality passed.');
      } else {
        if (soundEnabled) speakInstruction('Capture complete. Retake recommended.');
      }

      const previewUrl = URL.createObjectURL(result.blob);
      setCompletedResult({
        result,
        url: previewUrl,
        avgSharpness,
        avgTexture,
        passed,
      });
    } catch (err) {
      console.error('[GuidedScanner] Failed to stop capture:', err);
    }
  };

  // Format timestamp helper for filename
  const getTimestampFilename = (ext: 'mp4' | 'webm') => {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `loom_scan_${YYYY}${MM}${DD}_${HH}${mm}.${ext}`;
  };

  // Direct Local Download CTA
  const handleDownloadLocally = () => {
    if (!completedResult) return;
    const filename = getTimestampFilename(completedResult.result.extension);
    downloadCaptureLocally(completedResult.result.blob, filename);
  };

  // Send to LOOM Worker CTA
  const handleSendToLoom = async () => {
    if (!completedResult) return;
    setIsUploadingToLoom(true);
    setUploadLogs([]);
    setLoomDone(false);

    const endpoint = getStoredLoomEndpoint();
    const filename = getTimestampFilename(completedResult.result.extension);

    try {
      await submitToLoomWorker(endpoint, completedResult.result.blob, filename, 120.0, (line) => {
        setUploadLogs((prev) => [...prev, line]);
      });
      setLoomDone(true);
    } catch (err) {
      setUploadLogs((prev) => [...prev, `Error: ${(err as Error).message}`]);
    } finally {
      setIsUploadingToLoom(false);
    }
  };

  // Calculate current orbit progress percentage (0 - 100%)
  const orbitProgress = Math.min(100, Math.round((elapsedMs / (orbitDurationSec * 1000)) * 100));

  // 12-Sector Pacer Angles (30° each)
  const activeSectorIndex = Math.floor((orbitProgress / 100) * 12);

  const allChecksReady = checklist.baseplate && checklist.centered && checklist.cameraAngle;

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] bg-[#090b0e] flex flex-col overflow-hidden select-none">
      {/* 1. Pre-Flight Readiness Strip */}
      <div className="bg-[#12161f] border-b border-[#1e2430] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-mono z-20">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#f1f5f9] uppercase tracking-wider">
            Pre-Flight Checklist:
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
              allChecksReady
                ? 'bg-[#00e599]/15 text-[#00e599] border border-[#00e599]/30'
                : 'bg-[#181e2b] text-[#94a3b8]'
            }`}
          >
            {allChecksReady ? 'READY TO SCAN' : 'INCOMPLETE'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-[#f1f5f9] transition">
            <input
              type="checkbox"
              checked={checklist.baseplate}
              onChange={(e) => setChecklist({ ...checklist, baseplate: e.target.checked })}
              className="accent-[#00e599] w-3.5 h-3.5"
            />
            <span className={checklist.baseplate ? 'text-[#00e599]' : 'text-[#94a3b8]'}>
              [1] Textured baseplate placed
            </span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer hover:text-[#f1f5f9] transition">
            <input
              type="checkbox"
              checked={checklist.centered}
              onChange={(e) => setChecklist({ ...checklist, centered: e.target.checked })}
              className="accent-[#00e599] w-3.5 h-3.5"
            />
            <span className={checklist.centered ? 'text-[#00e599]' : 'text-[#94a3b8]'}>
              [2] Rigid object centered
            </span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer hover:text-[#f1f5f9] transition">
            <input
              type="checkbox"
              checked={checklist.cameraAngle}
              onChange={(e) => setChecklist({ ...checklist, cameraAngle: e.target.checked })}
              className="accent-[#00e599] w-3.5 h-3.5"
            />
            <span className={checklist.cameraAngle ? 'text-[#00e599]' : 'text-[#94a3b8]'}>
              [3] 35°–45° angle & fixed zoom
            </span>
          </label>
        </div>
      </div>

      {/* 2. Main Viewfinder & SVG Telemetry HUD Area */}
      <div className="relative flex-1 w-full bg-[#090b0e] flex items-center justify-center overflow-hidden">
        {/* iOS Safari Mandatory playsInline, muted, autoPlay */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover select-none pointer-events-none"
        />

        {/* Camera Permission / Error Fallback Overlay */}
        {cameraError && (
          <div className="absolute inset-0 bg-[#090b0e]/95 z-30 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#ff4d4d]/10 border border-[#ff4d4d]/30 flex items-center justify-center mb-4">
              <ShieldAlert className="w-7 h-7 text-[#ff4d4d]" />
            </div>
            <h2 className="text-base font-bold text-[#f1f5f9] mb-1">Camera Stream Inaccessible</h2>
            <p className="text-xs text-[#94a3b8] max-w-md mb-6 leading-relaxed">{cameraError}</p>
            <button
              onClick={startCamera}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00e599] text-[#090b0e] font-bold text-xs hover:bg-[#00e599]/90 transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Camera Initialization</span>
            </button>
          </div>
        )}

        {/* SVG HUD: Center Target Reticle (62% box) & 12-Sector 360° Orbit Pacer Ring */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Center Target Reticle: 62% box (bounds: 190, 190 to 810, 810) */}
          {/* Dynamic Corner brackets colored by telemetry.statusColor */}
          <g stroke={telemetry.statusColor} strokeWidth="3.5" fill="none" strokeLinecap="round" className="transition-colors duration-200">
            {/* Top-Left */}
            <path d="M 230 190 L 190 190 L 190 230" />
            {/* Top-Right */}
            <path d="M 770 190 L 810 190 L 810 230" />
            {/* Bottom-Left */}
            <path d="M 230 810 L 190 810 L 190 770" />
            {/* Bottom-Right */}
            <path d="M 770 810 L 810 810 L 810 770" />

            {/* Subtle center alignment crosshairs */}
            <line x1="480" y1="500" x2="520" y2="500" stroke={telemetry.statusColor} strokeWidth="1.5" opacity="0.6" />
            <line x1="500" y1="480" x2="500" y2="520" stroke={telemetry.statusColor} strokeWidth="1.5" opacity="0.6" />
          </g>

          {/* 12-Sector 360° Orbit Pacer Ring (Radius: 420, Center: 500, 500) */}
          <g>
            {Array.from({ length: 12 }).map((_, idx) => {
              const startAngleDeg = idx * 30 - 90;
              const isPassed = idx < activeSectorIndex;
              const isCurrent = idx === activeSectorIndex;

              // Arc coordinates for each 30° sector (with small gap)
              const r = 420;
              const radStart = ((startAngleDeg + 2) * Math.PI) / 180;
              const radEnd = ((startAngleDeg + 28) * Math.PI) / 180;
              const x1 = 500 + r * Math.cos(radStart);
              const y1 = 500 + r * Math.sin(radStart);
              const x2 = 500 + r * Math.cos(radEnd);
              const y2 = 500 + r * Math.sin(radEnd);

              return (
                <path
                  key={idx}
                  d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                  fill="none"
                  stroke={
                    isCurrent
                      ? '#00e599'
                      : isPassed
                      ? '#00e599'
                      : 'rgba(30, 36, 48, 0.6)'
                  }
                  strokeWidth={isCurrent ? '8' : '4'}
                  strokeLinecap="round"
                  filter={isCurrent ? 'url(#glow)' : undefined}
                  className="transition-all duration-300"
                />
              );
            })}

            {/* Orbit Pacer Glowing Moving Dot */}
            {isRecording && (
              <circle
                cx={500 + 420 * Math.cos(((orbitProgress * 3.6 - 90) * Math.PI) / 180)}
                cy={500 + 420 * Math.sin(((orbitProgress * 3.6 - 90) * Math.PI) / 180)}
                r="9"
                fill="#00e599"
                filter="url(#glow)"
                className="animate-pulse"
              />
            )}
          </g>
        </svg>

        {/* Top Floating Priority Coaching Status Banner */}
        <div className="absolute top-4 inset-x-4 flex justify-center pointer-events-none z-20">
          <div
            className="flex items-center gap-3 px-5 py-2.5 rounded-full border backdrop-blur-md shadow-2xl transition-all duration-200"
            style={{
              backgroundColor: 'rgba(18, 22, 31, 0.92)',
              borderColor: telemetry.statusColor,
            }}
          >
            {telemetry.status === 'OPTIMAL' ? (
              <CheckCircle2 className="w-4 h-4 text-[#00e599]" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-[#f59e0b] animate-bounce" />
            )}
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold tracking-wide" style={{ color: telemetry.statusColor }}>
                {telemetry.headline}
              </span>
              <span className="text-[10px] text-[#94a3b8] font-mono">{telemetry.instruction}</span>
            </div>
          </div>
        </div>

        {/* Floating Controls (Top Right): Voice Mute Toggle */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-lg bg-[#12161f]/90 backdrop-blur-md border border-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9] transition"
            title={soundEnabled ? 'Voice Guidance Active' : 'Voice Guidance Muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-[#00e599]" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>

        {/* Live Bottom Telemetry Pill Overlay */}
        <div className="absolute bottom-4 inset-x-4 z-20 max-w-xl mx-auto bg-[#12161f]/95 backdrop-blur-md border border-[#1e2430] rounded-xl p-3 flex items-center justify-between gap-3 text-xs font-mono">
          <div>
            <span className="text-[10px] text-[#94a3b8] block uppercase">Sharpness</span>
            <span
              className={`font-bold tabular-nums ${
                telemetry.sharpnessScore > 50 ? 'text-[#00e599]' : 'text-[#f59e0b]'
              }`}
            >
              {telemetry.sharpnessScore} <span className="text-[10px] text-[#94a3b8]">/ 100</span>
            </span>
          </div>

          <div className="h-6 w-[1px] bg-[#1e2430]" />

          <div>
            <span className="text-[10px] text-[#94a3b8] block uppercase">Texture</span>
            <span
              className={`font-bold tabular-nums ${
                telemetry.textureScore > 22 ? 'text-[#00e599]' : 'text-[#f59e0b]'
              }`}
            >
              {telemetry.textureScore}%
            </span>
          </div>

          <div className="h-6 w-[1px] bg-[#1e2430]" />

          <div>
            <span className="text-[10px] text-[#94a3b8] block uppercase">Elapsed / Target</span>
            <span className="text-[#f1f5f9] font-bold tabular-nums">
              {Math.floor(elapsedMs / 1000)}s <span className="text-[#94a3b8]">/ {orbitDurationSec}s</span>
            </span>
          </div>

          <div className="h-6 w-[1px] bg-[#1e2430]" />

          <div>
            <span className="text-[10px] text-[#94a3b8] block uppercase">
              {isRecording ? 'Data Size' : 'Bitrate'}
            </span>
            <span className="text-[#00e599] font-bold tabular-nums">
              {isRecording ? `${(recordedBytes / 1_048_576).toFixed(1)} MB` : '10 Mbps'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Bottom Action Bar: Orbit Preset & Capture Trigger */}
      <div className="bg-[#12161f] border-t border-[#1e2430] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 z-20">
        {/* Orbit Duration Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#94a3b8]">CADENCE:</span>
          <div className="flex bg-[#090b0e] p-1 rounded-lg border border-[#1e2430]">
            <button
              disabled={isRecording}
              onClick={() => setOrbitDurationSec(45)}
              className={`px-3 py-1 rounded text-xs font-mono transition ${
                orbitDurationSec === 45
                  ? 'bg-[#1e2430] text-[#00e599] font-bold'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              45s Turbo
            </button>
            <button
              disabled={isRecording}
              onClick={() => setOrbitDurationSec(60)}
              className={`px-3 py-1 rounded text-xs font-mono transition ${
                orbitDurationSec === 60
                  ? 'bg-[#1e2430] text-[#00e599] font-bold'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              60s High-Detail
            </button>
          </div>
        </div>

        {/* Big Capture Trigger Button */}
        <div>
          {isRecording ? (
            <button
              onClick={handleStopCapture}
              className="flex items-center gap-3 px-8 py-3 rounded-full bg-[#ff4d4d] hover:bg-[#ff4d4d]/90 text-white font-bold text-sm tracking-wide shadow-xl shadow-[#ff4d4d]/20 transition animate-pulse"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>STOP RECORDING ({Math.floor(elapsedMs / 1000)}s)</span>
            </button>
          ) : (
            <button
              onClick={handleStartCapture}
              className="flex items-center gap-3 px-8 py-3 rounded-full bg-[#00e599] hover:bg-[#00e599]/90 text-[#090b0e] font-bold text-sm tracking-wide shadow-xl shadow-[#00e599]/20 transition disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-[#090b0e]" />
              <span>START 10 MBPS CAPTURE</span>
            </button>
          )}
        </div>

        {/* Right shortcut to 3D STL inspector */}
        <div>
          <button
            onClick={onOpenInspector}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#090b0e] border border-[#1e2430] hover:border-[#00e599]/50 text-xs font-mono text-[#f1f5f9] transition"
          >
            <span>STL Inspector</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#00e599]" />
          </button>
        </div>
      </div>

      {/* 4. Post-Capture Quality Scorecard Modal */}
      {completedResult && (
        <div className="fixed inset-0 z-50 bg-[#090b0e]/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#12161f] border border-[#1e2430] rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
            {/* Header & Pass/Retake Badge */}
            <div className="flex items-center justify-between border-b border-[#1e2430] pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#94a3b8]">Scan Result</span>
                <h3 className="text-lg font-bold text-[#f1f5f9]">Photogrammetry Session Scorecard</h3>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase border ${
                  completedResult.passed
                    ? 'bg-[#00e599]/10 text-[#00e599] border-[#00e599]/30'
                    : 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30'
                }`}
              >
                {completedResult.passed ? 'PASS (OPTIMAL)' : 'RETAKE RECOMMENDED'}
              </span>
            </div>

            {/* Video Playback Preview */}
            <div className="relative rounded-lg overflow-hidden border border-[#1e2430] bg-[#090b0e] aspect-video">
              <video src={completedResult.url} controls playsInline className="w-full h-full object-contain" />
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-4 gap-2 text-xs font-mono text-center">
              <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
                <span className="text-[10px] text-[#94a3b8] block">DURATION</span>
                <span className="text-[#f1f5f9] font-bold">{completedResult.result.durationSec}s</span>
              </div>
              <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
                <span className="text-[10px] text-[#94a3b8] block">AVG SHARPNESS</span>
                <span
                  className={`font-bold ${
                    completedResult.avgSharpness >= 45 ? 'text-[#00e599]' : 'text-[#f59e0b]'
                  }`}
                >
                  {completedResult.avgSharpness} / 100
                </span>
              </div>
              <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
                <span className="text-[10px] text-[#94a3b8] block">AVG TEXTURE</span>
                <span className="text-[#00e599] font-bold">{completedResult.avgTexture}%</span>
              </div>
              <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
                <span className="text-[10px] text-[#94a3b8] block">FILE SIZE</span>
                <span className="text-[#f1f5f9] font-bold">
                  {(completedResult.result.sizeBytes / 1_048_576).toFixed(1)} MB
                </span>
              </div>
            </div>

            {/* Upload Logs if sending to LOOM */}
            {uploadLogs.length > 0 && (
              <div className="bg-[#090b0e] p-3 rounded-lg border border-[#1e2430] font-mono text-[11px] text-[#94a3b8] space-y-1 max-h-32 overflow-y-auto">
                {uploadLogs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-[#00e599]">&gt;</span>
                    <span className="text-[#f1f5f9]">{log}</span>
                  </div>
                ))}
              </div>
            )}

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-[#1e2430]">
              {/* Primary CTA: Download Capture */}
              <button
                onClick={handleDownloadLocally}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-[#00e599] hover:bg-[#00e599]/90 text-[#090b0e] font-bold text-xs transition"
              >
                <Download className="w-4 h-4" />
                <span>Download Capture ({completedResult.result.extension.toUpperCase()})</span>
              </button>

              {/* Secondary CTA: Send to LOOM Worker */}
              <button
                onClick={handleSendToLoom}
                disabled={isUploadingToLoom || loomDone}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-[#181e2b] hover:bg-[#20293a] border border-[#1e2430] text-xs font-mono text-[#f1f5f9] transition disabled:opacity-50"
              >
                {isUploadingToLoom ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-[#00e599]" />
                ) : (
                  <UploadCloud className="w-4 h-4 text-[#00e599]" />
                )}
                <span>{loomDone ? 'Processed on LOOM' : 'Send to LOOM GPU'}</span>
              </button>

              <button
                onClick={() => setCompletedResult(null)}
                className="py-3 px-4 rounded-lg bg-[#090b0e] border border-[#1e2430] text-xs font-mono text-[#94a3b8] hover:text-[#f1f5f9] transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
