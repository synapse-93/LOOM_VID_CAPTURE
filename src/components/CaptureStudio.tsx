import React, { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Play,
  Square,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Zap,
  Volume2,
  VolumeX,
  ChevronRight,
  Info,
  QrCode,
  Download,
} from 'lucide-react';
import { CVTelemetryEngine } from '../services/cvEngine';
import { HighBitrateRecorder } from '../services/videoRecorder';
import { loomBridge } from '../services/loomBridge';
import { TelemetryMetrics, OrbitState, ScanPreset, CaptureMetadata } from '../types/capture';

interface CaptureStudioProps {
  onOpenInspector: () => void;
  onOpenLoomBridge: () => void;
  onOpenQrModal: () => void;
  onOpenGuideModal: () => void;
}

export const CaptureStudio: React.FC<CaptureStudioProps> = ({
  onOpenInspector,
  onOpenLoomBridge,
  onOpenQrModal,
  onOpenGuideModal,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cvEngineRef = useRef<CVTelemetryEngine | null>(null);
  const recorderRef = useRef<HighBitrateRecorder | null>(null);

  // Device & Camera State
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [targetResolution, setTargetResolution] = useState<'1080p' | '4k' | '720p'>('1080p');
  const [cameraPermission, setCameraPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Live CV Telemetry State (10 Hz)
  const [metrics, setMetrics] = useState<TelemetryMetrics>({
    sharpness: 120,
    textureDensity: 45,
    glarePercentage: 0.5,
    luminanceAvg: 110,
    isMotionBlur: false,
    isFeatureless: false,
    isGlareDetected: false,
    overallStatus: 'optimal',
    statusMessage: 'Ready to scan',
  });

  // Orbital Pacing State
  const [scanPreset, setScanPreset] = useState<ScanPreset>('single-30');
  const [orbitState, setOrbitState] = useState<OrbitState>({
    currentAngle: 0,
    targetAngle: 0,
    angularSpeedDegPerSec: 12,
    elevationAngle: 42,
    targetTier: 'mid',
    lapsCompleted: 0,
    targetLaps: 1,
    progressPercent: 0,
    pacingState: 'on_track',
  });

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedDurationMs, setRecordedDurationMs] = useState(0);
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [currentBitrateMbps, setCurrentBitrateMbps] = useState(10.0);
  const [completedCapture, setCompletedCapture] = useState<{
    metadata: CaptureMetadata;
    videoBlob: Blob;
    videoUrl: string;
  } | null>(null);

  // History samples for metadata sidecar
  const telemetrySamplesRef = useRef<CaptureMetadata['samples']>([]);

  // Initialize CV Engine & Recorder instances
  useEffect(() => {
    const engine = new CVTelemetryEngine({
      sampleRateHz: 10,
      enableAudio: soundEnabled,
      enableHaptics: true,
    });
    cvEngineRef.current = engine;

    engine.onMetrics((m) => {
      setMetrics(m);
      if (isRecording) {
        telemetrySamplesRef.current.push({
          time: Date.now(),
          sharpness: m.sharpness,
          texture: m.textureDensity,
          glare: m.glarePercentage,
          angle: orbitState.currentAngle,
          elevation: orbitState.elevationAngle,
        });
      }
    });

    const recorder = new HighBitrateRecorder(10_000_000); // 10 Mbps
    recorderRef.current = recorder;

    recorder.onStats((stats) => {
      setIsRecording(stats.isRecording);
      setRecordedDurationMs(stats.durationMs);
      setRecordedBytes(stats.bytesRecorded);
      setCurrentBitrateMbps(stats.currentBitrateMbps);
    });

    return () => {
      engine.destroy();
      stopCamera();
    };
  }, []);

  // Update sound setting on engine
  useEffect(() => {
    cvEngineRef.current?.setConfig({ enableAudio: soundEnabled });
  }, [soundEnabled]);

  // Request camera and list devices
  const initCamera = useCallback(async () => {
    try {
      setCameraPermission('pending');
      stopCamera();

      // Constraints with preferred resolution
      const resMap = {
        '4k': { width: { ideal: 3840 }, height: { ideal: 2160 } },
        '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
        '720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      const videoConstraints: MediaTrackConstraints = {
        ...resMap[targetResolution],
        frameRate: { ideal: 60, min: 30 },
      };

      if (selectedDeviceId) {
        videoConstraints.deviceId = { exact: selectedDeviceId };
      } else {
        videoConstraints.facingMode = { ideal: 'environment' }; // Prefer back camera
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        cvEngineRef.current?.setVideoSource(videoRef.current);
        cvEngineRef.current?.start();
      }

      recorderRef.current?.setStream(stream);

      // Check torch capabilities
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchAvailable(!!capabilities?.torch);

      // Enumerate camera devices
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
      setDevices(videoInputs);

      setCameraPermission('granted');
    } catch (err) {
      console.error('[CaptureStudio] Failed to access camera:', err);
      setCameraPermission('denied');
    }
  }, [selectedDeviceId, targetResolution]);

  const stopCamera = () => {
    cvEngineRef.current?.stop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    initCamera();
    return () => stopCamera();
  }, [initCamera]);

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      const newState = !torchOn;
      // @ts-expect-error torch constraint
      await track.applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    } catch (err) {
      console.warn('Torch constraint error:', err);
    }
  };

  // Gyroscope / DeviceOrientation Tracking for Physical Orbit Angle
  useEffect(() => {
    let lastAlpha: number | null = null;
    let accumulatedAngle = 0;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta !== null) {
        // Pitch elevation (degrees)
        const elevation = Math.round(e.beta);
        setOrbitState((prev) => ({
          ...prev,
          elevationAngle: elevation,
          targetTier: elevation < 30 ? 'low' : elevation < 60 ? 'mid' : 'high',
        }));
      }

      if (e.alpha !== null) {
        if (lastAlpha !== null) {
          let delta = e.alpha - lastAlpha;
          // Handle 360 wrap-around
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          accumulatedAngle += delta;

          const angleNormalized = ((accumulatedAngle % 360) + 360) % 360;
          const laps = Math.max(0, Math.floor(Math.abs(accumulatedAngle) / 360));
          const progress = Math.min(100, Math.round((Math.abs(accumulatedAngle) / (orbitState.targetLaps * 360)) * 100));

          setOrbitState((prev) => ({
            ...prev,
            currentAngle: Math.round(angleNormalized),
            lapsCompleted: laps,
            progressPercent: progress,
          }));
        }
        lastAlpha = e.alpha;
      }
    };

    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [orbitState.targetLaps]);

  // Orbit Pacing Simulation / Timer Loop when recording
  useEffect(() => {
    if (!isRecording) return;

    const targetSec = scanPreset === 'single-30' ? 30 : scanPreset === 'double-60' ? 60 : 90;
    const targetLaps = scanPreset === 'single-30' ? 1 : scanPreset === 'double-60' ? 2 : 3;

    const interval = setInterval(() => {
      setOrbitState((prev) => {
        const elapsedSec = recordedDurationMs / 1000;
        const progress = Math.min(100, (elapsedSec / targetSec) * 100);
        const pacedAngle = (elapsedSec * (360 / (targetSec / targetLaps))) % 360;

        // Auto stop on preset completion
        if (progress >= 100 && scanPreset !== 'freeform') {
          handleStopRecording();
        }

        return {
          ...prev,
          targetAngle: Math.round(pacedAngle),
          progressPercent: Math.round(progress),
          targetLaps,
        };
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isRecording, recordedDurationMs, scanPreset]);

  // Start 10 Mbps Video Capture
  const handleStartRecording = () => {
    if (!recorderRef.current) return;
    telemetrySamplesRef.current = [];
    const started = recorderRef.current.start();
    if (started) {
      setIsRecording(true);
      setCompletedCapture(null);
    }
  };

  // Stop Capture & Package LOOM Manifest
  const handleStopRecording = async () => {
    if (!recorderRef.current || !recorderRef.current.isRecording()) return;
    try {
      const result = await recorderRef.current.stop();
      setIsRecording(false);

      // Play success chime and celebration confetti
      cvEngineRef.current?.playSuccessChime();
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#00e599', '#f59e0b', '#38bdf8'],
      });

      // Compute telemetry stats
      const samples = telemetrySamplesRef.current;
      const avgSharpness = samples.length ? Math.round(samples.reduce((a, b) => a + b.sharpness, 0) / samples.length) : metrics.sharpness;
      const minSharpness = samples.length ? Math.round(Math.min(...samples.map((s) => s.sharpness))) : metrics.sharpness;
      const avgTexture = samples.length ? Math.round(samples.reduce((a, b) => a + b.texture, 0) / samples.length) : metrics.textureDensity;
      const maxGlare = samples.length ? Math.max(...samples.map((s) => s.glare)) : metrics.glarePercentage;

      const metadata: CaptureMetadata = {
        id: `cap_${Date.now()}`,
        timestamp: new Date().toISOString(),
        durationSeconds: result.durationSec,
        resolution: {
          width: videoRef.current?.videoWidth || 1920,
          height: videoRef.current?.videoHeight || 1080,
        },
        fps: 60,
        targetBitrateMbps: 10.0,
        actualBitrateMbps: Math.round(((result.sizeBytes * 8) / (result.durationSec * 1_000_000)) * 10) / 10,
        fileSizeBytes: result.sizeBytes,
        mimeType: result.mimeType,
        preset: scanPreset,
        telemetrySummary: {
          avgSharpness,
          minSharpness,
          avgTexture,
          maxGlare,
          blurFramePercentage: Math.round((samples.filter((s) => s.sharpness < 75).length / Math.max(1, samples.length)) * 100),
          glareFramePercentage: Math.round((samples.filter((s) => s.glare > 3.0).length / Math.max(1, samples.length)) * 100),
          orbitCoveragePercent: orbitState.progressPercent,
          qualityRating: avgSharpness > 90 && maxGlare < 3.0 ? 'EXCELLENT' : 'GOOD',
        },
        deviceInfo: {
          userAgent: navigator.userAgent,
          cameraLabel: devices.find((d) => d.deviceId === selectedDeviceId)?.label || 'Primary Camera',
          hasGyro: 'DeviceOrientationEvent' in window,
        },
        samples,
      };

      setCompletedCapture({
        metadata,
        videoBlob: result.blob,
        videoUrl: result.url,
      });
    } catch (err) {
      console.error('Stop recording error:', err);
    }
  };

  // Format milliseconds to MM:SS.S
  const formatTime = (ms: number) => {
    const totalSec = ms / 1000;
    const minutes = Math.floor(totalSec / 60);
    const seconds = Math.floor(totalSec % 60);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`;
  };

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] bg-[#090b0e] flex flex-col overflow-hidden">
      {/* Live Viewport Area */}
      <div className="relative flex-1 w-full bg-[#090b0e] flex items-center justify-center overflow-hidden">
        {/* Mandated playsInline, muted, autoPlay for seamless iOS Safari & Chrome playback */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover select-none pointer-events-none"
        />

        {/* Camera Permission Overlay */}
        {cameraPermission !== 'granted' && (
          <div className="absolute inset-0 bg-[#090b0e]/95 flex flex-col items-center justify-center p-6 text-center z-30">
            <div className="w-16 h-16 rounded-2xl bg-[#12161f] border border-[#1e2430] flex items-center justify-center mb-4">
              <Camera className="w-8 h-8 text-[#00e599]" />
            </div>
            <h2 className="text-lg font-bold text-[#f1f5f9] mb-2">Enable Camera to Begin 3D Photogrammetry</h2>
            <p className="text-xs text-[#94a3b8] max-w-md mb-6 leading-relaxed">
              LOOM Capture Studio uses real-time computer vision at 10 Hz to guide your orbit cadence and capture high-fidelity 10 Mbps scans.
            </p>
            <div className="flex gap-3">
              <button
                onClick={initCamera}
                className="px-5 py-2.5 rounded-lg bg-[#00e599] text-[#090b0e] font-semibold text-xs hover:bg-[#00e599]/90 transition"
              >
                Allow Camera Access
              </button>
              <button
                onClick={onOpenQrModal}
                className="px-4 py-2.5 rounded-lg bg-[#12161f] border border-[#1e2430] text-[#f1f5f9] font-medium text-xs hover:bg-[#1e2430] transition flex items-center gap-2"
              >
                <QrCode className="w-3.5 h-3.5 text-[#00e599]" />
                Pair Smartphone
              </button>
            </div>
          </div>
        )}

        {/* Computer Vision AR Crosshairs & Bounding Target Reticle */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative w-64 h-64 md:w-80 md:h-80 border border-[#00e599]/20 rounded-2xl transition-all duration-300">
            {/* 4 Corner Targeting Brackets */}
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-[#00e599]" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-[#00e599]" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-[#00e599]" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-[#00e599]" />

            {/* Center Crosshairs */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-[1px] bg-[#00e599]/50" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1px] h-4 bg-[#00e599]/50" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#00e599]" />

            {/* Dynamic Target Elevation Indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-[#94a3b8] px-2 py-0.5 rounded bg-[#12161f]/80 backdrop-blur-sm border border-[#1e2430]">
              TILT: <span className="text-[#00e599] font-bold">{orbitState.elevationAngle}°</span> ({orbitState.targetTier.toUpperCase()} TIER)
            </div>
          </div>
        </div>

        {/* Top Floating Status Coach Banner */}
        <div className="absolute top-4 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
          <div
            className={`flex items-center gap-2.5 px-4 py-2 rounded-full border backdrop-blur-md shadow-xl transition-all duration-300 ${
              metrics.overallStatus === 'optimal'
                ? 'bg-[#12161f]/90 border-[#00e599]/40 text-[#00e599]'
                : metrics.overallStatus === 'warning'
                ? 'bg-[#12161f]/90 border-[#f59e0b]/50 text-[#f59e0b]'
                : 'bg-[#12161f]/90 border-[#ff4d4d]/60 text-[#ff4d4d]'
            }`}
          >
            {metrics.overallStatus === 'optimal' ? (
              <CheckCircle2 className="w-4 h-4 text-[#00e599]" />
            ) : (
              <AlertTriangle className="w-4 h-4 animate-pulse" />
            )}
            <span className="text-xs font-semibold tracking-wide">
              {metrics.statusMessage}
            </span>
          </div>
        </div>

        {/* Top-Right Quick Controls */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          {torchAvailable && (
            <button
              onClick={toggleTorch}
              className={`p-2.5 rounded-lg border backdrop-blur-md transition ${
                torchOn
                  ? 'bg-[#00e599] text-[#090b0e] border-[#00e599]'
                  : 'bg-[#12161f]/90 border-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
              title="Toggle Flashlight / Fill Light"
            >
              <Zap className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-lg bg-[#12161f]/90 backdrop-blur-md border border-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9] transition"
            title="Audio Feedback Toggle"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-[#00e599]" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={onOpenGuideModal}
            className="p-2.5 rounded-lg bg-[#12161f]/90 backdrop-blur-md border border-[#1e2430] text-[#94a3b8] hover:text-[#00e599] transition"
            title="Photogrammetry Best Practices"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        {/* 360° Orbital Compass & Cadence Pacer (Floating Left) */}
        <div className="absolute left-4 top-20 z-20 hidden sm:flex flex-col items-center bg-[#12161f]/90 backdrop-blur-md border border-[#1e2430] p-3 rounded-xl">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#94a3b8] mb-1">Orbit Pacer</span>
          <div className="relative w-20 h-20 flex items-center justify-center">
            {/* Circular Orbit Track */}
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="#1e2430"
                strokeWidth="6"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="#00e599"
                strokeWidth="6"
                strokeDasharray="264"
                strokeDashoffset={264 - (264 * orbitState.progressPercent) / 100}
                strokeLinecap="round"
                className="transition-all duration-200"
              />
            </svg>

            {/* Current Camera Angle Needle */}
            <div
              className="absolute w-1.5 h-6 bg-[#00e599] rounded-full origin-bottom -translate-y-3 transition-transform duration-150"
              style={{ transform: `rotate(${orbitState.currentAngle}deg)` }}
            />

            {/* Inner Readout */}
            <div className="absolute text-center">
              <span className="text-xs font-mono font-bold text-[#f1f5f9] tabular-nums">
                {orbitState.progressPercent}%
              </span>
            </div>
          </div>
          <span className="text-[9px] font-mono text-[#94a3b8] mt-1 tabular-nums">
            {orbitState.currentAngle}° / 360°
          </span>
        </div>

        {/* Live Bottom Telemetry HUD Bar */}
        <div className="absolute bottom-4 inset-x-4 z-20 max-w-4xl mx-auto bg-[#12161f]/95 backdrop-blur-md border border-[#1e2430] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          {/* Sharpness (Laplacian Variance) */}
          <div className="flex-1 min-w-[120px]">
            <div className="flex justify-between text-[10px] text-[#94a3b8] mb-1">
              <span>SHARPNESS</span>
              <span className={`font-semibold tabular-nums ${metrics.sharpness > 75 ? 'text-[#00e599]' : 'text-[#f59e0b]'}`}>
                {metrics.sharpness} var
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#090b0e] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${metrics.sharpness > 75 ? 'bg-[#00e599]' : 'bg-[#f59e0b]'}`}
                style={{ width: `${Math.min(100, (metrics.sharpness / 200) * 100)}%` }}
              />
            </div>
          </div>

          {/* Texture Density */}
          <div className="flex-1 min-w-[120px]">
            <div className="flex justify-between text-[10px] text-[#94a3b8] mb-1">
              <span>TEXTURE DENSITY</span>
              <span className={`font-semibold tabular-nums ${metrics.textureDensity > 12 ? 'text-[#00e599]' : 'text-[#f59e0b]'}`}>
                {metrics.textureDensity}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#090b0e] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${metrics.textureDensity > 12 ? 'bg-[#00e599]' : 'bg-[#f59e0b]'}`}
                style={{ width: `${metrics.textureDensity}%` }}
              />
            </div>
          </div>

          {/* Glare Saturation */}
          <div className="flex-1 min-w-[120px]">
            <div className="flex justify-between text-[10px] text-[#94a3b8] mb-1">
              <span>SPECULAR GLARE</span>
              <span className={`font-semibold tabular-nums ${metrics.glarePercentage < 3.0 ? 'text-[#00e599]' : 'text-[#ff4d4d]'}`}>
                {metrics.glarePercentage}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#090b0e] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${metrics.glarePercentage < 3.0 ? 'bg-[#00e599]' : 'bg-[#ff4d4d]'}`}
                style={{ width: `${Math.min(100, (metrics.glarePercentage / 10) * 100)}%` }}
              />
            </div>
          </div>

          {/* Capture Telemetry Badges */}
          <div className="flex items-center gap-2 border-l border-[#1e2430] pl-3">
            <div className="text-right">
              <span className="text-[10px] text-[#94a3b8] block">BITRATE</span>
              <span className="text-[#00e599] font-bold tabular-nums">
                {isRecording ? `${currentBitrateMbps || 10.0} Mbps` : '10.0 Mbps'}
              </span>
            </div>
            {isRecording && (
              <div className="text-right">
                <span className="text-[10px] text-[#94a3b8] block">SIZE</span>
                <span className="text-[#f1f5f9] font-bold tabular-nums">
                  {(recordedBytes / 1_048_576).toFixed(1)} MB
                </span>
              </div>
            )}
            <div className="text-right">
              <span className="text-[10px] text-[#94a3b8] block">TARGET FPS</span>
              <span className="text-[#f1f5f9] font-bold tabular-nums">60 fps</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Main Action & Capture Control Deck */}
      <div className="bg-[#12161f] border-t border-[#1e2430] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 z-20">
        {/* Preset & Device Selectors */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-mono text-[#94a3b8] hidden md:inline">PRESET:</span>
          <select
            value={scanPreset}
            disabled={isRecording}
            onChange={(e) => setScanPreset(e.target.value as ScanPreset)}
            className="bg-[#090b0e] border border-[#1e2430] rounded-lg px-3 py-2 text-xs font-mono text-[#f1f5f9] focus:outline-none focus:border-[#00e599] transition disabled:opacity-50"
          >
            <option value="single-30">Single Orbit (30s — Standard)</option>
            <option value="double-60">Double Orbit (60s — Multi-tier)</option>
            <option value="spiral-90">Spiral Orbit (90s — High-Detail)</option>
            <option value="freeform">Freeform (Manual Stop)</option>
          </select>

          {/* Resolution select */}
          <select
            value={targetResolution}
            disabled={isRecording}
            onChange={(e) => setTargetResolution(e.target.value as '1080p' | '4k' | '720p')}
            className="bg-[#090b0e] border border-[#1e2430] rounded-lg px-2.5 py-2 text-xs font-mono text-[#94a3b8] focus:outline-none focus:border-[#00e599] transition disabled:opacity-50"
          >
            <option value="1080p">1080p</option>
            <option value="4k">4K UHD</option>
            <option value="720p">720p</option>
          </select>

          {/* Camera switcher if multiple sensors detected */}
          {devices.length > 1 && (
            <select
              value={selectedDeviceId}
              disabled={isRecording}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-[#090b0e] border border-[#1e2430] rounded-lg px-2.5 py-2 text-xs font-mono text-[#94a3b8] focus:outline-none focus:border-[#00e599] transition disabled:opacity-50 max-w-[130px] truncate"
            >
              <option value="">Auto Camera</option>
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Big Capture Trigger Button */}
        <div className="flex items-center gap-4">
          {isRecording ? (
            <button
              onClick={handleStopRecording}
              className="flex items-center gap-3 px-6 py-3 rounded-full bg-[#ff4d4d] hover:bg-[#ff4d4d]/90 text-white font-bold text-sm tracking-wide shadow-lg shadow-[#ff4d4d]/20 transition animate-pulse"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>COMPLETE SCAN ({formatTime(recordedDurationMs)})</span>
            </button>
          ) : (
            <button
              onClick={handleStartRecording}
              disabled={cameraPermission !== 'granted'}
              className="flex items-center gap-3 px-7 py-3 rounded-full bg-[#00e599] hover:bg-[#00e599]/90 text-[#090b0e] font-bold text-sm tracking-wide shadow-lg shadow-[#00e599]/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 fill-[#090b0e]" />
              <span>START 10 MBPS CAPTURE</span>
            </button>
          )}
        </div>

        {/* Quick Links */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenInspector}
            className="px-3 py-2 rounded-lg bg-[#090b0e] border border-[#1e2430] hover:border-[#00e599]/40 text-xs text-[#94a3b8] hover:text-[#f1f5f9] transition flex items-center gap-1.5 font-mono"
          >
            <span>3D STL View</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onOpenLoomBridge}
            className="px-3 py-2 rounded-lg bg-[#090b0e] border border-[#1e2430] hover:border-[#00e599]/40 text-xs text-[#94a3b8] hover:text-[#00e599] transition flex items-center gap-1.5 font-mono"
          >
            <span>LOOM Hub</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Capture Review Modal */}
      {completedCapture && (
        <div className="fixed inset-0 z-50 bg-[#090b0e]/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#12161f] border border-[#1e2430] rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-[#1e2430] pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#00e599]">Capture Success</span>
                <h3 className="text-lg font-bold text-[#f1f5f9]">Photogrammetry Scan Audit</h3>
              </div>
              <span className="px-3 py-1 rounded-full bg-[#00e599]/10 text-[#00e599] border border-[#00e599]/20 text-xs font-mono font-bold">
                {completedCapture.metadata.telemetrySummary.qualityRating}
              </span>
            </div>

            {/* Video Preview */}
            <div className="relative rounded-lg overflow-hidden border border-[#1e2430] bg-[#090b0e] aspect-video">
              <video
                src={completedCapture.videoUrl}
                controls
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            {/* Telemetry Summary Grid */}
            <div className="grid grid-cols-3 gap-2.5 text-xs font-mono">
              <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
                <span className="text-[#94a3b8] text-[10px] block">Duration</span>
                <span className="text-[#f1f5f9] font-medium">{completedCapture.metadata.durationSeconds}s</span>
              </div>
              <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
                <span className="text-[#94a3b8] text-[10px] block">Avg Sharpness</span>
                <span className="text-[#00e599] font-medium">{completedCapture.metadata.telemetrySummary.avgSharpness} var</span>
              </div>
              <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
                <span className="text-[#94a3b8] text-[10px] block">Bitrate</span>
                <span className="text-[#f1f5f9] font-medium">{completedCapture.metadata.actualBitrateMbps} Mbps</span>
              </div>
              <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
                <span className="text-[#94a3b8] text-[10px] block">File Size</span>
                <span className="text-[#f1f5f9] font-medium">
                  {Math.round((completedCapture.metadata.fileSizeBytes / 1_048_576) * 10) / 10} MB
                </span>
              </div>
              <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
                <span className="text-[#94a3b8] text-[10px] block">Orbit Coverage</span>
                <span className="text-[#00e599] font-medium">{completedCapture.metadata.telemetrySummary.orbitCoveragePercent}%</span>
              </div>
              <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
                <span className="text-[#94a3b8] text-[10px] block">Format</span>
                <span className="text-[#f1f5f9] font-medium truncate">{completedCapture.metadata.mimeType.split(';')[0]}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-[#1e2430]">
              <button
                onClick={async () => {
                  const bundle = loomBridge.prepareCaptureBundle(
                    completedCapture.videoBlob,
                    completedCapture.metadata
                  );
                  await loomBridge.submitReconstructionJob(bundle);
                  setCompletedCapture(null);
                  onOpenLoomBridge();
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#00e599] hover:bg-[#00e599]/90 text-[#090b0e] font-bold text-xs transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>Submit to LOOM Pipeline</span>
              </button>

              <button
                onClick={() => {
                  loomBridge.downloadVideoFile(completedCapture.videoBlob, `loom_${completedCapture.metadata.id}.mp4`);
                  loomBridge.downloadMetadataFile(completedCapture.metadata);
                }}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#090b0e] border border-[#1e2430] hover:border-[#00e599]/40 text-xs font-mono text-[#f1f5f9] transition"
              >
                <Download className="w-4 h-4 text-[#00e599]" />
                <span>Save Files</span>
              </button>

              <button
                onClick={() => setCompletedCapture(null)}
                className="py-2.5 px-4 rounded-lg bg-[#181e2b] border border-[#1e2430] text-xs font-mono text-[#94a3b8] hover:text-[#f1f5f9] transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
