// Actual projected mesh bounds versus rendered Vietnamese labels, with no AI or Sheet calls.
const puppeteer = require('puppeteer'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), base = 'http://127.0.0.1:4182', wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const devices = [[320, 568, 'solution', 4], [360, 640, 'solution', 4], [390, 844, 'time', 3],
  [390, 844, 'solution', 4], [412, 915, 'solution', 4], [844, 390, 'solution', 4], [320, 568, 'single', 1]];
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    userDataDir: path.resolve(root, '../backups/v2-layout-browser'), args: ['--no-first-run'] });
  const reports = [];
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => /^https?:/.test(request.url()) && !request.url().startsWith(base) ? request.abort() : request.continue());
    for (const [width, height, spread, count] of devices) {
      await page.setViewport({ width, height, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      await page.goto(base + '/?preview=1&profile=1', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.TarotExperience && ['INTRO', 'HOME'].includes(document.body.dataset.act));
      await page.evaluate(() => TarotExperience.skipIntro());
      await page.waitForSelector('#welcome-panel:not([hidden])'); await wait(600);
      await page.click('input[name="spread"][value="' + spread + '"] + span');
      await page.type('#question', 'Một khoảng lặng cho hôm nay.'); await page.click('#begin-reading');
      await page.waitForFunction(() => document.body.dataset.act === 'SHUFFLE');
      await page.focus('#hold-shuffle-btn'); await page.keyboard.down('Space'); await wait(700); await page.keyboard.up('Space');
      await page.waitForFunction(() => document.body.dataset.act === 'FAN'); await wait(1200);
      for (let i = 0; i < count; i++) { await page.click('#btn-draw-current'); await page.waitForSelector('#slot-box-' + i + '.filled'); await wait(150); }
      await page.waitForFunction(() => document.body.dataset.act === 'REVEAL');
      await page.click('#flip-all'); await page.waitForFunction(count => Number(document.querySelector('#scene-status').dataset.opened) === count, {}, count);
      // Exercise the longest naturally occurring card names, rather than trusting a lucky random draw.
      await page.evaluate(() => {
        const names = ['Bánh Xe Số Phận', 'Nữ Hoàng Kiếm', 'Người Bị Treo', 'Kỵ Sĩ Tiền Xu'];
        document.querySelectorAll('.revealed-name').forEach((element, i) => { element.textContent = names[i]; });
      });
      await wait(1400);
      async function inspectLabels(phase) {
        const result = await page.evaluate(() => {
          const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
          return { cards: TarotExperience.geometrySnapshot().map(card => card.bounds),
            labels: [...document.querySelectorAll('.revealed-card-caption')].filter(element => !element.hidden && Number(getComputedStyle(element).opacity) > .05).map(rect),
            dock: rect(document.querySelector('#control-dock')) };
        });
        const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
        assert.equal(result.labels.length, phase === 'inspect' ? 1 : count, 'All expected titles remain readable');
        for (const label of result.labels) {
          assert.ok(label.left >= -1 && label.right <= width + 1 && label.top >= 0 && label.bottom <= height, 'Label inside viewport: ' + JSON.stringify(result));
          assert.equal(overlap(label, result.dock), false, 'Label does not overlap the buttons: ' + JSON.stringify(result));
          for (const card of result.cards) assert.equal(overlap(label, card), false, 'Label does not cover any card: ' + JSON.stringify(result));
        }
        for (let i = 0; i < result.labels.length; i++) for (let j = i + 1; j < result.labels.length; j++) assert.equal(overlap(result.labels[i], result.labels[j]), false, 'Titles do not overlap');
        return result;
      }
      const normal = await inspectLabels('normal');
      await page.screenshot({ path: path.join(root, `artifacts/labels-${width}-${height}-${count}.png`) });
      await page.click('#caption-0'); await page.waitForFunction(() => document.querySelector('#scene-status').dataset.inspected === '0'); await wait(1800);
      const inspected = await inspectLabels('inspect');
      await page.screenshot({ path: path.join(root, `artifacts/labels-${width}-${height}-${count}-inspect.png`) });
      await page.keyboard.press('Escape'); await wait(1800); await inspectLabels('normal');
      reports.push({ width, height, count, normal, inspected }); console.log('PASS', width, height, count);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(root, 'artifacts/layout-report.json'), JSON.stringify(reports, null, 2));
  } catch (error) {
    const pages = await browser.pages(); await pages.at(-1)?.screenshot({ path: path.join(root, 'artifacts/layout-failure.png') }); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
