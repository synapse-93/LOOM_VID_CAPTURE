export interface CameraInitResult {
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
  deviceLabel: string;
}

export interface RecorderResult {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
  sizeBytes: number;
  durationSec: number;
}

export class CameraRecorderService {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private startTime = 0;
  private timerInterval: number | null = null;
  private selectedMimeType = '';

  /**
   * Initializes the rear camera with photogrammetry constraints.
   * Maps NotAllowedError, NotFoundError, and insecure context into actionable messages.
   */
  public static async initRearCamera(): Promise<CameraInitResult> {
    if (typeof window === 'undefined') {
      throw new Error('Camera initialization requires a browser window environment.');
    }

    if (!window.isSecureContext) {
      throw new Error(
        'Camera access requires a Secure Context (HTTPS or localhost). Vercel deployments provide HTTPS automatically.'
      );
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser does not support WebRTC mediaDevices API.');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      });

      const videoTrack = stream.getVideoTracks()[0];
      const deviceLabel = videoTrack?.label || 'Rear Environment Camera';

      return { stream, videoTrack, deviceLabel };
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new Error(
          'Camera permission denied. Please allow camera access in your browser settings to record 3D scans.'
        );
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        throw new Error('No camera hardware was detected on this device.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        throw new Error('Camera is currently in use by another application or browser tab.');
      }
      throw new Error(error.message || 'Unable to access camera.');
    }
  }

  /**
   * Stops all active tracks on a MediaStream to release camera hardware cleanly.
   */
  public static releaseStream(stream: MediaStream | null) {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Track already closed
      }
    });
  }

  /**
   * Negotiates best supported MIME type in strict priority order.
   */
  public static getOptimalMimeType(): string {
    const priorityList = [
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm',
    ];

    if (typeof MediaRecorder === 'undefined') {
      return '';
    }

    for (const mime of priorityList) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }

    return '';
  }

  public setStream(stream: MediaStream) {
    this.mediaStream = stream;
  }

  /**
   * Begins high-bitrate recording (10 Mbps) with 1000ms chunk slices.
   */
  public startRecording(onTick?: (elapsedMs: number, bytes: number) => void): boolean {
    if (!this.mediaStream || !this.mediaStream.active) {
      console.error('[CameraRecorder] Cannot start recording: no active MediaStream');
      return false;
    }

    this.recordedChunks = [];
    this.selectedMimeType = CameraRecorderService.getOptimalMimeType();

    const options: MediaRecorderOptions = {
      videoBitsPerSecond: 10_000_000, // 10 Mbps
    };

    if (this.selectedMimeType) {
      options.mimeType = this.selectedMimeType;
    }

    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
    } catch {
      // Fallback if device rejects bitRate option
      try {
        this.mediaRecorder = new MediaRecorder(this.mediaStream);
      } catch (err) {
        console.error('[CameraRecorder] MediaRecorder creation failed:', err);
        return false;
      }
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.start(1000); // 1000ms chunk slices
    this.startTime = Date.now();

    if (onTick) {
      this.timerInterval = window.setInterval(() => {
        const elapsed = Date.now() - this.startTime;
        let totalBytes = 0;
        for (const chunk of this.recordedChunks) {
          totalBytes += chunk.size;
        }
        onTick(elapsed, totalBytes);
      }, 250);
    }

    return true;
  }

  /**
   * Stops recording and resolves with assembled Blob and photogrammetry metadata.
   */
  public stopRecording(): Promise<RecorderResult> {
    return new Promise((resolve, reject) => {
      if (this.timerInterval !== null) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('MediaRecorder is not actively recording.'));
        return;
      }

      const elapsedSec = Math.max(0.1, (Date.now() - this.startTime) / 1000);

      this.mediaRecorder.onstop = () => {
        const actualMime = this.mediaRecorder?.mimeType || this.selectedMimeType || 'video/mp4';
        const isMp4 = actualMime.toLowerCase().includes('mp4');
        const extension: 'mp4' | 'webm' = isMp4 ? 'mp4' : 'webm';

        const finalBlob = new Blob(this.recordedChunks, { type: actualMime });

        resolve({
          blob: finalBlob,
          mimeType: actualMime,
          extension,
          sizeBytes: finalBlob.size,
          durationSec: Math.round(elapsedSec * 10) / 10,
        });
      };

      this.mediaRecorder.stop();
    });
  }

  public isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

