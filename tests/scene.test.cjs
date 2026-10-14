// Exercise the production scene with real Three.js geometry/raycasting and GSAP.
// Only the DOM, audio, texture transport, and GPU are replaced for Node.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../vendor/three.r128.min.js');
const { gsap } = require('../vendor/gsap.3.12.5.min.js');
const motion = require('../tarot-motion.js');

class Element {
  constructor() {
    this.style = { setProperty(name, value) { this[name] = value; } }; this.dataset = {}; this.value = ''; this.innerHTML = ''; this.textContent = ''; this.children = [];
    Object.assign(this, { x: 0, y: 0, xPercent: 0, yPercent: 0, scale: 1, opacity: 1, clearProps: '', overflow: '', height: 0 });
    this.events = {}; this.attributes = new Map(); this.captures = new Set();
    const classes = new Set();
    this.classList = { add: (...items) => items.forEach(x => classes.add(x)), remove: (...items) => items.forEach(x => classes.delete(x)), contains: x => classes.has(x) };
  }
  addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
  dispatch(name, data = {}) { for (const callback of this.events[name] || []) callback({ preventDefault() {}, ...data }); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelectorAll() { return []; }
  appendChild(element) { this.children.push(element); return element; }
  focus() {}
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  get clientWidth() { return 1280; }
  getContext() {
    const gradient = { addColorStop() {} };
    return new Proxy({}, { get: (_, name) => name.startsWith('create') ? () => gradient : () => {} });
  }
}

function scene({ textureFailure = false, oracleDeferred = false, oracleFailure = false, oracleIncomplete = false, storage = new Map() } = {}) {
  gsap.globalTimeline.clear();
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const document = new Element();
  Object.assign(document, { hidden: false, body: new Element(), getElementById: get, createElement: () => new Element(), querySelector: () => null, querySelectorAll: () => [] });
  const window = new Element();
  Object.assign(window, { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2, matchMedia: () => ({ matches: false }), THREE: {}, gsap, TarotMotion: motion, TarotGeometry: require("../tarot-geometry.js") });
  class Renderer {
    constructor() { this.shadowMap = {}; this.capabilities = { getMaxAnisotropy: () => 16 }; this.info = { render: { calls: 0 } }; }
    setPixelRatio() {} setSize() {} initTexture() {} render() {}
  }
  class TextureLoader {
    load(url, onLoad, progress, onError) {
      const texture = new THREE.Texture();
      queueMicrotask(() => { if (textureFailure) onError?.(new Error('offline')); else onLoad?.(texture); });
      return texture;
    }
  }
  const three = { ...THREE, WebGLRenderer: Renderer, TextureLoader };
  window.THREE = three;
  window.TarotPersona = require('../tarot-persona.js');
  window.TarotReading = require('../tarot-reading.js');
  window.TarotAI = require('../tarot-ai.js');
  window.TarotTransport = require('../tarot-transport.js');
  window.TAROT_SHEETS_CONFIG = { endpoint: 'https://script.google.com/macros/s/test/exec' };
  window.TarotAtmosphere = require('../tarot-atmosphere.js');
  window.TarotAudio = require('../tarot-audio.js');
  window.TarotProfile = require('../tarot-profile.js');
  window.TarotUI = require('../tarot-ui.js');
  window.TarotRender = require('../tarot-render.js');
  window.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  let now = 0;
  let timerId = 0;
  let readingRequests = 0;
  const sheetRecords = [];
  const sheetConversations = [];
  const oraclePayloads = [];
  window.TarotSheets = { begin: profile => ({
    record: async (conclusion, status) => { sheetRecords.push({ ...profile, conclusion, status }); },
    followup: async value => { sheetConversations.push(value); }
  }) };
  let resolveOracle;
  const oracleGate = oracleDeferred ? new Promise(resolve => { resolveOracle = resolve; }) : Promise.resolve();
  const context = vm.createContext({
    document, window, THREE: three, gsap, console, URLSearchParams, AbortController, performance: { now: () => now },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: () => ++timerId, clearTimeout() {}, setInterval: () => ++timerId, clearInterval() {},
    fetch: async (url, options) => {
      if (options?.method === 'POST') {
        readingRequests++;
        const request = JSON.parse(options.body); oraclePayloads.push(request);
        await oracleGate;
        if (oracleFailure) return { ok: true, json: async () => ({ status: 'error', code: 'RATE_LIMIT', retryAfter: 30 }) };
        const paragraphs = request.state.cards.map((card, index) => {
          const name = window.TAROT_CARDS.find(item => item.id === card.id).viName;
          return `${api.appState.activeSpread.slots[index].title}: ${name}\n${oracleIncomplete && readingRequests === 1 ? '' : 'Lá này gợi ý bạn nhìn rõ nhu cầu của mình, cân nhắc lựa chọn và bắt đầu từ điều có thể chủ động hôm nay.'}`;
        });
        const text = request.action === 'ai_reading' ? 'Một góc nhìn mới cho bạn.\n\n' + paragraphs.join('\n\n')
          + '\n\nGóc nhìn chung\nBạn cần chọn một việc quan trọng để tập trung, thay vì cố giải quyết tất cả cùng lúc.'
          + '\n\nMột bước nhỏ cho bạn\nHãy viết ra một việc có thể hoàn thành hôm nay và dành mười phút để bắt đầu.' : 'Một góc nhìn mới cho bạn.';
        return { ok: true, json: async () => ({ status: 'success', text }) };
      }
      if (url.includes('ai_health')) return { ok: true, json: async () => ({ service: 'tarot-groq', version: 1, configured: true }) };
      return { json: async () => ({ status: 'empty', data: [] }) };
    }
  });
  let source = fs.readFileSync(require.resolve('../script.js'), 'utf8');
  vm.runInContext(fs.readFileSync(require.resolve('../tarot-data.js'), 'utf8'), context);
  {
    const close = source.lastIndexOf('});');
    source = source.slice(0, close) + `
    window.testScene = { appState, cardMeshes, camera, scene, ribbon, drawEntry,
      startChargingStage, startDrawStage, startRevealStage, pickCard, flipSelectedCard,
      onHoldStart, onHoldEnd, cancelHold, updateRibbonCardsPositions, resizeScene, hitCard,
      SPREAD_CONFIGS, handleCloseOracle, faceCache, renderLoop, ritual, requestFollowUp, finishIntro, entrance, updateShuffleMessage, optionsAccordion, restoreProfile, layoutIdleCards };
  ` + source.slice(close);
  }
  vm.runInContext(source, context);
  document.dispatch('DOMContentLoaded');
  const api = window.testScene;
  const advance = async seconds => {
    const start = gsap.globalTimeline.time();
    for (let elapsed = 0.01; elapsed <= seconds + 0.001; elapsed += 0.01) {
      now += 10;
      gsap.globalTimeline.time(start + elapsed, false);
      if (api.appState?.currentStage === 'draw') api.updateRibbonCardsPositions(0.01);
      await Promise.resolve();
    }
    gsap.ticker.sleep();
  };
  return Object.assign(api, { window, document, get, advance, storage, sheetRecords, sheetConversations, oraclePayloads, elapsed: () => now, setNow: value => { now = value; }, readingRequests: () => readingRequests, resolveOracle: () => resolveOracle?.() });
}

async function enterDraw(s, spread = 'time') {
  s.appState.activeSpread = s.SPREAD_CONFIGS[spread];
  s.startChargingStage();
  s.onHoldStart();
  s.setNow(s.elapsed() + 500);
  s.onHoldEnd();
  assert.equal(s.appState.currentStage, 'charge');
  await s.advance(0.7);
  assert.equal(s.appState.currentStage, 'charge', 'wait for the last settling card');
  await s.advance(0.15);
  assert.equal(s.appState.currentStage, 'draw');
  assert.equal(s.appState.isTransitioning, true);
  s.pickCard(s.cardMeshes[39]);
  assert.equal(s.appState.selectedCards.length, 0, 'cannot pick during entry');
  await s.advance(1.6);
  assert.equal(s.appState.isTransitioning, false);
}

test('intro orbits three cards, hands them to the idle scene and enables the menu', async () => {
  const s = scene();
  assert.equal(s.entrance.active, true);
  assert.equal(s.get('stageIntent').getAttribute('inert'), '');
  s.layoutIdleCards(.3);
  const first = s.cardMeshes[77].position.clone();
  s.layoutIdleCards(1.1);
  assert.ok(first.distanceTo(s.cardMeshes[77].position) > .1);
  assert.equal(s.cardMeshes.filter(mesh => mesh.visible).length, 3);
  await s.advance(3);
  assert.equal(s.entrance.active, false);
  assert.equal(s.entrance.blend, 1);
  assert.equal(s.get('stageIntent').getAttribute('inert'), null);
  assert.equal(s.document.body.classList.contains('intro-complete'), true);
  s.get('skipIntroBtn').dispatch('click');
  assert.equal(s.appState.currentStage, 'intent');
});

test('chosen cards land in the measured dock frames before the group rises', async () => {
  const s = scene(); await enterDraw(s);
  const rects = [0, 1, 2].map(index => ({ left: 470 + index * 100, top: 648, width: 27, height: 47 }));
  rects.forEach((rect, index) => { s.get('dockThumb-' + index).getBoundingClientRect = () => rect; });
  for (let index = 0; index < 3; index++) {
    s.pickCard(s.cardMeshes[38 + index]);
    assert.equal(s.get('dockSlot-' + index).classList.contains('filled'), false);
    await s.advance(1);
    const card = s.appState.selectedCards[index];
    assert.equal(card.isPlaced, true);
    assert.equal(s.get('dockSlot-' + index).classList.contains('filled'), true);
    assert.match(s.get('dockThumb-' + index).innerHTML, /<img/);
    assert.equal(card.mesh.visible, false);
    s.camera.updateMatrixWorld(true);
    const point = card.mesh.position.clone().project(s.camera);
    const x = (point.x * .5 + .5) * s.window.innerWidth;
    const y = (-point.y * .5 + .5) * s.window.innerHeight;
    assert.ok(Math.abs(x - rects[index].left - 13.5) < 1);
    assert.ok(Math.abs(y - rects[index].top - 23.5) < 1);
  }
  assert.equal(s.appState.currentStage, 'draw', 'hold the completed group in its frames briefly');
  await s.advance(1.6);
  assert.equal(s.appState.currentStage, 'reveal');
  assert.equal(s.appState.isTransitioning, false);
  assert.ok(s.appState.selectedCards.every(card => card.mesh.visible));
  assert.ok([0, 1, 2].every(index => s.get('dockSlot-' + index).classList.contains('departing')));
});

test('options opening can reverse repeatedly without stale closing callbacks', async () => {
  const s = scene(); s.finishIntro();
  const toggle = s.get('personalOptionsToggle'), details = s.get('personalOptions');
  toggle.dispatch('click'); await s.advance(.1);
  toggle.dispatch('click'); await s.advance(.1);
  toggle.dispatch('click'); await s.advance(1);
  assert.equal(details.open, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  s.optionsAccordion.close(true); await s.advance(1);
  assert.equal(details.open, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('personal fields restore on return and the forget control clears them', () => {
  const key = require('../tarot-profile.js').KEY;
  const storage = new Map([[key, JSON.stringify({ name: 'An', gender: 'Nữ', dob: { day: 8, month: 10, year: 2003 }, vibe: 'quansu', spread: 'solution' })]]);
  const s = scene({ storage });
  assert.equal(s.get('nameInput').value, 'An');
  assert.equal(s.get('genderInput').value, 'Nữ');
  assert.equal(s.appState.zodiac, 'Thiên Bình');
  assert.equal(s.appState.userVibe, 'quansu');
  assert.equal(s.appState.activeSpread.id, 'solution');
  s.get('nameInput').value = 'Bình'; s.get('nameInput').dispatch('input');
  assert.equal(JSON.parse(storage.get(key)).name, 'Bình');
  s.get('forgetProfileBtn').dispatch('click');
  assert.equal(storage.has(key), false);
  assert.equal(s.get('nameInput').value, '');
  assert.equal(s.appState.zodiac, '');
});

test('long shuffle holds show calm rotating messages and cancellation restores the hint', async () => {
  const s = scene(); s.startChargingStage(); s.onHoldStart();
  s.updateShuffleMessage(5); await s.advance(1);
  assert.match(s.get('chargeTipPill').textContent, /sâu sắc/);
  s.updateShuffleMessage(10); await s.advance(1);
  assert.match(s.get('chargeTipPill').textContent, /vừa lòng/);
  assert.ok(!s.get('chargeTipPill').textContent.includes('%'));
  s.cancelHold(); await s.advance(2);
  assert.match(s.get('chargeTipPill').textContent, /sẵn sàng/);
});

test('settling and entry complete before picking; fast picks produce unique cards', async () => {
  const s = scene();
  await enterDraw(s, 'solution');
  for (const index of [37, 38, 39, 40]) {
    const before = s.appState.selectedCards.length;
    s.pickCard(s.cardMeshes[index]); s.pickCard(s.cardMeshes[index]);
    s.pickCard(s.cardMeshes[(index + 1) % 78]);
    assert.equal(s.appState.selectedCards.length, before + 1, 'one card flight at a time');
    if (index !== 40) await s.advance(1.0);
  }
  assert.equal(s.appState.selectedCards.length, 4);
  assert.equal(s.appState.usedCardIds.size, 4);
  await s.advance(0.55);
  assert.equal(s.appState.currentStage, 'draw', 'do not interrupt the last flight');
  await s.advance(0.75);
  assert.equal(s.appState.currentStage, 'reveal');
  await s.advance(1.3);
  assert.equal(s.appState.isTransitioning, false);
  assert.equal(s.cardMeshes.filter(m => m.visible).length, 4);
});

test('cancel and short hold reset; another finger cannot finish a hold', async () => {
  const s = scene();
  s.startChargingStage();
  s.onHoldStart({ pointerId: 1, isPrimary: true, button: 0, preventDefault() {} });
  s.setNow(600);
  s.onHoldEnd({ pointerId: 2 });
  assert.equal(s.appState.isHolding, true);
  s.cancelHold();
  assert.equal(s.appState.isHolding, false);
  await s.advance(1);
  assert.equal(s.appState.currentStage, 'charge');
  s.onHoldStart();
  s.onHoldEnd();
  s.onHoldStart();
  assert.equal(s.appState.isHolding, false, 'wait for short-hold return animation');
  await s.advance(1);
  s.onHoldStart();
  assert.equal(s.appState.isHolding, true);
  s.cancelHold();
});

test('a drag, pointer cancellation, and UI clicks cannot pick a card', async () => {
  const s = scene();
  await enterDraw(s);
  const canvas = s.get('webgl-canvas');
  s.scene.updateMatrixWorld(true); s.camera.updateMatrixWorld(true);
  const p = s.cardMeshes[39].position.clone().project(s.camera);
  const event = { pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch', clientX: (p.x + 1) * 640, clientY: (1 - p.y) * 360 };
  canvas.dispatch('pointerdown', event);
  canvas.dispatch('pointermove', { ...event, clientX: event.clientX + 90 });
  canvas.dispatch('pointerup', { ...event, clientX: event.clientX + 90 });
  assert.equal(s.appState.selectedCards.length, 0);
  canvas.dispatch('pointerdown', event);
  canvas.dispatch('pointercancel', event);
  canvas.dispatch('pointerup', event);
  s.window.dispatch('pointerup', event);
  assert.equal(s.appState.selectedCards.length, 0);
  canvas.dispatch('pointerdown', event);
  canvas.dispatch('pointerup', event);
  assert.equal(s.appState.selectedCards.length, 1, 'real Three.js raycast can still select');
});

test('losing visibility cancels a hold and context restoration permits continuation', async () => {
  const s = scene();
  s.startChargingStage();
  s.onHoldStart();
  s.document.hidden = true;
  s.document.dispatch('visibilitychange');
  assert.equal(s.appState.isHolding, false);
  s.document.hidden = false;
  s.document.dispatch('visibilitychange');
  await s.advance(1);
  assert.equal(s.appState.currentStage, 'charge');
  s.get('webgl-canvas').dispatch('webglcontextlost');
  s.get('webgl-canvas').dispatch('webglcontextrestored');
  s.onHoldStart();
  assert.equal(s.appState.isHolding, true);
  s.cancelHold();
});

test('rapid flip requests queue once; resize mid-flip lands at new targets', async () => {
  const s = scene();
  await enterDraw(s);
  for (const index of [38, 39, 40]) { s.pickCard(s.cardMeshes[index]); await s.advance(1.0); }
  await s.advance(2.5);
  const cards = s.appState.selectedCards;
  cards[0].isReversed = true;
  await s.flipSelectedCard(cards[0]);
  await s.flipSelectedCard(cards[1]);
  await s.flipSelectedCard(cards[1]);
  await s.flipSelectedCard(cards[2]);
  await s.advance(0.4);
  s.window.innerWidth = 320; s.window.innerHeight = 568;
  s.resizeScene();
  await s.advance(8);
  assert.equal(cards.filter(c => c.isFlipped).length, 3);
  assert.equal(s.appState.activeFlip, null);
  assert.equal(s.get('oracleTriggerBar').classList.contains('show'), true);
  for (const card of cards) assert.ok(card.mesh.position.distanceTo(card.mesh.userData.targetPos) < 0.0001);
  assert.ok(Math.abs(cards[0].mesh.rotation.z - Math.PI) < 0.0001);
  s.appState.currentStage = 'oracle';
  s.handleCloseOracle();
  assert.equal(s.appState.currentStage, 'reveal');
});

test('failed artwork still permits reveal and completion', async () => {
  const s = scene({ textureFailure: true });
  await enterDraw(s, 'single');
  s.pickCard(s.cardMeshes[39]);
  await s.advance(2.5);
  const card = s.appState.selectedCards[0];
  await s.flipSelectedCard(card);
  await s.advance(3);
  assert.equal(card.face.failed, true);
  assert.equal(card.isFlipped, true);
  assert.equal(s.appState.activeFlip, null);
});

test('large action buttons select, reveal all, and reuse an in-flight reading', async () => {
  const s = scene({ oracleDeferred: true });
  assert.equal(s.cardMeshes.filter(mesh => mesh.visible).length, 3, 'entry scene renders only three cards');
  await enterDraw(s, 'solution');
  const pick = s.get('pickCenterBtn');
  for (let i = 0; i < 4; i++) { pick.dispatch('click'); if (i < 3) await s.advance(1.2); }
  assert.equal(s.appState.selectedCards.length, 4);
  assert.equal(pick.disabled, true);
  await s.advance(2.5);
  const action = s.get('summonOracleBtn');
  assert.equal(action.disabled, false);
  action.dispatch('click');
  assert.equal(s.readingRequests(), 0, 'opening cards does not request a reading');
  await s.advance(8);
  assert.equal(s.appState.selectedCards.filter(card => card.isFlipped).length, 4);
  assert.equal(action.disabled, false);
  s.window.innerWidth = 320;
  s.window.innerHeight = 568;
  s.resizeScene();
  await s.advance(0.1);
  for (const card of s.appState.selectedCards) {
    const captionTop = Number.parseFloat(s.get('cardLabel-' + card.slotIndex).style.top);
    assert.ok(captionTop + 30 < 420, 'two-line card caption leaves space above the 427px action button');
  }
  action.dispatch('click');
  await s.advance(0.1);
  assert.equal(s.readingRequests(), 1);
  s.handleCloseOracle();
  action.dispatch('click');
  assert.equal(s.readingRequests(), 1, 'reopening while pending does not duplicate requests');
  s.resolveOracle();
  await s.advance(0.1);
  assert.equal(s.get('readingText').children[0].children[0].textContent, 'Một góc nhìn mới cho bạn.');
  s.handleCloseOracle();
  action.dispatch('click');
  assert.equal(s.readingRequests(), 1, 'completed reading is reused');
  assert.equal(s.sheetRecords.length, 1, 'reopening does not append duplicate sheet rows');
  assert.equal(s.sheetRecords[0].spread, '4 lá');
  assert.equal(s.sheetRecords[0].status, 'Thành công');
  assert.match(s.sheetRecords[0].conclusion, /Một góc nhìn mới cho bạn/);
});

test('an incomplete reading can be retried inside the modal without drawing new cards or sending duplicates', async () => {
  const s = scene({ oracleIncomplete: true });
  await enterDraw(s, 'single');
  s.get('pickCenterBtn').dispatch('click'); await s.advance(2.5);
  s.get('summonOracleBtn').dispatch('click'); await s.advance(2.5);
  const ids = Array.from(s.appState.selectedCards, card => card.data.id);
  s.get('summonOracleBtn').dispatch('click'); await s.advance(.2);
  assert.equal(s.readingRequests(), 1);
  assert.equal(s.appState.readingResult, '');
  assert.equal(s.get('retryReadingBtn').hidden, false);
  assert.match(s.get('readingText').textContent, /chưa nhận đủ nội dung/);
  assert.equal(s.sheetRecords[0].status, 'Thất bại');
  s.get('retryReadingBtn').dispatch('click'); s.get('retryReadingBtn').dispatch('click');
  await s.advance(.2);
  assert.equal(s.readingRequests(), 2);
  assert.deepEqual(Array.from(s.appState.selectedCards, card => card.data.id), ids);
  assert.equal(s.get('retryReadingBtn').hidden, true);
  assert.ok(s.appState.readingResult.includes('Góc nhìn chung'));
  assert.equal(s.sheetRecords[1].status, 'Thành công');
});

test('an oracle API failure is logged with profile details and failure status', async () => {
  const s = scene({ oracleFailure: true });
  s.appState.userName = 'An';
  s.appState.userQuestion = 'Công việc?';
  s.appState.dob = { day: 10, month: 12, year: 2007 };
  s.appState.zodiac = 'Nhân Mã';
  s.get('genderInput').value = 'Nữ';
  await enterDraw(s, 'single');
  s.get('pickCenterBtn').dispatch('click');
  await s.advance(2.5);
  s.get('summonOracleBtn').dispatch('click');
  await s.advance(2.5);
  s.get('summonOracleBtn').dispatch('click');
  await s.advance(0.2);
  assert.equal(s.sheetRecords.length, 1);
  const row = s.sheetRecords[0];
  assert.equal(row.name, 'An');
  assert.equal(row.dob, '10/12/2007');
  assert.equal(row.gender, 'Nữ');
  assert.equal(row.question, 'Công việc?');
  assert.equal(row.status, 'Thất bại');
  assert.match(row.conclusion, /chạm hạn mức/);
  assert.match(row.solver, /Groq.*gpt-oss-120b/);
});

test('conversations retain the spread and invite support exactly once on the third successful reply', async () => {
  const s = scene();
  await enterDraw(s, 'single');
  s.get('pickCenterBtn').dispatch('click'); await s.advance(2.5);
  s.get('summonOracleBtn').dispatch('click'); await s.advance(2.5);
  s.get('summonOracleBtn').dispatch('click'); await s.advance(.2);
  const cards = s.appState.selectedCards.map(card => card.data.id);
  assert.equal(s.get('supportLetter').style.display, 'block');
  for (let turn = 1; turn <= 4; turn++) {
    s.get('followupInput').value = `Lời tâm sự ${turn}`;
    s.get('followupSendBtn').dispatch('click');
    // A second click while waiting must not add another request/turn.
    s.get('followupSendBtn').dispatch('click');
    await s.advance(.2);
    const history = s.appState.followupHistory;
    assert.equal(history.filter(item => item.role === 'rot').length, turn);
    assert.equal(history.filter(item => item.text.includes('https://hoahong.vercel.app/')).length, turn >= 3 ? 1 : 0);
    const payload = s.oraclePayloads[s.oraclePayloads.length - 1];
    assert.deepEqual(payload.state.cards.map(card => card.id), Array.from(cards));
    assert.equal(payload.reading, s.appState.readingResult);
    assert.equal(payload.history.length, turn * 2 - 1);
    assert.equal(s.sheetConversations.length, turn);
  }
  const invitations = s.get('followupMsgs').children.flatMap(bubble => bubble.children).filter(child => child.className === 'conversation-invitation');
  assert.equal(invitations.length, 1);
  assert.match(s.sheetConversations[3].followUpA, /hoahong.vercel.app/);
  s.get('restartBtn').dispatch('click');
  assert.equal(s.appState.followupHistory.length, 0);
  assert.equal(s.get('supportLetter').style.display, 'none');
});

test('visible left/right browsing controls change cards and dismiss the swipe demonstration', async () => {
  const s = scene(); await enterDraw(s);
  const start = s.ribbon.target;
  s.get('nextCardBtn').dispatch('click'); await s.advance(1.4);
  assert.ok(s.ribbon.target < start);
  assert.equal(s.get('swipeGuide').classList.contains('understood'), true);
  s.get('previousCardBtn').dispatch('click'); await s.advance(1.4);
  assert.equal(s.ribbon.target, start);
});

test('holding displays more moving cards while cancellation returns to a clean stack', async () => {
  const s = scene(); s.startChargingStage(); await s.advance(2.5);
  s.onHoldStart(); s.setNow(s.elapsed() + 4000); s.renderLoop();
  assert.equal(s.cardMeshes.filter(mesh => mesh.visible).length, 39);
  s.window.innerWidth = 390; s.renderLoop();
  assert.equal(s.cardMeshes.filter(mesh => mesh.visible).length, 26);
  s.cancelHold(); await s.advance(2.5);
  assert.equal(s.appState.isHolding, false);
  assert.equal(s.cardMeshes.filter(mesh => mesh.visible).length, 78);
  assert.equal(s.ritual.energy, 0);
});

test('restart reuses the scene, preserves choices, and cancels old card motion', async () => {
  const s = scene();
  await enterDraw(s, 'solution');
  for (let i = 0; i < 4; i++) { s.get('pickCenterBtn').dispatch('click'); await s.advance(1.2); }
  await s.advance(2.5);
  s.get('summonOracleBtn').dispatch('click');
  await s.advance(0.3);
  s.get('restartBtn').dispatch('click');
  assert.equal(s.appState.currentStage, 'intent');
  assert.equal(s.appState.activeSpread.id, 'solution');
  assert.equal(s.appState.selectedCards.length, 0);
  assert.equal(s.cardMeshes.filter(mesh => mesh.visible).length, 3);
  await s.advance(6);
  assert.equal(s.appState.currentStage, 'intent');
  assert.equal(s.appState.activeFlip, null);
  await enterDraw(s, 'single');
  s.get('pickCenterBtn').dispatch('click');
  assert.equal(s.appState.selectedCards.length, 1, 'same scene can start another spread');
});

test('a reading from a previous session cannot overwrite a new spread', async () => {
  const s = scene({ oracleDeferred: true });
  await enterDraw(s, 'single');
  s.get('pickCenterBtn').dispatch('click');
  await s.advance(2.5);
  s.get('summonOracleBtn').dispatch('click');
  await s.advance(2.5);
  s.get('summonOracleBtn').dispatch('click');
  await s.advance(0.1);
  assert.equal(s.readingRequests(), 1);
  s.get('restartBtn').dispatch('click');
  s.resolveOracle();
  await s.advance(0.2);
  assert.equal(s.appState.currentStage, 'intent');
  assert.equal(s.appState.readingResult, '');
  assert.equal(s.get('readingText').textContent, '');
});

test('scrubber reaches both ends and settling skips cards already selected', async () => {
  const s = scene(); await enterDraw(s, 'solution');
  const range = s.get('deckScrubber');
  range.dispatch('input', { target: { value: '0' } }); await s.advance(0.01);
  assert.equal(s.get('pickCenterBtn').disabled, true, 'wait for the indicated card to reach the center');
  s.get('pickCenterBtn').dispatch('click');
  assert.equal(s.appState.selectedCards.length, 0);
  await s.advance(1.4);
  assert.equal(s.get('pickCenterBtn').disabled, false);
  assert.ok(Math.abs(s.ribbon.offset - 38.5) < 0.001);
  s.get('pickCenterBtn').dispatch('click'); await s.advance(1.4);
  assert.equal(s.appState.selectedCards[0].mesh.userData.deckIndex, 0);
  assert.ok(!s.appState.selectedCards[0].mesh.visible, 'completed picks move out of the carousel');
  assert.ok(Math.abs(s.ribbon.target - 37.5) < 0.001, 'next available card moves to the center');
  range.dispatch('input', { target: { value: '77' } }); await s.advance(1.4);
  assert.ok(Math.abs(s.ribbon.offset + 38.5) < 0.001);
  s.get('pickCenterBtn').dispatch('click');
  assert.equal(s.appState.selectedCards[1].mesh.userData.deckIndex, 77);
});

test('resizing during the final pick completes one flight and allows reveal', async () => {
  const s = scene(); await enterDraw(s, 'single');
  s.get('pickCenterBtn').dispatch('click'); await s.advance(0.2);
  s.window.innerWidth = 320; s.window.innerHeight = 568; s.resizeScene();
  assert.equal(s.appState.isPickingCard, false);
  assert.equal(s.appState.selectedCards.length, 1);
  await s.advance(1.5);
  assert.equal(s.appState.currentStage, 'reveal');
  assert.equal(s.appState.isTransitioning, false);
  const card = s.appState.selectedCards[0];
  assert.ok(card.mesh.visible);
  assert.ok(card.mesh.position.distanceTo(card.mesh.userData.targetPos) < 0.0001);
});

after(() => { gsap.globalTimeline.clear(); gsap.ticker.sleep(); });
