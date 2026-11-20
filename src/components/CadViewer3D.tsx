import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  RotateCcw,
  Sliders,
  AlertTriangle,
  Upload,
  Layers,
  FileCode,
  Box,
} from 'lucide-react';
import { ScanProject, saveProject } from '../lib/projectStore';
import {
  loadGeometryFromBuffer,
  parseMlpDocument,
  getBasename,
  MlpLayer,
} from '../lib/mlpLoader';

interface CadViewer3DProps {
  project?: ScanProject | null;
  onProjectUpdated?: (updated: ScanProject) => void;
  onOpenUpload?: () => void;
}

export const CadViewer3D: React.FC<CadViewer3DProps> = ({
  project,
  onProjectUpdated,
  onOpenUpload,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const companionInputRef = useRef<HTMLInputElement>(null);

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const clipPlaneRef = useRef<THREE.Plane | null>(null);

  // Viewport Settings
  const [renderMode, setRenderMode] = useState<'SOLID' | 'WIREFRAME' | 'XRAY'>('SOLID');
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipPercent, setClipPercent] = useState(100); // 0 to 100%
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // MLP Layer Inspection
  const [mlpLayers, setMlpLayers] = useState<MlpLayer[]>([]);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [modelBounds, setModelBounds] = useState<{ min: number; max: number }>({ min: 0, max: 100 });

  // Initialize Three.js WebGL Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0C0D0F);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(160, 140, 200);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 3000;
    controls.minDistance = 5;
    controlsRef.current = controls;

    // 3-Point Studio + Hemisphere Lighting
    const hemiLight = new THREE.HemisphereLight(0xECEEF2, 0x0C0D0F, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xFFFFFF, 1.3);
    keyLight.position.set(200, 300, 200);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8A909E, 0.5);
    fillLight.position.set(-200, 100, -200);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xECEEF2, 0.85);
    rimLight.position.set(0, 250, -300);
    scene.add(rimLight);

    // Formlabs-style precision build-plate millimeter grid at Y = 0.000 mm
    const grid = new THREE.GridHelper(300, 30, 0x262930, 0x1A1D21);
    grid.position.y = 0;
    scene.add(grid);
    gridHelperRef.current = grid;

    // Clipping plane along Y-axis (height)
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);
    clipPlaneRef.current = clipPlane;

    // Animation Render Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update clipping plane height
  useEffect(() => {
    if (!clipPlaneRef.current) return;
    if (!clipEnabled) {
      clipPlaneRef.current.constant = 10000;
    } else {
      const { min, max } = modelBounds;
      const height = max - min;
      const cutY = min + (height * clipPercent) / 100;
      clipPlaneRef.current.constant = cutY;
    }
  }, [clipEnabled, clipPercent, modelBounds]);

  // Apply Render Mode Material (SOLID / WIREFRAME / XRAY)
  useEffect(() => {
    if (!currentGroupRef.current) return;

    currentGroupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const geom = mesh.geometry;
        const hasColors = !!geom.getAttribute('color');

        if (renderMode === 'SOLID') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: hasColors ? 0xffffff : 0xECEEF2,
            roughness: 0.35,
            metalness: 0.12,
            wireframe: false,
            side: THREE.DoubleSide,
            clippingPlanes: clipEnabled && clipPlaneRef.current ? [clipPlaneRef.current] : [],
            clipShadows: true,
            vertexColors: hasColors,
          });
        } else if (renderMode === 'WIREFRAME') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0x10B981,
            wireframe: true,
            side: THREE.DoubleSide,
            clippingPlanes: clipEnabled && clipPlaneRef.current ? [clipPlaneRef.current] : [],
          });
        } else if (renderMode === 'XRAY') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0x8A909E,
            roughness: 0.2,
            metalness: 0.1,
            transparent: true,
            opacity: 0.38,
            wireframe: false,
            side: THREE.DoubleSide,
            clippingPlanes: clipEnabled && clipPlaneRef.current ? [clipPlaneRef.current] : [],
          });
        }
      }
    });
  }, [renderMode, clipEnabled]);

  // Load and Render Active Project's Geometry
  const loadProjectMesh = useCallback(() => {
    if (!sceneRef.current || !project || !project.meshAssets) return;

    // Clean up previous group
    if (currentGroupRef.current) {
      sceneRef.current.remove(currentGroupRef.current);
      currentGroupRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material?.dispose();
          }
        }
      });
      currentGroupRef.current = null;
    }

    const { format, mlpXml, files } = project.meshAssets;
    const group = new THREE.Group();
    group.name = project.name;

    // Handle MeshLab Project (.mlp)
    if (format === 'mlp' && mlpXml) {
      const { layers } = parseMlpDocument(mlpXml, project.name);
      const companionMap = new Map<string, ArrayBuffer>();
      files.forEach((f) => {
        companionMap.set(getBasename(f.name).toLowerCase(), f.buffer);
      });

      const missing: string[] = [];

      layers.forEach((layer) => {
        const buffer = companionMap.get(layer.normalizedFilename);
        if (buffer) {
          layer.hasCompanion = true;
          try {
            const geom = loadGeometryFromBuffer(layer.filename, buffer);
            layer.geometry = geom;

            const material = new THREE.MeshStandardMaterial({
              color: 0xECEEF2,
              roughness: 0.35,
              metalness: 0.12,
              side: THREE.DoubleSide,
              clippingPlanes: clipEnabled && clipPlaneRef.current ? [clipPlaneRef.current] : [],
              clipShadows: true,
            });

            const mesh = new THREE.Mesh(geom, material);
            mesh.applyMatrix4(layer.transformMatrix);
            mesh.visible = layer.visible;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            layer.mesh = mesh;
            group.add(mesh);
          } catch (err) {
            console.error('[CadViewer3D] Error parsing companion file:', layer.filename, err);
          }
        } else {
          missing.push(layer.filename || layer.normalizedFilename);
        }
      });

      setMlpLayers(layers);
      setMissingFiles(missing);
    } else {
      // Handle Standard CAD Models (.stl, .ply, .obj)
      setMlpLayers([]);
      setMissingFiles([]);

      const primary = files.find((f) => {
        const l = f.name.toLowerCase();
        return l.endsWith('.stl') || l.endsWith('.ply') || l.endsWith('.obj');
      }) || files[0];

      if (primary) {
        try {
          const geom = loadGeometryFromBuffer(primary.name, primary.buffer);
          const material = new THREE.MeshStandardMaterial({
            color: 0xECEEF2,
            roughness: 0.35,
            metalness: 0.12,
            side: THREE.DoubleSide,
            clippingPlanes: clipEnabled && clipPlaneRef.current ? [clipPlaneRef.current] : [],
            clipShadows: true,
          });

          const mesh = new THREE.Mesh(geom, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        } catch (err) {
          console.error('[CadViewer3D] Error parsing primary mesh:', primary.name, err);
        }
      }
    }

    if (group.children.length > 0) {
      // Compute bounding box and snap flush to Y = 0.000 mm
      const bbox = new THREE.Box3().setFromObject(group);
      const center = new THREE.Vector3();
      bbox.getCenter(center);

      group.position.set(-center.x, -bbox.min.y, -center.z);
      sceneRef.current.add(group);
      currentGroupRef.current = group;

      // Update model bounds for Z/Y clipping slider
      setModelBounds({ min: 0, max: bbox.max.y - bbox.min.y });

      // Auto-fit camera framing
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 50);

      if (cameraRef.current && controlsRef.current) {
        cameraRef.current.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.7);
        controlsRef.current.target.set(0, size.y * 0.45, 0);
        controlsRef.current.update();
      }
    }
  }, [project, clipEnabled]);

  useEffect(() => {
    loadProjectMesh();
  }, [loadProjectMesh]);

  // Reset Camera View
  const handleResetCamera = () => {
    if (!currentGroupRef.current || !cameraRef.current || !controlsRef.current) return;
    const bbox = new THREE.Box3().setFromObject(currentGroupRef.current);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 50);

    cameraRef.current.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.7);
    controlsRef.current.target.set(0, size.y * 0.45, 0);
    controlsRef.current.update();
  };

  // Attach companion files for an .mlp project missing meshes
  const handleAttachCompanionFiles = async (fileList: FileList | File[]) => {
    if (!project || !project.meshAssets) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const newFiles = [...project.meshAssets.files];

    for (const f of files) {
      const buffer = await f.arrayBuffer();
      // Replace if existing or append
      const existingIdx = newFiles.findIndex((nf) => nf.name.toLowerCase() === f.name.toLowerCase());
      if (existingIdx >= 0) {
        newFiles[existingIdx] = { name: f.name, buffer };
      } else {
        newFiles.push({ name: f.name, buffer });
      }
    }

    const updatedAssets = {
      ...project.meshAssets,
      files: newFiles,
    };

    // Re-verify missing files
    const companionMap = new Set(newFiles.map((f) => getBasename(f.name).toLowerCase()));
    const remainingMissing = missingFiles.filter((m) => !companionMap.has(getBasename(m).toLowerCase()));

    const updatedProject: ScanProject = {
      ...project,
      status: remainingMissing.length === 0 ? 'COMPLETED' : 'NEEDS_MESH',
      meshAssets: updatedAssets,
      missingFilenames: remainingMissing,
    };

    await saveProject(updatedProject);
    onProjectUpdated?.(updatedProject);
  };

  // Direct Drag & Drop onto 3D Canvas
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const onDragLeave = () => {
    setIsDraggingOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (missingFiles.length > 0) {
        handleAttachCompanionFiles(e.dataTransfer.files);
      }
    }
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative w-full h-full bg-[#0C0D0F] select-none overflow-hidden"
    >
      {/* Hidden File Input for Attaching Companion Meshes */}
      <input
        ref={companionInputRef}
        type="file"
        multiple
        accept=".ply,.stl,.obj"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleAttachCompanionFiles(e.target.files);
          }
        }}
      />

      {/* Three.js Canvas Container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Top Floating Viewport Control Toolbar */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-20 font-mono text-xs">
        {/* Render Style Mode Selector */}
        <div className="bg-[#131518] border border-[#262930] rounded p-0.5 flex items-center gap-0.5">
          {(['SOLID', 'WIREFRAME', 'XRAY'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setRenderMode(mode)}
              className={`px-2.5 py-1 rounded transition text-[11px] ${
                renderMode === mode
                  ? 'bg-[#1A1D21] border border-[#262930] text-[#ECEEF2] font-semibold'
                  : 'text-[#8A909E] hover:text-[#ECEEF2]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Reset Camera View Button */}
        <button
          onClick={handleResetCamera}
          className="p-1.5 rounded bg-[#131518] border border-[#262930] text-[#8A909E] hover:text-[#ECEEF2] transition"
          title="Reset Camera (Fit Frame)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Z-Slice Clipping Toggle */}
        <button
          onClick={() => setClipEnabled(!clipEnabled)}
          className={`px-2.5 py-1 rounded border transition flex items-center gap-1.5 text-[11px] ${
            clipEnabled
              ? 'bg-[#1A1D21] border-[#10B981] text-[#10B981]'
              : 'bg-[#131518] border-[#262930] text-[#8A909E] hover:text-[#ECEEF2]'
          }`}
          title="Toggle Internal Cross-Section Cut Plane"
        >
          <Sliders className="w-3 h-3" />
          Z-SLICE
        </button>
      </div>

      {/* Z-Slice Cross-Section Cut Slider (When Clip Active) */}
      {clipEnabled && (
        <div className="absolute top-14 left-3 bg-[#131518] border border-[#262930] rounded p-2 z-20 font-mono text-[11px] flex items-center gap-3">
          <span className="text-[#8A909E] whitespace-nowrap">CUT PLANE:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={clipPercent}
            onChange={(e) => setClipPercent(Number(e.target.value))}
            className="w-32 accent-[#10B981] cursor-pointer"
          />
          <span className="text-[#ECEEF2] tabular-nums w-8">{clipPercent}%</span>
        </div>
      )}

      {/* Empty State / No Project Loaded Overlay */}
      {!project && (
        <div className="absolute inset-0 bg-[#0C0D0F]/90 flex flex-col items-center justify-center p-6 text-center z-10 pointer-events-auto">
          <div className="w-12 h-12 rounded border border-[#262930] bg-[#131518] flex items-center justify-center text-[#ECEEF2] mb-3">
            <Box className="w-6 h-6 text-[#8A909E]" />
          </div>
          <h3 className="font-mono text-sm font-semibold text-[#ECEEF2] uppercase tracking-wider mb-1">
            NO CAD MODEL ACTIVE
          </h3>
          <p className="font-mono text-xs text-[#8A909E] max-w-sm mb-4 leading-relaxed">
            Select a completed scan from Project History on the left, or upload a 3D model.
          </p>
          <button
            onClick={onOpenUpload}
            className="px-4 py-2 rounded bg-[#ECEEF2] text-[#0C0D0F] font-mono text-xs font-semibold hover:bg-white transition flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            OPEN UPLOAD WORKSTATION
          </button>
        </div>
      )}

      {/* Missing Companion Mesh Alert Overlay (For .MLP with missing referenced files) */}
      {project && missingFiles.length > 0 && (
        <div className="absolute top-3 right-3 max-w-sm bg-[#131518] border border-[#F59E0B] rounded-md p-3.5 z-30 font-mono text-xs">
          <div className="flex items-center gap-2 text-[#F59E0B] font-semibold mb-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>MISSING COMPANION 3D MESH</span>
          </div>
          <p className="text-[11px] text-[#8A909E] mb-2 leading-relaxed">
            This MeshLab Project references external geometry files that were not included in the payload:
          </p>
          <div className="bg-[#0C0D0F] border border-[#262930] rounded p-2 mb-3 max-h-24 overflow-y-auto">
            {missingFiles.map((fn, idx) => (
              <div key={idx} className="text-[10px] text-[#F59E0B] flex items-center gap-1.5 truncate">
                <FileCode className="w-3 h-3 shrink-0" />
                <span className="truncate">{fn}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => companionInputRef.current?.click()}
            className="w-full py-1.5 rounded bg-[#F59E0B] text-[#0C0D0F] font-semibold hover:brightness-110 transition flex items-center justify-center gap-1.5 text-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            ATTACH REFERENCED MESH (.PLY / .STL)
          </button>
        </div>
      )}

      {/* Layer List HUD in Bottom-Left (For .MLP files) */}
      {project && mlpLayers.length > 0 && (
        <div className="absolute bottom-3 left-3 bg-[#131518] border border-[#262930] rounded-md p-2.5 z-20 font-mono text-[11px] max-w-xs">
          <div className="flex items-center justify-between mb-1.5 text-[#8A909E] text-[10px] tracking-wider uppercase">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              MLP LAYERS ({mlpLayers.length})
            </span>
            <span>STATUS</span>
          </div>
          <div className="space-y-1">
            {mlpLayers.map((layer, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 p-1 rounded bg-[#0C0D0F] border border-[#262930]"
              >
                <span className="text-[#ECEEF2] truncate max-w-[150px]">{layer.label}</span>
                <span
                  className={`text-[10px] px-1 py-0.2 rounded font-semibold ${
                    layer.hasCompanion
                      ? 'text-[#10B981] bg-[#10B981]/10'
                      : 'text-[#F59E0B] bg-[#F59E0B]/10'
                  }`}
                >
                  {layer.hasCompanion ? 'LINKED' : 'MISSING'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drag Over Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-[#0C0D0F]/80 border-2 border-dashed border-[#ECEEF2] flex items-center justify-center z-40 font-mono text-sm text-[#ECEEF2]">
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 animate-bounce text-[#10B981]" />
            <span>DROP COMPANION .PLY / .STL MESH TO LINK</span>
          </div>
        </div>
      )}
    </div>
  );
};
