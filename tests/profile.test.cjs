const { test } = require('node:test');
const assert = require('node:assert/strict');
const profile = require('../tarot-profile.js');

test('personal preferences survive reload, excluding questions and conversation data', () => {
  const storage = new Map();
  const browser = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const first = profile.create(() => browser);
  assert.equal(first.save({ name: '  An  ', gender: 'Nữ', dob: { day: 8, month: 10, year: 2003 }, vibe: 'quansu', spread: 'mind', question: 'Riêng tư', history: ['Tâm sự'] }), true);
  const second = profile.create(() => browser);
  assert.equal(second.load().name, 'An');
  assert.deepEqual(second.load().dob, { day: 8, month: 10, year: 2003 });
  assert.equal(second.load().vibe, 'quansu');
  assert.equal(second.load().spread, 'mind');
  assert.ok(!storage.get(profile.KEY).includes('Riêng tư'));
  second.clear(); assert.equal(second.load().name, '');
});

test('unavailable browser storage and damaged profiles never block entry', () => {
  const denied = profile.create(() => { throw new Error('SecurityError'); });
  assert.equal(denied.load().name, ''); assert.equal(denied.save({ name: 'An' }), false); denied.clear();
  const damaged = profile.create(() => ({ getItem: () => '{ broken' }));
  assert.equal(damaged.load().vibe, 'chualanh');
  assert.equal(profile.clean(null).name, '');
  assert.equal(profile.clean({ name: {}, vibe: 'bad', dob: { day: 99, month: 13 } }).dob.day, '');
});
