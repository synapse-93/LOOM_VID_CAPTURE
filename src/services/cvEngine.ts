import { TelemetryMetrics, QualityStatus } from '../types/capture';

export interface CVEngineConfig {
  sampleRateHz: number;        // Default: 10 Hz (every 100ms)
  blurThreshold: number;       // Laplacian variance threshold (default ~65-80)
  textureThreshold: number;    // Min edge density % (default ~12%)
  glareThreshold: number;      // Max blown pixel % (default ~3.0%)
  enableAudio: boolean;
  enableHaptics: boolean;
}

export class CVTelemetryEngine {
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private timerId: number | null = null;
  private config: CVEngineConfig;
  private audioCtx: AudioContext | null = null;
  private lastAlertSoundTime = 0;
  private lastStatus: QualityStatus = 'optimal';
  private onMetricsCallback: ((metrics: TelemetryMetrics) => void) | null = null;

  // Analysis downsample dimensions for high performance CPU analysis (320x180)
  private readonly ANALYZE_WIDTH = 320;
  private readonly ANALYZE_HEIGHT = 180;

  constructor(config?: Partial<CVEngineConfig>) {
    this.config = {
      sampleRateHz: 10,
      blurThreshold: 75,
      textureThreshold: 12.0,
      glareThreshold: 3.2,
      enableAudio: true,
      enableHaptics: true,
      ...config,
    };

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.ANALYZE_WIDTH;
    this.canvas.height = this.ANALYZE_HEIGHT;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  public setVideoSource(video: HTMLVideoElement) {
    this.videoElement = video;
  }

  public setConfig(newConfig: Partial<CVEngineConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public onMetrics(callback: (metrics: TelemetryMetrics) => void) {
    this.onMetricsCallback = callback;
  }

  public start() {
    if (this.timerId !== null) return;
    const intervalMs = Math.round(1000 / this.config.sampleRateHz);
    this.timerId = window.setInterval(() => {
      this.analyzeFrame();
    }, intervalMs);
  }

  public stop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public destroy() {
    this.stop();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
    }
  }

  /**
   * Samples the current video frame and extracts sharpness, texture, and glare metrics.
   */
  public analyzeFrame(): TelemetryMetrics | null {
    if (!this.videoElement || !this.ctx) return null;
    if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
    if (this.videoElement.videoWidth === 0 || this.videoElement.videoHeight === 0) return null;

    const w = this.ANALYZE_WIDTH;
    const h = this.ANALYZE_HEIGHT;

    // Draw downsampled frame to offscreen canvas
    try {
      this.ctx.drawImage(this.videoElement, 0, 0, w, h);
    } catch {
      return null;
    }

    let imgData: ImageData;
    try {
      imgData = this.ctx.getImageData(0, 0, w, h);
    } catch {
      return null;
    }

    const data = imgData.data;
    const totalPixels = w * h;

    // Step 1: Grayscale conversion & Glare detection
    const gray = new Uint8Array(totalPixels);
    let totalLuminance = 0;
    let glarePixels = 0;

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // ITU-R BT.601 luminance
      const lum = (r * 299 + g * 587 + b * 114) >> 10;
      gray[p] = lum;
      totalLuminance += lum;

      // Specular glare: saturated highlights above 248
      if (lum > 248 && (r > 240 && g > 240 && b > 240)) {
        glarePixels++;
      }
    }

    const avgLuminance = totalLuminance / totalPixels;
    const glarePercentage = (glarePixels / totalPixels) * 100;

    // Step 2: Discrete Laplacian operator for Sharpness / Motion Blur
    // Kernel:
    //  0  1  0
    //  1 -4  1
    //  0  1  0
    // Compute variance of Laplacian response
    let laplacianSum = 0;
    let laplacianSqSum = 0;
    let validSampleCount = 0;
    let highGradientEdgeCount = 0;

    // Sample with 1-pixel margin to avoid boundary artifacts
    for (let y = 1; y < h - 1; y++) {
      const rowOffset = y * w;
      for (let x = 1; x < w - 1; x++) {
        const idx = rowOffset + x;

        const val = gray[idx];
        const up = gray[idx - w];
        const down = gray[idx + w];
        const left = gray[idx - 1];
        const right = gray[idx + 1];

        // Laplacian
        const lap = up + down + left + right - 4 * val;
        laplacianSum += lap;
        laplacianSqSum += lap * lap;
        validSampleCount++;

        // Edge magnitude for Texture Density (simple gradient magnitude)
        const dx = right - left;
        const dy = down - up;
        const gradMagnitude = Math.abs(dx) + Math.abs(dy);

        // Gradient threshold for meaningful photogrammetry surface feature
        if (gradMagnitude > 32) {
          highGradientEdgeCount++;
        }
      }
    }

    // Laplacian variance = E[X^2] - (E[X])^2
    const meanLap = laplacianSum / validSampleCount;
    const meanLapSq = laplacianSqSum / validSampleCount;
    const variance = Math.max(0, meanLapSq - meanLap * meanLap);

    // Texture Density percentage of surface
    const textureDensity = Math.min(100, (highGradientEdgeCount / validSampleCount) * 100);

    // Evaluate Quality Flags
    const isMotionBlur = variance < this.config.blurThreshold;
    const isFeatureless = textureDensity < this.config.textureThreshold;
    const isGlareDetected = glarePercentage > this.config.glareThreshold;

    let overallStatus: QualityStatus = 'optimal';
    let statusMessage = 'Optimal Capture Cadence';

    if (isMotionBlur && isGlareDetected) {
      overallStatus = 'critical';
      statusMessage = 'Motion Blur & Specular Glare! Slow down and adjust lighting.';
    } else if (isMotionBlur) {
      overallStatus = 'warning';
      statusMessage = 'Camera Pacing Too Fast — Motion Blur Detected';
    } else if (isGlareDetected) {
      overallStatus = 'warning';
      statusMessage = 'Specular Glare Detected — Diffuse Light or Shift Angle';
    } else if (isFeatureless) {
      overallStatus = 'warning';
      statusMessage = 'Low Feature Contrast — Background is too flat';
    }

    const metrics: TelemetryMetrics = {
      sharpness: Math.round(variance * 10) / 10,
      textureDensity: Math.round(textureDensity * 10) / 10,
      glarePercentage: Math.round(glarePercentage * 10) / 10,
      luminanceAvg: Math.round(avgLuminance),
      isMotionBlur,
      isFeatureless,
      isGlareDetected,
      overallStatus,
      statusMessage,
    };

    // Trigger alerts if state degraded
    if (overallStatus !== 'optimal' && this.lastStatus === 'optimal') {
      this.triggerAlertFeedback(overallStatus);
    }
    this.lastStatus = overallStatus;

    if (this.onMetricsCallback) {
      this.onMetricsCallback(metrics);
    }

    return metrics;
  }

