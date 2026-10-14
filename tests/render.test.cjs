const { test } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('../vendor/three.r128.min.js');
const render = require('../tarot-render.js');

test('antialiasing uses multisampling and a final screen pass at the drawing-buffer resolution', () => {
  const operations = [];
  let active;
  const renderer = {
    capabilities: { isWebGL2: true },
    getContext: () => ({ MAX_SAMPLES: 36183, getParameter: () => 4 }),
    setRenderTarget(target) { active = target; operations.push(target ? 'target' : 'screen'); },
    render(scene) { operations.push(active ? 'scene' : 'antialias'); if (!active) {
      assert.equal(scene.children[0].material.uniforms.uStep.value.x, 1 / 780);
    } }
  };
  const pipeline = render.create(THREE, renderer);
  pipeline.resize(390, 844, 2);
  pipeline.render(new THREE.Scene(), new THREE.Camera());
  assert.deepEqual(operations, ['target', 'scene', 'screen', 'antialias']);
});

test('quality ratios supersample standard screens without exceeding the pixel budget', () => {
  assert.equal(render.preferredRatio(1280, 720, 1), 2);
  assert.equal(render.preferredRatio(390, 844, 3), 2.5);
  assert.ok(3840 * 2160 * render.preferredRatio(3840, 2160, 3) ** 2 <= 3840 * 2160);
});

test('card outlines use derivative antialiasing and independently tinted materials', () => {
  const shared = render.outlineMaterial(THREE, .8, 1.4), selected = shared.clone();
  selected.uniforms.uColor.value.set('#91cfc7');
  assert.equal(shared.extensions.derivatives, true);
  assert.ok(shared.fragmentShader.includes('fwidth(d)'));
  assert.notEqual(selected.uniforms.uColor.value.getHexString(), shared.uniforms.uColor.value.getHexString());
  shared.dispose(); selected.dispose();
});
