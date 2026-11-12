import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import {
  createMechanicalBracketGeometry,
  createTurbineImpellerGeometry,
  createSculptureGeometry,
  geometryToBinaryStl,
} from '../utils/stlGenerators';
import {
  RotateCcw,
  Download,
  Upload,
  Camera,
  Box,
  Sliders,
} from 'lucide-react';

export type RenderMode = 'solid' | 'wireframe' | 'normals' | 'points' | 'xray';

interface ModelTelemetry {
  triangles: number;
  vertices: number;
  dimX: number; // mm
  dimY: number; // mm
  dimZ: number; // mm
  volumeCm3: number;
  surfaceAreaMm2: number;
}

export const ThreeInspector: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const bboxHelperRef = useRef<THREE.Box3Helper | null>(null);
  const currentGeomRef = useRef<THREE.BufferGeometry | null>(null);
  const clippingPlaneRef = useRef<THREE.Plane | null>(null);

  // UI States
  const [selectedPreset, setSelectedPreset] = useState<'bracket' | 'impeller' | 'sculpture' | 'custom'>('bracket');
  const [renderMode, setRenderMode] = useState<RenderMode>('solid');
  const [showGrid, setShowGrid] = useState(true);
  const [showBbox, setShowBbox] = useState(true);
  const [clippingActive, setClippingActive] = useState(false);
  const [clippingAxis, setClippingAxis] = useState<'x' | 'y' | 'z'>('y');
  const [clippingValue, setClippingValue] = useState(50); // 0 to 100%
  const [colorScheme, setColorScheme] = useState<'emerald' | 'titanium' | 'amber' | 'bronze'>('emerald');
  const [fileName, setFileName] = useState('mechanical-bracket.stl');
  const [telemetry, setTelemetry] = useState<ModelTelemetry>({
    triangles: 0,
    vertices: 0,
    dimX: 0,
    dimY: 0,
    dimZ: 0,
    volumeCm3: 0,
    surfaceAreaMm2: 0,
  });

  // Color mapping
  const colorHex = {
    emerald: 0x00e599,
    titanium: 0x94a3b8,
    amber: 0xf59e0b,
    bronze: 0xd97706,
  }[colorScheme];

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090b0e);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(120, 90, 140);
    cameraRef.current = camera;

    // 3. Renderer with antialias and local clipping
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 600;
    controls.minDistance = 10;
    controlsRef.current = controls;

    // 5. Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(100, 150, 80);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 400;
    const d = 100;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x00e599, 0.4);
    fillLight.position.set(-100, 50, -80);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x94a3b8, 0.6);
    rimLight.position.set(0, -50, -100);
    scene.add(rimLight);

    // 6. Ground Grid & Shadow Receiver
    const gridHelper = new THREE.GridHelper(200, 40, 0x1e2430, 0x12161f);
    gridHelper.position.y = -0.1;
    gridHelper.name = 'gridHelper';
    scene.add(gridHelper);

    const shadowPlaneGeom = new THREE.PlaneGeometry(300, 300);
    const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeom, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.2;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // 7. Clipping plane
    const clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);
    clippingPlaneRef.current = clippingPlane;

    // 8. Model Group
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // 9. Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // 10. Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Grid visibility
  useEffect(() => {
    if (!sceneRef.current) return;
    const grid = sceneRef.current.getObjectByName('gridHelper');
    if (grid) grid.visible = showGrid;
  }, [showGrid]);

  // Compute surface area & volume estimate
  const computeGeometryTelemetry = (geom: THREE.BufferGeometry): ModelTelemetry => {
    geom.computeBoundingBox();
    const bbox = geom.boundingBox || new THREE.Box3();
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const pos = geom.getAttribute('position');
    const triCount = geom.index ? geom.index.count / 3 : pos.count / 3;
    const vertCount = pos.count;

    // Calculate surface area and volume via divergence theorem
    let areaMm2 = 0;
    let signedVolMm3 = 0;

    const nonIndexed = geom.index ? geom.toNonIndexed() : geom;
    const p = nonIndexed.getAttribute('position');
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();

    for (let i = 0; i < p.count; i += 3) {
      vA.fromBufferAttribute(p, i);
      vB.fromBufferAttribute(p, i + 1);
      vC.fromBufferAttribute(p, i + 2);

      cb.subVectors(vC, vB);
      ab.subVectors(vA, vB);
      cb.cross(ab);
      areaMm2 += cb.length() * 0.5;

      signedVolMm3 += vA.dot(cb) / 6.0;
    }

    const volumeCm3 = Math.max(0, Math.abs(signedVolMm3) / 1000.0);

    return {
      triangles: Math.round(triCount),
      vertices: vertCount,
      dimX: Math.round(size.x * 10) / 10,
      dimY: Math.round(size.y * 10) / 10,
      dimZ: Math.round(size.z * 10) / 10,
      volumeCm3: Math.round(volumeCm3 * 10) / 10,
      surfaceAreaMm2: Math.round(areaMm2),
    };
  };

  // Re-render mesh with selected mode and color
  const applyGeometryToScene = useCallback((geometry: THREE.BufferGeometry) => {
    if (!meshGroupRef.current || !sceneRef.current) return;
    currentGeomRef.current = geometry;

    // Center geometry at origin (bottom flush with ground y = 0)
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    geometry.translate(-center.x, -bbox.min.y, -center.z);
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    // Clear previous mesh
    while (meshGroupRef.current.children.length > 0) {
      const child = meshGroupRef.current.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      meshGroupRef.current.remove(child);
    }

    // Remove old bbox
    if (bboxHelperRef.current) {
      sceneRef.current.remove(bboxHelperRef.current);
      bboxHelperRef.current = null;
    }

    // Setup materials based on renderMode
    const clipPlanes = clippingActive && clippingPlaneRef.current ? [clippingPlaneRef.current] : [];

    let meshObject: THREE.Object3D;

    if (renderMode === 'solid') {
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        metalness: 0.25,
        roughness: 0.35,
        clippingPlanes: clipPlanes,
        clipShadows: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshObject = mesh;
    } else if (renderMode === 'wireframe') {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        wireframe: true,
        clippingPlanes: clipPlanes,
      });
      meshObject = new THREE.Mesh(geometry, mat);
    } else if (renderMode === 'normals') {
      const mat = new THREE.MeshNormalMaterial({
        clippingPlanes: clipPlanes,
        side: THREE.DoubleSide,
      });
      meshObject = new THREE.Mesh(geometry, mat);
    } else if (renderMode === 'points') {
      const mat = new THREE.PointsMaterial({
        color: colorHex,
        size: 1.2,
        sizeAttenuation: true,
        clippingPlanes: clipPlanes,
      });
      meshObject = new THREE.Points(geometry, mat);
    } else {
      // X-ray inspection mode
      const mat = new THREE.MeshPhysicalMaterial({
        color: colorHex,
        transmission: 0.85,
        opacity: 1,
        transparent: true,
        roughness: 0.1,
        ior: 1.5,
        clippingPlanes: clipPlanes,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, mat);
      meshObject = mesh;
    }

    meshGroupRef.current.add(meshObject);

    // Add Bounding Box Helper if enabled
    if (showBbox) {
      const helper = new THREE.Box3Helper(geometry.boundingBox!, new THREE.Color(0x1e2430));
      sceneRef.current.add(helper);
      bboxHelperRef.current = helper;
    }

    // Telemetry updates
    const t = computeGeometryTelemetry(geometry);
    setTelemetry(t);
  }, [renderMode, colorHex, clippingActive, showBbox]);

  // Load Preset Model
  useEffect(() => {
    let geom: THREE.BufferGeometry;
    let name = 'mechanical-bracket.stl';

    if (selectedPreset === 'bracket') {
      geom = createMechanicalBracketGeometry();
      name = 'mechanical-bracket.stl';
    } else if (selectedPreset === 'impeller') {
      geom = createTurbineImpellerGeometry();
      name = 'aerospace-impeller.stl';
    } else if (selectedPreset === 'sculpture') {
      geom = createSculptureGeometry();
      name = 'archaeological-sculpture.stl';
    } else {
      return; // Custom file loaded via file input
    }

    setFileName(name);
    applyGeometryToScene(geom);
  }, [selectedPreset, applyGeometryToScene]);

  // Handle Clipping Plane updates
  useEffect(() => {
    if (!clippingPlaneRef.current || !currentGeomRef.current) return;
    const geom = currentGeomRef.current;
    geom.computeBoundingBox();
    const bbox = geom.boundingBox!;

    const normal = new THREE.Vector3(
      clippingAxis === 'x' ? -1 : 0,
      clippingAxis === 'y' ? -1 : 0,
      clippingAxis === 'z' ? -1 : 0
    );

    let min = 0;
    let max = 100;
    if (clippingAxis === 'x') { min = bbox.min.x; max = bbox.max.x; }
    if (clippingAxis === 'y') { min = bbox.min.y; max = bbox.max.y; }
    if (clippingAxis === 'z') { min = bbox.min.z; max = bbox.max.z; }

    const targetPos = min + (max - min) * (clippingValue / 100);
    clippingPlaneRef.current.normal.copy(normal);
    clippingPlaneRef.current.constant = targetPos;

    // Refresh material
    if (currentGeomRef.current) {
      applyGeometryToScene(currentGeomRef.current);
    }
  }, [clippingActive, clippingAxis, clippingValue, applyGeometryToScene]);

  // Camera presets
  const setCameraView = (view: 'iso' | 'front' | 'top' | 'right') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (view === 'iso') {
      camera.position.set(120, 90, 140);
    } else if (view === 'front') {
      camera.position.set(0, 30, 180);
    } else if (view === 'top') {
      camera.position.set(0, 200, 0.01);
    } else if (view === 'right') {
      camera.position.set(180, 30, 0);
    }
    controls.target.set(0, 25, 0);
    controls.update();
  };

  // Upload custom STL
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSelectedPreset('custom');

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (!buffer) return;

      const loader = new STLLoader();
      try {
        const geom = loader.parse(buffer);
        applyGeometryToScene(geom);
      } catch (err) {
        alert('Failed to parse STL file. Please ensure it is a valid binary or ASCII STL.');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Export Binary STL
  const handleDownloadStl = () => {
    if (!currentGeomRef.current) return;
    const stlBuffer = geometryToBinaryStl(currentGeomRef.current);
    const blob = new Blob([stlBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'loom_photogrammetry_model.stl';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Capture Screenshot PNG
  const handleTakeScreenshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `loom_${fileName.replace('.stl', '')}_render.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] bg-[#090b0e] flex flex-col lg:flex-row overflow-hidden select-none">
      {/* 3D Viewport */}
      <div className="relative flex-1 h-full min-h-[420px]" ref={mountRef}>
        {/* Floating Top Viewport Controls */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-[#12161f]/90 backdrop-blur-md border border-[#1e2430] p-1.5 rounded-lg">
          <button
            onClick={() => setCameraView('iso')}
            className="px-2.5 py-1 text-xs font-mono rounded bg-[#1e2430] hover:bg-[#283244] text-[#f1f5f9] transition"
          >
            ISO
          </button>
          <button
            onClick={() => setCameraView('top')}
            className="px-2.5 py-1 text-xs font-mono rounded hover:bg-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9] transition"
          >
            TOP
          </button>
          <button
            onClick={() => setCameraView('front')}
            className="px-2.5 py-1 text-xs font-mono rounded hover:bg-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9] transition"
          >
            FRONT
          </button>
          <button
            onClick={() => setCameraView('right')}
            className="px-2.5 py-1 text-xs font-mono rounded hover:bg-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9] transition"
          >
            RIGHT
          </button>
          <div className="h-4 w-[1px] bg-[#1e2430]" />
          <button
            onClick={() => setCameraView('iso')}
            title="Reset Camera"
            className="p-1 rounded hover:bg-[#1e2430] text-[#94a3b8] hover:text-[#00e599] transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Viewport Action Buttons */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <button
            onClick={handleTakeScreenshot}
            title="Export High-Res PNG"
            className="p-2 rounded-lg bg-[#12161f]/90 backdrop-blur-md border border-[#1e2430] text-[#94a3b8] hover:text-[#00e599] hover:border-[#00e599]/40 transition"
          >
            <Camera className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownloadStl}
            title="Download STL Asset"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#00e599] text-[#090b0e] font-medium text-xs hover:bg-[#00e599]/90 transition"
          >
            <Download className="w-4 h-4" />
            <span>Download STL</span>
          </button>
        </div>

        {/* Live Millimeter Readout Overlay */}
        <div className="absolute bottom-4 left-4 z-10 bg-[#12161f]/90 backdrop-blur-md border border-[#1e2430] p-3 rounded-lg flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-[#94a3b8] block text-[10px] uppercase tracking-wider">Bounding Dimensions</span>
            <span className="text-[#f1f5f9] font-semibold tabular-nums">
              {telemetry.dimX} × {telemetry.dimY} × {telemetry.dimZ} <span className="text-[#00e599]">mm</span>
            </span>
          </div>
          <div className="h-6 w-[1px] bg-[#1e2430]" />
          <div>
            <span className="text-[#94a3b8] block text-[10px] uppercase tracking-wider">Volume</span>
            <span className="text-[#f1f5f9] tabular-nums">
              {telemetry.volumeCm3} <span className="text-[#94a3b8]">cm³</span>
            </span>
          </div>
          <div className="h-6 w-[1px] bg-[#1e2430]" />
          <div>
            <span className="text-[#94a3b8] block text-[10px] uppercase tracking-wider">Triangles</span>
            <span className="text-[#f1f5f9] tabular-nums">{telemetry.triangles.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Right Telemetry & Controls Sidebar */}
      <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-[#1e2430] bg-[#12161f] p-5 flex flex-col gap-5 overflow-y-auto">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-[#f1f5f9] tracking-wide uppercase flex items-center gap-2">
              <Box className="w-4 h-4 text-[#00e599]" />
              STL Inspector
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00e599]/10 text-[#00e599] border border-[#00e599]/20">
              Mesh Ready
            </span>
          </div>
          <p className="text-xs text-[#94a3b8]">Inspect LOOM reconstruction meshes with real-world metric dimensions.</p>
        </div>

        {/* Model Presets & File Upload */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider block">
            Select 3D Model
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => setSelectedPreset('bracket')}
              className={`px-2 py-2 text-xs rounded border transition ${
                selectedPreset === 'bracket'
                  ? 'bg-[#00e599]/10 border-[#00e599] text-[#00e599]'
                  : 'bg-[#181e2b] border-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              Bracket
            </button>
            <button
              onClick={() => setSelectedPreset('impeller')}
              className={`px-2 py-2 text-xs rounded border transition ${
                selectedPreset === 'impeller'
                  ? 'bg-[#00e599]/10 border-[#00e599] text-[#00e599]'
                  : 'bg-[#181e2b] border-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              Impeller
            </button>
            <button
              onClick={() => setSelectedPreset('sculpture')}
              className={`px-2 py-2 text-xs rounded border transition ${
                selectedPreset === 'sculpture'
                  ? 'bg-[#00e599]/10 border-[#00e599] text-[#00e599]'
                  : 'bg-[#181e2b] border-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              Sculpture
            </button>
          </div>

          <label className="relative flex items-center justify-center gap-2 w-full py-2.5 px-3 border border-dashed border-[#1e2430] hover:border-[#00e599]/50 rounded-lg cursor-pointer bg-[#090b0e]/50 hover:bg-[#090b0e] transition text-xs text-[#94a3b8] hover:text-[#f1f5f9]">
            <Upload className="w-3.5 h-3.5 text-[#00e599]" />
            <span className="truncate">{selectedPreset === 'custom' ? fileName : 'Upload Custom .STL'}</span>
            <input type="file" accept=".stl" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* Shading & Render Mode */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider block">
            Render Mode
          </label>
          <div className="grid grid-cols-3 gap-1.5 text-xs">
            {(['solid', 'wireframe', 'normals', 'points', 'xray'] as RenderMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setRenderMode(mode)}
                className={`py-1.5 px-2 rounded border capitalize transition ${
                  renderMode === mode
                    ? 'bg-[#00e599]/10 border-[#00e599] text-[#00e599]'
                    : 'bg-[#181e2b] border-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Color Palette */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider block">
            PBR Color Finish
          </label>
          <div className="flex items-center gap-2">
            {[
              { id: 'emerald', label: 'Emerald', bg: 'bg-[#00e599]' },
              { id: 'titanium', label: 'Titanium', bg: 'bg-[#94a3b8]' },
              { id: 'amber', label: 'Amber', bg: 'bg-[#f59e0b]' },
              { id: 'bronze', label: 'Bronze', bg: 'bg-[#d97706]' },
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => setColorScheme(c.id as 'emerald' | 'titanium' | 'amber' | 'bronze')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded border text-xs transition ${
                  colorScheme === c.id
                    ? 'border-[#00e599] bg-[#1e2430] text-[#f1f5f9]'
                    : 'border-[#1e2430] text-[#94a3b8] hover:text-[#f1f5f9]'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${c.bg}`} />
                <span className="text-[10px]">{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cross-Section Slicing Tool */}
        <div className="space-y-2.5 bg-[#090b0e] p-3 rounded-lg border border-[#1e2430]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#f1f5f9] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#00e599]" />
              Internal Cross-Section Slicing
            </span>
            <input
              type="checkbox"
              checked={clippingActive}
              onChange={(e) => setClippingActive(e.target.checked)}
              className="accent-[#00e599] w-3.5 h-3.5 cursor-pointer"
            />
          </div>

          {clippingActive && (
            <div className="space-y-2 pt-1 border-t border-[#1e2430]/60">
              <div className="flex items-center justify-between text-xs text-[#94a3b8]">
                <span>Slice Plane Axis:</span>
                <div className="flex gap-1">
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <button
                      key={axis}
                      onClick={() => setClippingAxis(axis)}
                      className={`px-2 py-0.5 text-[10px] uppercase font-mono rounded ${
                        clippingAxis === axis
                          ? 'bg-[#00e599] text-[#090b0e] font-bold'
                          : 'bg-[#181e2b] text-[#94a3b8]'
                      }`}
                    >
                      {axis}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="range"
                min="5"
                max="95"
                value={clippingValue}
                onChange={(e) => setClippingValue(Number(e.target.value))}
                className="w-full accent-[#00e599] cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Telemetry Readout Grid */}
        <div className="space-y-2 border-t border-[#1e2430] pt-4">
          <label className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider block">
            Mesh Topology Metrics
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
              <span className="text-[#94a3b8] text-[10px] block">Triangles</span>
              <span className="text-[#f1f5f9] font-medium tabular-nums">{telemetry.triangles.toLocaleString()}</span>
            </div>
            <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
              <span className="text-[#94a3b8] text-[10px] block">Vertices</span>
              <span className="text-[#f1f5f9] font-medium tabular-nums">{telemetry.vertices.toLocaleString()}</span>
            </div>
            <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
              <span className="text-[#94a3b8] text-[10px] block">Surface Area</span>
              <span className="text-[#f1f5f9] font-medium tabular-nums">
                {telemetry.surfaceAreaMm2.toLocaleString()} <span className="text-[#94a3b8] text-[10px]">mm²</span>
              </span>
            </div>
            <div className="bg-[#090b0e] p-2.5 rounded border border-[#1e2430]">
              <span className="text-[#94a3b8] text-[10px] block">Volume</span>
              <span className="text-[#f1f5f9] font-medium tabular-nums">
                {telemetry.volumeCm3} <span className="text-[#94a3b8] text-[10px]">cm³</span>
              </span>
            </div>
          </div>
        </div>

        {/* Viewport Display Toggles */}
        <div className="pt-2 border-t border-[#1e2430] flex items-center justify-between text-xs text-[#94a3b8]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
              className="accent-[#00e599] rounded"
            />
            <span>Ground Grid</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showBbox}
              onChange={(e) => setShowBbox(e.target.checked)}
              className="accent-[#00e599] rounded"
            />
            <span>Bounding Box</span>
          </label>
        </div>
      </div>
    </div>
  );
};
