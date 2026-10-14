// Validate UI/service contracts with intercepted responses; never call Google or Groq.
const puppeteer = require('puppeteer');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), base = 'http://127.0.0.1:4182';
const catalogue = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'js/tarot-data.js'), 'utf8'), catalogue);
const cards = catalogue.window.TAROT_CARDS;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function answer(payload) {
  const card = cards.find(item => item.id === payload.state.cards[0].id);
  return 'Rót nghe câu chuyện của bạn.\n\nThông Điệp: ' + card.viName + '\n'
    + 'Lá bài này nhắc bạn nhìn rõ điều mình có thể chủ động trong câu chuyện. Hãy đối chiếu cảm xúc với những gì đã thực sự diễn ra, rồi chọn một bước đi vừa sức để bắt đầu.\n\n'
    + 'Góc nhìn chung\nBạn nên bắt đầu từ một việc cụ thể mà mình có thể thay đổi ngay hôm nay. Trải bài gợi ý cân nhắc nhu cầu và giới hạn của bạn. Không cần ép bản thân giải quyết mọi chuyện cùng lúc.\n\n'
    + 'Một bước nhỏ cho bạn\nViết xuống một việc nhỏ có thể hoàn thành trong mười phút. Làm việc đó rồi dành một chút thời gian quan sát cảm giác của mình.';
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    userDataDir: path.resolve(root, '../backups/v2-services-browser'), args: ['--no-first-run'] });
  const page = await browser.newPage(), errors = [], requests = [], unexpected = [];
  let reads = 0, holdReading = false, releaseReading, activeReading;
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    if (url.origin === base || !/^https?:/.test(request.url())) { request.continue(); return; }
    const respond = body => request.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    if (url.hostname === 'api.ipify.org') { respond({ ip: '203.0.113.24' }); return; }
    if (url.hostname !== 'script.google.com') { unexpected.push(url.origin); request.abort(); return; }
    const payload = JSON.parse(request.postData() || '{}'); requests.push(payload);
    if (url.searchParams.get('action') === 'ai_health') { respond({ service: 'tarot-ai', version: 2, configured: true, readingFormat: 2 }); return; }
    if (payload.action === 'ai_reading') {
      reads++; activeReading = payload;
      if (holdReading) await new Promise(resolve => { releaseReading = resolve; });
      respond({ status: 'success', provider: 'intern', model: 'deepseek-v4-flash-0711', text: reads === 1 ? 'Nội dung chưa đủ.' : answer(payload) }); return;
    }
    if (payload.action === 'ai_followup') { respond({ status: 'success', text: '**Rót vẫn đang nghe.** Mình cùng nhìn lại trải bài này.\n\n- Một bước nhỏ vừa sức.\n- Bạn cứ thong thả nhé.\n\n```js\nconst calm = true;\n```\n\n<img src=x onerror=alert(1)>\n[Không mở](javascript:alert)' }); return; }
    respond({ status: 'success', data: [{ name: 'Một người bạn', amount: 100000 }] });
  });
  async function draw() {
    await page.waitForSelector('#welcome-panel:not([hidden])');
    await page.click('input[name="spread"][value="single"] + span');
    await page.type('#question', 'Mình nên làm gì trước?');
    await page.click('#begin-reading'); await delay(800);
    await page.focus('#hold-shuffle-btn'); await page.keyboard.down('Space'); await delay(800); await page.keyboard.up('Space');
    await page.waitForFunction(() => document.body.dataset.act === 'FAN'); await delay(1200);
    await page.click('#btn-draw-current'); await page.waitForFunction(() => document.body.dataset.act === 'REVEAL');
    await page.click('#flip-all'); await page.waitForFunction(() => !document.querySelector('#open-reading').disabled);
    await page.click('#open-reading');
  }
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(base, { waitUntil: 'networkidle0' }); await draw();
    await page.waitForSelector('#retry-reading:not([hidden])');
    const originalIds = await page.evaluate(() => window.TarotExperience.snapshot().map(item => item.data.id));
    await page.click('#retry-reading'); await page.waitForSelector('#conversation:not([hidden])');
    await page.waitForFunction(() => document.querySelector('#reading-modal').classList.contains('is-visible') && document.querySelector('#reading-modal').getAnimations().length === 0);
    assert.equal(reads, 2);
    assert.deepEqual(await page.evaluate(() => window.TarotExperience.snapshot().map(item => item.data.id)), originalIds);
    await page.waitForFunction(() => document.querySelector('#sheet-status').textContent === 'Đã lưu trải bài.');
    for (let turn = 0; turn < 3; turn++) {
      await page.type('#chat-input', 'Mình muốn nói thêm về chuyện này.'); await page.click('#chat-send');
      await page.waitForFunction(() => !document.querySelector('#chat-send').disabled);
    }
    await page.click('input[name="rating"][value="5"] + span'); await page.type('#rating-note', 'Nhẹ nhàng, rõ ràng.');
    await page.click('#feedback-send'); await page.waitForFunction(() => document.querySelector('#feedback-status').textContent.includes('đã nhận'));
    const successLog = requests.find(item => item.action === 'log_reading' && item.status === 'Thành công');
    const feedback = requests.find(item => item.action === 'update_feedback');
    assert.ok(successLog && feedback); assert.equal(feedback.time, successLog.time); assert.equal(feedback.ip, successLog.ip);
    assert.equal(feedback.rating, 5); assert.equal(feedback.ratingNote, 'Nhẹ nhàng, rõ ràng.');
    const chats = requests.filter(item => item.action === 'ai_followup');
    assert.equal(chats.length, 3); assert.equal(chats[2].history.length, 5);
    assert.deepEqual(chats[2].history.map(item => item.role), ['user', 'rot', 'user', 'rot', 'user']);
    assert.match(successLog.solver, /intern.*deepseek-v4-flash-0711/);
    assert.equal(await page.$$('.message.assistant strong').then(items => items.length), 3);
    assert.equal(await page.$$('.message.assistant .syntax-keyword').then(items => items.length), 6);
    assert.equal(await page.$$('.message.assistant img,.message.assistant script,.message.assistant a[href^="javascript:"]').then(items => items.length), 0);
    assert.equal(chats[2].state.cards[0].id, originalIds[0]); assert.ok(chats[2].reading.includes('Góc nhìn chung'));
    assert.equal(await page.$$('.support-nudge').then(items => items.length), 1);
    assert.ok(requests.some(item => item.action === 'update_followup'));
    await page.click('[data-restart]');
    holdReading = true; await draw();
    await page.waitForFunction(() => !document.querySelector('#reading-loading').hidden);
    for (let i = 0; i < 30 && !releaseReading; i++) await delay(100);
    assert.ok(releaseReading, 'Pending reading captured');
    await page.waitForFunction(() => document.querySelector('#reading-modal').classList.contains('is-visible') && document.querySelector('#reading-modal').getAnimations().length === 0);
    await page.click('[data-restart]'); releaseReading(); await delay(700);
    await page.waitForFunction(() => document.body.dataset.act === 'HOME');
    assert.equal(await page.$eval('body', element => element.dataset.act), 'HOME');
    assert.equal(await page.$eval('#reading-text', element => element.textContent), '');
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    const report = { realProviderCalls: 0, mockReads: reads, mockChats: chats.length, preservedCardIds: originalIds,
      matchedFeedbackToOriginalRow: true, staleReadingIgnoredAfterReset: true, errors };
    fs.writeFileSync(path.join(root, 'artifacts/services-report.json'), JSON.stringify(report, null, 2));
    console.log('PASS', JSON.stringify(report));
  } catch (error) {
    console.error('Browser errors:', errors); await page.screenshot({ path: path.join(root, 'artifacts/services-failure.png') }); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
