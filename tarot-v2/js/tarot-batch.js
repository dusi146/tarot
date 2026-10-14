/* Draw identical card backs together, retaining each card's transform and foil lighting. */
(function (root) {
  'use strict';
  function create({ THREE, geometry, maps, makeMaterial, group, capacity, supported = true }) {
    const batchGeometry = new THREE.BufferGeometry();
    for (const name of Object.keys(geometry.attributes)) batchGeometry.setAttribute(name, geometry.getAttribute(name));
    if (geometry.index) batchGeometry.setIndex(geometry.index);
    const groups = geometry.groups;
    const sharedSides = groups.length === 3 && groups[0].materialIndex === 0 && groups[1].materialIndex === 1
      && groups[2].materialIndex === 2 && groups[0].start + groups[0].count === groups[1].start;
    // Unselected front/back sides have exactly the same map, material and foil uniforms.
    if (sharedSides) {
      batchGeometry.addGroup(groups[0].start, groups[0].count + groups[1].count, 0);
      batchGeometry.addGroup(groups[2].start, groups[2].count, 1);
    } else for (const item of groups) batchGeometry.addGroup(item.start, item.count, item.materialIndex);
    const foil = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
    batchGeometry.setAttribute('instanceFoil', foil);
    const materials = sharedSides ? [makeMaterial(maps), makeMaterial(null, true)]
      : [makeMaterial(maps), makeMaterial(maps), makeMaterial(null, true)];
    // A material define reaches both shader stages (Three's USE_INSTANCING is vertex-only).
    for (const material of materials) material.defines = { ...material.defines, TAROT_INSTANCING: 1 };
    const mesh = new THREE.InstancedMesh(batchGeometry, materials, capacity);
    mesh.name = 'shared-card-backs'; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; group.add(mesh);
    let requested = true, count = 0;
    const view = new THREE.Matrix4(), ordered = [], entries = Array.from({ length: capacity }, () => ({ card: null, depth: 0 }));
    const nearFirst = (a, b) => a.depth - b.depth;
    function sync(cards, camera) {
      count = 0;
      ordered.length = 0;
      if (camera) { camera.updateMatrixWorld(); view.multiplyMatrices(camera.matrixWorldInverse, group.matrixWorld); }
      for (const card of cards) {
        const eligible = supported && requested && card.mesh.visible && card.mesh.parent === group
          && card.slotIndex === -1 && !card.flightActive;
        // The original mesh stays as the exact interaction proxy; only its drawing layer changes.
        card.mesh.layers.set(eligible ? 1 : 0);
        card.mesh.matrixAutoUpdate = !eligible && card.mesh.visible;
        if (card.haloMesh) card.haloMesh.visible = card.haloMat.opacity > 0;
        if (!eligible) continue;
        const entry = entries[count++]; entry.card = card;
        const p = card.mesh.position, e = view.elements;
        entry.depth = camera ? -(e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14]) : ordered.length;
        ordered.push(entry);
      }
      // All batched surfaces are opaque: nearer instances populate depth before hidden fragments.
      if (camera) ordered.sort(nearFirst);
      for (let i = 0; i < count; i++) {
        const card = ordered[i].card;
        card.mesh.updateMatrix(); mesh.setMatrixAt(i, card.mesh.matrix);
        foil.array[i * 2] = card.glintPhase; foil.array[i * 2 + 1] = card.rimGlow;
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
