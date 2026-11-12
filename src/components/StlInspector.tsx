import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import {
  createMechanicalBracketGeometry,
  createTurbineImpellerGeometry,
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

  // UI state
  const [isWireframe, setIsWireframe] = useState(false);
  const [modelName, setModelName] = useState('mechanical-bracket.stl');
  const [telemetry, setTelemetry] = useState({
    dimX: 0,
    dimY: 0,
    dimZ: 0,
    triangles: 0,
  });

  // Calculate dimensions and triangle count
  const updateTelemetry = (geom: THREE.BufferGeometry) => {
    geom.computeBoundingBox();
    const bbox = geom.boundingBox || new THREE.Box3();
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const pos = geom.getAttribute('position');
    const triangles = geom.index ? geom.index.count / 3 : pos.count / 3;

    setTelemetry({
      dimX: Math.round(size.x * 10) / 10,
      dimY: Math.round(size.y * 10) / 10,
      dimZ: Math.round(size.z * 10) / 10,
      triangles: Math.round(triangles),
    });
  };

  // Center on X/Y and snap lowest vertex flush to Z = 0 on millimeter GridHelper
  const loadGeometry = useCallback((geometry: THREE.BufferGeometry) => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return;

    currentGeomRef.current = geometry;
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    // Snap center X, center Y to 0, and snap min Z to 0.0
    // (In Three.js standard coordinates, Y is Up or Z is Up depending on orientation;
    // photogrammetry build plates use horizontal ground at Y=0 or Z=0. We orient ground on Y=0)
    geometry.translate(-center.x, -bbox.min.y, -center.z);
    geometry.computeVertexNormals();

    if (currentMeshRef.current) {
      sceneRef.current.remove(currentMeshRef.current);
      currentMeshRef.current.geometry.dispose();
      (currentMeshRef.current.material as THREE.Material).dispose();
      currentMeshRef.current = null;
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0x00e599,
      roughness: 0.35,
      metalness: 0.2,
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
    const radius = Math.max(25, sphere.radius);
    cameraRef.current.position.set(radius * 2.2, radius * 1.8, radius * 2.5);
    controlsRef.current.target.set(0, radius * 0.5, 0);
    controlsRef.current.update();
  }, [isWireframe]);

  // Initialize Three.js WebGL Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090b0e);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
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

    // Millimeter GridHelper
    const gridHelper = new THREE.GridHelper(200, 40, 0x1e2430, 0x12161f);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight1.position.set(100, 150, 100);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x00e599, 0.4);
    dirLight2.position.set(-100, 80, -100);
    scene.add(dirLight2);

    // Initial default sample mesh
    const defaultGeom = createMechanicalBracketGeometry();
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

    // Render loop
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
  const handleResetView = () => {
    if (!currentGeomRef.current || !cameraRef.current || !controlsRef.current) return;
    currentGeomRef.current.computeBoundingSphere();
    const sphere = currentGeomRef.current.boundingSphere!;
    const radius = Math.max(25, sphere.radius);
    cameraRef.current.position.set(radius * 2.2, radius * 1.8, radius * 2.5);
    controlsRef.current.target.set(0, radius * 0.5, 0);
    controlsRef.current.update();
  };

  // Drag and drop or file upload loader
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
        alert('Invalid STL file. Please upload a binary or ASCII STL mesh.');
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

  // Download STL locally
  const handleDownloadStl = () => {
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
      className="relative w-full h-[calc(100vh-4rem)] bg-[#090b0e] flex flex-col select-none overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Top Floating Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-[#12161f]/90 backdrop-blur-md border border-[#1e2430] p-1.5 rounded-lg text-xs font-mono">
        <span className="text-[#94a3b8] px-2 truncate max-w-[180px]">{modelName}</span>
        <div className="h-4 w-[1px] bg-[#1e2430]" />
        <button
          onClick={() => setIsWireframe(!isWireframe)}
          className={`px-3 py-1 rounded transition ${
            isWireframe
              ? 'bg-[#00e599] text-[#090b0e] font-bold'
              : 'bg-[#181e2b] text-[#f1f5f9] hover:bg-[#20293a]'
          }`}
        >
          {isWireframe ? 'Wireframe ON' : 'Solid Shading'}
        </button>
        <button
          onClick={handleResetView}
          className="flex items-center gap-1 px-3 py-1 rounded bg-[#181e2b] text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#20293a] transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset View</span>
        </button>
      </div>

      {/* Top Right File Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {/* Sample presets switcher */}
        <button
          onClick={() => {
            setModelName('mechanical-bracket.stl');
            loadGeometry(createMechanicalBracketGeometry());
          }}
          className="px-2.5 py-1.5 rounded-lg bg-[#12161f]/90 backdrop-blur-md border border-[#1e2430] text-xs font-mono text-[#94a3b8] hover:text-[#00e599] transition"
        >
          Bracket
        </button>
        <button
          onClick={() => {
            setModelName('turbine-impeller.stl');
            loadGeometry(createTurbineImpellerGeometry());
          }}
          className="px-2.5 py-1.5 rounded-lg bg-[#12161f]/90 backdrop-blur-md border border-[#1e2430] text-xs font-mono text-[#94a3b8] hover:text-[#00e599] transition"
        >
          Impeller
        </button>

        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#12161f]/90 backdrop-blur-md border border-[#1e2430] hover:border-[#00e599]/50 text-xs font-mono text-[#f1f5f9] cursor-pointer transition">
          <Upload className="w-3.5 h-3.5 text-[#00e599]" />
          <span>Upload .STL</span>
          <input
            type="file"
            accept=".stl"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="hidden"
          />
        </label>

        <button
          onClick={handleDownloadStl}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00e599] hover:bg-[#00e599]/90 text-xs font-mono font-bold text-[#090b0e] transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export STL</span>
        </button>
      </div>

      {/* WebGL Viewport */}
      <div ref={mountRef} className="w-full h-full flex-1" />

      {/* Bottom Millimeter Readout & Topology Overlay */}
      <div className="absolute bottom-4 left-4 z-10 bg-[#12161f]/95 backdrop-blur-md border border-[#1e2430] p-3 rounded-xl flex items-center gap-5 text-xs font-mono">
        <div>
          <span className="text-[10px] uppercase text-[#94a3b8] block">Bounding Box (L × W × H)</span>
          <span className="text-[#f1f5f9] font-bold tabular-nums">
            {telemetry.dimX} × {telemetry.dimY} × {telemetry.dimZ} <span className="text-[#00e599]">mm</span>
          </span>
        </div>

        <div className="h-6 w-[1px] bg-[#1e2430]" />

        <div>
          <span className="text-[10px] uppercase text-[#94a3b8] block">Triangles</span>
          <span className="text-[#f1f5f9] font-bold tabular-nums">{telemetry.triangles.toLocaleString()}</span>
        </div>

        <div className="h-6 w-[1px] bg-[#1e2430]" />

        <div>
          <span className="text-[10px] uppercase text-[#94a3b8] block">Grid Scale</span>
          <span className="text-[#00e599] font-bold tabular-nums">5 mm / div</span>
        </div>
      </div>
    </div>
  );
};
