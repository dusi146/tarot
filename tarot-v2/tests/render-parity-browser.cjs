// Compare the same frozen scene with individual and instanced cards, pixel for pixel.
const puppeteer = require('puppeteer'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), base = 'http://127.0.0.1:4182', wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    userDataDir: path.resolve(root, '../backups/v2-parity-browser'), args: ['--no-first-run'] });
  const report = [];
  try {
    const page = await browser.newPage(), errors = [];
    if (process.env.TASK_WEBGL1 === '1') await page.evaluateOnNewDocument(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : getContext.call(this, type, ...args); };
    });
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setRequestInterception(true);
    page.on('request', r => /^https?:/.test(r.url()) && !r.url().startsWith(base) ? r.abort() : r.continue());
    async function compare(phase) {
      await page.evaluate(() => { TarotExperience.profile.freeze(true); document.getAnimations().forEach(animation => animation.pause()); TarotExperience.profile.batch(false); TarotExperience.profile.occlusion(false); });
      await wait(80); const original = await page.screenshot();
      const before = await page.evaluate(() => TarotExperience.renderStats());
      await page.evaluate(() => { TarotExperience.profile.batch(true); TarotExperience.profile.occlusion(true); }); await wait(80); const optimized = await page.screenshot();
      const after = await page.evaluate(() => TarotExperience.renderStats());
      const difference = await page.evaluate(async sources => {
        const load = src => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Cannot decode comparison frame')); image.src = src; });
        const [a, b] = await Promise.all(sources.map(load));
        const canvas = document.createElement('canvas'); canvas.width = a.width; canvas.height = a.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(a, 0, 0); const aa = ctx.getImageData(0, 0, a.width, a.height).data;
        ctx.clearRect(0, 0, a.width, a.height); ctx.drawImage(b, 0, 0); const bb = ctx.getImageData(0, 0, b.width, b.height).data;
        let total = 0, changed = 0, max = 0;
        for (let i = 0; i < aa.length; i += 4) { let pixel = 0; for (let j = 0; j < 3; j++) { const delta = Math.abs(aa[i + j] - bb[i + j]); total += delta; pixel = Math.max(pixel, delta); } if (pixel > 12) changed++; max = Math.max(max, pixel); }
        return { meanChannelDifference: total / (a.width * a.height * 3), changedPixelRatio: changed / (a.width * a.height), max };
      }, [original, optimized].map(buffer => 'data:image/png;base64,' + Buffer.from(buffer).toString('base64')));
      fs.writeFileSync(path.join(root, 'artifacts/parity-' + phase + '-individual.png'), original);
      fs.writeFileSync(path.join(root, 'artifacts/parity-' + phase + '-batch.png'), optimized);
      assert.ok(difference.meanChannelDifference < .4 && difference.changedPixelRatio < .003, phase + ': ' + JSON.stringify(difference));
      assert.equal(before.particles, after.particles); assert.equal(before.pixelRatio, after.pixelRatio);
      assert.equal(before.cardVertices, after.cardVertices); assert.equal(before.activeMotes, after.activeMotes);
      report.push({ phase, difference, before, after });
      await page.evaluate(() => { TarotExperience.profile.freeze(false); document.getAnimations().forEach(animation => animation.play()); });
    }
    await page.goto(base + '/?preview=1&profile=1', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#welcome-panel:not([hidden])'); await wait(900); await compare('home');
    await page.type('#question', 'Một khoảng lặng cho hôm nay.'); await page.click('#begin-reading');
    await page.waitForFunction(() => document.body.dataset.act === 'SHUFFLE'); await wait(900); await compare('shuffle');
    await page.focus('#hold-shuffle-btn'); await page.keyboard.down('Space'); await wait(900); await page.keyboard.up('Space');
    await page.waitForFunction(() => document.body.dataset.act === 'FAN'); await wait(1800); await compare('fan');
    await page.click('#btn-draw-current'); await wait(420); await compare('flight');
    await page.waitForSelector('#slot-box-0.filled');
    for (let i = 1; i < 3; i++) { await page.click('#btn-draw-current'); await page.waitForSelector('#slot-box-' + i + '.filled'); await wait(150); }
    await page.waitForFunction(() => document.body.dataset.act === 'REVEAL'); await page.click('#flip-all');
    await page.waitForFunction(() => TarotExperience.renderStats().activeMotes >= 28); await compare('motes');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(root, process.env.TASK_WEBGL1 === '1' ? 'artifacts/render-parity-webgl1.json' : 'artifacts/render-parity.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.map(item => ({ phase: item.phase, difference: item.difference, originalDraws: item.before.calls, batchedDraws: item.after.calls }))));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
