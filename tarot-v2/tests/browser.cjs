const puppeteer = require('puppeteer');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), base = 'http://127.0.0.1:4182';
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const devices = [
  { name: 'desktop', width: 1440, height: 900, spread: 'time', count: 3 },
  { name: 'mobile', width: 390, height: 844, spread: 'solution', count: 4 },
  { name: 'small', width: 320, height: 568, spread: 'single', count: 1 },
  { name: 'landscape', width: 844, height: 390, spread: 'mind', count: 3 }
];
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--no-first-run'], userDataDir: path.resolve(root, '../backups/v2-preview-browser') });
  const report = []; let activePage, activeErrors;
  try {
    for (const device of devices.filter(item => !process.env.DEVICE || item.name === process.env.DEVICE)) {
      const page = await browser.newPage(), errors = [], external = [];
      activePage = page; activeErrors = errors;
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (/^https?:/.test(request.url()) && !request.url().startsWith(base)) { external.push(request.url().split('?')[0]); request.abort(); }
        else request.continue();
      });
      await page.setViewport({ width: device.width, height: device.height, deviceScaleFactor: 1, hasTouch: device.name !== 'desktop', isMobile: device.name !== 'desktop' });
      await page.goto(base + '/?preview=1', { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('#scene-status').dataset.act === 'INTRO');
      for (let sample = 0; sample < 34; sample++) {
        await wait(200);
        const geometry = await page.evaluate(() => window.TarotExperience.geometrySnapshot());
        if (await page.$eval('body', element => element.dataset.act === 'INTRO')) {
          assert.equal(await page.$eval('#brand-crest', element => getComputedStyle(element).visibility), 'hidden', 'No brand text during the intro');
        }
        assert.equal(geometry.length, 3);
        for (let i = 0; i < geometry.length; i++) for (let j = i + 1; j < geometry.length; j++) {
          const a = geometry[i], b = geometry[j];
          assert.ok(![0, 1, 2].every(axis => a.min[axis] < b.max[axis] && a.max[axis] > b.min[axis]), 'Intro card volumes do not intersect');
        }
        if (await page.$eval('body', element => element.dataset.act === 'HOME')) break;
      }
      await page.waitForSelector('#welcome-panel:not([hidden])', { timeout: 20000 });
      await wait(900);
      const cta = await page.$eval('#begin-reading', element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
      assert.ok(cta.top >= 0 && cta.bottom < device.height, 'Start button visible without scrolling');
      if (device.height > device.width) {
        const positions = await page.evaluate(() => ({ heading: document.querySelector('.welcome-heading').getBoundingClientRect().bottom, form: document.querySelector('#intent-form').getBoundingClientRect().top }));
        assert.ok(positions.form > positions.heading + 40, 'Mobile heading has its own visible area above the form');
      }
      await page.screenshot({ path: path.join(root, 'artifacts', device.name + '-home.png') });
      if (await page.$eval('#btn-motion-top', element => !element.hidden)) {
        await page.click('#btn-motion-top');
        await page.evaluate(() => {
          for (const [beta, gamma] of [[30, 0], [36, 14]]) {
            const event = new Event('deviceorientation'); Object.defineProperties(event, { beta: { value: beta }, gamma: { value: gamma } }); dispatchEvent(event);
          }
        });
        assert.ok(await page.evaluate(() => window.TarotMobile.sample().x > 0));
        await page.click('#btn-motion-top');
      }
      await page.click('#options-toggle');
      await page.waitForFunction(() => !document.querySelector('#personal-options').hidden && document.querySelector('#personal-options').getAnimations().length === 0);
      await page.click('#name'); await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
      await page.type('#name', 'Bạn thử');
      await page.select('#birth-day', '29'); await page.select('#birth-month', '2'); await page.select('#birth-year', '2000');
      assert.equal(await page.$eval('#zodiac', element => element.textContent), 'Song Ngư');
      await page.click('input[name="vibe"][value="tatnuoc"] + span');
      await page.click('#options-toggle'); await wait(550);
      await page.click('input[name="spread"][value="' + device.spread + '"] + span');
      await page.type('#question', 'Mình nên bắt đầu thay đổi từ đâu?');
      await page.click('#begin-reading');
      await page.waitForFunction(() => document.body.dataset.act === 'SHUFFLE');
      await wait(700);
      const hold = await page.$eval('#hold-shuffle-btn', element => { const r = element.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(hold.x, hold.y); await page.mouse.down(); await wait(1500);
      await page.screenshot({ path: path.join(root, 'artifacts', device.name + '-shuffle.png') });
      await page.mouse.up();
      await page.waitForFunction(() => document.body.dataset.act === 'FAN', { timeout: 12000 });
      await wait(1600);
      await page.screenshot({ path: path.join(root, 'artifacts', device.name + '-fan.png') });
      const dragY = await page.$eval('#spread-header-ui', element => element.getBoundingClientRect().bottom + 65);
      await page.mouse.move(device.width * .50, dragY); await page.mouse.down();
      await page.mouse.move(device.width * .20, dragY, { steps: 12 }); await page.mouse.up(); await wait(600);
      assert.equal(await page.$eval('#scene-status', element => element.dataset.selected), '0', 'Swiping never picks automatically');
      const before = await page.$eval('#spread-counter-label', element => element.textContent);
      await page.click('#btn-fan-next'); await wait(600);
      assert.notEqual(await page.$eval('#spread-counter-label', element => element.textContent), before);
      const dockErrors = [];
      await page.evaluate(() => {
        window.__flightFrames = []; window.__flightLast = performance.now(); window.__trackFlights = true;
        function sample(now) { if (!window.__trackFlights) return; if (!window.__pauseFlightMeasure) window.__flightFrames.push(now - window.__flightLast); window.__flightLast = now; requestAnimationFrame(sample); }
        requestAnimationFrame(sample);
      });
      for (let i = 0; i < device.count; i++) {
        await page.click('#btn-draw-current');
        if (device.name === 'mobile' && i === 0) { await wait(250); await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 1, hasTouch: true, isMobile: true }); }
        await page.waitForSelector('#slot-box-' + i + '.filled', { timeout: 12000 });
        const error = Number(await page.$eval('#scene-status', element => element.dataset.dockError));
        assert.ok(error < 1, 'Dock alignment ' + error); dockErrors.push(error);
        if (i === 0 && device.count > 1) {
          await page.evaluate(() => { window.__pauseFlightMeasure = true; });
          await page.screenshot({ path: path.join(root, 'artifacts', device.name + '-docked.png') });
          await page.evaluate(() => { window.__pauseFlightMeasure = false; window.__flightLast = performance.now(); });
        }
        await wait(150);
      }
      await page.waitForFunction(() => document.body.dataset.act === 'REVEAL', { timeout: 15000 });
      const flightFrames = await page.evaluate(() => { window.__trackFlights = false; return window.__flightFrames.sort((a, b) => a - b); });
      const flightTiming = { max: Math.round(flightFrames.at(-1)), p95: Math.round(flightFrames[Math.floor(flightFrames.length * .95)]) };
      const textureTaskMax = await page.$eval('#scene-status', element => Number(element.dataset.faceTaskMax || 0));
      await page.click('#flip-all');
      await page.waitForFunction(count => Number(document.querySelector('#scene-status').dataset.opened) === count, { timeout: 20000 }, device.count);
      assert.equal(await page.$eval('#flight-layer', element => getComputedStyle(element).display), 'none', 'No stale flight canvas covering the revealed artwork');
      assert.equal(await page.$eval('#open-reading', element => element.classList.contains('reading-ready')), true);
      await page.screenshot({ path: path.join(root, 'artifacts', device.name + '-reveal.png') });
      const ids = await page.evaluate(() => window.TarotExperience.snapshot().map(card => card.data.id));
      assert.equal(new Set(ids).size, device.count, 'No duplicate cards');
      await page.click('#caption-0');
      await page.waitForFunction(() => document.querySelector('#scene-status').dataset.inspected === '0');
      await wait(400); await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('#scene-status').dataset.inspected === '-1');
      await page.click('#btn-sound-top'); await page.click('#btn-sound-top');
      await page.click('#open-reading');
      await page.waitForSelector('#conversation:not([hidden])');
      await page.waitForFunction(() => document.querySelector('#reading-modal').classList.contains('is-visible') && document.querySelector('#reading-modal').getAnimations().length === 0);
      const closeOffset = await page.$eval('#reading-modal .close-dialog', button => {
        const a = button.getBoundingClientRect(), b = button.querySelector('svg').getBoundingClientRect();
        return Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2);
      });
      assert.ok(closeOffset < .5, 'Close icon is centred in the button');
      const sections = await page.$$eval('.reading-interpretation', elements => elements.map(element => element.textContent));
      assert.equal(sections.length, device.count);
      await page.screenshot({ path: path.join(root, 'artifacts', device.name + '-reading.png') });
      for (let turn = 0; turn < 4; turn++) {
        await page.type('#chat-input', 'Mình vẫn còn băn khoăn về trải bài này.');
        await page.click('#chat-send');
        await page.waitForFunction(() => !document.querySelector('#chat-send').disabled);
      }
      assert.equal(await page.$$('.support-nudge').then(elements => elements.length), 1);
      await page.click('input[name="rating"][value="5"] + span'); await page.click('#feedback-send');
      assert.match(await page.$eval('#feedback-status', element => element.textContent), /Bản xem thử/);
      await page.click('[data-close="reading-modal"]');
      await page.waitForFunction(() => !document.querySelector('#reading-modal').open);
      await page.click('#open-support'); await page.waitForSelector('#support-modal[open]');
      assert.match(await page.$eval('.shopee-link', element => element.href), /hoahong.vercel.app/);
      assert.equal(await page.$eval('.donation-bank', element => element.open), false);
      await page.waitForFunction(() => document.querySelector('#support-modal').classList.contains('is-visible') && document.querySelector('#support-modal').getAnimations().length === 0);
      await page.screenshot({ path: path.join(root, 'artifacts', device.name + '-support.png') });
      await page.click('.donation-bank summary');
      await page.waitForFunction(() => document.querySelector('.donation-qr').naturalWidth > 0);
      assert.equal(await page.$eval('.donation-bank', element => element.open), true);
      await page.click('[data-close="support-modal"]');
      await page.waitForFunction(() => !document.querySelector('#support-modal').open);
      await page.click('#new-reading'); await page.waitForSelector('#welcome-panel:not([hidden])');
      assert.match(await page.$eval('#name', element => element.value), /Bạn thử/);
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      report.push({ ...device, dockErrors, cardIds: ids, flightTiming, textureTaskMax, closeOffset, errors, externalRequests: external.length });
      fs.writeFileSync(path.join(root, 'artifacts', device.name + '-report.json'), JSON.stringify([report.at(-1)], null, 2));
      console.log('PASS', JSON.stringify(report.at(-1))); await page.close();
    }
    fs.writeFileSync(path.join(root, 'artifacts', process.env.DEVICE ? process.env.DEVICE + '-report.json' : 'browser-report.json'), JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('Browser errors:', activeErrors);
    if (activePage && !activePage.isClosed()) { await activePage.screenshot({ path: path.join(root, 'artifacts', 'failure.png') }); console.error(await activePage.$eval('#scene-status', element => ({ ...element.dataset }))); }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
