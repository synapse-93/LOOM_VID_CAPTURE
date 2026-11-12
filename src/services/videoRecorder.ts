export interface RecordingStats {
  isRecording: boolean;
  durationMs: number;
  bytesRecorded: number;
  currentBitrateMbps: number;
  mimeType: string;
}

export class HighBitrateRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private startTime = 0;
  private timerId: number | null = null;
  private totalBytes = 0;
  private onStatsCallback: ((stats: RecordingStats) => void) | null = null;
  private selectedMimeType = '';

  constructor(private targetBitrateBps: number = 10_000_000) {}

  public static getSupportedMimeType(): string {
    const candidateTypes = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];

    for (const type of candidateTypes) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  public setStream(stream: MediaStream) {
    this.mediaStream = stream;
  }

  public onStats(callback: (stats: RecordingStats) => void) {
    this.onStatsCallback = callback;
  }

  public start(): boolean {
    if (!this.mediaStream) {
      console.error('[HighBitrateRecorder] No MediaStream provided');
      return false;
    }

    this.recordedChunks = [];
    this.totalBytes = 0;
    this.selectedMimeType = HighBitrateRecorder.getSupportedMimeType();

    const options: MediaRecorderOptions = {
      videoBitsPerSecond: this.targetBitrateBps,
    };

    if (this.selectedMimeType) {
      options.mimeType = this.selectedMimeType;
    }

    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
    } catch {
      // Fallback without explicit options if device rejected specific bitrate
      try {
        this.mediaRecorder = new MediaRecorder(this.mediaStream);
      } catch (err) {
        console.error('[HighBitrateRecorder] Failed to create MediaRecorder', err);
        return false;
      }
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
        this.totalBytes += event.data.size;
      }
    };

    this.mediaRecorder.onerror = (e) => {
      console.error('[HighBitrateRecorder] MediaRecorder error', e);
    };

    // Request chunks every 1000ms for continuous streaming and memory safety
    this.mediaRecorder.start(1000);
    this.startTime = Date.now();

    this.timerId = window.setInterval(() => {
      if (this.onStatsCallback) {
        const elapsedMs = Date.now() - this.startTime;
        const elapsedSec = elapsedMs / 1000;
        const currentBitrateMbps = elapsedSec > 0 ? (this.totalBytes * 8) / (elapsedSec * 1_000_000) : 0;
        this.onStatsCallback({
          isRecording: true,
          durationMs: elapsedMs,
          bytesRecorded: this.totalBytes,
          currentBitrateMbps: Math.round(currentBitrateMbps * 100) / 100,
          mimeType: this.selectedMimeType || 'video/webm',
        });
      }
    }, 250);

    return true;
  }

  public stop(): Promise<{ blob: Blob; url: string; mimeType: string; durationSec: number; sizeBytes: number }> {
    return new Promise((resolve, reject) => {
      if (this.timerId !== null) {
        clearInterval(this.timerId);
        this.timerId = null;
      }

      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('Recorder is not active'));
        return;
      }

      const elapsedSec = (Date.now() - this.startTime) / 1000;

      this.mediaRecorder.onstop = () => {
        const mime = this.selectedMimeType || 'video/webm';
        const finalBlob = new Blob(this.recordedChunks, { type: mime });
        const finalUrl = URL.createObjectURL(finalBlob);

        if (this.onStatsCallback) {
          this.onStatsCallback({
            isRecording: false,
            durationMs: elapsedSec * 1000,
            bytesRecorded: finalBlob.size,
            currentBitrateMbps: (finalBlob.size * 8) / (elapsedSec * 1_000_000),
            mimeType: mime,
          });
        }

        resolve({
          blob: finalBlob,
          url: finalUrl,
          mimeType: mime,
          durationSec: Math.round(elapsedSec * 10) / 10,
          sizeBytes: finalBlob.size,
        });
      };

      this.mediaRecorder.stop();
    });
  }

  public isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

