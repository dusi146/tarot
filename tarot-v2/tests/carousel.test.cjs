const test = require('node:test');
const assert = require('node:assert/strict');
const ring = require('../js/tarot-carousel.js');
test('forwards and backwards traverse every card and cross the seam repeatedly', () => {
  for (const direction of [-1, 1]) {
    const visited = new Set();
    for (let step = 0; step < 78 * 4; step++) {
      const phase = 38 + step * direction, index = ring.wrap(phase, 78);
      visited.add(index);
      assert.equal(ring.offset(index, phase, 78), 0);
      assert.equal(ring.offset(ring.wrap(index + direction, 78), phase, 78), direction);
    }
    assert.equal(visited.size, 78);
  }
});
test('quick navigation chooses the nearby revolution instead of springing across the deck', () => {
  assert.equal(ring.nearest(0, 77, 78), 78);
  assert.equal(ring.nearest(77, 0, 78), -1);
  assert.equal(ring.nearest(1, -79, 78), -77);
  assert.equal(ring.nearest(77, 78 * 100 + .2, 78), 78 * 100 - 1);
  assert.equal(ring.wrap(-.25, 78), 77.75);
});
test('removing any card preserves every remaining identity across positive and negative revolutions', () => {
  for (const count of [78, 77, 75, 5, 2]) for (let removed = 0; removed < count; removed++) {
    const cards = Array.from({ length: count }, (_, i) => i), remaining = cards.filter(id => id !== removed);
    for (let cycle = -3; cycle <= 3; cycle++) for (let index = 0; index < count; index++) {
      if (index === removed) continue;
      const next = ring.remove(cycle * count + index, removed, count);
      assert.equal(remaining[ring.wrap(next, count - 1)], cards[index]);
    }
    const from = ring.remove(removed + .25, removed, count), to = ring.remove(removed + .75, removed, count);
    assert.ok(Math.abs(to - from) < .00001, 'Only the gap collapses');
  }
});
