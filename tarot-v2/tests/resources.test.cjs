const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const THREE = require('../vendor/three.r128.min.js');
const source = fs.readFileSync(require.resolve('../js/engine.js'), 'utf8');
function artFixture() {
  const canvases = [];
  const document = { createElement() {
    const operations = [], canvas = { kind: canvases.length, operations };
    const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }),
      fillRect: (...args) => operations.push(['fillRect', ...args]),
      drawImage: (image, ...args) => operations.push(['drawImage', image.kind, ...args]) },
    { set(target, key, value) { operations.push([key, value]); target[key] = value; return true; } });
    canvas.getContext = () => context; canvases.push(canvas); return canvas;
  } };
  const code = source.slice(source.indexOf('function createSynchronizedArtBuilder()'), source.indexOf('// Helper to draw a rounded rectangle path'));
  const builder = vm.runInNewContext(code + '\ncreateSynchronizedArtBuilder()', {
    document, THREE, TEX_W: 900, TEX_H: 1530, sharedPaperGrain: { kind: 'grain' }, clamp: (value, min, max) => Math.max(min, Math.min(max, value)) });
  return { builder, canvases };
}
test('split texture preparation retains exact roughness/metalness/emboss operations, resolution and filtering', async () => {
  const a = artFixture(), b = artFixture();
  const synchronous = a.builder.compileMaps(), steps = [];
  const asynchronous = await b.builder.compileMaps(null, async work => { steps.push(work); return work(); });
  assert.equal(steps.length, 4, 'Independent PBR layers and texture creation yield between jobs');
  assert.deepEqual(b.canvases.map(canvas => canvas.operations), a.canvases.map(canvas => canvas.operations));
  for (const key of Object.keys(synchronous)) {
    const before = synchronous[key], after = asynchronous[key];
    assert.equal(before.image.width, after.image.width); assert.equal(before.image.height, after.image.height);
    assert.equal(before.anisotropy, after.anisotropy); assert.equal(before.encoding, after.encoding);
    assert.equal(before.minFilter, after.minFilter); assert.equal(before.magFilter, after.magFilter);
  }
});
test('resetting during queued preparation cancels the remaining work without creating textures', async () => {
  const { builder, canvases } = artFixture(); let steps = 0;
  const result = await builder.compileMaps(null, work => ++steps === 2 ? null : work());
  assert.equal(result, null); assert.equal(steps, 2);
  assert.equal(canvases[3].operations.length, 0); assert.equal(canvases[4].operations.length, 0);
});
test('all sound layers keep their complete scheduled life, then release their graph without disconnecting master audio', () => {
  const code = source.slice(source.indexOf('class TarotSoundEngine'), source.indexOf('const sound = new TarotSoundEngine'));
  const Sound = vm.runInNewContext('(' + code + ')', { WeakMap, Math, clamp: (value, min, max) => Math.max(min, Math.min(max, value)) });
  const nodes = [], sources = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  function node(isSource = false) {
    const listeners = [];
    const result = { gain: param(), frequency: param(), Q: param(), playbackRate: param(), pan: param(), disconnects: 0,
      connect() {}, disconnect() { this.disconnects++; }, addEventListener(type, listener) { if (type === 'ended') listeners.push(listener); },
      start() {}, stop() {}, end() { listeners.splice(0).forEach(listener => listener()); } };
    nodes.push(result); if (isSource) sources.push(result); return result;
  }
  const sound = new Sound(); sound.masterGain = node(); sound.pinkNoiseBuffer = sound.whiteNoiseBuffer = {};
  sound.ctx = { currentTime: 100, createGain: () => node(), createBiquadFilter: () => node(), createStereoPanner: () => node(),
    createBufferSource: () => node(true), createOscillator: () => node(true) };
  for (const method of ['playCardTick', 'playHoverBrush', 'playPaperRustle', 'playFlightWhoosh', 'playSlotDock', 'playCardFlipStart', 'playRevealResonance', 'playUiClick', 'playChime']) {
    sound.ctx.currentTime++; sound[method]();
  }
  assert.ok(sources.length > 20, 'All original layered sounds are synthesized');
  assert.ok(nodes.every(node => node.disconnects === 0), 'Nothing is disconnected before its native ended event');
  for (const source of sources.reverse()) source.end();
  assert.equal(sound.masterGain.disconnects, 0);
  assert.ok(nodes.slice(1).every(node => node.disconnects === 1), 'No ended voice or shared panner remains connected');
});