  /**
   * Subtle Web Audio synthesized chimes and mobile haptics for non-distracting user coaching.
   */
  private triggerAlertFeedback(status: QualityStatus) {
    const now = Date.now();
    if (now - this.lastAlertSoundTime < 1800) return; // Debounce audio alerts
    this.lastAlertSoundTime = now;

    // Haptics for mobile devices
    if (this.config.enableHaptics && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (status === 'critical') {
          navigator.vibrate([100, 50, 100]);
        } else {
          navigator.vibrate(60);
        }
      } catch {
        // Haptics not allowed by browser context
      }
    }

    // Web Audio Synthesized notification
    if (this.config.enableAudio && typeof window !== 'undefined') {
      try {
        if (!this.audioCtx) {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            this.audioCtx = new AudioContextClass();
          }
        }

        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }

        if (this.audioCtx) {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);

          const freq = status === 'critical' ? 260 : 380;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
          gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.25);

          osc.start();
          osc.stop(this.audioCtx.currentTime + 0.25);
        }
      } catch {
        // Audio playback restricted
      }
    }
  }

  /**
   * Milestone celebration sound on complete 360 degree orbit
   */
  public playSuccessChime() {
    if (!this.config.enableAudio) return;
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx) {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const now = this.audioCtx.currentTime;

        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
          const osc = this.audioCtx!.createOscillator();
          const gain = this.audioCtx!.createGain();
          osc.connect(gain);
          gain.connect(this.audioCtx!.destination);

          const noteStart = now + idx * 0.08;
          osc.frequency.setValueAtTime(freq, noteStart);
          gain.gain.setValueAtTime(0.09, noteStart);
          gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.2);

          osc.start(noteStart);
          osc.stop(noteStart + 0.2);
        });
      }
    } catch {
      // Audio fallback
    }
  }
}

