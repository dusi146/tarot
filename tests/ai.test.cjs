const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../tarot-ai.js');
const state = { userName: 'An', userQuestion: 'Công việc?', userVibe: 'chualanh', dob: {},
  activeSpread: { id: 'single' }, selectedCards: [{ data: { id: '00', meaning: 'not trusted' }, isReversed: false }], readingResult: 'Lời giải ban đầu' };
const response = result => ({ ok: true, json: async () => result });

test('AI refuses legacy Apps Script before any POST can accidentally append a sheet row', async () => {
  const calls = [], ai = create({ endpoint: 'https://example.test/exec', fetch: async (url, options) => {
    calls.push({ url, options }); return response({ status: 'success', data: [] });
  } });
  await assert.rejects(ai.read(state), /hoàn tất kết nối/);
  assert.equal(calls.length, 1); assert.equal(calls[0].options.method, undefined);
});
test('browser sends card identities and conversation context without API keys or arbitrary instructions', async () => {
  const bodies = [], ai = create({ endpoint: 'https://example.test/exec', fetch: async (url, options) => {
    if (options.body) { bodies.push(JSON.parse(options.body)); return response({ status: 'success', text: 'Chào bạn.' }); }
    return response({ service: 'tarot-groq', version: 1, configured: true });
  } });
  assert.equal(await ai.read(state), 'Chào bạn.');
  await ai.chat(state, [{ role: 'user', text: 'Mình thấy lo.' }]);
  assert.deepEqual(bodies[0].state.cards, [{ id: '00', reversed: false }]);
  assert.equal(bodies[0].systemInstruction, undefined);
  assert.equal(bodies[1].reading, state.readingResult);
  assert.equal(bodies[1].history[0].text, 'Mình thấy lo.');
  assert.ok(!/apiKey|Authorization|GROQ_API_KEY/.test(JSON.stringify(bodies)));
});
test('429 cooldown prevents repeated calls and expires at the provider retry time', async () => {
  let now = 1000, posts = 0;
  const ai = create({ endpoint: 'https://example.test/exec', now: () => now, fetch: async (url, options) => {
    if (!options.body) return response({ service: 'tarot-groq', version: 1, configured: true });
    posts++; return response({ status: 'error', code: 'RATE_LIMIT', retryAfter: 45 });
  } });
  await assert.rejects(ai.read(state), /45 giây/);
  now += 10000; await assert.rejects(ai.read(state), /35 giây/); assert.equal(posts, 1);
  now += 35000; await assert.rejects(ai.read(state), /45 giây/); assert.equal(posts, 2);
});
test('a new spread while health is loading cannot change the original request snapshot', async () => {
  let release, sent;
  const gate = new Promise(resolve => { release = resolve; });
  const current = { ...state, selectedCards: [...state.selectedCards] };
  const ai = create({ endpoint: 'https://example.test/exec', fetch: async (url, options) => {
    if (!options.body) { await gate; return response({ service: 'tarot-groq', version: 1, configured: true }); }
    sent = JSON.parse(options.body); return response({ status: 'success', text: 'Lượt cũ' });
  } });
  const pending = ai.read(current);
  current.userQuestion = 'Câu hỏi khác'; current.selectedCards = [];
  release(); await pending;
  assert.equal(sent.state.question, 'Công việc?'); assert.equal(sent.state.cards.length, 1);
});
