const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../tarot-transport.js');
const endpoint = 'https://script.google.com/macros/s/test/exec';
const responseUrl = 'https://script.googleusercontent.com/macros/echo?user_content_key=test-signed-response&lib=test';
const ok = value => ({ ok: true, status: 200, url: responseUrl, json: async () => value });
const missing = url => ({ ok: false, status: 404, url });

test('a delayed Google response recovers through GET without replaying the completed POST', async () => {
  const calls = [], waits = [], payload = { action: 'log_reading', time: 'immutable', conclusion: 'Lời giải' };
  const transport = create({ sleep: async ms => { waits.push(ms); }, fetch: async (url, options) => {
    calls.push({ url, options }); return calls.length < 3 ? missing(responseUrl) : ok({ status: 'success' });
  } });
  assert.deepEqual(await transport.request(endpoint, { payload }), { status: 'success' });
  assert.deepEqual(waits, [1000, 2000]);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
  for (const call of calls.slice(1)) {
    assert.equal(call.url, responseUrl, 'keep the signed response URL intact');
    assert.equal(call.options.method, 'GET'); assert.equal(call.options.body, undefined);
    assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.credentials, 'omit');
  }
});
test('every initial request has a fresh URL while preserving the health action and simple headers', async () => {
  const calls = [], transport = create({ now: () => 1234, fetch: async (url, options) => { calls.push({ url, options }); return ok({ status: 'success' }); } });
  await transport.request(endpoint + '?action=ai_health'); await transport.request(endpoint + '?action=ai_health');
  await transport.request(endpoint, { payload: { action: 'ai_reading' } });
  assert.notEqual(calls[0].url, calls[1].url);
  assert.match(calls[0].url, /\?action=ai_health&_request=/);
  assert.match(calls[2].url, /\/exec\?_request=/);
  for (const call of calls) { assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.redirect, 'follow'); }
  assert.deepEqual(calls[2].options.headers, { 'Content-Type': 'text/plain;charset=UTF-8' });
});
test('a permanent missing response has bounded retries and never resends the operation', async () => {
  const calls = [], transport = create({ sleep: async () => {}, fetch: async (url, options) => { calls.push({ url, options }); return missing(responseUrl); } });
  await assert.rejects(transport.request(endpoint, { payload: { action: 'ai_reading' } }), { code: 'CONNECTION_ERROR', status: 404 });
  assert.equal(calls.length, 4); assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
});
test('deployment 404, unrelated redirects, and other HTTP failures are not retried', async () => {
  for (const result of [missing(endpoint), missing('https://script.googleusercontent.com.attacker.test/error'), { ok: false, status: 429, url: responseUrl }]) {
    let calls = 0;
    const transport = create({ sleep: async () => { throw new Error('Should not wait'); }, fetch: async () => { calls++; return result; } });
    await assert.rejects(transport.request(endpoint), { code: 'CONNECTION_ERROR', status: result.status });
    assert.equal(calls, 1);
  }
});
test('an HTML error page cannot leak into the user-facing JSON error', async () => {
  const transport = create({ fetch: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <html private content>'); } }) });
  await assert.rejects(transport.request(endpoint), error => error.code === 'INVALID_RESPONSE' && !error.message.includes('private content'));
});
test('an unreadable network failure remains a single POST with a clear Vietnamese message', async () => {
  let calls = 0;
  const transport = create({ fetch: async () => { calls++; throw new TypeError('Failed to fetch private response URL'); } });
  await assert.rejects(transport.request(endpoint, { payload: { action: 'log_reading' } }), error => error.code === 'CONNECTION_ERROR' && !error.message.includes('private response'));
  assert.equal(calls, 1);
});
test('the overall deadline aborts a redirect recovery delay instead of leaving it running', async () => {
  let calls = 0;
  const transport = create({ fetch: async () => { calls++; return missing(responseUrl); } });
  await assert.rejects(transport.request(endpoint, { timeout: 15 }), { code: 'CONNECTION_TIMEOUT' });
  assert.equal(calls, 1);
});
