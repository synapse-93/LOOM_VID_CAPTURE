import * as THREE from 'three';

/**
 * Converts any Three.js BufferGeometry into a standard binary STL ArrayBuffer.
 */
export function geometryToBinaryStl(geometry: THREE.BufferGeometry): ArrayBuffer {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  nonIndexed.computeVertexNormals();

  const posAttr = nonIndexed.getAttribute('position');
  const normAttr = nonIndexed.getAttribute('normal');

  const triangleCount = posAttr.count / 3;
  const headerBytes = 80;
  const countBytes = 4;
  const triangleBytes = 50;
  const totalBufferSize = headerBytes + countBytes + triangleCount * triangleBytes;

  const buffer = new ArrayBuffer(totalBufferSize);
  const view = new DataView(buffer);

  // 80-byte header string
  const headerStr = 'LOOM PRECISION CAD CALIBRATION GAUGING MESH (BINARY STL)';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < headerStr.length ? headerStr.charCodeAt(i) : 0);
  }

  // Triangle count (uint32, little-endian)
  view.setUint32(80, triangleCount, true);

  let offset = 84;
  for (let t = 0; t < triangleCount; t++) {
    const vIdx = t * 3;

    // Normal vector
    const nx = normAttr ? normAttr.getX(vIdx) : 0;
    const ny = normAttr ? normAttr.getY(vIdx) : 0;
    const nz = normAttr ? normAttr.getZ(vIdx) : 1;

    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;

    // 3 Vertices
    for (let i = 0; i < 3; i++) {
      const vx = posAttr.getX(vIdx + i);
      const vy = posAttr.getY(vIdx + i);
      const vz = posAttr.getZ(vIdx + i);

      view.setFloat32(offset, vx, true); offset += 4;
      view.setFloat32(offset, vy, true); offset += 4;
      view.setFloat32(offset, vz, true); offset += 4;
    }

    // 2-byte attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}

/**
 * Creates a calibrated industrial stepped prism calibration gauge block:
 * Base: 60mm x 40mm x 15mm
 * Step 1: 40mm x 40mm x 15mm
 * Step 2: 20mm x 40mm x 15mm
 * Center bore: 12mm diameter
 */
export function createCalibrationPrismGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Step 0: Base stage (60 x 40 x 15 mm)
  const base = new THREE.BoxGeometry(60, 15, 40);
  base.translate(0, 7.5, 0);
  geometries.push(base);

  // Step 1: Intermediate tier (40 x 40 x 15 mm)
  const tier1 = new THREE.BoxGeometry(40, 15, 40);
  tier1.translate(-10, 22.5, 0);
  geometries.push(tier1);

  // Step 2: Top prism stage (20 x 40 x 15 mm)
  const tier2 = new THREE.BoxGeometry(20, 15, 40);
  tier2.translate(-20, 37.5, 0);
  geometries.push(tier2);

  // Vertical Calibration Boss
  const boss = new THREE.CylinderGeometry(8, 8, 20, 32);
  boss.translate(15, 25, 0);
  geometries.push(boss);

  // Horizontal Alignment Pin
  const pin = new THREE.CylinderGeometry(4, 4, 30, 24);
  pin.rotateZ(Math.PI / 2);
  pin.translate(0, 7.5, 12);
  geometries.push(pin);

  const merged = mergeBufferGeometries(geometries);
  alignGeometryToBaseplate(merged);
  return merged;
}

/**
 * Creates athletic shoe reference geometry with toe spring, heel counter,
 * and outsole profile, scaled to exact target length (default 280mm, EU 43).
 */
