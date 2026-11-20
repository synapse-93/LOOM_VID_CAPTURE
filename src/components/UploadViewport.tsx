import React, { useState, useRef } from 'react';
import {
  Upload,
  FileVideo,
  Box,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { loadMeshBundle } from '../lib/mlpLoader';
import { ScanProject, saveProject } from '../lib/projectStore';
import {
  createCalibrationPrismGeometry,
  createShoeModelGeometry,
  geometryToBinaryStl,
  getGeometryMetrics,
} from '../utils/stlGenerators';
import { createBottleSampleMesh } from '../lib/mlpLoader';

interface UploadViewportProps {
  onVideoUploaded: (file: File) => void;
  onCadProjectLoaded: (project: ScanProject) => void;
}

export const UploadViewport: React.FC<UploadViewportProps> = ({
  onVideoUploaded,
  onCadProjectLoaded,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setIsProcessing(true);
    setStatusMessage('Analyzing dropped payload...');

    // 1. Check if any 3D CAD files were dropped (.mlp, .stl, .ply, .obj)
    const hasCad = files.some((f) => {
      const ext = f.name.toLowerCase().split('.').pop();
      return ext === 'mlp' || ext === 'stl' || ext === 'ply' || ext === 'obj';
    });

    if (hasCad) {
      try {
        setStatusMessage('Resolving 3D mesh layers & transforms...');
        const result = await loadMeshBundle(files);

        const now = Date.now();
        const primaryExt = result.format;
        const isMlp = primaryExt === 'mlp';

        const newProject: ScanProject = {
          id: `proj-cad-${now}`,
          name: result.projectName,
          createdAt: now,
          sourceType: isMlp ? 'MLP_PROJECT' : 'UPLOAD',
          status: result.status === 'MISSING_COMPANION' ? 'NEEDS_MESH' : 'COMPLETED',
          fileSize: result.meshAssets.files.reduce((acc, f) => acc + f.buffer.byteLength, 0),
          meshAssets: result.meshAssets,
          metrics: {
            triangles: result.metrics.triangles,
            dimensionsMm: result.metrics.dimensionsMm,
            volumeCm3: result.metrics.volumeCm3,
            layerCount: result.layers.length,
          },
          missingFilenames: result.missingFilenames,
          logs: [
            {
              timestamp: '00:00:00.000',
              stage: 'IMPORT',
              message: `Imported ${result.projectName} (${result.format.toUpperCase()}) with ${result.layers.length} layers`,
              level: 'info',
            },
            ...(result.status === 'MISSING_COMPANION'
              ? [
                  {
                    timestamp: '00:00:00.020',
                    stage: 'IMPORT',
                    message: `Warning: ${result.missingFilenames.length} referenced companion mesh file(s) missing: ${result.missingFilenames.join(', ')}`,
                    level: 'warn' as const,
                  },
                ]
              : [
                  {
                    timestamp: '00:00:00.020',
                    stage: 'IMPORT',
                    message: `Verified geometry: ${result.metrics.triangles.toLocaleString()} triangles, dimensions ${result.metrics.dimensionsMm[0]} x ${result.metrics.dimensionsMm[1]} x ${result.metrics.dimensionsMm[2]} mm`,
                    level: 'success' as const,
                  },
                ]),
          ],
          progressPercent: 100,
          currentStageIndex: 8,
          currentStageName: 'CAD_LOADED',
        };

        await saveProject(newProject);
        setIsProcessing(false);
        setStatusMessage(null);
        onCadProjectLoaded(newProject);
        return;
      } catch (err: unknown) {
        console.error('[UploadViewport] Failed to load 3D CAD files:', err);
        const error = err as Error;
        setStatusMessage(`CAD Import Error: ${error.message}`);
        setIsProcessing(false);
        return;
      }
    }

    // 2. Check if a video file was dropped (.mp4, .mov, .webm)
    const videoFile = files.find((f) => {
      const ext = f.name.toLowerCase().split('.').pop();
      return ext === 'mp4' || ext === 'mov' || ext === 'webm';
    });

    if (videoFile) {
      setIsProcessing(false);
      setStatusMessage(null);
      onVideoUploaded(videoFile);
      return;
    }

    setIsProcessing(false);
    setStatusMessage('Unsupported file type. Please upload MP4/MOV/WebM video or MLP/STL/PLY/OBJ files.');
  };

  // Drag-and-drop handlers
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Quick loaders for standard calibration/sample models
  const handleLoadSampleBottle = async () => {
    setIsProcessing(true);
    setStatusMessage('Generating MeshLab Project Bottle_clean_final.mlp...');

    const now = Date.now();
    const bottleGeom = createBottleSampleMesh(240);
    const bottleStl = geometryToBinaryStl(bottleGeom);
    const metrics = getGeometryMetrics(bottleGeom);

    const bottleXml = `<!DOCTYPE MeshLabDocument>
<MeshLabProject>
 <MeshGroup>
  <MLMesh label="meshed-poisson.ply" filename="meshed-poisson.ply" visible="1">
   <MLMatrix44>
1.000000 0.000000 0.000000 0.000000 
0.000000 1.000000 0.000000 0.000000 
0.000000 0.000000 1.000000 0.000000 
0.000000 0.000000 0.000000 1.000000 
   </MLMatrix44>
  </MLMesh>
 </MeshGroup>
</MeshLabProject>`;

    const project: ScanProject = {
      id: `proj-bottle-${now}`,
      name: 'Bottle_clean_final.mlp',
      createdAt: now,
      sourceType: 'MLP_PROJECT',
      status: 'COMPLETED',
      fileSize: bottleStl.byteLength + bottleXml.length,
      metrics: {
        triangles: metrics.triangles,
        dimensionsMm: metrics.dimensionsMm,
        volumeCm3: metrics.volumeCm3,
        layerCount: 1,
      },
      meshAssets: {
        primaryFilename: 'Bottle_clean_final.mlp',
        format: 'mlp',
        mlpXml: bottleXml,
        files: [
          { name: 'meshed-poisson.ply', buffer: bottleStl },
          { name: 'Bottle_clean_final.mlp', buffer: new TextEncoder().encode(bottleXml).buffer as ArrayBuffer },
        ],
      },
      progressPercent: 100,
      currentStageIndex: 8,
      currentStageName: 'BINARY_STL_EXPORT',
    };

    await saveProject(project);
    setIsProcessing(false);
    setStatusMessage(null);
    onCadProjectLoaded(project);
  };

  const handleLoadSampleShoe = async () => {
    setIsProcessing(true);
    setStatusMessage('Generating athletic shoe model (280mm EU 43)...');

    const now = Date.now();
    const shoeGeom = createShoeModelGeometry(280);
    const shoeStl = geometryToBinaryStl(shoeGeom);
    const metrics = getGeometryMetrics(shoeGeom);

    const project: ScanProject = {
      id: `proj-shoe-${now}`,
      name: 'shoe_3_master_280mm.stl',
      createdAt: now,
      sourceType: 'SAMPLE',
      status: 'COMPLETED',
      fileSize: shoeStl.byteLength,
      metrics: {
        triangles: metrics.triangles,
        dimensionsMm: metrics.dimensionsMm,
        volumeCm3: metrics.volumeCm3,
        layerCount: 1,
      },
      meshAssets: {
        primaryFilename: 'shoe_3_master_280mm.stl',
        format: 'stl',
        files: [{ name: 'shoe_3_master_280mm.stl', buffer: shoeStl }],
      },
      progressPercent: 100,
      currentStageIndex: 8,
      currentStageName: 'BINARY_STL_EXPORT',
    };

    await saveProject(project);
    setIsProcessing(false);
    setStatusMessage(null);
    onCadProjectLoaded(project);
  };

  const handleLoadCalibrationPrism = async () => {
    setIsProcessing(true);
    setStatusMessage('Generating stepped prism calibration gauge block...');

    const now = Date.now();
    const prismGeom = createCalibrationPrismGeometry();
    const prismStl = geometryToBinaryStl(prismGeom);
    const metrics = getGeometryMetrics(prismGeom);

    const project: ScanProject = {
      id: `proj-prism-${now}`,
      name: 'calibration_prism_gauge.stl',
      createdAt: now,
      sourceType: 'SAMPLE',
      status: 'COMPLETED',
      fileSize: prismStl.byteLength,
      metrics: {
        triangles: metrics.triangles,
        dimensionsMm: metrics.dimensionsMm,
        volumeCm3: metrics.volumeCm3,
        layerCount: 1,
      },
      meshAssets: {
        primaryFilename: 'calibration_prism_gauge.stl',
        format: 'stl',
        files: [{ name: 'calibration_prism_gauge.stl', buffer: prismStl }],
      },
      progressPercent: 100,
      currentStageIndex: 8,
      currentStageName: 'BINARY_STL_EXPORT',
    };

    await saveProject(project);
    setIsProcessing(false);
    setStatusMessage(null);
    onCadProjectLoaded(project);
  };

  return (
    <div className="w-full h-full bg-[#0C0D0F] p-6 flex flex-col justify-between overflow-y-auto select-none">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".mp4,.mov,.webm,.mlp,.stl,.ply,.obj"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleFiles(e.target.files);
          }
        }}
      />

      {/* Main Drag & Drop Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex-1 border-2 border-dashed rounded-md flex flex-col items-center justify-center p-8 text-center cursor-pointer transition ${
          isDragging
            ? 'border-[#ECEEF2] bg-[#1A1D21]'
            : 'border-[#262930] hover:border-[#8A909E] bg-[#131518]'
        }`}
      >
        <div className="w-14 h-14 rounded border border-[#262930] bg-[#0C0D0F] flex items-center justify-center text-[#ECEEF2] mb-4">
          <Upload className="w-7 h-7" />
        </div>

        <h3 className="font-mono text-sm font-semibold text-[#ECEEF2] uppercase tracking-wider mb-1">
          INGEST VIDEO OR 3D CAD DATA
        </h3>
        <p className="font-mono text-xs text-[#8A909E] max-w-md mb-6 leading-relaxed">
          Drop a video file to execute the 8-stage photogrammetry pipeline, or drop 3D CAD files (.mlp, .stl, .ply, .obj) for direct inspection.
        </p>

        {/* Accepted Formats Tags */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6 font-mono text-[11px]">
          <span className="px-2.5 py-1 bg-[#0C0D0F] border border-[#262930] rounded text-[#ECEEF2] flex items-center gap-1.5">
            <FileVideo className="w-3.5 h-3.5 text-[#8A909E]" />
            MP4 / MOV / WEBM
          </span>
          <span className="px-2.5 py-1 bg-[#0C0D0F] border border-[#262930] rounded text-[#10B981] flex items-center gap-1.5 font-semibold">
            <Layers className="w-3.5 h-3.5 text-[#10B981]" />
            .MLP (MESHLAB PROJECT)
          </span>
          <span className="px-2.5 py-1 bg-[#0C0D0F] border border-[#262930] rounded text-[#ECEEF2] flex items-center gap-1.5">
            <Box className="w-3.5 h-3.5 text-[#8A909E]" />
            STL / PLY / OBJ
          </span>
        </div>

        <button
          type="button"
          className="px-4 py-2 rounded bg-[#ECEEF2] text-[#0C0D0F] font-mono text-xs font-semibold hover:bg-white transition flex items-center gap-2"
        >
          BROWSE LOCAL FILES
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        {statusMessage && (
          <div className="mt-4 px-3 py-1.5 rounded bg-[#1A1D21] border border-[#262930] font-mono text-xs text-[#ECEEF2]">
            {isProcessing && <span className="inline-block w-2 h-2 rounded-full bg-[#10B981] animate-ping mr-2" />}
            {statusMessage}
          </div>
        )}
      </div>

      {/* Preset CAD Sample Models */}
      <div className="mt-6 pt-4 border-t border-[#262930]">
        <div className="flex items-center justify-between mb-3 font-mono">
          <span className="text-[11px] text-[#8A909E] uppercase tracking-wider">
            CALIBRATION & REFERENCE SAMPLES
          </span>
          <span className="text-[10px] text-[#8A909E]">
            ZERO-DOWNLOAD BROWSER PREVIEW
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
          <button
            onClick={handleLoadSampleBottle}
            className="p-3 rounded bg-[#131518] border border-[#262930] hover:border-[#8A909E] text-left transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[#ECEEF2]">Bottle_clean_final.mlp</span>
                <span className="px-1.5 py-0.2 rounded bg-[#0C0D0F] border border-[#262930] text-[10px] text-[#10B981]">
                  MLP
                </span>
              </div>
              <p className="text-[11px] text-[#8A909E] mb-2">
                Screened Poisson mesh with MLMatrix44 transform matrix.
              </p>
            </div>
            <span className="text-[10px] text-[#8A909E]">240.0 mm / 18,432 tris</span>
          </button>

          <button
            onClick={handleLoadSampleShoe}
            className="p-3 rounded bg-[#131518] border border-[#262930] hover:border-[#8A909E] text-left transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[#ECEEF2]">shoe_3_master_280mm.stl</span>
                <span className="px-1.5 py-0.2 rounded bg-[#0C0D0F] border border-[#262930] text-[10px] text-[#ECEEF2]">
                  STL
                </span>
              </div>
              <p className="text-[11px] text-[#8A909E] mb-2">
                Athletic shoe scan scaled to calibrated EU 43 dimension.
              </p>
            </div>
            <span className="text-[10px] text-[#8A909E]">280.0 mm / 34,180 tris</span>
          </button>

          <button
            onClick={handleLoadCalibrationPrism}
            className="p-3 rounded bg-[#131518] border border-[#262930] hover:border-[#8A909E] text-left transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[#ECEEF2]">calibration_prism.stl</span>
                <span className="px-1.5 py-0.2 rounded bg-[#0C0D0F] border border-[#262930] text-[10px] text-[#ECEEF2]">
                  STL
                </span>
              </div>
              <p className="text-[11px] text-[#8A909E] mb-2">
                Stepped industrial prism gauge with alignment bosses.
              </p>
            </div>
            <span className="text-[10px] text-[#8A909E]">60.0 x 40.0 x 45.0 mm</span>
          </button>
        </div>
      </div>
    </div>
  );
};

