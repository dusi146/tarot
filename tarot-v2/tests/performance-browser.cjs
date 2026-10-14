// Repeatable measurements, using only the local mock experience. No real AI/Sheet calls.
const puppeteer = require('puppeteer'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), base = 'http://127.0.0.1:4182';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const label = process.env.TASK_PERF_LABEL || 'current';
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    userDataDir: path.resolve(root, '../backups/v2-performance-browser'), args: ['--no-first-run'] });
  const reports = [];
  try {
    for (const device of [{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 }, { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2 }]) {
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewport({ ...device, hasTouch: device.name === 'mobile', isMobile: device.name === 'mobile' });
      await page.setRequestInterception(true);
      page.on('request', request => /^https?:/.test(request.url()) && !request.url().startsWith(base) ? request.abort() : request.continue());
      await page.evaluateOnNewDocument(() => {
        const measured = window.__perf = { phase: '', frames: {}, draws: 0, reads: 0, longTasks: [] };
        const originalRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function (...args) { measured.reads++; return originalRect.apply(this, args); };
        for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (Context) {
          for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
            const original = Context.prototype[method]; if (!original) continue;
            Context.prototype[method] = function (...args) { measured.draws++; return original.apply(this, args); };
          }
        }
        new PerformanceObserver(list => { for (const entry of list.getEntries()) measured.longTasks.push({ phase: measured.phase, ms: entry.duration }); }).observe({ type: 'longtask', buffered: true });
        let last = 0;
        function sample(now) {
          if (measured.phase && last) (measured.frames[measured.phase] ||= []).push({ ms: now - last, draws: measured.draws, reads: measured.reads });
          measured.draws = measured.reads = 0; last = now; requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      const cdp = await page.createCDPSession(); await cdp.send('Performance.enable');
      const phases = {}, metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
      let startMetrics;
      async function begin(phase) { startMetrics = await metrics(); await page.evaluate(phase => { window.__perf.phase = phase; }, phase); }
      async function end(phase) {
        await page.evaluate(() => { window.__perf.phase = ''; }); const after = await metrics();
        phases[phase] = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'].map(key => [key, after[key] - startMetrics[key]]));
      }
      await page.goto(base + '/?preview=1&profile=1', { waitUntil: 'networkidle0' });
      await page.waitForSelector('#welcome-panel:not([hidden])'); await wait(900);
      await begin('home'); await wait(1800); await end('home');
      await page.type('#question', 'Mình muốn nhìn lại một tuần vừa qua.');
      await page.click('input[name="spread"][value="solution"] + span'); await page.click('#begin-reading');
      await page.waitForFunction(() => document.body.dataset.act === 'SHUFFLE'); await wait(500);
      const hold = await page.$eval('#hold-shuffle-btn', el => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      await page.mouse.move(...hold); await page.mouse.down(); await wait(1000);
      await begin('shuffle'); await wait(2500); await end('shuffle');
      await begin('gather'); await page.mouse.up(); await page.waitForFunction(() => document.body.dataset.act === 'FAN'); await end('gather'); await wait(1700);
      await begin('swipe'); await page.mouse.move(device.width / 2, device.height * .44);
      for (let i = 0; i < 16; i++) { await page.mouse.wheel({ deltaX: i < 8 ? 330 : -330 }); await wait(80); }
      await wait(700); await end('swipe');
      await begin('pick');
      for (let i = 0; i < 4; i++) { await page.click('#btn-draw-current'); await page.waitForSelector('#slot-box-' + i + '.filled'); await wait(150); }
      await page.waitForFunction(() => document.body.dataset.act === 'REVEAL'); await end('pick');
      await begin('flip'); await page.click('#flip-all'); await page.waitForFunction(() => document.querySelector('#scene-status').dataset.opened === '4'); await end('flip');
      await begin('reveal'); await wait(1800); await end('reveal');
      await begin('modal'); await page.click('#open-reading'); await page.waitForSelector('#conversation:not([hidden])'); await wait(1500); await end('modal');
      const report = await page.evaluate(() => {
        const summary = {};
        for (const [phase, frames] of Object.entries(window.__perf.frames)) {
          const ordered = frames.map(frame => frame.ms).sort((a, b) => a - b), sum = key => frames.reduce((n, frame) => n + frame[key], 0);
          summary[phase] = { frames: frames.length, p95: +ordered[Math.floor(ordered.length * .95)].toFixed(1), max: +ordered.at(-1).toFixed(1),
            averageDraws: +(sum('draws') / frames.length).toFixed(1), averageLayoutReads: +(sum('reads') / frames.length).toFixed(2), over33ms: ordered.filter(ms => ms > 33.4).length };
        }
        return { phases: summary, longTasks: window.__perf.longTasks.filter(task => task.phase),
          pixelRatio: document.querySelector('#stage-container canvas').width / innerWidth,
          preserved: window.TarotExperience.renderStats?.() || null };
      });
      for (const phase of Object.keys(report.phases)) report.phases[phase].cpu = phases[phase];
      assert.deepEqual(errors, []); reports.push({ device: device.name, ...report, errors });
      console.log(JSON.stringify({ label, device: device.name, phases: report.phases, longTasks: report.longTasks.length }));
      await page.close();
    }
    fs.writeFileSync(path.join(root, 'artifacts/performance-' + label + '.json'), JSON.stringify(reports, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
