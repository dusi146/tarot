const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const THREE = require('../vendor/three.r128.min.js');
const layout = require('../js/tarot-layout.js');
const source = fs.readFileSync(require.resolve('../js/engine.js'), 'utf8');

function fixture(width, height, count) {
  const camera = new THREE.PerspectiveCamera(38, width / height, .1, 120);
  const context = vm.createContext({ innerWidth: width, innerHeight: height, camera, CARD_H: 2.55,
    activeCount: count, captionHeights: Array(count).fill(76), captionEls: Array.from({ length: count }, () => ({ style: {} })),
    captionStyleCache: Array.from({ length: count }, () => ({})), revealLayout: null, revealLayoutViewport: '', revealReservedTop: 0,
    revealLayoutDirty: true, revealActionBarEl: { offsetTop: 96, offsetHeight: 52 },
    brandCrestEl: { getBoundingClientRect: () => ({ bottom: 52 }) },
    document: { getElementById: () => ({ getBoundingClientRect: () => ({ top: height - 90 }) }) },
    window: { TarotLayout: layout }, layoutMetrics: { revealCamZ: 7.15, revealInspectCamZ: 4.65 },
    state: { inspectedSlot: 0, selectedCards: Array.from({ length: count }, () => ({ pos: new THREE.Vector3() })),
      camTargetPos: new THREE.Vector3(), camTargetLookAt: new THREE.Vector3(), smoothPointer: { x: 0, y: 0 } } });
  const compute = source.slice(source.indexOf('function computeRevealLayout()'), source.indexOf('function recordDockError('));
  const start = source.indexOf('        if (state.inspectedSlot !== -1) {', source.indexOf('function updateActReveal('));
  const cameraCode = source.slice(start, source.indexOf('        glintLight.position.set(', start));
  vm.runInContext(compute + '\ncomputeRevealLayout();\nthis.focusCamera = function() { const heroXs = layoutMetrics.revealHeroXs;\n' + cameraCode + '\n};', context);
  return { context, camera };
}

test('desktop inspection enlarges the view and reserves the brand, caption and controls', () => {
  for (const [width, height] of [[1024, 600], [1280, 720], [1440, 900], [1920, 1080]]) {
    const target = layout.inspection({ width, height, top: 170, bottom: height - 112 });
    const previousHeight = Math.min(460, height - 112 - 170 - 76 - 42);
    assert.ok(target.desktop); assert.ok(target.cardHeight > previousHeight * 1.15);
    assert.ok(target.top >= 80); assert.ok(target.cardHeight + 76 + 32 <= target.bottom - target.top);
    assert.ok(target.cardHeight <= 760);
  }
});

test('phone and short landscape inspection keep their existing size limits', () => {
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [844, 390], [1440, 480]]) {
    const top = 170, bottom = height - 112;
    const target = layout.inspection({ width, height, top, bottom });
    assert.equal(target.desktop, false); assert.equal(target.top, top); assert.equal(target.bottom, bottom);
    assert.equal(target.cardHeight, Math.max(60, Math.min(460, bottom - top - 76 - 42)));
  }
});

test('the actual desktop inspection camera keeps complete tilted and reversed cards in bounds', () => {
  for (const [width, height] of [[1024, 600], [1280, 720], [1440, 900], [1920, 1080]]) {
    for (const count of [1, 3, 4]) {
      const { context, camera } = fixture(width, height, count), metrics = context.layoutMetrics;
      for (let index = 0; index < count; index++) for (const sign of [-1, 1]) for (const reversed of [false, true]) {
        context.state.selectedCards[index].pos.set(metrics.revealHeroXs[index], metrics.revealHeroYs[index] + .098, .67);
        context.state.inspectedSlot = index; context.focusCamera();
        camera.position.copy(context.state.camTargetPos); camera.lookAt(context.state.camTargetLookAt); camera.updateMatrixWorld(true);
        const scale = metrics.revealHeroScale * 1.025;
        const transform = new THREE.Matrix4().compose(new THREE.Vector3(metrics.revealHeroXs[index], metrics.revealHeroYs[index] + .098, .67),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(.19 * sign, .22 * sign, reversed ? Math.PI : 0)), new THREE.Vector3(scale, scale, scale));
        const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
        for (const x of [-.75, .75]) for (const y of [-1.275, 1.275]) for (const z of [-.02, .02]) {
          const p = new THREE.Vector3(x, y, z).applyMatrix4(transform).project(camera), sx = (p.x + 1) * width / 2, sy = (1 - p.y) * height / 2;
          bounds.left = Math.min(bounds.left, sx); bounds.right = Math.max(bounds.right, sx);
          bounds.top = Math.min(bounds.top, sy); bounds.bottom = Math.max(bounds.bottom, sy);
        }
        const safe = metrics.revealInspectBounds;
        assert.ok(bounds.left >= 0 && bounds.right <= width, `${width}×${height}/${count}: horizontal crop`);
        assert.ok(bounds.top >= safe.top - 2, `${width}×${height}/${count}: brand overlap at ${bounds.top}`);
        assert.ok(bounds.bottom + 12 + 76 <= safe.bottom + 2, `${width}×${height}/${count}: controls overlap at ${bounds.bottom}`);
      }
    }
  }
});
