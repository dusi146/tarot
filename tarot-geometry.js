/* Rounded cards with one shared rim and separate, correctly oriented faces. */
(function (root) {
  'use strict';
  function createCards(THREE, width, height, thickness) {
    const bevel = 0.004;
    const x = -width / 2 + bevel, y = -height / 2 + bevel;
    const w = width - bevel * 2, h = height - bevel * 2, r = 0.045;
    const shape = new THREE.Shape();
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    const bevelDepth = thickness * 0.22, depth = thickness - bevelDepth * 2;
    const raw = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true,
      bevelThickness: bevelDepth, bevelSize: bevel, bevelSegments: 3, curveSegments: 10, steps: 1 });
    raw.translate(0, 0, -depth / 2);
    const positions = raw.attributes.position, normals = raw.attributes.normal;
    const buckets = [[], [], []];
    for (let i = 0; i < positions.count; i += 3) {
      const nz = (normals.getZ(i) + normals.getZ(i + 1) + normals.getZ(i + 2)) / 3;
      const kind = nz > 0.999 ? 1 : nz < -0.999 ? 2 : 0;
      for (let j = i; j < i + 3; j++) {
        const px = positions.getX(j), py = positions.getY(j);
        buckets[kind].push(px, py, positions.getZ(j), normals.getX(j), normals.getY(j), normals.getZ(j),
          Math.max(0, Math.min(1, kind === 2 ? 0.5 - px / width : 0.5 + px / width)), Math.max(0, Math.min(1, 0.5 + py / height)));
      }
    }
    const count = positions.count, p = new Float32Array(count * 3), n = new Float32Array(count * 3), uv = new Float32Array(count * 2);
    let vertex = 0;
    for (const bucket of buckets) for (let i = 0; i < bucket.length; i += 8, vertex++) {
      p.set(bucket.slice(i, i + 3), vertex * 3); n.set(bucket.slice(i + 3, i + 6), vertex * 3); uv.set(bucket.slice(i + 6, i + 8), vertex * 2);
    }
    const back = new THREE.BufferGeometry();
    back.setAttribute('position', new THREE.BufferAttribute(p, 3));
    back.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    back.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const sides = buckets[0].length / 8, front = buckets[1].length / 8, rear = buckets[2].length / 8;
    back.addGroup(0, sides, 0); back.addGroup(sides, front + rear, 1);
    const selected = back.clone(); selected.clearGroups();
    selected.addGroup(0, sides, 0); selected.addGroup(sides, front, 1); selected.addGroup(sides + front, rear, 2);
    const outlinePoints = shape.getPoints(32).map(point => new THREE.Vector3(point.x, point.y, thickness / 2 + 0.0003));
    const outline = new THREE.BufferGeometry().setFromPoints(outlinePoints.flatMap((point, i) => [point, outlinePoints[(i + 1) % outlinePoints.length]]));
    raw.dispose();
    return { back, selected, outline };
  }
  const api = { createCards };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotGeometry = api;
})(typeof window === 'object' ? window : this);
