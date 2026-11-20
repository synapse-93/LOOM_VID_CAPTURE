import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Square,
  Circle,
  Clock,
  Radio,
  FileVideo,
} from 'lucide-react';
import { analyzeFrame, FrameTelemetry } from '../lib/cvGuidance';
import { CameraRecorderService, RecorderResult } from '../lib/cameraRecorder';

interface CaptureViewportProps {
  onCaptureComplete: (result: {
    blob: Blob;
    mimeType: string;
    extension: 'mp4' | 'webm';
    sizeBytes: number;
    durationSec: number;
  }) => void;
  onSwitchToUpload: () => void;
  onTelemetryUpdate?: (telemetry: FrameTelemetry, orbitSectors: number) => void;
}

export const CaptureViewport: React.FC<CaptureViewportProps> = ({
  onCaptureComplete,
  onSwitchToUpload,
  onTelemetryUpdate,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cvCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const recorderServiceRef = useRef<CameraRecorderService>(new CameraRecorderService());

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [targetDurationSec, setTargetDurationSec] = useState<30 | 45 | 60>(45);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // 12-sector circular orbit pacer tracking (30° each sector)
  const [completedSectors, setCompletedSectors] = useState<boolean[]>(new Array(12).fill(false));

  const [telemetry, setTelemetry] = useState<FrameTelemetry>({
    sharpnessScore: 0,
    rawVariance: 0,
    textureScore: 0,
    overexposedRatio: 0,
    status: 'OPTIMAL',
    code: 'SYS_LOCKED',
    guidance: 'ALIGN OBJECT IN OPTICAL RETICLE',
    statusColor: '#8A909E',
  });

  const lastSpokenTimeRef = useRef(0);
  const lastSpokenTextRef = useRef('');

  // Start live rear camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
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
    startCamera();
    return () => {
      CameraRecorderService.releaseStream(activeStreamRef.current);
    };
  }, [startCamera]);

  // 10 Hz Real-Time Optical Telemetry Loop (every 100ms)
  useEffect(() => {
    const hiddenCanvas = document.createElement('canvas');
    cvCanvasRef.current = hiddenCanvas;

    const interval = setInterval(() => {
      if (!videoRef.current) return;

      const telem = analyzeFrame(videoRef.current, hiddenCanvas);
      setTelemetry(telem);

      const sectorCount = completedSectors.filter(Boolean).length;
      onTelemetryUpdate?.(telem, sectorCount);

      // Audio coaching alerts with 4s cooldown
      if (soundEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const now = Date.now();
        if (now - lastSpokenTimeRef.current > 4000) {
          if (telem.status === 'MOTION_BLUR' && lastSpokenTextRef.current !== 'Slow down') {
            lastSpokenTimeRef.current = now;
            lastSpokenTextRef.current = 'Slow down';
            window.speechSynthesis.speak(new SpeechSynthesisUtterance('Slow down'));
          } else if (telem.status === 'LOW_TEXTURE' && lastSpokenTextRef.current !== 'Move closer') {
            lastSpokenTimeRef.current = now;
            lastSpokenTextRef.current = 'Move closer';
            window.speechSynthesis.speak(new SpeechSynthesisUtterance('Move closer'));
          } else if (telem.status === 'GLARE' && lastSpokenTextRef.current !== 'Diffuse light') {
            lastSpokenTimeRef.current = now;
            lastSpokenTextRef.current = 'Diffuse light';
            window.speechSynthesis.speak(new SpeechSynthesisUtterance('Diffuse light'));
          }
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [soundEnabled, completedSectors, onTelemetryUpdate]);

  // Update Orbit Pacer sectors during active recording based on elapsed time
  useEffect(() => {
    if (!isRecording) return;

    const sectorDurationMs = (targetDurationSec * 1000) / 12;
    const currentActiveIndex = Math.min(11, Math.floor(elapsedMs / sectorDurationMs));

    setCompletedSectors((prev) => {
      const updated = [...prev];
      for (let i = 0; i <= currentActiveIndex; i++) {
        updated[i] = true;
      }
      return updated;
    });

    if (elapsedMs >= targetDurationSec * 1000) {
      handleStopRecording();
    }
  }, [isRecording, elapsedMs, targetDurationSec]);

  // Toggle Recording
  const handleStartRecording = () => {
    if (cameraError) return;

    setCompletedSectors(new Array(12).fill(false));
    recorderServiceRef.current.startRecording(
      (ms) => setElapsedMs(ms)
    );
    setIsRecording(true);
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    try {
      const result: RecorderResult = await recorderServiceRef.current.stopRecording();
      onCaptureComplete({
        blob: result.blob,
        mimeType: result.mimeType,
        extension: result.extension,
        sizeBytes: result.sizeBytes,
        durationSec: result.durationSec,
      });
    } catch (err) {
      console.error('[CaptureViewport] Stop recording error:', err);
    }
  };

  const progressPercent = Math.min(100, (elapsedMs / (targetDurationSec * 1000)) * 100);

  return (
    <div className="relative w-full h-full bg-[#0C0D0F] flex flex-col select-none overflow-hidden">
      {/* Center Video Viewport Area */}
      <div className="relative flex-1 flex items-center justify-center bg-[#0C0D0F] overflow-hidden">
        {/* Live Hardware Video Element */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-contain"
        />

        {/* Camera Permission / Error Fallback */}
        {cameraError && (
          <div className="absolute inset-0 bg-[#0C0D0F] flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="w-12 h-12 rounded border border-[#EF4444] flex items-center justify-center text-[#EF4444] mb-3">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <h3 className="font-mono text-sm font-semibold text-[#ECEEF2] uppercase tracking-wider mb-1">
              OPTICAL SENSOR UNAVAILABLE
            </h3>
            <p className="font-mono text-xs text-[#8A909E] max-w-md mb-5 leading-relaxed">
              {cameraError}
            </p>
            <div className="flex gap-2">
              <button
                onClick={startCamera}
                className="px-3 py-1.5 rounded bg-[#ECEEF2] text-[#0C0D0F] font-mono text-xs font-medium hover:bg-white transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                RETRY SENSOR
              </button>
              <button
                onClick={onSwitchToUpload}
                className="px-3 py-1.5 rounded bg-[#1A1D21] border border-[#262930] text-[#ECEEF2] font-mono text-xs hover:bg-[#262930] transition flex items-center gap-1.5"
              >
                <FileVideo className="w-3.5 h-3.5 text-[#8A909E]" />
                UPLOAD VIDEO FILE
              </button>
            </div>
          </div>
        )}

        {/* Optical Double-Stroked Reticle & 12-Sector Orbit Pacer Ring */}
        {!cameraError && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* 12-Sector Circular Orbit Pacer (Diameter 280px) */}
            <div className="relative w-[280px] h-[280px] flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 280 280">
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = i * 30 - 90;
                  const rad = (angle * Math.PI) / 180;
                  const cx = 140 + 120 * Math.cos(rad);
                  const cy = 140 + 120 * Math.sin(rad);
                  const isDone = completedSectors[i];

                  return (
                    <g key={i}>
                      {/* Radial tick marks */}
                      <line
                        x1={140 + 105 * Math.cos(rad)}
                        y1={140 + 105 * Math.sin(rad)}
                        x2={140 + 130 * Math.cos(rad)}
                        y2={140 + 130 * Math.sin(rad)}
                        stroke={isDone ? '#10B981' : '#262930'}
                        strokeWidth={isDone ? 2.5 : 1}
                      />
                      {/* Sector node circle */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isDone ? 4 : 2.5}
                        fill={isDone ? '#10B981' : '#1A1D21'}
                        stroke={isDone ? '#0C0D0F' : '#262930'}
                        strokeWidth={1}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Optical Reticle Box (140x140) with double-stroked corners */}
              <div
                className="relative w-[140px] h-[140px] transition-colors duration-150"
                style={{
                  border: `2px solid ${telemetry.statusColor}`,
                  boxShadow: '0 0 0 1px #0C0D0F, inset 0 0 0 1px #0C0D0F',
                }}
              >
                {/* Crosshairs */}
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-0.5"
                  style={{ backgroundColor: telemetry.statusColor }}
                />
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-0.5"
                  style={{ backgroundColor: telemetry.statusColor }}
                />

                {/* Status indicator tag on top edge */}
                <div
                  className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wider text-[#0C0D0F] font-semibold whitespace-nowrap"
                  style={{ backgroundColor: telemetry.statusColor }}
                >
                  {telemetry.code}
                </div>
              </div>
            </div>

            {/* Orbit Guidance HUD Banner */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#131518] border border-[#262930] rounded font-mono text-[11px] text-[#ECEEF2] tracking-wide flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: telemetry.statusColor }}
              />
              <span>{telemetry.guidance}</span>
            </div>
          </div>
        )}

        {/* Top-Right Secondary Controls */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 rounded bg-[#131518] border border-[#262930] text-[#8A909E] hover:text-[#ECEEF2] transition"
            title={soundEnabled ? 'Mute Coaching Audio' : 'Enable Coaching Audio'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-[#10B981]" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>

        {/* Top-Left Mode & Duration Selector */}
        <div className="absolute top-3 left-3 flex items-center gap-2 z-10 font-mono text-[11px]">
          <span className="px-2 py-1 bg-[#131518] border border-[#262930] rounded text-[#8A909E] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            DURATION:
          </span>
          {([30, 45, 60] as const).map((dur) => (
            <button
              key={dur}
              disabled={isRecording}
              onClick={() => setTargetDurationSec(dur)}
              className={`px-2 py-1 rounded transition border ${
                targetDurationSec === dur
                  ? 'bg-[#1A1D21] border-[#ECEEF2] text-[#ECEEF2] font-medium'
                  : 'bg-[#131518] border-[#262930] text-[#8A909E] hover:text-[#ECEEF2]'
              } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {dur}s
            </button>
          ))}
        </div>
      </div>

      {/* Primary Bottom Recording Trigger & Telemetry Bar */}
      <div className="h-[60px] bg-[#131518] border-t border-[#262930] px-4 flex items-center justify-between z-20">
        {/* Left: 10 Hz Telemetry Readouts */}
        <div className="flex items-center gap-4 font-mono text-[11px] text-[#8A909E]">
          <div>
            <span className="text-[10px] tracking-wider block text-[#8A909E]">SHARPNESS σ²</span>
            <span
              className={`font-semibold tabular-nums ${
                telemetry.rawVariance >= 120 ? 'text-[#10B981]' : 'text-[#EF4444]'
              }`}
            >
              {telemetry.rawVariance.toFixed(1)}
            </span>
          </div>

          <div className="h-6 w-px bg-[#262930]" />

          <div>
            <span className="text-[10px] tracking-wider block text-[#8A909E]">EDGE TEXTURE</span>
            <span
              className={`font-semibold tabular-nums ${
                telemetry.textureScore >= 30 ? 'text-[#10B981]' : 'text-[#F59E0B]'
              }`}
            >
              {telemetry.textureScore}%
            </span>
          </div>

          <div className="h-6 w-px bg-[#262930]" />

          <div>
            <span className="text-[10px] tracking-wider block text-[#8A909E]">GLARE RATIO</span>
            <span
              className={`font-semibold tabular-nums ${
                telemetry.overexposedRatio < 0.05 ? 'text-[#10B981]' : 'text-[#EF4444]'
              }`}
            >
              {(telemetry.overexposedRatio * 100).toFixed(1)}%
            </span>
          </div>

          <div className="h-6 w-px bg-[#262930]" />

          <div>
            <span className="text-[10px] tracking-wider block text-[#8A909E]">ORBIT SECTORS</span>
            <span className="font-semibold text-[#ECEEF2] tabular-nums">
              {completedSectors.filter(Boolean).length} / 12
            </span>
          </div>
        </div>

        {/* Center: Record / Stop Primary Button */}
        <div className="flex items-center gap-3">
          {isRecording ? (
            <button
              onClick={handleStopRecording}
              className="px-5 py-2 rounded bg-[#F97316] text-[#0C0D0F] font-mono text-xs font-semibold hover:brightness-110 transition flex items-center gap-2"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              STOP RECORDING ({(elapsedMs / 1000).toFixed(1)}s / {targetDurationSec}s)
            </button>
          ) : (
            <button
              onClick={handleStartRecording}
              disabled={!!cameraError}
              className={`px-5 py-2 rounded bg-[#ECEEF2] text-[#0C0D0F] font-mono text-xs font-semibold hover:bg-white transition flex items-center gap-2 ${
                cameraError ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Circle className="w-3.5 h-3.5 fill-[#EF4444] text-[#EF4444]" />
              START 360° ORBIT CAPTURE
            </button>
          )}
        </div>

        {/* Right: Codec & Pipeline Handoff */}
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#8A909E]">
          <span className="px-2 py-0.5 rounded bg-[#0C0D0F] border border-[#262930]">
            1080p @ 30fps
          </span>
          <span className="px-2 py-0.5 rounded bg-[#0C0D0F] border border-[#262930]">
            10 Mbps
          </span>
        </div>
      </div>

      {/* Recording Progress Bar at top edge of bottom bar */}
      {isRecording && (
        <div className="absolute bottom-[60px] left-0 right-0 h-1 bg-[#1A1D21] z-30">
          <div
            className="h-full bg-[#F97316] transition-all duration-100"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
};
