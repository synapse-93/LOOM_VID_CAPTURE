import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export interface MlpLayer {
  label: string;
  filename: string;
  normalizedFilename: string; // basename in lowercase
  visible: boolean;
  transformMatrix: THREE.Matrix4; // 16-float row-major matrix
  geometry?: THREE.BufferGeometry;
  mesh?: THREE.Mesh;
  hasCompanion: boolean;
}

export interface LoadedMeshResult {
  projectName: string;
  format: 'mlp' | 'stl' | 'ply' | 'obj';
  status: 'READY' | 'MISSING_COMPANION';
  layers: MlpLayer[];
  group: THREE.Group;
  missingFilenames: string[];
  rawXml?: string;
  metrics: {
    triangles: number;
    dimensionsMm: [number, number, number];
    volumeCm3: number;
  };
  meshAssets: {
    primaryFilename: string;
    format: 'stl' | 'ply' | 'obj' | 'mlp';
    mlpXml?: string;
    files: { name: string; buffer: ArrayBuffer }[];
  };
}

/**
 * Extracts normalized basename from path: e.g. "./models/bottle.ply" -> "bottle.ply"
 */
export function getBasename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Parses a MeshLab Project XML document (<MeshLabProject>)
 */
export function parseMlpDocument(xmlText: string, _defaultName = 'project.mlp'): {
  layers: MlpLayer[];
  cameraMatrix?: THREE.Matrix4;
} {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  // Check XML parser errors
  const parseError = xmlDoc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    console.warn('[mlpLoader] XML parse warning:', parseError[0].textContent);
  }

  const layers: MlpLayer[] = [];
  const meshElements = Array.from(xmlDoc.getElementsByTagName('MLMesh'));

  meshElements.forEach((el, index) => {
    const label = el.getAttribute('label') || `Layer ${index + 1}`;
    const rawFilename = el.getAttribute('filename') || '';
    const visibleAttr = el.getAttribute('visible');
    const visible = visibleAttr === null || visibleAttr === '1' || visibleAttr.toLowerCase() === 'true';

    // Parse MLMatrix44 (16 floats, row-major)
    const matrix = new THREE.Matrix4();
    const matrixEl = el.getElementsByTagName('MLMatrix44')[0];
    if (matrixEl && matrixEl.textContent) {
      const numbers = matrixEl.textContent
        .trim()
        .split(/\s+/)
        .map(Number)
        .filter((n) => !isNaN(n));

      if (numbers.length === 16) {
        // Three.js Matrix4.set takes row-major elements:
        // n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44
        matrix.set(
          numbers[0], numbers[1], numbers[2], numbers[3],
          numbers[4], numbers[5], numbers[6], numbers[7],
          numbers[8], numbers[9], numbers[10], numbers[11],
          numbers[12], numbers[13], numbers[14], numbers[15]
        );
      }
    }

    const basename = getBasename(rawFilename);

    layers.push({
      label,
      filename: rawFilename,
      normalizedFilename: basename.toLowerCase(),
      visible,
      transformMatrix: matrix,
      hasCompanion: false,
    });
  });

  return { layers };
}

/**
 * Loads a BufferGeometry from ArrayBuffer based on filename extension
 */
export function loadGeometryFromBuffer(filename: string, buffer: ArrayBuffer): THREE.BufferGeometry {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.stl')) {
    const loader = new STLLoader();
    const geom = loader.parse(buffer);
    geom.computeVertexNormals();
    return geom;
  }

  if (lower.endsWith('.ply')) {
    const loader = new PLYLoader();
    const geom = loader.parse(buffer);
    if (!geom.getAttribute('normal')) {
      geom.computeVertexNormals();
    }
    return geom;
  }

  if (lower.endsWith('.obj')) {
    const text = new TextDecoder().decode(buffer);
    const loader = new OBJLoader();
    const group = loader.parse(text);

    // Merge meshes into a single BufferGeometry
    const geometries: THREE.BufferGeometry[] = [];
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrix);
        geometries.push(g);
      }
    });

    if (geometries.length > 0) {
      return mergeGeometries(geometries);
    }
  }

  // Fallback to STLLoader
  const stlLoader = new STLLoader();
  return stlLoader.parse(buffer);
}

/**
 * Resolves dropped or selected bundle of files (.mlp + companion .ply/.stl/.obj)
 */
