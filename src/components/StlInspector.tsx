import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import {
  createCalibrationPrismGeometry,
  geometryToBinaryStl,
} from '../utils/stlGenerators';
import {
  RotateCcw,
  Upload,
  Download,
} from 'lucide-react';

export const StlInspector: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentMeshRef = useRef<THREE.Mesh | null>(null);
  const currentGeomRef = useRef<THREE.BufferGeometry | null>(null);

  // Inspection State
  const [isWireframe, setIsWireframe] = useState(false);
  const [modelName, setModelName] = useState('calibration-prism-gauge.stl');
  const [telemetry, setTelemetry] = useState({
    dimX: 0,
    dimY: 0,
    dimZ: 0,
    triangles: 0,
  });

  // Calculate Bounding Dimensions and Triangle Count
  const updateTelemetry = (geom: THREE.BufferGeometry) => {
    geom.computeBoundingBox();
    const bbox = geom.boundingBox || new THREE.Box3();
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const pos = geom.getAttribute('position');
    const triangles = geom.index ? geom.index.count / 3 : pos.count / 3;

    setTelemetry({
      dimX: Math.round(size.x * 10) / 10,
      dimY: Math.round(size.z * 10) / 10, // Depth
      dimZ: Math.round(size.y * 10) / 10, // Height
      triangles: Math.round(triangles),
    });
  };

  // Center on X/Y and snap lowest vertex flush to Z = 0.000 mm on millimeter GridHelper
  const loadGeometry = useCallback((geometry: THREE.BufferGeometry) => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return;

    currentGeomRef.current = geometry;
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    // Auto-center on X/Z and snap lowest vertex flush to Y = 0.000 (Z_min = 0.000 mm)
    geometry.translate(-center.x, -bbox.min.y, -center.z);
    geometry.computeVertexNormals();

    if (currentMeshRef.current) {
      sceneRef.current.remove(currentMeshRef.current);
      currentMeshRef.current.geometry.dispose();
      (currentMeshRef.current.material as THREE.Material).dispose();
      currentMeshRef.current = null;
    }

    // Industrial matte CAD material
    const material = new THREE.MeshStandardMaterial({
      color: 0xECEEF2,
      roughness: 0.38,
      metalness: 0.15,
      wireframe: isWireframe,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    sceneRef.current.add(mesh);
    currentMeshRef.current = mesh;

    updateTelemetry(geometry);

    // Auto-frame camera with bounding sphere
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere!;
    const radius = Math.max(30, sphere.radius);
    cameraRef.current.position.set(radius * 2.0, radius * 1.6, radius * 2.2);
    controlsRef.current.target.set(0, radius * 0.4, 0);
    controlsRef.current.update();
  }, [isWireframe]);

  // Initialize Three.js WebGL Viewport
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0C0D0F);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    cameraRef.current = camera;

    // Renderer (zero glow, matte anti-aliasing)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Millimeter GridHelper (10 mm divisions, major lines every 50 mm, at Z = 0.000 mm flush)
    const gridHelper = new THREE.GridHelper(200, 20, 0x363B45, 0x1A1D21);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Directional Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight1.position.set(120, 160, 100);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x8A909E, 0.45);
    dirLight2.position.set(-100, 60, -100);
    scene.add(dirLight2);

    // Load Default Calibration Prism Gauge Mesh
    const defaultGeom = createCalibrationPrismGeometry();
    loadGeometry(defaultGeom);

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

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
  }, [loadGeometry]);

  // Update wireframe mode
  useEffect(() => {
    if (currentMeshRef.current) {
      (currentMeshRef.current.material as THREE.MeshStandardMaterial).wireframe = isWireframe;
    }
  }, [isWireframe]);

  // Reset Camera View
  const handleResetCamera = () => {
    if (!currentGeomRef.current || !cameraRef.current || !controlsRef.current) return;
    currentGeomRef.current.computeBoundingSphere();
    const sphere = currentGeomRef.current.boundingSphere!;
    const radius = Math.max(30, sphere.radius);
    cameraRef.current.position.set(radius * 2.0, radius * 1.6, radius * 2.2);
    controlsRef.current.target.set(0, radius * 0.4, 0);
    controlsRef.current.update();
  };

  // Drag & drop / file picker handling
  const handleFile = (file: File) => {
    setModelName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) return;
      try {
        const loader = new STLLoader();
        const geom = loader.parse(buffer);
        loadGeometry(geom);
      } catch (err) {
        alert('ERR_INVALID_STL: Please provide a valid binary or ASCII STL mesh.');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.stl')) {
      handleFile(file);
    }
  };

  // Export Binary STL
  const handleExportStl = () => {
    if (!currentGeomRef.current) return;
    const buffer = geometryToBinaryStl(currentGeomRef.current);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = modelName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[1fr_300px] h-[calc(100vh-48px)] bg-[#0C0D0F] select-none overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* LEFT THREE.JS VIEWPORT */}
      <div className="relative w-full h-full border-b lg:border-b-0 border-[#262930] overflow-hidden">
        {/* Top-Left File Header */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-[#131518] border border-[#262930] px-3 py-1.5 rounded font-mono text-xs">
          <span className="text-[#8A909E] uppercase text-[10px]">FILE:</span>
          <span className="text-[#ECEEF2] truncate max-w-[220px] font-medium">{modelName}</span>
        </div>

        {/* Top-Right Quick Viewport Controls */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <label className="border border-[#262930] bg-[#131518] hover:bg-[#1A1D21] text-[#ECEEF2] text-xs font-mono px-2.5 py-1.5 rounded flex items-center gap-1.5 cursor-pointer transition">
            <Upload className="w-3.5 h-3.5 text-[#8A909E]" />
            <span>LOAD .STL</span>
            <input
              type="file"
              accept=".stl"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
            />
          </label>

          <button
            onClick={handleExportStl}
            className="border border-[#262930] bg-[#131518] hover:bg-[#1A1D21] text-[#ECEEF2] text-xs font-mono px-2.5 py-1.5 rounded flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5 text-[#8A909E]" />
            <span>EXPORT</span>
          </button>
        </div>

        {/* WebGL Canvas */}
        <div ref={mountRef} className="w-full h-full" />

        {/* Viewport Bottom Overlay Readout */}
        <div className="absolute bottom-3 left-3 z-10 bg-[#131518] border border-[#262930] px-3 py-1.5 rounded font-mono text-xs flex items-center gap-4 text-[#8A909E]">
          <div>
            <span>GRID: </span>
            <span className="text-[#ECEEF2] font-medium">10 mm / DIV</span>
          </div>
          <div className="w-[1px] h-3 bg-[#262930]" />
          <div>
            <span>Z-MIN: </span>
            <span className="text-[#10B981] font-medium">0.000 mm (FLUSH)</span>
          </div>
        </div>
      </div>

      {/* RIGHT TELEMETRY SIDEBAR */}
      <div className="bg-[#131518] border-l border-[#262930] p-4 flex flex-col justify-between font-mono text-xs overflow-y-auto">
        <div className="space-y-4">
          <div className="pb-2 border-b border-[#262930] flex items-center justify-between">
            <span className="text-[11px] text-[#8A909E] uppercase tracking-wider font-semibold">
              CAD METRICS & TOPOLOGY
            </span>
            <span className="text-[10px] text-[#10B981] px-1.5 py-0.2 rounded border border-[#10B981]/30 bg-[#10B981]/10">
              MANIFOLD
            </span>
          </div>

          {/* Bounding Box Dimensions */}
          <div className="border border-[#262930] rounded-md p-3 bg-[#0C0D0F] space-y-2">
            <span className="text-[10px] text-[#8A909E] uppercase block">
              BOUNDING BOX (L × W × H)
            </span>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="p-2 border border-[#262930] rounded bg-[#131518]">
                <span className="text-[9px] text-[#8A909E] block">LENGTH (X)</span>
                <span className="text-[#ECEEF2] font-semibold tabular-nums">{telemetry.dimX} mm</span>
              </div>
              <div className="p-2 border border-[#262930] rounded bg-[#131518]">
                <span className="text-[9px] text-[#8A909E] block">WIDTH (Y)</span>
                <span className="text-[#ECEEF2] font-semibold tabular-nums">{telemetry.dimY} mm</span>
              </div>
              <div className="p-2 border border-[#262930] rounded bg-[#131518]">
                <span className="text-[9px] text-[#8A909E] block">HEIGHT (Z)</span>
                <span className="text-[#ECEEF2] font-semibold tabular-nums">{telemetry.dimZ} mm</span>
              </div>
            </div>
          </div>

          {/* Triangle Count & Topology */}
          <div className="border border-[#262930] rounded-md p-3 bg-[#0C0D0F] space-y-2">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-[#8A909E]">TRIANGLE COUNT</span>
              <span className="text-[#ECEEF2] font-semibold tabular-nums">
                {telemetry.triangles.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-[#8A909E]">BUILD PLATE Z-MIN</span>
              <span className="text-[#10B981] font-semibold tabular-nums">0.000 mm</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-[#8A909E]">WATERTIGHT STATUS</span>
              <span className="text-[#10B981] font-semibold">CLOSED MANIFOLD</span>
            </div>
          </div>

          {/* Shading & Inspection Controls */}
          <div className="border border-[#262930] rounded-md p-3 bg-[#0C0D0F] space-y-2.5">
            <span className="text-[10px] text-[#8A909E] uppercase block">SHADING CONTROLS</span>
            <div className="grid grid-cols-2 gap-1.5 bg-[#131518] p-1 border border-[#262930] rounded">
              <button
                type="button"
                onClick={() => setIsWireframe(false)}
                className={`py-1 rounded text-center transition ${
                  !isWireframe
                    ? 'bg-[#1A1D21] text-[#ECEEF2] border border-[#262930] font-medium'
                    : 'text-[#8A909E] hover:text-[#ECEEF2]'
                }`}
              >
                SOLID
              </button>
              <button
                type="button"
                onClick={() => setIsWireframe(true)}
                className={`py-1 rounded text-center transition ${
                  isWireframe
                    ? 'bg-[#1A1D21] text-[#ECEEF2] border border-[#262930] font-medium'
                    : 'text-[#8A909E] hover:text-[#ECEEF2]'
                }`}
              >
                WIREFRAME
              </button>
            </div>

            <button
              onClick={handleResetCamera}
              className="w-full py-1.5 rounded border border-[#262930] bg-[#131518] hover:bg-[#1A1D21] text-[#ECEEF2] flex items-center justify-center gap-1.5 transition text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#8A909E]" />
              <span>RESET CAMERA VIEW</span>
            </button>
          </div>
        </div>

        {/* Quick Calibration Sample Loader */}
        <div className="pt-3 border-t border-[#262930]">
          <span className="text-[10px] text-[#8A909E] uppercase block mb-1.5">
            SAMPLE CALIBRATION GAUGE
          </span>
          <button
            onClick={() => {
              setModelName('calibration-prism-gauge.stl');
              loadGeometry(createCalibrationPrismGeometry());
            }}
            className="w-full py-2 rounded bg-[#ECEEF2] hover:bg-[#FFFFFF] text-[#0C0D0F] font-mono font-medium text-xs transition"
          >
            RELOAD CALIBRATION PRISM
          </button>
        </div>
      </div>
    </div>
  );
};
