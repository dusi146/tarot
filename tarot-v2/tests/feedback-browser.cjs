// Check real Web Audio activation/output and mocked physical feedback without external requests.
const puppeteer = require('puppeteer'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), base = 'http://127.0.0.1:4182';
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    userDataDir: path.resolve(root, '../backups/v2-feedback-browser'), args: ['--no-first-run'] });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.setRequestInterception(true);
    page.on('request', r => /^https?:/.test(r.url()) && !r.url().startsWith(base) ? r.abort() : r.continue());
    await page.evaluateOnNewDocument(() => {
      window.__motionRequests = 0; window.__haptics = []; window.__gains = []; window.__audioPeak = 0;
      Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: { requestPermission: async () => { window.__motionRequests++; return 'granted'; } } });
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: pattern => { window.__haptics.push(pattern); return true; } });
      const Native = window.AudioContext || window.webkitAudioContext;
      window.AudioContext = class extends Native {
        constructor(...args) { super(...args); window.__audioContext = this; }
        createGain() { const gain = super.createGain(); window.__gains.push(gain); return gain; }
        createDynamicsCompressor() {
          const compressor = super.createDynamicsCompressor(), analyser = super.createAnalyser(), data = new Float32Array(512);
          window.__compressor = compressor; analyser.fftSize = 512; compressor.connect(analyser);
          const sample = () => { analyser.getFloatTimeDomainData(data); for (const value of data) window.__audioPeak = Math.max(window.__audioPeak, Math.abs(value)); requestAnimationFrame(sample); };
          requestAnimationFrame(sample); return compressor;
        }
      };
    });
    await page.goto(base + '/?preview=1', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.dataset.act === 'INTRO');
    assert.equal(await page.evaluate(() => !!window.__audioContext), false, 'No autoplay before a gesture');
    assert.equal(await page.$$('#btn-sound-top,#btn-motion-top,#toggle-haptics').then(items => items.length), 0);
    const tap = async selector => { const point = await page.$eval(selector, el => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await page.touchscreen.tap(...point); };
    await tap('#skip-intro'); await page.waitForSelector('#welcome-panel:not([hidden])');
    await page.waitForFunction(() => window.__audioContext?.state === 'running' && window.TarotMobile.status().motion);
    await tap('#options-toggle');
    await page.waitForFunction(() => !document.querySelector('#personal-options').hidden && document.querySelector('#personal-options').getAnimations().length === 0);
    await tap('#options-toggle');
    await page.waitForFunction(() => window.__audioPeak > .01);
    const report = await page.evaluate(() => ({ contextState: window.__audioContext.state, masterGain: window.__gains[0].gain.value,
      peak: window.__audioPeak, compressor: { threshold: window.__compressor.threshold.value, ratio: window.__compressor.ratio.value },
      motionRequests: window.__motionRequests, motionEnabled: window.TarotMobile.status().motion, hapticPulses: window.__haptics.filter(value => value !== 0).length }));
    assert.ok(Math.abs(report.masterGain - 3.2) < 1e-6); assert.equal(report.motionRequests, 1); assert.equal(report.motionEnabled, true);
    assert.ok(report.hapticPulses > 0); assert.ok(report.peak > .01 && report.peak < 1);
    assert.deepEqual(errors, []); report.errors = errors;
    fs.writeFileSync(path.join(root, 'artifacts/audio-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
