export type CoachingStatus = 'MOTION_BLUR' | 'LOW_TEXTURE' | 'GLARE' | 'OPTIMAL';

export interface FrameTelemetry {
  sharpnessScore: number;     // 0 - 100
  rawVariance: number;        // Raw Laplacian variance σ²
  textureScore: number;       // 0 - 100
  overexposedRatio: number;   // 0.0 - 1.0
  status: CoachingStatus;
  headline: string;
  instruction: string;
  statusColor: string;        // Hex code for status badge and HUD reticle
}

// Offscreen analysis canvas dimensions
export const CV_CANVAS_WIDTH = 160;
export const CV_CANVAS_HEIGHT = 120;

/**
 * Analyzes live video frame on a 160x120 canvas to extract photogrammetry quality metrics.
 */
export function analyzeFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): FrameTelemetry {
  const defaultTelemetry: FrameTelemetry = {
    sharpnessScore: 0,
    rawVariance: 0,
    textureScore: 0,
    overexposedRatio: 0,
    status: 'OPTIMAL',
    headline: 'STANDBY',
    instruction: 'Point camera at subject to begin CV inspection',
    statusColor: '#94a3b8',
  };

  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return defaultTelemetry;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return defaultTelemetry;

  if (canvas.width !== CV_CANVAS_WIDTH) canvas.width = CV_CANVAS_WIDTH;
  if (canvas.height !== CV_CANVAS_HEIGHT) canvas.height = CV_CANVAS_HEIGHT;

  try {
    ctx.drawImage(video, 0, 0, CV_CANVAS_WIDTH, CV_CANVAS_HEIGHT);
  } catch {
    return defaultTelemetry;
  }

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, CV_CANVAS_WIDTH, CV_CANVAS_HEIGHT);
  } catch {
    return defaultTelemetry;
  }

  const data = imgData.data;
  const W = CV_CANVAS_WIDTH;

  // Pre-calculate full luminance buffer (160 x 120)
  // Luminance: Y = 0.299R + 0.587G + 0.114B
  const lum = new Uint8Array(W * CV_CANVAS_HEIGHT);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) >> 10;
  }

  // 1. Motion Blur / Edge Sharpness on Center Box (x: 40..120, y: 30..90)
  // Region width = 80, height = 60
  const cxMin = 40;
  const cxMax = 120;
  const cyMin = 30;
  const cyMax = 90;

  let centerPixelsCount = 0;
  let overexposedPixelsCount = 0;
  let laplacianSum = 0;
  let laplacianSqSum = 0;
  let laplacianSampleCount = 0;

  // Discrete 3x3 Laplacian kernel [0, 1, 0, 1, -4, 1, 0, 1, 0]
  for (let y = cyMin; y < cyMax; y++) {
    const rowOffset = y * W;
    for (let x = cxMin; x < cxMax; x++) {
      const idx = rowOffset + x;
      const val = lum[idx];

      centerPixelsCount++;
      if (val > 245) {
        overexposedPixelsCount++;
      }

      // Laplacian sample with 1px border margin
      if (y > cyMin && y < cyMax - 1 && x > cxMin && x < cxMax - 1) {
        const up = lum[idx - W];
        const down = lum[idx + W];
        const left = lum[idx - 1];
        const right = lum[idx + 1];

        const lap = up + down + left + right - 4 * val;
        laplacianSum += lap;
        laplacianSqSum += lap * lap;
        laplacianSampleCount++;
      }
    }
  }

  // Compute variance σ² = E[X²] - (E[X])²
  let variance = 0;
  if (laplacianSampleCount > 0) {
    const meanLap = laplacianSum / laplacianSampleCount;
    const meanLapSq = laplacianSqSum / laplacianSampleCount;
    variance = Math.max(0, meanLapSq - meanLap * meanLap);
  }

  // Map variance to 0-100 score (variance ~85 is the threshold)
  // Variance typically ranges 0 to 400+
  const sharpnessScore = Math.min(100, Math.round((variance / 180) * 100));
  const isBlurry = variance < 85;

  // 2. Surface & Background Texture Density:
  // Compute horizontal and vertical Sobel gradient magnitudes across center subject box
  // AND lower support-plane margin (y: 85..115)
  // G = |G_x| + |G_y|
  let textureSampleCount = 0;
  let highGradientCount = 0;

  // Scan center region + lower support plane margin (y: 30..115, x: 20..140)
  const texYMin = 30;
  const texYMax = 115;
  const texXMin = 20;
  const texXMax = 140;

  for (let y = texYMin; y < texYMax; y++) {
    const rowOffset = y * W;
    for (let x = texXMin; x < texXMax; x++) {
      const idx = rowOffset + x;

      // Sobel gradient approximation:
      // Gx = lum[x+1, y] - lum[x-1, y]
      // Gy = lum[x, y+1] - lum[x, y-1]
      const gx = lum[idx + 1] - lum[idx - 1];
      const gy = lum[idx + W] - lum[idx - W];
      const gMagnitude = Math.abs(gx) + Math.abs(gy);

      textureSampleCount++;
      if (gMagnitude > 28) {
        highGradientCount++;
      }
    }
  }

  const textureScore = textureSampleCount > 0
    ? Math.min(100, Math.round((highGradientCount / textureSampleCount) * 100))
    : 0;
  const hasLowTexture = textureScore < 22;

  // 3. Specular Glare Detector: fraction of center pixels with luminance > 245
  const overexposedRatio = centerPixelsCount > 0
    ? Math.round((overexposedPixelsCount / centerPixelsCount) * 1000) / 1000
    : 0;
  const isOverexposed = overexposedRatio > 0.18;

  // 4. Deterministic Priority Coaching State Machine
  // Priority 1: MOTION_BLUR
  // Priority 2: LOW_TEXTURE
  // Priority 3: GLARE
  // Priority 4: OPTIMAL
  let status: CoachingStatus;
  let headline: string;
  let instruction: string;
  let statusColor: string;

  if (isBlurry) {
    status = 'MOTION_BLUR';
    headline = 'TOO FAST / BLURRY';
    instruction = 'Slow down your walk to lock SIFT features';
    statusColor = '#f59e0b'; // Amber Warning
  } else if (hasLowTexture) {
    status = 'LOW_TEXTURE';
    headline = 'LOW SURFACE TEXTURE';
    instruction = 'Place newspaper or patterned sheet beneath object';
    statusColor = '#f59e0b'; // Amber Warning
  } else if (isOverexposed) {
    status = 'GLARE';
    headline = 'SPECULAR GLARE';
    instruction = 'Tilt camera slightly to avoid light reflection';
    statusColor = '#ff4d4d'; // Crimson Alert
  } else {
    status = 'OPTIMAL';
    headline = 'LOCKED & SHARP';
    instruction = 'Maintain steady pace around the orbit ring';
    statusColor = '#00e599'; // Emerald Optimal
  }

  return {
    sharpnessScore,
    rawVariance: Math.round(variance * 10) / 10,
    textureScore,
    overexposedRatio,
    status,
    headline,
    instruction,
    statusColor,
  };
}

