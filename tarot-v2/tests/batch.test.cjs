const test = require('node:test'), assert = require('node:assert/strict');
const THREE = require('../vendor/three.r128.min.js'), { create, createMotes } = require('../js/tarot-batch.js');
function fixture(supported = true) {
  const geometry = new THREE.BoxGeometry(1.5, 2.55, .028), group = new THREE.Group();
  const batch = create({ THREE, geometry, group, capacity: 78, supported, makeMaterial: () => new THREE.MeshStandardMaterial() });
  const cards = Array.from({ length: 6 }, (_, index) => {
    const mesh = new THREE.Mesh(geometry), haloMesh = new THREE.Mesh(), haloMat = { opacity: 0 }; mesh.add(haloMesh); group.add(mesh);
    mesh.position.set(index * 1.17, Math.sin(index), index * -.24); mesh.rotation.set(.1, Math.PI + index * .13, index * .04); mesh.scale.setScalar(.6 + index * .03);
    return { mesh, haloMesh, haloMat, slotIndex: -1, flightActive: false, glintPhase: index * .3, rimGlow: index * .1 };
  });
  return { batch, cards, geometry, group };
}
test('batched cards preserve all vertices, material groups, transforms and individual foil values', () => {
  const { batch, cards, geometry } = fixture(); batch.sync(cards);
  assert.equal(batch.stats().count, cards.length);
  assert.equal(batch.mesh.geometry.attributes.position, geometry.attributes.position);
  assert.deepEqual(batch.mesh.geometry.groups, geometry.groups);
  const matrix = new THREE.Matrix4();
  cards.forEach((card, i) => {
    batch.mesh.getMatrixAt(i, matrix);
    matrix.elements.forEach((value, j) => assert.ok(Math.abs(value - card.mesh.matrix.elements[j]) < 1e-6));
    assert.ok(Math.abs(batch.mesh.geometry.getAttribute('instanceFoil').getX(i) - card.glintPhase) < 1e-6);
    assert.ok(Math.abs(batch.mesh.geometry.getAttribute('instanceFoil').getY(i) - card.rimGlow) < 1e-6);
    assert.equal(card.mesh.layers.mask, 2); assert.equal(card.haloMesh.visible, false);
  });
});
test('selected, flying and hidden cards are never duplicated; nonzero halos remain visible', () => {
  const { batch, cards } = fixture(); cards[0].slotIndex = 0; cards[1].flightActive = true; cards[2].mesh.visible = false;
  cards[0].haloMat.opacity = .00001; batch.sync(cards);
  assert.equal(batch.stats().count, 3); assert.equal(cards[0].haloMesh.visible, true);
  for (const card of cards.slice(0, 3)) assert.equal(card.mesh.layers.mask, 1);
  const raycaster = new THREE.Raycaster(); raycaster.layers.enable(1);
  assert.equal(raycaster.layers.test(cards[3].mesh.layers), true, 'Visible batched backs remain raycastable');
  batch.setEnabled(false); batch.sync(cards); assert.equal(batch.mesh.visible, false);
  for (const card of cards) assert.equal(card.mesh.layers.mask, 1);
});
test('a device without instancing keeps the original renderer with the same cards and effects', () => {
  const { batch, cards } = fixture(false); batch.sync(cards);
  assert.equal(batch.stats().enabled, false); assert.equal(batch.mesh.count, 0);
  assert.ok(cards.every(card => card.mesh.layers.mask === 1));
});
test('motes retain every active particle, its color, world size, position and lifetime opacity', () => {
  const group = new THREE.Group(), camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  const batch = createMotes({ THREE, group, map: new THREE.Texture(), capacity: 42 });
  const pool = Array.from({ length: 42 }, (_, i) => {
    const sprite = new THREE.Sprite(); sprite.position.set(i * .03, i * .05, .8); sprite.scale.set(.1, .1, 1); group.add(sprite);
    return { active: i % 3 !== 0, sprite, mat: { color: new THREE.Color(0x72e8df), opacity: i / 42 } };
  });
  batch.sync(pool, camera); assert.equal(batch.stats().count, 28);
  const active = pool.filter(mote => mote.active), geometry = batch.mesh.geometry;
  active.forEach((mote, i) => {
    assert.ok(Math.abs(geometry.getAttribute('particleSize').getX(i) - mote.sprite.scale.y * camera.projectionMatrix.elements[5]) < 1e-6);
    assert.ok(Math.abs(geometry.getAttribute('particleOpacity').getX(i) - mote.mat.opacity) < 1e-6);
    assert.ok(Math.abs(geometry.getAttribute('position').getY(i) - mote.sprite.position.y) < 1e-6);
    assert.ok(Math.abs(geometry.getAttribute('color').getY(i) - mote.mat.color.g) < 1e-6);
  });
  batch.setEnabled(false); batch.sync(pool, camera); assert.equal(batch.mesh.visible, false);
  assert.ok(pool.every(mote => mote.sprite.layers.mask === 1));
  assert.ok(active.every(mote => mote.sprite.matrixAutoUpdate));
});
