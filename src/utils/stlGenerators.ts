import * as THREE from 'three';

/**
 * Converts any Three.js BufferGeometry into a standard binary STL ArrayBuffer.
 */
export function geometryToBinaryStl(geometry: THREE.BufferGeometry): ArrayBuffer {
  // Ensure non-indexed geometry with computed normals for direct triangle writing
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  nonIndexed.computeVertexNormals();

  const posAttr = nonIndexed.getAttribute('position');
  const normAttr = nonIndexed.getAttribute('normal');

  const triangleCount = posAttr.count / 3;
  const headerBytes = 80;
  const countBytes = 4;
  const triangleBytes = 50; // 12 (normal) + 36 (3 vertices) + 2 (attr)
  const totalBufferSize = headerBytes + countBytes + triangleCount * triangleBytes;

  const buffer = new ArrayBuffer(totalBufferSize);
  const view = new DataView(buffer);

  // Write 80-byte ASCII header
  const headerStr = 'LOOM 3D Photogrammetry Scanner - Binary STL Export';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < headerStr.length ? headerStr.charCodeAt(i) : 0);
  }

  // Write triangle count (uint32, little-endian)
  view.setUint32(80, triangleCount, true);

  let offset = 84;
  for (let t = 0; t < triangleCount; t++) {
    const vIdx = t * 3;

    // Normal vector from first vertex (or average)
    const nx = normAttr ? normAttr.getX(vIdx) : 0;
    const ny = normAttr ? normAttr.getY(vIdx) : 0;
    const nz = normAttr ? normAttr.getZ(vIdx) : 1;

    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;

    // 3 Vertices (x, y, z)
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
 * Procedurally generates a Precision Mechanical Bracket scan model
 * Dimensions roughly 85mm x 50mm x 45mm.
 */
export function createMechanicalBracketGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Base plate with center cutout
  const baseGeom = new THREE.BoxGeometry(85, 12, 50, 10, 2, 10);
  baseGeom.translate(0, 6, 0);
  geometries.push(baseGeom);

  // Upright bracket flange
  const uprightGeom = new THREE.BoxGeometry(14, 45, 50, 2, 8, 10);
  uprightGeom.translate(-35.5, 30, 0);
  geometries.push(uprightGeom);

  // Reinforced gusset rib (triangular support)
  const ribGeom = new THREE.CylinderGeometry(0.1, 24, 30, 16, 4);
  ribGeom.rotateZ(Math.PI / 4);
  ribGeom.translate(-20, 24, 0);
  geometries.push(ribGeom);

  // Cylindrical mounting boss on top
  const bossGeom = new THREE.CylinderGeometry(14, 14, 18, 32);
  bossGeom.translate(18, 18, 0);
  geometries.push(bossGeom);

  // Internal bore cylinder simulated
  const boreGeom = new THREE.CylinderGeometry(8, 8, 22, 24);
  boreGeom.translate(18, 20, 0);
  geometries.push(boreGeom);

  // Left mounting hole ring
  const ringGeom = new THREE.TorusGeometry(10, 2.5, 16, 32);
  ringGeom.rotateX(Math.PI / 2);
  ringGeom.translate(-35.5, 40, 0);
  geometries.push(ringGeom);

  return mergeBufferGeometries(geometries);
}

/**
 * Procedurally generates an Aerospace Turbine Impeller scan model
 */
export function createTurbineImpellerGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Central conical hub
  const hubGeom = new THREE.CylinderGeometry(12, 28, 35, 48);
  hubGeom.translate(0, 17.5, 0);
  geometries.push(hubGeom);

  // Center shaft bore
  const shaftGeom = new THREE.CylinderGeometry(7, 7, 40, 32);
  shaftGeom.translate(0, 20, 0);
  geometries.push(shaftGeom);

  // 12 Aerofoil twisted blades
  const bladeCount = 12;
  for (let i = 0; i < bladeCount; i++) {
    const angle = (i / bladeCount) * Math.PI * 2;
    const blade = new THREE.BoxGeometry(32, 2.8, 18, 6, 2, 4);

    // Apply aero twist along radius
    const pos = blade.getAttribute('position');
    for (let p = 0; p < pos.count; p++) {
      const x = pos.getX(p);
      const twistFactor = (x + 16) / 32;
      const curY = pos.getY(p);
      const curZ = pos.getZ(p);
      const twistAngle = twistFactor * 0.55;
      const newY = curY * Math.cos(twistAngle) - curZ * Math.sin(twistAngle);
      const newZ = curY * Math.sin(twistAngle) + curZ * Math.cos(twistAngle);
      pos.setY(p, newY);
      pos.setZ(p, newZ);
    }
    blade.computeVertexNormals();

    blade.translate(22, 16, 0);
    blade.rotateY(angle);
    geometries.push(blade);
  }

  // Base balancing ring
  const ring = new THREE.TorusGeometry(26, 3.5, 16, 48);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 4, 0);
  geometries.push(ring);

  return mergeBufferGeometries(geometries);
}

/**
 * Procedurally generates a Complex Archaeological Torus Sculpture
 */
export function createSculptureGeometry(): THREE.BufferGeometry {
  const geom = new THREE.TorusKnotGeometry(26, 7.5, 128, 32, 2, 3);
  geom.rotateX(Math.PI / 2);
  geom.translate(0, 28, 0);
  return geom;
}

/**
 * Utility to combine multiple buffer geometries into a single non-indexed geometry
 */
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexedList = geometries.map((g) => (g.index ? g.toNonIndexed() : g));

  let totalVertexCount = 0;
  for (const g of nonIndexedList) {
    totalVertexCount += g.getAttribute('position').count;
  }

  const mergedPos = new Float32Array(totalVertexCount * 3);
  const mergedNorm = new Float32Array(totalVertexCount * 3);

  let offset = 0;
  for (const g of nonIndexedList) {
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

