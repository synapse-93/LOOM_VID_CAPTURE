import {
  createBottleSampleMesh,
} from './mlpLoader';
import {
  createShoeModelGeometry,
  geometryToBinaryStl,
  getGeometryMetrics,
} from '../utils/stlGenerators';

export type SourceType = 'CAMERA' | 'UPLOAD' | 'MLP_PROJECT' | 'SAMPLE';
export type ProjectStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'NEEDS_MESH' | 'FAILED';

export interface PipelineLog {
  timestamp: string;
  stage: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
}

export interface ProjectMetrics {
  triangles: number;
  dimensionsMm: [number, number, number]; // [X, Y, Z]
  volumeCm3: number;
  layerCount?: number;
}

export interface MeshAssetFile {
  name: string;
  buffer: ArrayBuffer;
}

export interface MeshAssets {
  primaryFilename: string;
  format: 'stl' | 'ply' | 'obj' | 'mlp';
  mlpXml?: string;
  files: MeshAssetFile[];
}

export interface ScanProject {
  id: string;
  name: string;
  createdAt: number;
  sourceType: SourceType;
  status: ProjectStatus;
  durationSec?: number;
  fileSize?: number;
  videoBlob?: Blob;
  videoUrl?: string;
  meshAssets?: MeshAssets;
  metrics?: ProjectMetrics;
  logs?: PipelineLog[];
  currentStageIndex?: number;
  currentStageName?: string;
  progressPercent?: number;
  missingFilenames?: string[];
}

const DB_NAME = 'loom_workstation_db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in current environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllProjects(): Promise<ScanProject[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const results = (req.result as ScanProject[]) || [];
        // Sort descending by creation date
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[projectStore] getAllProjects error:', err);
    return [];
  }
}

export async function getProject(id: string): Promise<ScanProject | undefined> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result as ScanProject | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[projectStore] getProject error:', err);
    return undefined;
  }
}

export async function saveProject(project: ScanProject): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(project);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[projectStore] saveProject error:', err);
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[projectStore] deleteProject error:', err);
  }
}

/**
 * Ensures the pre-seeded CAD projects exist on first visit:
 * 1. Bottle_clean_final.mlp (MeshLab project referencing meshed-poisson.ply)
 * 2. shoe_3_master_280mm.stl (Calibrated 280mm master print model)
 */
export async function ensurePreSeeded(): Promise<ScanProject[]> {
  const existing = await getAllProjects();
  if (existing.length > 0) {
    return existing;
  }

  const seeded: ScanProject[] = [];
  const now = Date.now();

  // 1. Pre-seed Bottle_clean_final.mlp
  try {
    const bottleGeom = createBottleSampleMesh(240);
    const bottleStl = geometryToBinaryStl(bottleGeom);
    const bottleMetrics = getGeometryMetrics(bottleGeom);

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

    const bottleProject: ScanProject = {
      id: 'proj-sample-bottle-mlp',
      name: 'Bottle_clean_final.mlp',
      createdAt: now - 3600000 * 2, // 2 hours ago
      sourceType: 'MLP_PROJECT',
      status: 'COMPLETED',
      fileSize: bottleStl.byteLength + bottleXml.length,
      metrics: {
        triangles: bottleMetrics.triangles,
        dimensionsMm: bottleMetrics.dimensionsMm,
        volumeCm3: bottleMetrics.volumeCm3,
        layerCount: 1,
      },
      meshAssets: {
        primaryFilename: 'Bottle_clean_final.mlp',
        format: 'mlp',
        mlpXml: bottleXml,
        files: [
          {
            name: 'meshed-poisson.ply',
            buffer: bottleStl,
          },
          {
            name: 'Bottle_clean_final.mlp',
            buffer: new TextEncoder().encode(bottleXml).buffer as ArrayBuffer,
          },
        ],
      },
      logs: [
        {
          timestamp: '00:00:01.120',
          stage: 'KEYFRAME_SELECTION',
          message: 'Ingested 240 frames @ 1080p, variance filter passed 196 keyframes',
          level: 'info',
        },
        {
          timestamp: '00:00:02.840',
          stage: 'SPARSE_RECONSTRUCTION',
          message: 'Bundle adjustment converged with 42,108 3D tie points, mean reproj err = 0.42px',
          level: 'info',
        },
        {
          timestamp: '00:00:04.510',
          stage: 'SURFACE_POISSON',
          message: 'Screened Poisson depth 10 reconstruction completed (18,432 triangles)',
          level: 'info',
        },
        {
          timestamp: '00:00:05.200',
          stage: 'WATERTIGHT_MANIFOLD',
          message: 'Planar baseplate sealed at Z = 0.000 mm. Manifold integrity verified.',
          level: 'success',
        },
      ],
      progressPercent: 100,
      currentStageIndex: 8,
      currentStageName: 'BINARY_STL_EXPORT',
    };

    await saveProject(bottleProject);
    seeded.push(bottleProject);
  } catch (err) {
    console.error('[projectStore] Failed to seed Bottle_clean_final.mlp:', err);
  }

  // 2. Pre-seed shoe_3_master_280mm.stl
  try {
    const shoeGeom = createShoeModelGeometry(280);
    const shoeStl = geometryToBinaryStl(shoeGeom);
    const shoeMetrics = getGeometryMetrics(shoeGeom);

    const shoeProject: ScanProject = {
      id: 'proj-sample-shoe-stl',
      name: 'shoe_3_master_280mm.stl',
      createdAt: now - 3600000 * 5, // 5 hours ago
      sourceType: 'SAMPLE',
      status: 'COMPLETED',
      fileSize: shoeStl.byteLength,
      metrics: {
        triangles: shoeMetrics.triangles,
        dimensionsMm: shoeMetrics.dimensionsMm,
        volumeCm3: shoeMetrics.volumeCm3,
        layerCount: 1,
      },
      meshAssets: {
        primaryFilename: 'shoe_3_master_280mm.stl',
        format: 'stl',
        files: [
          {
            name: 'shoe_3_master_280mm.stl',
            buffer: shoeStl,
          },
        ],
      },
      logs: [
        {
          timestamp: '00:00:01.050',
          stage: 'KEYFRAME_SELECTION',
          message: 'Ingested 360° circular trajectory, 280 high-contrast keyframes locked',
          level: 'info',
        },
        {
          timestamp: '00:00:03.210',
          stage: 'DENSE_MVS',
          message: 'PatchMatch dense depth map fusion generated 1.2M point cloud',
          level: 'info',
        },
        {
          timestamp: '00:00:04.900',
          stage: 'METRIC_SCALING',
          message: 'Millimeter gauge alignment confirmed total sole length = 280.0 mm',
          level: 'info',
        },
        {
          timestamp: '00:00:05.620',
          stage: 'BINARY_STL_EXPORT',
          message: 'Binary Little-Endian STL exported cleanly. Ready for Formlabs / Bambu slicer.',
          level: 'success',
        },
      ],
      progressPercent: 100,
      currentStageIndex: 8,
      currentStageName: 'BINARY_STL_EXPORT',
    };

    await saveProject(shoeProject);
    seeded.push(shoeProject);
  } catch (err) {
    console.error('[projectStore] Failed to seed shoe_3_master_280mm.stl:', err);
  }

  return seeded;
}
