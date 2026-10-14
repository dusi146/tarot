const puppeteer = require('puppeteer');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), base = 'http://127.0.0.1:4182';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, userDataDir: path.resolve(root, '../backups/v2-carousel-browser'), args: ['--no-first-run'] });
  const report = [];
  try {
    for (const width of [1440, 390, 320].filter(width => !process.env.TASK_CAROUSEL_WIDTH || width === Number(process.env.TASK_CAROUSEL_WIDTH))) {
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewport({ width, height: width > 700 ? 900 : 844, hasTouch: width < 700, isMobile: width < 700 });
      await page.setRequestInterception(true);
      page.on('request', request => /^https?:/.test(request.url()) && !request.url().startsWith(base) ? request.abort() : request.continue());
      await page.goto(base + '/?preview=1', { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.body.dataset.act === 'INTRO');
      await wait(2000); await page.screenshot({ path: path.join(root, 'artifacts', 'intro-orbit-' + width + '.png') });
      await page.click('#skip-intro'); await page.waitForSelector('#welcome-panel:not([hidden])'); await wait(900);
      if (width < 700) {
        const options = await page.$eval('#options-toggle', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        await page.touchscreen.tap(options.x, options.y);
        assert.equal(await page.$eval('#options-toggle', el => getComputedStyle(el).webkitTapHighlightColor), 'rgba(0, 0, 0, 0)');
        assert.equal(await page.$eval('#options-toggle', el => getComputedStyle(el).outlineStyle), 'none', 'Touch does not show an outline');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid', 'Keyboard navigation still has a focus indicator');
        await wait(500); await page.click('#options-toggle'); await wait(550);
      }
      await page.type('#question', 'Mình muốn nhìn lại tuần này.');
      await page.click('input[name="spread"][value="time"] + span'); await page.click('#begin-reading');
      await page.waitForFunction(() => document.body.dataset.act === 'SHUFFLE'); await wait(600);
      const hold = await page.$eval('#hold-shuffle-btn', el => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      await page.mouse.move(...hold); await page.mouse.down(); await wait(650); await page.mouse.up();
      await page.waitForFunction(() => document.body.dataset.act === 'FAN'); await wait(1700);
      // Seek close to the seam through the public range control.
      await page.$eval('#spread-slider', el => { el.value = el.max; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => window.TarotExperience.fanSnapshot().index === 77 && Math.abs(window.TarotExperience.fanSnapshot().phase - window.TarotExperience.fanSnapshot().target) < .01);
      const last = await page.evaluate(() => window.TarotExperience.fanSnapshot());
      await page.click('#btn-fan-next'); await wait(700);
      let snap = await page.evaluate(() => window.TarotExperience.fanSnapshot());
      assert.equal(snap.index, 0); assert.equal(snap.focusedId, last.availableIds[0]);
      await page.click('#btn-fan-prev'); await wait(700);
      assert.equal(await page.evaluate(() => window.TarotExperience.fanSnapshot().index), 77);
      // Wheel traverses an entire revolution and remains on the same identity.
      await page.mouse.move(width / 2, 360); await page.mouse.wheel({ deltaX: 78 * 110 }); await wait(1600);
      snap = await page.evaluate(() => window.TarotExperience.fanSnapshot());
      assert.equal(snap.index, 77); assert.ok(snap.phase > last.phase + 77);
      assert.equal(snap.focusedId, last.focusedId);
      assert.equal(await page.$eval('#scene-status', el => el.dataset.selected), '0');
      await page.click('#btn-fan-next'); await wait(700);
      assert.equal(await page.evaluate(() => window.TarotExperience.fanSnapshot().index), 0);
      // Pick the last card, then the newly centred first card. Both must land in their slots.
      const selected = [];
      for (let i = 0; i < 2; i++) {
        if (i === 1) {
          const count = await page.evaluate(() => window.TarotExperience.fanSnapshot().count);
          await page.mouse.move(width / 2, 360); await page.mouse.wheel({ deltaX: -count * 110 * 3 }); await wait(1600);
          assert.ok(await page.evaluate(() => window.TarotExperience.fanSnapshot().phase < 0));
        }
        const before = await page.evaluate(() => window.TarotExperience.fanSnapshot());
        selected.push(before.focusedId);
        const point = await page.evaluate(id => window.TarotExperience.geometrySnapshot().find(card => card.id === id).screen, before.focusedId);
        if (width < 700) await page.touchscreen.tap(...point); else await page.mouse.click(...point);
        await page.waitForSelector('#slot-box-' + i + '.filled', { timeout: 4000 }); await wait(300);
        const after = await page.evaluate(() => ({ fan: window.TarotExperience.fanSnapshot(), picked: window.TarotExperience.snapshot().map(c => c.data.id) }));
        assert.equal(after.fan.count, 77 - i); assert.equal(after.picked[i], before.focusedId);
        for (const id of after.picked) assert.ok(!after.fan.availableIds.includes(id), 'Chosen cards are removed from the loop');
        assert.ok(Number(await page.$eval('#scene-status', el => el.dataset.dockError)) < 1);
        await page.click('#btn-fan-prev'); await wait(600);
        await page.click('#btn-fan-next'); await wait(600);
      }
      assert.equal(new Set(selected).size, 2); assert.deepEqual(errors, []);
      report.push({ width, loops: 'forward + reverse + full revolution + three reverse revolutions after picking', directCardTap: 'passed', pickedAtSeam: selected, errors, touchFocus: width < 700 ? 'passed' : 'not applicable' });
      await page.screenshot({ path: path.join(root, 'artifacts', 'loop-seam-' + width + '.png') });
      await page.close();
    }
    fs.writeFileSync(path.join(root, 'artifacts/carousel-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
