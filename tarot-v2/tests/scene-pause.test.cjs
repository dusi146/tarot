const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/engine.js'), 'utf8');

function fixture({ started = true } = {}) {
  const frames = new Map(), windowEvents = new Map(), documentEvents = new Map(), glEvents = new Map();
  const calls = { main: 0, overlay: 0, cards: 0, motes: 0, update: 0, publish: 0, resize: 0, layout: 0 };
  let now = 1000, sequence = 0;
  const state = { act: 'HOME', inputBlocked: false, globalTime: 10, actTime: 3,
    smoothPointer: { x: 0, y: 0 }, pointerNDC: { x: 0, y: 0 } };
  const rotation = () => ({ rotation: { z: 0 } });
  const document = { hidden: false, addEventListener: (name, listener) => documentEvents.set(name, listener) };
  const context = vm.createContext({ Math, state, document, lerp: (a, b, t) => a + (b - a) * t, performance: { now: () => now },
    frameRequest: 0, renderStarted: started, contextLost: false, viewportDirty: false, spreadRectsDirty: false,
    revealLayoutDirty: false, profileFrozen: false, reducedMotion: false, hoverPending: false,
    pointerState: { isDown: false }, holdBtnEl: { classList: { remove() {} } }, holdLabelEl: {}, sound: {},
    requestAnimationFrame: fn => { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame: id => frames.delete(id),
    window: { addEventListener: (name, listener) => windowEvents.set(name, listener), TarotMobile: { suspend() {}, sample: () => ({ active: false }) } },
    applyViewportResize: () => { calls.resize++; context.viewportDirty = false; },
    computeRevealLayout: () => { calls.layout++; context.revealLayoutDirty = false; },
    cardBatch: { sync: () => calls.cards++ }, moteBatch: { sync: () => calls.motes++ }, cards: [], revealMotesPool: [],
    MOTE_POOL_SIZE: 0, TOTAL_CARDS: 0,
    renderer: { render: () => calls.main++, domElement: { addEventListener: (name, fn) => glEvents.set(name, fn) } },
    overlayRenderer: { render: () => calls.overlay++, domElement: { style: { display: 'block' } } },
    overlayScene: { children: [{ isMesh: true }] }, scene: {}, camera: { position: { copy() {} }, lookAt() {} },
    nebulaUniforms: { uTime: { value: 0 } }, ringOuter: rotation(), ringMid: rotation(), ringInner: rotation(), ringTilted: rotation(), ringEllipse: rotation(),
    stepSpringVec3() {}, updateHome: () => calls.update++, updateActReveal: () => calls.update++,
    performCardRaycast() {}, publishState: () => calls.publish++ });
  const loop = source.slice(source.indexOf('      let lastFrameTime = performance.now();'), source.indexOf('      window.onload = function'));
  const blocking = source.slice(source.indexOf('  blockInput(blocked) {'), source.indexOf('  skipIntro() {'));
  const hooks = source.slice(source.indexOf("document.addEventListener('visibilitychange', () => {"), source.indexOf("holdBtnEl.addEventListener('keydown'"));
  const resizeHook = source.split('\n').find(line => line.includes("window.addEventListener('resize', () => { viewportDirty"));
  vm.runInContext(loop + '\nthis.api = { requestSceneFrame, syncSceneActivity, blockInput: ({' + blocking + '}).blockInput };\n' + hooks + resizeHook, context);
  function tick(ms = 16) { now += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); }
  return { context, state, calls, frames, tick, advance: ms => { now += ms; }, api: context.api,
    resize: () => windowEvents.get('resize')(),
    visibility: hidden => { document.hidden = hidden; documentEvents.get('visibilitychange')(); },
    loseContext: () => glEvents.get('webglcontextlost')({ preventDefault() {} }), restoreContext: () => glEvents.get('webglcontextrestored')() };
}

test('opening a dialog stops both WebGL renderers, card work and the scene clock', () => {
  const f = fixture(); f.api.requestSceneFrame(); f.tick();
  assert.equal(f.calls.main, 1); assert.equal(f.calls.overlay, 1);
  f.api.blockInput(true); const time = f.state.globalTime;
  for (let i = 0; i < 100; i++) f.tick();
  assert.equal(f.frames.size, 0); assert.equal(f.state.globalTime, time);
  for (const key of ['main', 'overlay', 'cards', 'motes', 'update', 'publish']) assert.equal(f.calls[key], 1, key);
});

test('closing the final dialog resumes one loop without advancing through time spent reading', () => {
  const f = fixture(); f.api.requestSceneFrame(); f.tick(); f.api.blockInput(true); f.tick();
  const time = f.state.globalTime; f.advance(120000);
  f.api.blockInput(true); f.tick(); assert.equal(f.calls.main, 1, 'another open dialog keeps the scene paused');
  f.api.blockInput(false); f.api.requestSceneFrame(); assert.equal(f.frames.size, 1);
  f.tick(); assert.ok(Math.abs(f.state.globalTime - time - .016) < 1e-8);
  assert.equal(f.calls.main, 2); assert.equal(f.frames.size, 1);
});

test('resizing while reading redraws once without restarting motion or advancing cards', () => {
  const f = fixture(); f.api.requestSceneFrame(); f.tick(); f.api.blockInput(true); f.tick();
  const time = f.state.globalTime;
  f.resize(); f.resize(); assert.equal(f.frames.size, 1); f.tick();
  assert.equal(f.calls.resize, 1); assert.equal(f.calls.main, 2); assert.equal(f.calls.overlay, 2);
  assert.equal(f.calls.update, 1); assert.equal(f.calls.publish, 1);
  assert.equal(f.state.globalTime, time); assert.equal(f.frames.size, 0);
});

test('hidden tabs and context loss release the loop; a restored paused scene redraws once', () => {
  const f = fixture(); f.api.requestSceneFrame(); f.tick();
  f.visibility(true); assert.equal(f.frames.size, 0); f.advance(30000);
  f.visibility(false); f.tick(); assert.ok(Math.abs(f.state.globalTime - 10.032) < 1e-8);
  f.loseContext(); assert.equal(f.frames.size, 0);
  f.api.blockInput(true); f.restoreContext(); assert.equal(f.frames.size, 1); f.tick();
  assert.equal(f.calls.resize, 1); assert.equal(f.frames.size, 0); assert.equal(f.calls.update, 2);
});

test('startup waits for warmed resources, and paused caption changes preserve the static scene', () => {
  const f = fixture({ started: false }); f.resize(); f.api.requestSceneFrame(); assert.equal(f.frames.size, 0);
  f.context.renderStarted = true; f.api.syncSceneActivity(); f.tick();
  f.state.act = 'REVEAL'; f.api.blockInput(true); f.tick();
  f.context.revealLayoutDirty = true; f.api.requestSceneFrame(); f.tick();
  assert.equal(f.calls.layout, 1); assert.equal(f.frames.size, 0); assert.equal(f.calls.update, 1);
});