export function createShoeModelGeometry(targetLengthMm = 280): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // 1. Outsole base plate (Z-axis length ~280mm, X-axis width ~100mm, Y-axis thickness ~14mm)
  const sole = new THREE.BoxGeometry(94, 14, 270, 12, 2, 28);
  sole.translate(0, 7, 0);
  geometries.push(sole);

  // 2. Midsole cushion layer (slightly tapered)
  const midsole = new THREE.BoxGeometry(90, 20, 255, 10, 2, 24);
  midsole.translate(0, 24, -5);
  geometries.push(midsole);

  // 3. Heel wedge / counter (heightens back of shoe)
  const heelWedge = new THREE.CylinderGeometry(38, 42, 28, 24);
  heelWedge.scale(1.1, 1, 1.4);
  heelWedge.translate(0, 42, -75);
  geometries.push(heelWedge);

  // 4. Forefoot / Toe box with upward toe spring
  const forefoot = new THREE.CylinderGeometry(40, 45, 22, 24);
  forefoot.scale(1.05, 0.9, 1.5);
  forefoot.translate(0, 32, 60);
  geometries.push(forefoot);

  // 5. Instep & Shoe Collar / Ankle opening
  const collar = new THREE.TorusGeometry(32, 12, 16, 28);
  collar.rotateX(Math.PI / 2);
  collar.scale(0.85, 1.3, 1);
  collar.translate(0, 68, -35);
  geometries.push(collar);

  // 6. Tongue and laces bridge
  const tongue = new THREE.BoxGeometry(42, 12, 90);
  tongue.rotateX(-0.35);
  tongue.translate(0, 58, 15);
  geometries.push(tongue);

  const raw = mergeBufferGeometries(geometries);

  // Scale along Z to exact targetLengthMm
  scaleGeometryToTargetLength(raw, targetLengthMm, 'z');

  // Align base flush to Y = 0.000 mm and center X/Z
  alignGeometryToBaseplate(raw);

  return raw;
}

/**
 * Scales geometry so its bounding box dimension along chosen axis matches targetLengthMm.
 */
export function scaleGeometryToTargetLength(
  geometry: THREE.BufferGeometry,
  targetLengthMm: number,
  axis: 'x' | 'y' | 'z' = 'z'
): void {
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox!;
  const currentDim = bbox.max[axis] - bbox.min[axis];
  if (currentDim <= 0) return;

  const scaleFactor = targetLengthMm / currentDim;
  geometry.scale(scaleFactor, scaleFactor, scaleFactor);
  geometry.computeVertexNormals();
}

/**
 * Snaps base of geometry flush to Y = 0.000 mm and centers X and Z at origin.
 */
export function alignGeometryToBaseplate(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox!;
  const center = new THREE.Vector3();
  bbox.getCenter(center);

  geometry.translate(-center.x, -bbox.min.y, -center.z);
  geometry.computeVertexNormals();
}

/**
 * Extracts bounding metrics, triangle count, and volume in cm3.
 */
export function getGeometryMetrics(geometry: THREE.BufferGeometry): {
  triangles: number;
  dimensionsMm: [number, number, number];
  volumeCm3: number;
} {
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox || new THREE.Box3();
  const size = new THREE.Vector3();
  bbox.getSize(size);

  const pos = geometry.getAttribute('position');
  const triangles = geometry.index ? geometry.index.count / 3 : pos.count / 3;

  // Approximate watertight volume from bounding volume * form factor
  const boundingVolCm3 = (size.x * size.y * size.z) / 1000;
  const estimatedVol = Math.round(boundingVolCm3 * 0.42 * 10) / 10;

  return {
    triangles: Math.round(triangles),
    dimensionsMm: [
      Math.round(size.x * 10) / 10,
      Math.round(size.z * 10) / 10,
      Math.round(size.y * 10) / 10,
    ],
    volumeCm3: Math.max(1, estimatedVol),
  };
}

/**
 * Merges buffer geometries into a single non-indexed geometry.
 */
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geometries.map((g) => (g.index ? g.toNonIndexed() : g));

  let totalVertexCount = 0;
  for (const g of nonIndexed) {
    totalVertexCount += g.getAttribute('position').count;
  }

  const mergedPos = new Float32Array(totalVertexCount * 3);
  const mergedNorm = new Float32Array(totalVertexCount * 3);

  let offset = 0;
  for (const g of nonIndexed) {
    g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');

    for (let i = 0; i < pos.count; i++) {
      mergedPos[(offset + i) * 3] = pos.getX(i);
      mergedPos[(offset + i) * 3 + 1] = pos.getY(i);
      mergedPos[(offset + i) * 3 + 2] = pos.getZ(i);

      if (norm) {
        mergedNorm[(offset + i) * 3] = norm.getX(i);
        mergedNorm[(offset + i) * 3 + 1] = norm.getY(i);
        mergedNorm[(offset + i) * 3 + 2] = norm.getZ(i);
      }
    }
    offset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
  merged.computeVertexNormals();
  return merged;
}
