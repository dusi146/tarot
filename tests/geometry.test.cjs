const { test } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('../vendor/three.r128.min.js');
const motion = require('../tarot-motion.js');
const geometry = require('../tarot-geometry.js');

test('rounded cards preserve face direction, UVs, thickness and material groups', () => {
  const { back, selected } = geometry.createCards(THREE, 0.8, 1.4, 0.004);
  assert.equal(back.groups.length, 2); assert.equal(selected.groups.length, 3);
  back.computeBoundingBox();
  const size = back.boundingBox.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 0.8) < 0.00001);
  assert.ok(Math.abs(size.y - 1.4) < 0.00001);
  assert.ok(Math.abs(size.z - 0.004) < 0.00001);
  for (const attribute of Object.values(back.attributes)) assert.ok([...attribute.array].every(Number.isFinite));
  for (const value of back.attributes.uv.array) assert.ok(value >= 0 && value <= 1);
  const n = selected.attributes.normal, p = selected.attributes.position, uv = selected.attributes.uv;
  for (const [groupIndex, normalZ] of [[1, 1], [2, -1]]) {
    const group = selected.groups[groupIndex];
    for (let i = group.start; i < group.start + group.count; i++) {
      assert.ok(Math.abs(n.getZ(i) - normalZ) < 0.00001);
      assert.ok(Math.abs(uv.getX(i) - (0.5 + p.getX(i) / 0.8 * normalZ)) < 0.00001);
    }
  }
});

test('the rotated carousel cards have disjoint world bounds throughout a swipe, including hover', () => {
  const { back } = geometry.createCards(THREE, 0.8, 1.4, 0.004);
  for (const [scale, baseX, cameraDepth] of [[0.3, 0, 6.15], [0.65, 0, 6.15], [1, 0, 5.35], [1.22, 0, 5.35], [1.22, -1.7, 5.35]]) {
    const config = { scale, baseX, cameraDepth, baseY: 0, step: scale * (0.8 + 1.4 * Math.sin(0.05)) * 1.13 };
    for (let center = -0.5; center <= 78; center += 0.125) {
      const bounds = [];
      for (let index = 0; index < 78; index++) {
        const delta = index - center;
        if (Math.abs(delta) >= 4) continue;
        const pose = motion.carouselPose(delta, config, 1);
        const mesh = new THREE.Mesh(back);
        mesh.position.set(pose.x, pose.y, pose.z); mesh.scale.setScalar(pose.scale);
        mesh.rotation.set(pose.rotX, pose.rotY, pose.rotZ); mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(mesh);
        for (const previous of bounds) assert.ok(box.min.x > previous.max.x, 'silhouettes remain separated');
        bounds.push(box);
      }
    }
  }
});

test('perspective keeps visible carousel silhouettes separate on portrait, landscape and desktop', () => {
  const { back } = geometry.createCards(THREE, 0.8, 1.4, 0.004);
  for (const [width, height, scale, sx, sy, limit] of [[390, 844, 1.22, 195, 409, 4], [320, 568, 0.65, 160, 270, 4], [844, 390, 1.22, 281, 252, 3], [1280, 720, 1.22, 640, 360, 4]]) {
    const cam = width < height ? { x: 0, y: 1.68, z: 6.6, rotX: -0.15 } : { x: 0, y: 1.62, z: 5.8, rotX: -0.14 };
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(cam.x, cam.y, cam.z); camera.rotation.x = cam.rotX; camera.updateMatrixWorld(true);
    const center = motion.screenToWorld(cam, width, height, sx, sy, 0.45);
    const config = { scale, baseX: center.x, baseY: center.y, cameraDepth: cam.z - 0.45, visibleLimit: limit,
      step: scale * (0.8 + 1.4 * Math.sin(0.05)) * 1.13 };
    for (let offset = 0; offset < 1; offset += 0.0625) {
      let previousRight = -Infinity;
      for (let index = -4; index <= 4; index++) {
        const delta = index + offset; if (Math.abs(delta) >= limit) continue;
        const pose = motion.carouselPose(delta, config, 1), mesh = new THREE.Mesh(back);
        mesh.position.set(pose.x, pose.y, pose.z); mesh.rotation.set(pose.rotX, pose.rotY, pose.rotZ); mesh.scale.setScalar(pose.scale); mesh.updateMatrixWorld(true);
        let left = Infinity, right = -Infinity;
        for (let vertex = 0; vertex < back.attributes.position.count; vertex++) {
          const point = new THREE.Vector3().fromBufferAttribute(back.attributes.position, vertex).applyMatrix4(mesh.matrixWorld).project(camera);
          left = Math.min(left, point.x); right = Math.max(right, point.x);
        }
        assert.ok(left > previousRight, 'no projected overlap: ' + width + ' × ' + height);
        previousRight = right;
      }
    }
  }
});

test('the closed deck is stacked along the card normal with a physical gap', () => {
  const normal = new THREE.Vector3(0, Math.sin(0.35), Math.cos(0.35));
  for (let i = 1; i < 78; i++) {
    const displacement = new THREE.Vector3().copy(motion.stackPose(i, 0.004)).sub(motion.stackPose(i - 1, 0.004));
    assert.ok(displacement.dot(normal) > 0.0044);
    assert.ok(displacement.clone().cross(normal).length() < 1e-10);
  }
});

test('screen anchoring respects perspective and tilt across phone and desktop viewports', () => {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 720]]) {
    const config = { x: 0, y: 1.68, z: 6.6, rotX: -0.15 };
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(config.x, config.y, config.z); camera.rotation.x = config.rotX; camera.updateMatrixWorld(true);
    for (const [sx, sy] of [[width / 2, height / 2], [32, height - 44], [width - 32, 180]]) {
      const world = motion.screenToWorld(config, width, height, sx, sy, 1.35);
      const projected = new THREE.Vector3().copy(world).project(camera);
      assert.ok(Math.abs((projected.x + 1) * width / 2 - sx) < 1e-8);
      assert.ok(Math.abs((1 - projected.y) * height / 2 - sy) < 1e-8);
    }
  }
});
