export type QualityStatus = 'optimal' | 'warning' | 'critical';

export interface TelemetryMetrics {
  sharpness: number;        // Laplacian variance (typically 0 - 800)
  textureDensity: number;   // Percentage of high-contrast edge pixels (0 - 100)
  glarePercentage: number;  // Percentage of blown highlights / saturated pixels (0 - 100)
  luminanceAvg: number;     // Average brightness (0 - 255)
  isMotionBlur: boolean;
  isFeatureless: boolean;
  isGlareDetected: boolean;
  overallStatus: QualityStatus;
  statusMessage: string;
}

export type ScanPreset = 'single-30' | 'double-60' | 'spiral-90' | 'freeform';

export interface OrbitState {
  currentAngle: number;       // 0 to 360 degrees (compass azimuth or simulated)
  targetAngle: number;        // Pacing guide target angle
  angularSpeedDegPerSec: number;
  elevationAngle: number;     // Pitch / tilt angle (-90 to +90 degrees)
  targetTier: 'low' | 'mid' | 'high'; // 15°, 45°, 75°
  lapsCompleted: number;
  targetLaps: number;
  progressPercent: number;    // 0 to 100%
  pacingState: 'on_track' | 'too_fast' | 'too_slow' | 'reverse';
}

export interface CaptureMetadata {
  id: string;
  timestamp: string;
  durationSeconds: number;
  resolution: { width: number; height: number };
  fps: number;
  targetBitrateMbps: number;
  actualBitrateMbps: number;
  fileSizeBytes: number;
  mimeType: string;
  preset: ScanPreset;
  telemetrySummary: {
    avgSharpness: number;
    minSharpness: number;
    avgTexture: number;
    maxGlare: number;
    blurFramePercentage: number;
    glareFramePercentage: number;
    orbitCoveragePercent: number;
    qualityRating: 'EXCELLENT' | 'GOOD' | 'NEEDS_RESCAN';
  };
  deviceInfo: {
    userAgent: string;
    cameraLabel: string;
    hasGyro: boolean;
  };
  samples: Array<{
    time: number;
    sharpness: number;
    texture: number;
    glare: number;
    angle: number;
    elevation: number;
  }>;
}

export interface LoomReconstructionJob {
  jobId: string;
  captureId: string;
  createdAt: string;
  updatedAt: string;
  status: 'queued' | 'feature_extraction' | 'sparse_sfm' | 'dense_mvs' | 'meshing' | 'texturing' | 'ready' | 'failed';
  progress: number; // 0 - 100
  currentStageName: string;
  stageLogs: string[];
  outputModelUrl?: string;
  triangleCount?: number;
  vertexCount?: number;
  fileSizeMb?: number;
  reconstructionTimeSec?: number;
  config: {
    featureQuality: 'fast' | 'high' | 'ultra';
    mesher: 'poisson' | 'delaunay';
    textureResolution: 2048 | 4096 | 8192;
  };
}