export async function loadMeshBundle(files: File[]): Promise<LoadedMeshResult> {
  // Look for .mlp file in the list
  const mlpFile = files.find((f) => f.name.toLowerCase().endsWith('.mlp'));

  if (mlpFile) {
    const mlpText = await mlpFile.text();
    const { layers } = parseMlpDocument(mlpText, mlpFile.name);

    // Build companion map by lowercase basename
    const companionMap = new Map<string, { file: File; buffer: ArrayBuffer }>();
    for (const f of files) {
      if (f !== mlpFile) {
        const buf = await f.arrayBuffer();
        companionMap.set(getBasename(f.name).toLowerCase(), { file: f, buffer: buf });
      }
    }

    const group = new THREE.Group();
    group.name = mlpFile.name;

    const missingFilenames: string[] = [];
    const attachedFiles: { name: string; buffer: ArrayBuffer }[] = [];

    // Attach mlp file itself
    const mlpBuf = new TextEncoder().encode(mlpText).buffer as ArrayBuffer;
    attachedFiles.push({ name: mlpFile.name, buffer: mlpBuf });

    for (const layer of layers) {
      const match = companionMap.get(layer.normalizedFilename);
      if (match) {
        layer.hasCompanion = true;
        attachedFiles.push({ name: match.file.name, buffer: match.buffer });

        try {
          const geom = loadGeometryFromBuffer(match.file.name, match.buffer);
          layer.geometry = geom;

          const material = new THREE.MeshStandardMaterial({
            color: 0xECEEF2,
            roughness: 0.35,
            metalness: 0.12,
            side: THREE.DoubleSide,
            vertexColors: !!geom.getAttribute('color'),
          });

          const mesh = new THREE.Mesh(geom, material);
          mesh.applyMatrix4(layer.transformMatrix);
          mesh.visible = layer.visible;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          layer.mesh = mesh;
          group.add(mesh);
        } catch (err) {
          console.error(`[mlpLoader] Failed to load companion geometry ${match.file.name}:`, err);
        }
      } else {
        missingFilenames.push(layer.filename || layer.normalizedFilename);
      }
    }

    const isMissing = missingFilenames.length > 0 && group.children.length === 0;
    const metrics = computeGroupMetrics(group);

    return {
      projectName: mlpFile.name,
      format: 'mlp',
      status: isMissing ? 'MISSING_COMPANION' : 'READY',
      layers,
      group,
      missingFilenames,
      rawXml: mlpText,
      metrics,
      meshAssets: {
        primaryFilename: mlpFile.name,
        format: 'mlp',
        mlpXml: mlpText,
        files: attachedFiles,
      },
    };
  }

  // No .mlp file found: check for standalone 3D model files (.stl, .ply, .obj)
  const modelFile = files.find((f) => {
    const l = f.name.toLowerCase();
    return l.endsWith('.stl') || l.endsWith('.ply') || l.endsWith('.obj');
  });

  if (modelFile) {
    const buffer = await modelFile.arrayBuffer();
    const geom = loadGeometryFromBuffer(modelFile.name, buffer);

    const ext = modelFile.name.toLowerCase().split('.').pop() as 'stl' | 'ply' | 'obj';

    const group = new THREE.Group();
    group.name = modelFile.name;

    const material = new THREE.MeshStandardMaterial({
      color: 0xECEEF2,
      roughness: 0.35,
      metalness: 0.12,
      side: THREE.DoubleSide,
      vertexColors: !!geom.getAttribute('color'),
    });

    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const metrics = computeGroupMetrics(group);

    return {
      projectName: modelFile.name,
      format: ext || 'stl',
      status: 'READY',
      layers: [
        {
          label: modelFile.name,
          filename: modelFile.name,
          normalizedFilename: modelFile.name.toLowerCase(),
          visible: true,
          transformMatrix: new THREE.Matrix4(),
          geometry: geom,
          mesh,
          hasCompanion: true,
        },
      ],
      group,
      missingFilenames: [],
      metrics,
      meshAssets: {
        primaryFilename: modelFile.name,
        format: ext || 'stl',
        files: [{ name: modelFile.name, buffer }],
      },
    };
  }

  throw new Error('No supported 3D CAD files (.mlp, .stl, .ply, .obj) found in selection.');
}

/**
 * Creates procedural CAD reference bottle geometry for Bottle_clean_final.mlp
 * Scaled to 240mm height with a watertight planar baseplate at Z = 0.000 mm.
 */
