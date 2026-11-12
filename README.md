# LOOM Capture Studio (`loom-capture-studio`)

> **Computer-Vision-Guided 3D Photogrammetry Scanner & Three.js STL Inspector**  
> Standalone, production-grade Vite + React + TypeScript + Tailwind CSS v4 single-page application built for zero-config deployment on Vercel.

---

## 🚀 Key Capabilities

1. **10 Hz Real-Time Computer Vision Guidance Engine (`src/lib/cvGuidance.ts`)**
   - Samples live camera frames on an offscreen `160×120` canvas every `100ms`.
   - **Motion Blur / Edge Sharpness**: Center `80×60` box luminance converted to grayscale; calculates discrete 3×3 Laplacian kernel variance $\sigma^2$ (`variance < 85` flags `MOTION_BLUR`).
   - **Surface & Background Texture**: Horizontal and vertical Sobel gradient magnitudes ($G = |G_x| + |G_y|$) across subject and support plane (`y: 85..115`). Catches plain white/glossy tables that break SIFT feature tracking (`textureScore < 22` flags `LOW_TEXTURE`).
   - **Specular Glare Detector**: Analyzes luminance clipping ($Y > 245$); flags `GLARE` when overexposure exceeds 18%.
   - **Deterministic State Machine**: Real-time HUD reticle coloring (`#00e599`, `#f59e0b`, `#ff4d4d`) and synthesized voice coaching (`window.speechSynthesis`).

2. **High-Bitrate Cross-Browser Camera Recorder (`src/lib/cameraRecorder.ts`)**
   - Probes rear environment camera with 1080p / 30–60 fps constraints.
   - Enforces `<video playsInline muted autoPlay>` for seamless iOS Safari and Android Chrome inline playback.
   - Negotiates MIME types in strict priority (`video/mp4;codecs=avc1`, `video/mp4`, `video/webm;codecs=h264`, `video/webm;codecs=vp9`, `video/webm`).
   - Captures at **10 Mbps** (`videoBitsPerSecond: 10_000_000`) with 1000ms chunk slicing to prevent compression smear.
   - Safe `MediaStreamTrack` lifecycle management with automatic release on unmount.

3. **12-Sector 360° Orbit Pacer Ring & SVG HUD (`src/components/GuidedScanner.tsx`)**
   - 12-sector circular SVG ring (`30°` per sector) with dual cadence presets (`45s Turbo` vs `60s High-Detail`).
   - Animate glowing pacer beacon around the ring to coach uniform circular orbits.
   - Pre-flight readiness strip (`[1] Textured baseplate`, `[2] Rigid object centered`, `[3] 35°–45° angle`).
   - Post-capture quality scorecard with video playback preview, Pass/Retake rating, and download CTAs.

4. **Interactive Three.js Binary STL Inspector (`src/components/StlInspector.tsx`)**
   - Loads binary `.stl` files via drag-and-drop, file picker, or bundled sample models (Precision Bracket & Turbine Impeller).
   - Auto-centers geometry on X/Y and snaps lowest vertex flush to $Z = 0.0$ on a millimeter `GridHelper`.
   - Auto-frames camera with `OrbitControls`.
   - Solid / Wireframe toggle, Reset View button, exact bounding box readout (`L × W × H mm`), and triangle counts.

5. **Decoupled LOOM Integration Adapter (`src/lib/loomBridge.ts`)**
   - Configurable `loomEndpoint` persisted in `localStorage` (defaulting to `VITE_LOOM_API_URL`).
   - Built-in `checkLoomHealth()` with 3-second timeout.
   - `downloadCaptureLocally()` for immediate capture download to feed into `scripts/demo.py`.
   - `submitToLoomWorker()` for remote GPU reconstruction or high-fidelity standalone simulation.

6. **Instant Mobile Phone Handoff (`src/App.tsx`)**
   - Built-in QR code modal powered by `qrcode` to pair mobile devices to the Vercel HTTPS URL in seconds.

---

## 🛠️ Project Structure

```
loom-capture-studio/
├── .env.example              # Environment variables template
├── vercel.json               # Zero-config SPA routing for Vercel
├── vite.config.ts            # Vite 6 + Tailwind v4 + Three.js chunking
├── package.json              # Dependencies and build scripts
├── src/
│   ├── main.tsx              # Application entry point
│   ├── App.tsx               # Workspace router, top navigation & QR modal
│   ├── index.css             # Tailwind CSS v4 CSS-first styling
│   ├── vite-env.d.ts         # Vite client environment declarations
│   ├── lib/
│   │   ├── cvGuidance.ts     # 10 Hz Computer Vision coaching engine
│   │   ├── cameraRecorder.ts # 10 Mbps MediaRecorder camera service
│   │   └── loomBridge.ts     # LOOM GPU backend adapter & health checker
│   ├── components/
│   │   ├── GuidedScanner.tsx # Viewfinder, SVG HUD, 12-sector orbit pacer
│   │   └── StlInspector.tsx  # Three.js 3D STL inspector with millimeter readout
│   └── utils/
│       └── stlGenerators.ts  # Binary STL procedural mesh generators
└── public/
    └── logo.svg              # Studio branding logo
```

---

## 💻 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Type check & production build verification
npx tsc --noEmit
npm run build
```

---

## ☁️ Zero-Config Vercel Deployment

1. Push this repository to GitHub or GitLab.
2. Import the project into **Vercel**.
3. Framework Preset: **Vite**.
4. Build Command: `npm run build`.
5. Output Directory: `dist`.
6. (Optional) Set `VITE_LOOM_API_URL` to point to your live LOOM GPU worker.
7. Deploy! Vercel automatically provisions SSL/HTTPS, enabling WebRTC camera and gyroscope access across iOS Safari and Android Chrome.

# LOOM_VID_CAPTURE
