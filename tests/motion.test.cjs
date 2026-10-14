const { test } = require('node:test');
const assert = require('node:assert/strict');
const motion = require('../tarot-motion.js');

test('longer shuffle holds smoothly increase energy and angular speed within bounds', () => {
  let previousEnergy = 0, previousSpeed = 0;
  for (let time = .1; time <= 20; time += .1) {
    const before = motion.shufflePose(0, time - .001), after = motion.shufflePose(0, time + .001);
    const speed = Math.abs(after.rotY - before.rotY) / .002;
    assert.ok(after.energy >= previousEnergy && after.energy <= 1);
    assert.ok(speed >= previousSpeed - 1e-8 && speed < 1.6);
    previousEnergy = after.energy; previousSpeed = speed;
    for (let i = 0; i < 78; i++) {
      const pose = motion.shufflePose(i, time);
      assert.ok([pose.x, pose.y, pose.z, pose.scale].every(Number.isFinite));
      assert.ok(Math.abs(pose.x) < 1.5 && Math.abs(pose.y) < 1);
    }
  }
  assert.equal(Array.from({ length: 78 }, (_, i) => motion.shufflePose(i, 4).visible).filter(Boolean).length, 39);
  assert.equal(Array.from({ length: 78 }, (_, i) => motion.shufflePose(i, 4, true).visible).filter(Boolean).length, 26);
});

test('inertia travels the same distance at 30, 60, 120 and 144 Hz', () => {
  const results = [30, 60, 120, 144].map(hz => {
    const state = { offset: 0, target: 0, velocity: 2 };
    for (let frame = 0; frame < hz * 2; frame++) motion.advanceRibbon(state, 1 / hz, 1.85, false);
    return state;
  });
  for (const state of results) {
    assert.ok(Math.abs(state.target - results[0].target) < 0.0001);
    assert.ok(Math.abs(state.offset - results[0].offset) < 0.0001);
  }
});

test('overscroll settles at either end without oscillating or escaping', () => {
  for (const sign of [-1, 1]) {
    const state = { offset: sign * 1.8, target: sign * 2.2, velocity: sign * 3.5 };
    for (let frame = 0; frame < 240; frame++) motion.advanceRibbon(state, 1 / 60, 1.85, false);
    assert.ok(Math.abs(state.target - sign * 1.85) < 0.00001);
    assert.ok(Math.abs(state.offset - state.target) < 0.00001);
    assert.equal(state.velocity, 0);
  }
});

test('all spread sizes fit without overlap across portrait, landscape and desktop', () => {
  for (const [width, height] of [[280, 653], [320, 568], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
    const camera = width / height < 1 ? { y: 1.58, z: 6.6, rotX: -0.15 } : { y: 1.55, z: 5.6, rotX: -0.15 };
    for (const count of [1, 3, 4]) {
      for (const preview of [true, false]) {
        const cards = Array.from({ length: count }, (_, i) => motion.selectedLayout(count, i, width, height, camera, 0.8, 1.4, preview));
        const view = motion.viewAt(camera, width / height, cards[0].z);
        for (let i = 0; i < count; i++) {
          const card = cards[i];
          assert.ok(Math.abs(card.x) + 0.8 * card.scale / 2 < view.width * 0.5);
          assert.ok(Math.abs(card.y - view.centerY) + 1.4 * card.scale / 2 < view.height * 0.5);
          for (let previous = 0; previous < i; previous++) {
            const other = cards[previous];
            assert.ok(Math.abs(card.x - other.x) > card.scale * 0.8 || Math.abs(card.y - other.y) > card.scale * 1.4);
          }
        }
        assert.ok(Math.abs(cards[0].x + cards[count - 1].x) < 1e-10);
      }
    }
  }
});