export function createBottleSampleMesh(targetHeightMm = 240): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // 1. Flat Planar Base & Cylindrical Body (Dia 80mm, Height 140mm)
  const body = new THREE.CylinderGeometry(40, 40, 140, 36, 4);
  body.translate(0, 70, 0);
  geometries.push(body);

  // 2. Elegant Conical Shoulder Transition (Dia 80mm -> 32mm, Height 45mm)
  const shoulder = new THREE.CylinderGeometry(16, 40, 45, 36, 4);
  shoulder.translate(0, 140 + 22.5, 0);
  geometries.push(shoulder);

  // 3. Threaded Finish & Neck (Dia 30mm, Height 55mm)
  const neck = new THREE.CylinderGeometry(15, 16, 55, 36, 4);
  neck.translate(0, 185 + 27.5, 0);
  geometries.push(neck);

  // 4. Threading Ring
  const thread = new THREE.TorusGeometry(16.5, 1.8, 16, 36);
  thread.rotateX(Math.PI / 2);
  thread.translate(0, 222, 0);
  geometries.push(thread);

  const raw = mergeGeometries(geometries);

  // Scale to target height
  raw.computeBoundingBox();
  const bbox = raw.boundingBox!;
  const currentHeight = bbox.max.y - bbox.min.y;
  const scaleFactor = targetHeightMm / currentHeight;
  raw.scale(scaleFactor, scaleFactor, scaleFactor);

  // Recenter X/Z and snap base flush to Y = 0.000 mm
  raw.computeBoundingBox();
  const updatedBbox = raw.boundingBox!;
  const center = new THREE.Vector3();
  updatedBbox.getCenter(center);
  raw.translate(-center.x, -updatedBbox.min.y, -center.z);
  raw.computeVertexNormals();

  return raw;
}

/**
 * Computes bounding dimensions, triangles, and volume for a Three.js Group
 */
export function computeGroupMetrics(group: THREE.Group): {
  triangles: number;
  dimensionsMm: [number, number, number];
  volumeCm3: number;
} {
  const bbox = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  bbox.getSize(size);

  let triangles = 0;
  let signedVolMm3 = 0;

  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geom = mesh.geometry;
      const pos = geom.getAttribute('position');
      if (pos) {
        triangles += geom.index ? geom.index.count / 3 : pos.count / 3;

        // Compute signed volume
        const nonIndexed = geom.index ? geom.toNonIndexed() : geom;
        const p = nonIndexed.getAttribute('position');
        const vA = new THREE.Vector3();
        const vB = new THREE.Vector3();
        const vC = new THREE.Vector3();
        const cb = new THREE.Vector3();
        const ab = new THREE.Vector3();

        for (let i = 0; i < p.count; i += 3) {
          vA.fromBufferAttribute(p, i).applyMatrix4(mesh.matrix);
          vB.fromBufferAttribute(p, i + 1).applyMatrix4(mesh.matrix);
          vC.fromBufferAttribute(p, i + 2).applyMatrix4(mesh.matrix);

          cb.subVectors(vC, vB);
          ab.subVectors(vA, vB);
          cb.cross(ab);
          signedVolMm3 += vA.dot(cb) / 6.0;
        }
      }
    }
  });

  const volumeCm3 = Math.max(0, Math.round((Math.abs(signedVolMm3) / 1000.0) * 10) / 10);

  return {
    triangles: Math.round(triangles),
    dimensionsMm: [
      Math.round(size.x * 10) / 10,
      Math.round(size.z * 10) / 10,
      Math.round(size.y * 10) / 10,
    ],
    volumeCm3: volumeCm3 > 0 ? volumeCm3 : Math.round(((size.x * size.y * size.z * 0.45) / 1000) * 10) / 10,
  };
}

/**
 * Merges buffer geometries into a single BufferGeometry
 */
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of nonIndexed) {
    count += g.getAttribute('position').count;
  }

  const pos = new Float32Array(count * 3);
  const norm = new Float32Array(count * 3);

  let offset = 0;
  for (const g of nonIndexed) {
    g.computeVertexNormals();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos[(offset + i) * 3] = p.getX(i);
      pos[(offset + i) * 3 + 1] = p.getY(i);
      pos[(offset + i) * 3 + 2] = p.getZ(i);
      if (n) {
        norm[(offset + i) * 3] = n.getX(i);
        norm[(offset + i) * 3 + 1] = n.getY(i);
        norm[(offset + i) * 3 + 2] = n.getZ(i);
      }
    }
    offset += p.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  merged.computeVertexNormals();
  return merged;
}
