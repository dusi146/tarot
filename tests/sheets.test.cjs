const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function sheets({ failIP = false, rejectLog = false, gateLog = null } = {}) {
  const calls = [];
  let clock = Date.parse('2026-10-14T16:59:50.123Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const window = {};
  const context = vm.createContext({
    window, Intl, Date: Clock, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      if (url.includes('ipify')) {
        if (failIP) throw new Error('offline');
        return { ok: true, json: async () => ({ ip: '203.0.113.7' }) };
      }
      const payload = JSON.parse(options.body);
      calls.push({ url, options, payload });
      if (payload.action === 'log_reading') await gateLog;
      return { ok: true, json: async () => rejectLog && payload.action === 'log_reading'
        ? { status: 'error', message: 'Không tìm thấy' } : { status: 'success' } };
    }
  });
  for (const file of ['sheets-config.js', 'tarot-sheets.js']) {
    vm.runInContext(fs.readFileSync(require.resolve(`../${file}`), 'utf8'), context);
  }
  return { api: window.TarotSheets, calls, setClock: value => { clock = Date.parse(value); } };
}

test('existing Apps Script receives the full 18-column protocol and confirms feedback', async () => {
  const app = sheets();
  const profile = { name: 'An', dob: '10/12/2007', zodiac: 'Nhân Mã', gender: 'Nữ', question: 'Công việc?', spread: '3 lá', vibe: 'chualanh', solver: 'Ta Văn Rót / gemini-2.5-flash', source: 'facebook' };
  const session = app.api.begin(profile);
  profile.name = 'Changed';
  await session.record('Lời giải đầy đủ', 'Thành công');
  await session.feedback({ rating: 5, ratingNote: 'Hữu ích', feedback: 'Cảm ơn' });
  await session.followup({ followUpQ: 'Khách: Hỏi thêm', followUpA: 'Rót: Trả lời' });
  const [log, feedback, followup] = app.calls.map(call => call.payload);
  assert.equal(log.name, 'An');
  assert.equal(log.conclusion, 'Lời giải đầy đủ');
  assert.equal(log.time, '23:59:50.123 14/10/2026');
  assert.equal(log.sheetName, '14-10-2026');
  assert.equal(log.ip, '203.0.113.7');
  for (const update of [feedback, followup]) {
    assert.equal(update.time, log.time);
    assert.equal(update.ip, log.ip);
  }
  assert.equal(feedback.action, 'update_feedback');
  assert.equal(feedback.rating, 5);
  assert.equal(followup.action, 'update_followup');
  assert.equal(app.calls[0].options.headers['Content-Type'], 'text/plain;charset=UTF-8');
  assert.equal(app.calls[0].options.mode, undefined);
});

test('feedback waits for the original row and each reading is appended only once', async () => {
  let release;
  const gateLog = new Promise(resolve => { release = resolve; });
  const app = sheets({ gateLog });
  const session = app.api.begin({ name: 'An' });
  const log = session.record('Lời giải', 'Thành công');
  const duplicate = session.record('Duplicate', 'Thành công');
  assert.equal(log, duplicate);
  const feedback = session.feedback({ rating: 4 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.calls.length, 1);
  release();
  await feedback;
  assert.equal(app.calls.length, 2);
});

test('backend errors are reported and feedback cannot update an unsaved reading', async () => {
  const app = sheets({ rejectLog: true });
  const session = app.api.begin({});
  await assert.rejects(session.record('Lỗi API', 'Thất bại'), /Không tìm thấy/);
  await assert.rejects(session.feedback({ rating: 3 }), /Không tìm thấy/);
  assert.equal(app.calls.length, 1);
});

test('failed IP lookup keeps unique immutable keys and supports API failure records', async () => {
  const app = sheets({ failIP: true });
  await app.api.begin({ name: 'A' }).record('Lỗi API: 429', 'Thất bại');
  await app.api.begin({ name: 'B' }).record('Lời giải', 'Thành công');
  assert.equal(app.calls[0].payload.ip, 'Không rõ');
  assert.equal(app.calls[0].payload.status, 'Thất bại');
  assert.notEqual(app.calls[0].payload.time, app.calls[1].payload.time);
});

test('legacy midnight fallback cannot overwrite a different reading', async () => {
  const app = sheets();
  const session = app.api.begin({});
  await session.record('Lời giải', 'Thành công');
  app.setClock('2026-10-14T17:00:01Z');
  await assert.rejects(session.feedback({ rating: 5 }), /sang ngày mới/);
  assert.equal(app.calls.length, 1);
});
