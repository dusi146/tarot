const { test } = require('node:test'), assert = require('node:assert/strict');
const { create } = require('../js/tarot-ai.js');
const state = { userName: 'An', userQuestion: 'Công việc?', userVibe: 'chualanh', dob: {}, activeSpread: { id: 'single' },
  selectedCards: [{ data: { id: '00' }, isReversed: false }], readingResult: 'Lời giải đầu tiên' };
const response = value => ({ ok: true, json: async () => value });
test('refuses legacy sheet-only deployment before sending an AI POST', async () => {
  const calls = [], ai = create({ endpoint: 'https://example.test/exec', fetch: async (_, options) => { calls.push(options); return response({ status: 'success', data: [] }); } });
  await assert.rejects(ai.read(state), /hoàn tất kết nối/); assert.equal(calls.length, 1); assert.equal(calls[0].method, 'GET');
});
for (const health of [{ service: 'tarot-ai', version: 2, configured: true }, { service: 'tarot-groq', version: 1, configured: true }]) test('accepts supported backend ' + health.service + ' and keeps provider metadata', async () => {
  const calls = [], ai = create({ endpoint: 'https://example.test/exec', fetch: async (_, options) => {
    if (!options.body) return response(health);
    calls.push(JSON.parse(options.body)); return response({ status: 'success', text: 'Chào bạn.', provider: 'intern', model: 'deepseek-v4-flash-0711' });
  } });
  assert.deepEqual(await ai.readResult(state), { text: 'Chào bạn.', provider: 'intern', model: 'deepseek-v4-flash-0711' });
  assert.equal(await ai.read(state), 'Chào bạn.'); assert.deepEqual(calls[0].state.cards, [{ id: '00', reversed: false }]);
  assert.ok(!/apiKey|Authorization|INTERN_AI_API_KEY/.test(JSON.stringify(calls)));
});
test('long conversation trims complete old pairs while keeping reading and newest question', async () => {
  let sent;
  const ai = create({ endpoint: 'https://example.test/exec', fetch: async (_, options) => {
    if (!options.body) return response({ service: 'tarot-ai', version: 2, configured: true });
    sent = JSON.parse(options.body); return response({ status: 'success', text: 'Rót nghe nè.' });
  } });
  const history = Array.from({ length: 45 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: 'x'.repeat(1000) + i }));
  await ai.chat(state, history);
  assert.equal(sent.reading, state.readingResult); assert.equal(sent.history.at(-1).text, history.at(-1).text);
  assert.equal(sent.history[0].role, 'user'); assert.ok(sent.history.length % 2 === 1);
  assert.equal(sent.history[1].role, 'rot', 'assistant messages use the Apps Script conversation protocol');
  assert.ok(sent.history.reduce((sum, item) => sum + item.text.length, 0) <= 24000); assert.equal(history.length, 45);
});
test('only an exhausted chain imposes a browser cooldown, and auth errors explain configuration', async () => {
  let now = 1000, posts = 0;
  const ai = create({ endpoint: 'https://example.test/exec', now: () => now, fetch: async (_, options) => {
    if (!options.body) return response({ service: 'tarot-ai', version: 2, configured: true });
    posts++; return response({ status: 'error', code: 'RATE_LIMIT', retryAfter: 40 });
  } });
  await assert.rejects(ai.read(state), /40 giây/); now += 10000;
  await assert.rejects(ai.read(state), /30 giây/); assert.equal(posts, 1);
  const auth = create({ endpoint: 'https://example.test/exec', fetch: async (_, options) => response(options.body
    ? { status: 'error', code: 'AUTH_ERROR', message: 'secret upstream response' } : { service: 'tarot-ai', version: 2, configured: true }) });
  await assert.rejects(auth.read(state), /chủ trang kiểm tra/);
});

test('connection loss and a pending server request recover using the exact same AI snapshot', async () => {
  const posts = [], waits = []; let now = 0;
  const ai = create({ endpoint: 'https://example.test/exec', now: () => now,
    sleep: async ms => { waits.push(ms); now += ms; }, fetch: async (_, options) => {
      if (!options.body) return response({ service: 'tarot-ai', version: 2, configured: true });
      posts.push(JSON.parse(options.body));
      if (posts.length === 1) throw new TypeError('Network disconnected');
      if (posts.length === 2) return response({ status: 'error', code: 'BUSY', retryAfter: 5 });
      return response({ status: 'success', text: 'An ơi, Rót chào bạn.', provider: 'groq' });
    } });
  const result = await ai.read({ ...state, userGender: 'Nữ' });
  assert.match(result, /An ơi/); assert.equal(posts.length, 3);
  assert.deepEqual(posts[0], posts[1]); assert.deepEqual(posts[1], posts[2]);
  assert.equal(posts[0].state.gender, 'Nữ'); assert.deepEqual(waits, [1500, 5000]);
});

test('concurrent identical reading requests share one network operation', async () => {
  let posts = 0, release; const gate = new Promise(resolve => { release = resolve; });
  const ai = create({ endpoint: 'https://example.test/exec', fetch: async (_, options) => {
    if (!options.body) return response({ service: 'tarot-ai', version: 2, configured: true });
    posts++; await gate; return response({ status: 'success', text: 'Một lượt đọc.' });
  } });
  const first = ai.read(state), second = ai.read(state); release();
  assert.deepEqual(await Promise.all([first, second]), ['Một lượt đọc.', 'Một lượt đọc.']);
  assert.equal(posts, 1);
});

test('BUSY has a bounded wait and never becomes a misleading rate limit on the next attempt', async () => {
  let busy = true, now = 0;
  const ai = create({ endpoint: 'https://example.test/exec', now: () => now, sleep: async ms => { now += ms; },
    fetch: async (_, options) => response(!options.body ? { service: 'tarot-ai', version: 2, configured: true }
      : busy ? { status: 'error', code: 'BUSY', retryAfter: 5 } : { status: 'success', text: 'Đã xong.' }) });
  await assert.rejects(ai.read(state), error => error.code === 'BUSY' && !/hạn mức/.test(error.message));
  busy = false; assert.equal(await ai.read(state), 'Đã xong.');
});

test('diagnostics keep only known providers and codes, never arbitrary provider bodies', async () => {
  const { diagnostics } = require('../js/tarot-ai.js');
  const attempts = [{ provider: 'intern', code: 'AUTH_ERROR', status: 401, elapsedMs: 1000, key: 'private-secret' },
    { provider: 'evil-private-secret', code: 'OK', status: 200 }, { provider: 'groq', code: 'private-secret' }];
  const text = diagnostics({ code: 'PROVIDER_ERROR', attempts, message: 'private-secret' });
  assert.equal(text, 'PROVIDER_ERROR / intern:AUTH_ERROR/HTTP401/1000ms');
});
