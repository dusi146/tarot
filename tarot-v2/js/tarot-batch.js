/* Draw identical card backs together, retaining each card's transform and foil lighting. */
(function (root) {
  'use strict';
  function create({ THREE, geometry, maps, makeMaterial, group, capacity, supported = true }) {
    const batchGeometry = new THREE.BufferGeometry();
    for (const name of Object.keys(geometry.attributes)) batchGeometry.setAttribute(name, geometry.getAttribute(name));
    if (geometry.index) batchGeometry.setIndex(geometry.index);
    for (const item of geometry.groups) batchGeometry.addGroup(item.start, item.count, item.materialIndex);
    const foil = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
    batchGeometry.setAttribute('instanceFoil', foil);
    const materials = [makeMaterial(maps), makeMaterial(maps), makeMaterial(null, true)];
    // A material define reaches both shader stages (Three's USE_INSTANCING is vertex-only).
    for (const material of materials) material.defines = { ...material.defines, TAROT_INSTANCING: 1 };
    const mesh = new THREE.InstancedMesh(batchGeometry, materials, capacity);
    mesh.name = 'shared-card-backs'; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; group.add(mesh);
    let requested = true, count = 0;
    function sync(cards) {
      count = 0;
      for (const card of cards) {
        const eligible = supported && requested && card.mesh.visible && card.mesh.parent === group
          && card.slotIndex === -1 && !card.flightActive;
        // The original mesh stays as the exact interaction proxy; only its drawing layer changes.
        card.mesh.layers.set(eligible ? 1 : 0);
        card.mesh.matrixAutoUpdate = !eligible && card.mesh.visible;
        if (card.haloMesh) card.haloMesh.visible = card.haloMat.opacity > 0;
        if (!eligible) continue;
        card.mesh.updateMatrix(); mesh.setMatrixAt(count, card.mesh.matrix);
        foil.array[count * 2] = card.glintPhase; foil.array[count * 2 + 1] = card.rimGlow; count++;
      }
      mesh.count = count; mesh.visible = count > 0;
      if (count) {
        mesh.instanceMatrix.updateRange.count = count * 16; mesh.instanceMatrix.needsUpdate = true;
        foil.updateRange.count = count * 2; foil.needsUpdate = true;
      }
    }
    return { sync, mesh, setEnabled: value => { requested = !!value; },
      stats: () => ({ supported, enabled: supported && requested, count }) };
  }
  function createMotes({ THREE, group, map, capacity, supported = true }) {
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const size = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    const opacity = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position); geometry.setAttribute('color', color);
    geometry.setAttribute('particleSize', size); geometry.setAttribute('particleOpacity', opacity); geometry.setDrawRange(0, 0);
    const material = new THREE.PointsMaterial({ map, size: 1, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float particleSize;\nattribute float particleOpacity;\nvarying float vParticleOpacity;')
        .replace('gl_PointSize = size;', 'vParticleOpacity = particleOpacity;\ngl_PointSize = size * particleSize;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vParticleOpacity;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vParticleOpacity );');
    };
    const mesh = new THREE.Points(geometry, material); mesh.name = 'shared-reveal-motes'; mesh.frustumCulled = false; mesh.visible = false; group.add(mesh);
    let requested = true, count = 0;
    function sync(pool, camera) {
      count = 0;
      for (const mote of pool) {
        const eligible = requested && supported && mote.active && mote.sprite.visible;
        mote.sprite.layers.set(eligible ? 1 : 0); mote.sprite.matrixAutoUpdate = !eligible && mote.active;
        if (!eligible) continue;
        position.setXYZ(count, mote.sprite.position.x, mote.sprite.position.y, mote.sprite.position.z);
        color.setXYZ(count, mote.mat.color.r, mote.mat.color.g, mote.mat.color.b);
        // Convert the original sprite's world height to Three's point-size convention.
        size.array[count] = mote.sprite.scale.y * camera.projectionMatrix.elements[5]; opacity.array[count] = mote.mat.opacity; count++;
      }
      mesh.visible = count > 0; geometry.setDrawRange(0, count);
      if (count) for (const attribute of [position, color, size, opacity]) {
        attribute.updateRange.count = count * attribute.itemSize; attribute.needsUpdate = true;
      }
    }
    return { sync, mesh, setEnabled: value => { requested = !!value; }, stats: () => ({ supported, enabled: requested && supported, count }) };
  }
  const api = { create, createMotes };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotBatch = api;
})(typeof window === 'object' ? window : this);
