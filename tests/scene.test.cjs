// Exercise the production scene with real Three.js geometry/raycasting and GSAP.
// Only the DOM, audio, texture transport, and GPU are replaced for Node.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../vendor/three.r128.min.js');
const { gsap } = require('../vendor/gsap.3.12.5.min.js');
const motion = require('../tarot-motion.js');

class Element {
  constructor() {
    this.style = {}; this.dataset = {}; this.value = ''; this.innerHTML = ''; this.textContent = '';
    this.events = {}; this.attributes = new Map(); this.captures = new Set();
    const classes = new Set();
    this.classList = { add: (...items) => items.forEach(x => classes.add(x)), remove: (...items) => items.forEach(x => classes.delete(x)), contains: x => classes.has(x) };
  }
  addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
  dispatch(name, data = {}) { for (const callback of this.events[name] || []) callback({ preventDefault() {}, ...data }); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelectorAll() { return []; }
  focus() {}
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  get clientWidth() { return 1280; }
  getContext() {
    const gradient = { addColorStop() {} };
    return new Proxy({}, { get: (_, name) => name.startsWith('create') ? () => gradient : () => {} });
  }
}

function scene({ textureFailure = false, oracleDeferred = false } = {}) {
  gsap.globalTimeline.clear();
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const document = new Element();
  Object.assign(document, { hidden: false, body: new Element(), getElementById: get, createElement: () => new Element(), querySelector: () => null, querySelectorAll: () => [] });
  const window = new Element();
  Object.assign(window, { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2, matchMedia: () => ({ matches: false }), THREE: {}, gsap, TarotMotion: motion, TarotGeometry: require("../tarot-geometry.js") });
  class Renderer {
    constructor() { this.shadowMap = {}; this.capabilities = { getMaxAnisotropy: () => 16 }; this.info = { render: { calls: 0 } }; }
    setPixelRatio() {} setSize() {} initTexture() {} render() {}
  }
  class TextureLoader {
    load(url, onLoad, progress, onError) {
      const texture = new THREE.Texture();
      queueMicrotask(() => { if (textureFailure) onError?.(new Error('offline')); else onLoad?.(texture); });
      return texture;
    }
  }
  const three = { ...THREE, WebGLRenderer: Renderer, TextureLoader };
  window.THREE = three;
  let now = 0;
  let timerId = 0;
  let readingRequests = 0;
  let resolveOracle;
  const oracleGate = oracleDeferred ? new Promise(resolve => { resolveOracle = resolve; }) : Promise.resolve();
  const context = vm.createContext({
    document, window, THREE: three, gsap, console, performance: { now: () => now },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: () => ++timerId, clearTimeout() {}, setInterval: () => ++timerId, clearInterval() {},
    fetch: async (url, options) => {
      if (options?.method === 'POST') {
        readingRequests++;
        await oracleGate;
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Một góc nhìn mới cho bạn.' }] } }] }) };
      }
      return { json: async () => ({ status: 'empty', data: [] }) };
    }
  });
  let source = fs.readFileSync(require.resolve('../script.js'), 'utf8');
  vm.runInContext(fs.readFileSync(require.resolve('../tarot-data.js'), 'utf8'), context);
  {
    const close = source.lastIndexOf('});');
    source = source.slice(0, close) + `
    window.testScene = { appState, cardMeshes, camera, scene, ribbon, drawEntry,
      startChargingStage, startDrawStage, startRevealStage, pickCard, flipSelectedCard,
      onHoldStart, onHoldEnd, cancelHold, updateRibbonCardsPositions, resizeScene, hitCard,
      SPREAD_CONFIGS, handleCloseOracle, faceCache };
  ` + source.slice(close);
  }
  vm.runInContext(source, context);
  document.dispatch('DOMContentLoaded');
  const api = window.testScene;
  const advance = async seconds => {
    const start = gsap.globalTimeline.time();
    for (let elapsed = 0.01; elapsed <= seconds + 0.001; elapsed += 0.01) {
      now += 10;
      gsap.globalTimeline.time(start + elapsed, false);
      if (api.appState?.currentStage === 'draw') api.updateRibbonCardsPositions(0.01);
      await Promise.resolve();
    }
    gsap.ticker.sleep();
  };
  return Object.assign(api, { window, document, get, advance, elapsed: () => now, setNow: value => { now = value; }, readingRequests: () => readingRequests, resolveOracle: () => resolveOracle?.() });
}

async function enterDraw(s, spread = 'time') {
  s.appState.activeSpread = s.SPREAD_CONFIGS[spread];
  s.startChargingStage();
  s.onHoldStart();
  s.setNow(s.elapsed() + 500);
  s.onHoldEnd();
  assert.equal(s.appState.currentStage, 'charge');
  await s.advance(0.7);
  assert.equal(s.appState.currentStage, 'charge', 'wait for the last settling card');
  await s.advance(0.15);
  assert.equal(s.appState.currentStage, 'draw');
  assert.equal(s.appState.isTransitioning, true);
  s.pickCard(s.cardMeshes[39]);
  assert.equal(s.appState.selectedCards.length, 0, 'cannot pick during entry');
  await s.advance(1.6);
  assert.equal(s.appState.isTransitioning, false);
}

test('settling and entry complete before picking; fast picks produce unique cards', async () => {
  const s = scene();
  await enterDraw(s, 'solution');
  for (const index of [37, 38, 39, 40]) {
    const before = s.appState.selectedCards.length;
    s.pickCard(s.cardMeshes[index]); s.pickCard(s.cardMeshes[index]);
    s.pickCard(s.cardMeshes[(index + 1) % 78]);
    assert.equal(s.appState.selectedCards.length, before + 1, 'one card flight at a time');
    if (index !== 40) await s.advance(0.9);
  }
  assert.equal(s.appState.selectedCards.length, 4);
  assert.equal(s.appState.usedCardIds.size, 4);
  await s.advance(0.55);
  assert.equal(s.appState.currentStage, 'draw', 'do not interrupt the last flight');
  await s.advance(0.4);
  assert.equal(s.appState.currentStage, 'reveal');
  await s.advance(1);
  assert.equal(s.appState.isTransitioning, false);
  assert.equal(s.cardMeshes.filter(m => m.visible).length, 4);
});

test('cancel and short hold reset; another finger cannot finish a hold', async () => {
  const s = scene();
  s.startChargingStage();
  s.onHoldStart({ pointerId: 1, isPrimary: true, button: 0, preventDefault() {} });
  s.setNow(600);
  s.onHoldEnd({ pointerId: 2 });
  assert.equal(s.appState.isHolding, true);
  s.cancelHold();
  assert.equal(s.appState.isHolding, false);
  await s.advance(1);
  assert.equal(s.appState.currentStage, 'charge');
  s.onHoldStart();
  s.onHoldEnd();
  s.onHoldStart();
  assert.equal(s.appState.isHolding, false, 'wait for short-hold return animation');
  await s.advance(1);
  s.onHoldStart();
  assert.equal(s.appState.isHolding, true);
  s.cancelHold();
});

test('a drag, pointer cancellation, and UI clicks cannot pick a card', async () => {
  const s = scene();
  await enterDraw(s);
  const canvas = s.get('webgl-canvas');
  s.scene.updateMatrixWorld(true); s.camera.updateMatrixWorld(true);
  const p = s.cardMeshes[39].position.clone().project(s.camera);
  const event = { pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch', clientX: (p.x + 1) * 640, clientY: (1 - p.y) * 360 };
  canvas.dispatch('pointerdown', event);
  canvas.dispatch('pointermove', { ...event, clientX: event.clientX + 90 });
  canvas.dispatch('pointerup', { ...event, clientX: event.clientX + 90 });
  assert.equal(s.appState.selectedCards.length, 0);
  canvas.dispatch('pointerdown', event);
  canvas.dispatch('pointercancel', event);
  canvas.dispatch('pointerup', event);
  s.window.dispatch('pointerup', event);
  assert.equal(s.appState.selectedCards.length, 0);
  canvas.dispatch('pointerdown', event);
  canvas.dispatch('pointerup', event);
  assert.equal(s.appState.selectedCards.length, 1, 'real Three.js raycast can still select');
});

test('losing visibility cancels a hold and context restoration permits continuation', async () => {
  const s = scene();
  s.startChargingStage();
  s.onHoldStart();
  s.document.hidden = true;
  s.document.dispatch('visibilitychange');
  assert.equal(s.appState.isHolding, false);
  s.document.hidden = false;
  s.document.dispatch('visibilitychange');
  await s.advance(1);
  assert.equal(s.appState.currentStage, 'charge');
  s.get('webgl-canvas').dispatch('webglcontextlost');
  s.get('webgl-canvas').dispatch('webglcontextrestored');
  s.onHoldStart();
  assert.equal(s.appState.isHolding, true);
  s.cancelHold();
});

test('rapid flip requests queue once; resize mid-flip lands at new targets', async () => {
  const s = scene();
  await enterDraw(s);
  for (const index of [38, 39, 40]) { s.pickCard(s.cardMeshes[index]); await s.advance(0.9); }
  await s.advance(2.1);
  const cards = s.appState.selectedCards;
  cards[0].isReversed = true;
  await s.flipSelectedCard(cards[0]);
  await s.flipSelectedCard(cards[1]);
  await s.flipSelectedCard(cards[1]);
  await s.flipSelectedCard(cards[2]);
  await s.advance(0.4);
  s.window.innerWidth = 320; s.window.innerHeight = 568;
  s.resizeScene();
  await s.advance(8);
  assert.equal(cards.filter(c => c.isFlipped).length, 3);
  assert.equal(s.appState.activeFlip, null);
  assert.equal(s.get('oracleTriggerBar').classList.contains('show'), true);
  for (const card of cards) assert.ok(card.mesh.position.distanceTo(card.mesh.userData.targetPos) < 0.0001);
  assert.ok(Math.abs(cards[0].mesh.rotation.z - Math.PI) < 0.0001);
  s.appState.currentStage = 'oracle';
  s.handleCloseOracle();
  assert.equal(s.appState.currentStage, 'reveal');
});

test('failed artwork still permits reveal and completion', async () => {
  const s = scene({ textureFailure: true });
  await enterDraw(s, 'single');
  s.pickCard(s.cardMeshes[39]);
  await s.advance(2.1);
  const card = s.appState.selectedCards[0];
  await s.flipSelectedCard(card);
  await s.advance(3);
  assert.equal(card.face.failed, true);
  assert.equal(card.isFlipped, true);
  assert.equal(s.appState.activeFlip, null);
});

test('large action buttons select, reveal all, and reuse an in-flight reading', async () => {
  const s = scene({ oracleDeferred: true });
  assert.equal(s.cardMeshes.filter(mesh => mesh.visible).length, 3, 'entry scene renders only three cards');
  await enterDraw(s, 'solution');
  const pick = s.get('pickCenterBtn');
  for (let i = 0; i < 4; i++) { pick.dispatch('click'); if (i < 3) await s.advance(1.2); }
  assert.equal(s.appState.selectedCards.length, 4);
  assert.equal(pick.disabled, true);
  await s.advance(2);
  const action = s.get('summonOracleBtn');
  assert.equal(action.disabled, false);
  action.dispatch('click');
  assert.equal(s.readingRequests(), 0, 'opening cards does not request a reading');
  await s.advance(8);
  assert.equal(s.appState.selectedCards.filter(card => card.isFlipped).length, 4);
  assert.equal(action.disabled, false);
  s.window.innerWidth = 320;
  s.window.innerHeight = 568;
  s.resizeScene();
  await s.advance(0.1);
  for (const card of s.appState.selectedCards) {
    const captionTop = Number.parseFloat(s.get('cardLabel-' + card.slotIndex).style.top);
    assert.ok(captionTop + 30 < 420, 'two-line card caption leaves space above the 427px action button');
  }
  action.dispatch('click');
  await s.advance(0.1);
  assert.equal(s.readingRequests(), 1);
  s.handleCloseOracle();
  action.dispatch('click');
  assert.equal(s.readingRequests(), 1, 'reopening while pending does not duplicate requests');
  s.resolveOracle();
  await s.advance(0.1);
  assert.equal(s.get('readingText').textContent, 'Một góc nhìn mới cho bạn.');
  s.handleCloseOracle();
  action.dispatch('click');
  assert.equal(s.readingRequests(), 1, 'completed reading is reused');
});

test('restart reuses the scene, preserves choices, and cancels old card motion', async () => {
  const s = scene();
  await enterDraw(s, 'solution');
  for (let i = 0; i < 4; i++) { s.get('pickCenterBtn').dispatch('click'); await s.advance(1.2); }
  await s.advance(2);
  s.get('summonOracleBtn').dispatch('click');
  await s.advance(0.3);
  s.get('restartBtn').dispatch('click');
  assert.equal(s.appState.currentStage, 'intent');
  assert.equal(s.appState.activeSpread.id, 'solution');
  assert.equal(s.appState.selectedCards.length, 0);
  assert.equal(s.cardMeshes.filter(mesh => mesh.visible).length, 3);
  await s.advance(6);
  assert.equal(s.appState.currentStage, 'intent');
  assert.equal(s.appState.activeFlip, null);
  await enterDraw(s, 'single');
  s.get('pickCenterBtn').dispatch('click');
  assert.equal(s.appState.selectedCards.length, 1, 'same scene can start another spread');
});

test('a reading from a previous session cannot overwrite a new spread', async () => {
  const s = scene({ oracleDeferred: true });
  await enterDraw(s, 'single');
  s.get('pickCenterBtn').dispatch('click');
  await s.advance(2);
  s.get('summonOracleBtn').dispatch('click');
  await s.advance(2);
  s.get('summonOracleBtn').dispatch('click');
  await s.advance(0.1);
  assert.equal(s.readingRequests(), 1);
  s.get('restartBtn').dispatch('click');
  s.resolveOracle();
  await s.advance(0.2);
  assert.equal(s.appState.currentStage, 'intent');
  assert.equal(s.appState.readingResult, '');
  assert.equal(s.get('readingText').textContent, '');
});

test('scrubber reaches both ends and settling skips cards already selected', async () => {
  const s = scene(); await enterDraw(s, 'solution');
  const range = s.get('deckScrubber');
  range.dispatch('input', { target: { value: '0' } }); await s.advance(0.01);
  assert.equal(s.get('pickCenterBtn').disabled, true, 'wait for the indicated card to reach the center');
  s.get('pickCenterBtn').dispatch('click');
  assert.equal(s.appState.selectedCards.length, 0);
  await s.advance(1.4);
  assert.equal(s.get('pickCenterBtn').disabled, false);
  assert.ok(Math.abs(s.ribbon.offset - 38.5) < 0.001);
  s.get('pickCenterBtn').dispatch('click'); await s.advance(1.4);
  assert.equal(s.appState.selectedCards[0].mesh.userData.deckIndex, 0);
  assert.ok(!s.appState.selectedCards[0].mesh.visible, 'completed picks move out of the carousel');
  assert.ok(Math.abs(s.ribbon.target - 37.5) < 0.001, 'next available card moves to the center');
  range.dispatch('input', { target: { value: '77' } }); await s.advance(1.4);
  assert.ok(Math.abs(s.ribbon.offset + 38.5) < 0.001);
  s.get('pickCenterBtn').dispatch('click');
  assert.equal(s.appState.selectedCards[1].mesh.userData.deckIndex, 77);
});

test('resizing during the final pick completes one flight and allows reveal', async () => {
  const s = scene(); await enterDraw(s, 'single');
  s.get('pickCenterBtn').dispatch('click'); await s.advance(0.2);
  s.window.innerWidth = 320; s.window.innerHeight = 568; s.resizeScene();
  assert.equal(s.appState.isPickingCard, false);
  assert.equal(s.appState.selectedCards.length, 1);
  await s.advance(1.5);
  assert.equal(s.appState.currentStage, 'reveal');
  assert.equal(s.appState.isTransitioning, false);
  const card = s.appState.selectedCards[0];
  assert.ok(card.mesh.visible);
  assert.ok(card.mesh.position.distanceTo(card.mesh.userData.targetPos) < 0.0001);
});

after(() => { gsap.globalTimeline.clear(); gsap.ticker.sleep(); });
