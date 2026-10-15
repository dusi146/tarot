const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const THREE = require('../vendor/three.r128.min.js');
const motion = require('../js/tarot-return.js');
const source = fs.readFileSync(require.resolve('../js/engine.js'), 'utf8');
function scene(count, width = 1440, height = 900) {
  const deckGroup = new THREE.Group();
  const cards = Array.from({ length: 8 }, (_, i) => {
    const mesh = new THREE.Object3D(); deckGroup.add(mesh);
    mesh.position.set((i - (count - 1) / 2) * 1.7, count === 4 && width < 768 ? (i < 2 ? 1 : -1) : 0, .5);
    mesh.rotation.set(0, 0, i % 2 ? Math.PI : 0);
    return { mesh, pos: mesh.position, quat: mesh.quaternion, rot: mesh.rotation, scale: .8,
      vel: new THREE.Vector3(), frontMat: {}, haloMat: {}, glintPhase: 0, rimGlow: 0 };
  });
  const state = { selectedCards: cards.slice(0, count), act: 'REVEAL', actTime: 0, globalTime: 10,
    camTargetPos: new THREE.Vector3(0, 1, 5), camTargetLookAt: new THREE.Vector3(), smoothPointer: { x: 0, y: 0 } };
  const classes = new Set(), window = { TarotReturn: motion, TarotMobile: { suspend() {} } };
  let homes = 0;
  window.TarotExperience = { home() { homes++; state.act = 'HOME'; state.selectedCards = []; cards.forEach((card, i) => { card.mesh.visible = i < 3; }); } };
  const context = vm.createContext({ THREE, window, state, cards, deckGroup, reducedMotion: false,
    generation: 0, scheduled: new Set(), pointerState: {}, hideSpreadUI() {}, hideRevealedCaptions() {},
    introOrbits: {}, holdBtnEl: { classList: { remove() {} } }, setWhisper() {}, syncSceneActivity() {},
    document: { body: { classList: { remove(...names) { names.forEach(name => classes.delete(name)); }, add(name) { classes.add(name); } } } },
    innerWidth: width, innerHeight: height, layoutMetrics: { introCamZ: 12 }, camera: { fov: 38 },
    homePlacement: { center: 200, height: 140 }, homeBounds: { top: 130, bottom: 270 },
    CARD_H: 3, CARD_W: 1.7, backMaps: {}, lerp: (a,b,t) => a+(b-a)*t,
    refreshHomeBounds() {}, updateHome() {}, clearTimeout });
  vm.runInContext(source.slice(source.indexOf('function homeFrame(dt)'), source.indexOf('function updateHome(dt)')), context);
  return { cards, state, context, classes, homes: () => homes,
    start: () => vm.runInContext('beginReturnHome()', context),
    step(seconds) { state.actTime = seconds; state.globalTime = 10 + seconds; vm.runInContext('updateReturnHome(1/60)', context); } };
}
test('all cards finish turning before departure, with exactly three home destinations', () => {
  for (const count of [1, 3, 4]) {
    const plan = motion.plan(count);
    assert.equal(plan.filter(item => item.kind !== 'exit').length, 3);
    assert.equal(plan.filter(item => item.kind === 'enter').length, count === 1 ? 2 : 0);
    assert.equal(plan.filter(item => item.kind === 'exit').length, count === 4 ? 1 : 0);
    for (let i = 0; i < count; i++) { assert.equal(motion.phase(motion.DEPART, i).flip, 1); assert.equal(motion.phase(motion.DEPART, i).flight, 0); }
  }
});
test('actual engine choreography flips in place, admits side cards and lands three backs on desktop and phone', async () => {
  for (const [width,height] of [[1440,900],[390,844]]) for (const count of [1,3,4]) {
    const app = scene(count, width, height), initial = app.cards.slice(0,count).map(card => card.pos.clone());
    const completion = app.start(); assert.equal(app.start(), completion); assert.equal(app.state.act, 'RETURN');
    app.step(.9);
    assert.equal(app.cards.filter(card => card.mesh.visible).length, count);
    for (let i=0;i<count;i++) { assert.ok(app.cards[i].pos.distanceTo(initial[i]) < 1e-8); assert.ok(Math.abs(app.cards[i].quat.dot(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI,0)))) > .999); }
    app.step(1.05); assert.equal(app.cards.filter(card => card.mesh.visible).length, count === 1 ? 3 : count);
    if (count === 1) { assert.ok(app.cards[1].pos.x < 0); assert.ok(app.cards[2].pos.x > 0); }
    for(let time=1.1;time<motion.DURATION;time+=1/60) app.step(time);
    assert.ok(app.classes.has('return-arriving'));
    for(const card of app.cards.filter(card=>card.mesh.visible)) assert.ok(card.pos.toArray().every(Number.isFinite));
    app.step(motion.DURATION); await completion;
    assert.equal(app.homes(),1); assert.equal(app.state.act,'HOME'); assert.equal(app.cards.filter(card=>card.mesh.visible).length,3);
  }
});
test('restart closes dialogs and awaits the return before discarding selected cards', () => {
  const app = fs.readFileSync(require.resolve('../js/app.js'),'utf8');
  const restart = app.slice(app.indexOf('  async function restart()'), app.indexOf("  $('intent-form').addEventListener('submit'"));
  assert.ok(restart.indexOf('.map(closeDialog)') < restart.indexOf('await engine.returnHome()'));
  assert.ok(restart.indexOf('await engine.returnHome()') < restart.indexOf('clearSession()'));
  assert.ok(restart.indexOf('version++') < restart.indexOf('.map(closeDialog)'));
});
