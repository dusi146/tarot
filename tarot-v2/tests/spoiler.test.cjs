const { test } = require('node:test');
const assert = require('node:assert/strict');
const spoiler = require('../js/tarot-spoiler.js');

function fixture({ reduced = false, canvasSupported = true, observers = true, width = 280, height = 160, styleFails = false } = {}) {
  const frames = new Map(), events = new Map(), clicks = new Set(), motionListeners = new Set();
  let nextFrame = 0, stamp = 0, drawCount = 0, styleReads = 0, size = { width, height };
  let onIntersection, onResize, disconnected = 0;
  const motion = { matches: reduced, addEventListener: (_, fn) => motionListeners.add(fn), removeEventListener: (_, fn) => motionListeners.delete(fn) };
  const view = { devicePixelRatio: 3, matchMedia: () => motion,
    getComputedStyle: () => { styleReads++; if (styleFails) throw Error('No canvas styling'); return { color: '#e2c285' }; },
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; }, cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  if (observers) {
    view.IntersectionObserver = class { constructor(fn) { onIntersection = fn; } observe() {} disconnect() { disconnected++; } };
    view.ResizeObserver = class { constructor(fn) { onResize = fn; } observe() {} disconnect() { disconnected++; } };
  }
  const context = { clearRect() {}, setTransform(...args) { this.transform = args; }, beginPath() {},
    arc(x, y, r) { assert.ok([x, y, r].every(Number.isFinite)); drawCount++; }, fill() {} };
  const canvas = { style: {}, attributes: {}, getContext: () => canvasSupported ? context : null,
    setAttribute(name, value) { this.attributes[name] = value; },
    getBoundingClientRect: () => ({ left: 12, top: 22 }), remove() { this.removed = true; } };
  const document = { defaultView: view, hidden: false, createElement: () => canvas,
    addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  const classes = new Set(), element = { ownerDocument: document, dataset: {},
    classList: { contains: name => classes.has(name), add: name => classes.add(name) },
    querySelector: () => ({ addEventListener: (_, fn) => clicks.add(fn), removeEventListener: (_, fn) => clicks.delete(fn) }),
    getBoundingClientRect: () => size, appendChild() {} };
  const container = { querySelectorAll: () => element.dataset.threadsInit ? [] : [element] };
  function tick(step = 34) { stamp += step; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(stamp); }
  return { container, element, canvas, context, document, frames, events, motionListeners,
    get drawCount() { return drawCount; }, get styleReads() { return styleReads; }, get disconnected() { return disconnected; },
    tick, intersect: value => onIntersection?.([{ isIntersecting: value }]),
    resize: (w, h) => { size = { width: w, height: h }; if (onResize) onResize(); else events.get('resize')?.(); },
    reveal: (event = { detail: 0 }) => { for (const fn of [...clicks]) fn(event); },
    visibility: hidden => { document.hidden = hidden; events.get('visibilitychange')?.(); },
    reduce: value => { motion.matches = value; for (const fn of [...motionListeners]) fn(); } };
}

test('particle mask initializes once, uses the theme color, limits work and caps pixel density', () => {
  const f = fixture({ width: 2000, height: 1000 }); spoiler.init(f.container); spoiler.init(f.container);
  assert.equal(f.canvas.attributes['aria-hidden'], 'true');
  assert.equal(f.context.fillStyle, '#e2c285'); assert.equal(f.context.transform[0], 2);
  assert.equal(f.drawCount, 3200); assert.equal(f.frames.size, 0);
  f.intersect(true); f.tick();
  assert.equal(f.drawCount, 6400); assert.equal(f.styleReads, 1, 'no computed-style reads in the animation loop');
  spoiler.destroy(f.container);
});

test('offscreen, hidden and closed masks pause; returning resumes just one animation loop', () => {
  const f = fixture(); spoiler.init(f.container); f.intersect(true); assert.equal(f.frames.size, 1);
  f.intersect(false); assert.equal(f.frames.size, 0);
  f.intersect(true); f.visibility(true); assert.equal(f.frames.size, 0);
  f.visibility(false); assert.equal(f.frames.size, 1);
  f.resize(0, 0); assert.equal(f.frames.size, 0);
  f.resize(320, 220); assert.equal(f.frames.size, 1); assert.equal(f.canvas.style.width, '324px');
  spoiler.destroy(f.container); spoiler.destroy(f.container);
  assert.equal(f.frames.size, 0); assert.equal(f.events.size, 0); assert.equal(f.motionListeners.size, 0);
  assert.equal(f.disconnected, 2); assert.ok(f.canvas.removed);
});

for (const event of [{ detail: 1, clientX: 120, clientY: 100 }, { detail: 0 }]) {
  test((event.detail ? 'pointer' : 'keyboard') + ' reveal disperses particles, finishes and releases all listeners', () => {
    const f = fixture(); spoiler.init(f.container); f.intersect(true); f.reveal(event); f.reveal(event);
    assert.ok(f.element.classList.contains('revealed'));
    for (let i = 0; i < 30; i++) f.tick();
    assert.ok(f.canvas.removed); assert.equal(f.frames.size, 0); assert.equal(f.events.size, 0);
    assert.equal(f.disconnected, 2); assert.equal(f.motionListeners.size, 0);
    spoiler.destroy(f.container);
  });
}

test('reduced motion keeps a static mask and reveals immediately without starting an animation', () => {
  const f = fixture({ reduced: true }); spoiler.init(f.container); f.intersect(true);
  assert.ok(f.drawCount > 0); assert.equal(f.frames.size, 0);
  f.reveal(); assert.ok(f.canvas.removed); assert.equal(f.frames.size, 0);
  spoiler.destroy(f.container);
  const changed = fixture(); spoiler.init(changed.container); changed.intersect(true); changed.reduce(true);
  assert.equal(changed.frames.size, 0); changed.reduce(false); assert.equal(changed.frames.size, 1);
  changed.reveal(); changed.reduce(true); assert.ok(changed.canvas.removed); spoiler.destroy(changed.container);
});

test('resize fallback works without observers, and unavailable canvas leaves the native reveal intact', () => {
  const f = fixture({ observers: false }); spoiler.init(f.container);
  assert.equal(f.frames.size, 1); f.resize(210, 80); assert.equal(f.canvas.style.height, '84px');
  spoiler.destroy(f.container); assert.equal(f.events.size, 0);
  const unsupported = fixture({ canvasSupported: false }); spoiler.init(unsupported.container);
  assert.equal(unsupported.element.dataset.threadsInit, undefined); assert.equal(unsupported.frames.size, 0);
  assert.equal(unsupported.events.size, 0); spoiler.destroy(unsupported.container);
  const failed = fixture({ styleFails: true }); assert.doesNotThrow(() => spoiler.init(failed.container));
  assert.ok(failed.canvas.removed); assert.equal(failed.events.size, 0); assert.equal(failed.frames.size, 0);
  assert.equal(failed.disconnected, 2); spoiler.destroy(failed.container);
});
