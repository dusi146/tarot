const { test } = require('node:test'), assert = require('node:assert/strict');
const { create } = require('../js/tarot-mobile.js');
function fixture({ permission = 'granted', touch = true, secure = true, vibration = true, request = true } = {}) {
  const win = new EventTarget(), doc = new EventTarget(), pulses = [], notices = [], stored = new Map();
  let time = 1000, permissions = 0;
  Object.assign(win, { isSecureContext: secure, matchMedia: () => ({ matches: touch }), localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
    screen: { orientation: Object.assign(new EventTarget(), { angle: 0 }) }, DeviceOrientationEvent: request ? { requestPermission: async () => { permissions++; return permission; } } : {} });
  doc.hidden = false;
  const nav = { maxTouchPoints: touch ? 1 : 0, userActivation: { hasBeenActive: true } };
  if (vibration) nav.vibrate = value => { pulses.push(value); return true; };
  const api = create({ window: win, document: doc, navigator: nav, now: () => time, onNotice: text => notices.push(text) });
  function orientation(beta, gamma) { const event = new Event('deviceorientation'); Object.assign(event, { beta, gamma }); win.dispatchEvent(event); }
  return { api, win, doc, pulses, notices, nav, stored, orientation, advance: ms => { time += ms; }, permissions: () => permissions };
}
test('sensors are opt-in, request permission once per enable, calibrate to the current posture and clamp tilt', async () => {
  const f = fixture(); assert.equal(f.permissions(), 0); assert.equal(f.api.sample().active, false);
  assert.equal(await f.api.toggleMotion(), true); assert.equal(f.permissions(), 1);
  f.orientation(34, 5); assert.ok(Math.abs(f.api.sample().x) < 1e-8); assert.ok(Math.abs(f.api.sample().y) < 1e-8);
  f.orientation(41, 19); assert.equal(f.api.sample().x, .5); assert.equal(f.api.sample().y, -.25);
  f.orientation(90, 80); assert.equal(f.api.sample().x, .65); assert.equal(f.api.sample().y, -.65);
  await f.api.toggleMotion(); f.orientation(50, 20); assert.equal(f.api.sample().active, false); assert.equal(f.api.sample().x, 0);
});
test('denied permission, unsupported vibration and insecure pages leave normal touch interactions available', async () => {
  const denied = fixture({ permission: 'denied' }); assert.equal(await denied.api.toggleMotion(), false); assert.equal(denied.api.status().motion, false); assert.equal(denied.notices.length, 1);
  const insecure = fixture({ secure: false }); assert.equal(await insecure.api.toggleMotion(), false); assert.equal(insecure.permissions(), 0);
  const desktop = fixture({ touch: false }); assert.equal(desktop.api.status().supportedMotion, false); assert.equal(desktop.api.feel('select'), false);
  const noVibration = fixture({ vibration: false }); assert.equal(noVibration.api.status().supportedHaptics, false); assert.equal(noVibration.api.feel('flip'), false);
});
test('orientation change and returning from a modal recalibrate instead of jumping', async () => {
  const f = fixture({ request: false }); await f.api.toggleMotion(); f.orientation(30, 0); f.orientation(38, 14);
  assert.ok(f.api.sample().x > 0); f.api.suspend(true); assert.equal(f.api.sample().x, 0);
  f.orientation(70, 40); assert.equal(f.api.sample().x, 0);
  f.api.suspend(false); f.orientation(70, 40); assert.equal(f.api.sample().x, 0);
  f.win.screen.orientation.angle = 90; f.win.screen.orientation.dispatchEvent(new Event('change'));
  f.orientation(30, 0); f.orientation(30, 14); assert.ok(Math.abs(f.api.sample().x) < 1e-8); assert.equal(f.api.sample().y, -.5);
});
test('haptics are brief, throttled, independently mutable and stopped in background', () => {
  const f = fixture(); assert.equal(f.api.feel('select'), true); assert.equal(f.pulses[0], 14);
  assert.equal(f.api.feel('tick'), false); f.advance(120); assert.equal(f.api.feel('tick'), true);
  f.advance(100); f.api.feel('shuffle'); f.advance(200); assert.equal(f.api.feel('shuffle'), false);
  f.advance(1200); assert.equal(f.api.feel('complete'), true); assert.deepEqual(f.pulses.at(-1), [10, 45, 18]);
  assert.equal(f.api.toggleHaptics(), false); assert.equal(f.pulses.at(-1), 0); f.advance(500); assert.equal(f.api.feel('flip'), false);
  assert.equal(JSON.parse(f.stored.get('tarot-v2:sensory')).haptics, false);
  f.api.toggleHaptics(); f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(f.pulses.at(-1), 0); assert.equal(f.api.feel('select'), false);
});

test('first interaction enables supported feedback once; further gestures never toggle it off or repeat permission', async () => {
  const f = fixture(); assert.equal(f.permissions(), 0);
  assert.equal(await f.api.activate(), true);
  assert.equal(f.api.status().haptics, true); assert.equal(f.api.status().motion, true);
  await f.api.activate(); await f.api.activate(); assert.equal(f.permissions(), 1);
  assert.equal(f.api.status().motion, true);
  const denied = fixture({ permission: 'denied' });
  assert.equal(await denied.api.activate(), false); await denied.api.activate();
  assert.equal(denied.permissions(), 1); assert.equal(denied.api.status().haptics, true);
  const desktop = fixture({ touch: false }); await desktop.api.activate();
  assert.equal(desktop.permissions(), 0); assert.equal(desktop.api.sample().active, false);
});
