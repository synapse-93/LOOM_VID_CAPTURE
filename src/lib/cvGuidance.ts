export type OpticalStatus = 'MOTION_BLUR' | 'LOW_TEXTURE' | 'GLARE' | 'OPTIMAL';
export type OpticalStatusCode = 'ERR_BLUR' | 'WARN_TEXTURE' | 'WARN_GLARE' | 'SYS_LOCKED';

export interface FrameTelemetry {
  sharpnessScore: number;     // 0 - 100
  rawVariance: number;        // Raw Laplacian variance σ²
  textureScore: number;       // 0 - 100
  overexposedRatio: number;   // 0.0 - 1.0 (0.0% - 100.0%)
  status: OpticalStatus;
  code: OpticalStatusCode;
  guidance: string;
  statusColor: string;        // #10B981 | #F59E0B | #EF4444
}

export const CV_CANVAS_WIDTH = 160;
export const CV_CANVAS_HEIGHT = 120;

/**
 * 10 Hz pure TypeScript pixel analyzer operating on hidden 160x120 canvas.
 * Works seamlessly for both live camera streams and local test video files.
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
    code: 'SYS_LOCKED',
    guidance: 'OPTICAL LOCK — MAINTAIN STEADY ORBIT',
    statusColor: '#8A909E',
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
  const H = CV_CANVAS_HEIGHT;

  // Grayscale luminance array (160x120): Y = 0.299R + 0.587G + 0.114B
  const lum = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) >> 10;
  }

  // 1. Laplacian Edge Sharpness on Center 80x60 region (x: 40..120, y: 30..90)
  const cxMin = 40;
  const cxMax = 120;
  const cyMin = 30;
  const cyMax = 90;

  let centerPixelCount = 0;
  let overexposedPixelCount = 0;
  let laplacianSum = 0;
  let laplacianSqSum = 0;
  let laplacianCount = 0;

  // Discrete 3x3 Laplacian kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0]
  for (let y = cyMin; y < cyMax; y++) {
    const rowOffset = y * W;
    for (let x = cxMin; x < cxMax; x++) {
      const idx = rowOffset + x;
      const val = lum[idx];

      centerPixelCount++;
      if (val > 245) {
        overexposedPixelCount++;
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
        laplacianCount++;
      }
    }
  }

  // Variance σ² = E[X²] - (E[X])²
  let variance = 0;
  if (laplacianCount > 0) {
    const meanLap = laplacianSum / laplacianCount;
    const meanLapSq = laplacianSqSum / laplacianCount;
    variance = Math.max(0, meanLapSq - meanLap * meanLap);
  }

  // Normalize sharpness score (0 - 100), variance < 85 indicates motion blur
  const sharpnessScore = Math.min(100, Math.round((variance / 170) * 100));
  const isBlurry = variance < 85;

  // 2. Sobel Surface Texture Density (0 - 100):
  // Compute Sobel gradient magnitude G = |Gx| + |Gy| across center subject box
  // AND lower table margin (y: 85..115)
  let textureSampleCount = 0;
  let highEdgeCount = 0;

  const texYMin = 30;
  const texYMax = 115;
  const texXMin = 20;
  const texXMax = 140;

  for (let y = texYMin; y < texYMax; y++) {
    const rowOffset = y * W;
    for (let x = texXMin; x < texXMax; x++) {
      const idx = rowOffset + x;

      const gx = lum[idx + 1] - lum[idx - 1];
      const gy = lum[idx + W] - lum[idx - W];
      const gMagnitude = Math.abs(gx) + Math.abs(gy);

      textureSampleCount++;
      if (gMagnitude > 28) {
        highEdgeCount++;
      }
    }
  }

  const textureScore = textureSampleCount > 0
    ? Math.min(100, Math.round((highEdgeCount / textureSampleCount) * 100))
    : 0;
  const hasLowTexture = textureScore < 22;

  // 3. Specular Glare Ratio: fraction of center pixels with luminance > 245
  const overexposedRatio = centerPixelCount > 0
    ? Math.round((overexposedPixelCount / centerPixelCount) * 1000) / 1000
    : 0;
  const isOverexposed = overexposedRatio > 0.18;

  // 4. Deterministic Coaching Output (Priority Hierarchy)
  // Priority 1: MOTION_BLUR -> "MOTION BLUR — REDUCE ORBIT VELOCITY"
  // Priority 2: LOW_TEXTURE -> "LOW TEXTURE — PLACE PRINTED ANCHOR SHEET"
  // Priority 3: GLARE       -> "SPECULAR GLARE — ADJUST CAMERA TILT"
  // Priority 4: OPTIMAL     -> "OPTICAL LOCK — MAINTAIN STEADY ORBIT"
  let status: OpticalStatus;
  let code: OpticalStatusCode;
  let guidance: string;
  let statusColor: string;

  if (isBlurry) {
    status = 'MOTION_BLUR';
    code = 'ERR_BLUR';
    guidance = 'MOTION BLUR — REDUCE ORBIT VELOCITY';
    statusColor = '#EF4444'; // Critical Red
  } else if (hasLowTexture) {
    status = 'LOW_TEXTURE';
    code = 'WARN_TEXTURE';
    guidance = 'LOW TEXTURE — PLACE PRINTED ANCHOR SHEET';
    statusColor = '#F59E0B'; // Caution Amber
  } else if (isOverexposed) {
    status = 'GLARE';
    code = 'WARN_GLARE';
    guidance = 'SPECULAR GLARE — ADJUST CAMERA TILT';
    statusColor = '#F59E0B'; // Caution Amber
  } else {
    status = 'OPTIMAL';
    code = 'SYS_LOCKED';
    guidance = 'OPTICAL LOCK — MAINTAIN STEADY ORBIT';
    statusColor = '#10B981'; // Optimal Green
  }

  return {
    sharpnessScore,
    rawVariance: Math.round(variance * 10) / 10,
    textureScore,
    overexposedRatio,
    status,
    code,
    guidance,
    statusColor,
  };
}
