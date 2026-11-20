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

  return mergeBufferGeometries(geometries);
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
