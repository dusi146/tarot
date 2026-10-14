/* Optional physical feedback. Sensor values affect lighting/tilt, never card picking. */
(function (root) {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const deltaAngle = (value, baseline) => (value - baseline + 540) % 360 - 180;
  function create(options) {
    const win = options.window, nav = options.navigator, doc = options.document;
    const touch = options.touch === undefined ? nav.maxTouchPoints > 0 || win.matchMedia('(pointer: coarse)').matches : options.touch;
    const supportedMotion = touch && win.isSecureContext && typeof win.DeviceOrientationEvent !== 'undefined';
    const supportedHaptics = touch && typeof nav.vibrate === 'function';
    const target = { x: 0, y: 0, active: false }, now = options.now || (() => performance.now());
    let motion = false, haptics = supportedHaptics, neutral = null, blocked = false, pending = false, lastBuzz = -Infinity;
    let lastShuffleBuzz = -Infinity;
    try { const saved = JSON.parse(win.localStorage.getItem('tarot-v2:sensory')); if (typeof saved?.haptics === 'boolean') haptics = supportedHaptics && saved.haptics; } catch {}
    const status = () => ({ supportedMotion, supportedHaptics, motion, haptics, pending });
    function changed() { options.onStatus?.(status()); }
    function calibrate() { neutral = null; target.x = target.y = 0; }
    function onOrientation(event) {
      if (!motion || blocked || doc.hidden || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
      if (!neutral) neutral = { beta: event.beta, gamma: event.gamma };
      const angle = (win.screen?.orientation?.angle || 0) * Math.PI / 180;
      const x = deltaAngle(event.gamma, neutral.gamma), y = -deltaAngle(event.beta, neutral.beta);
      target.x = clamp((x * Math.cos(angle) + y * Math.sin(angle)) / 28, -.65, .65);
      target.y = clamp((y * Math.cos(angle) - x * Math.sin(angle)) / 28, -.65, .65);
    }
    async function toggleMotion() {
      if (!supportedMotion || pending) return false;
      if (motion) { motion = false; target.active = false; win.removeEventListener('deviceorientation', onOrientation); calibrate(); changed(); return false; }
      pending = true; changed();
      try {
        // Must run directly from this button gesture on browsers that require permission.
        if (typeof win.DeviceOrientationEvent.requestPermission === 'function'
            && await win.DeviceOrientationEvent.requestPermission() !== 'granted') {
          options.onNotice?.('Bạn chưa cho phép nghiêng máy. Chạm và vuốt bài vẫn dùng bình thường nhé.'); return false;
        }
        motion = true; target.active = true; calibrate(); win.addEventListener('deviceorientation', onOrientation, { passive: true });
        options.onNotice?.('Giữ máy ở tư thế thoải mái rồi nghiêng nhẹ để ngắm ánh sáng trên bài.'); return true;
      } catch { options.onNotice?.('Chưa bật được nghiêng máy trên trình duyệt này.'); return false; }
      finally { pending = false; changed(); }
    }
    function toggleHaptics() {
      if (!supportedHaptics) return false;
      haptics = !haptics;
      try { win.localStorage.setItem('tarot-v2:sensory', JSON.stringify({ haptics })); } catch {}
      if (!haptics) nav.vibrate(0); changed(); return haptics;
    }
    const patterns = { select: 14, dock: 8, complete: [10, 45, 18], flip: 12, ui: 7, tick: 5, shuffle: 7 };
    function feel(kind) {
      if (!supportedHaptics || !haptics || doc.hidden || blocked || nav.userActivation?.hasBeenActive === false) return false;
      const time = now();
      if (time - lastBuzz < (kind === 'tick' ? 100 : 65)) return false;
      if (kind === 'shuffle' && time - lastShuffleBuzz < 1200) return false;
      const pattern = patterns[kind]; if (!pattern) return false;
      try { const result = nav.vibrate(pattern); lastBuzz = time; if (kind === 'shuffle') lastShuffleBuzz = time; return result; }
      catch { return false; }
    }
    function suspend(value) {
      blocked = value; calibrate();
      if (value && supportedHaptics) try { nav.vibrate(0); } catch {}
    }
    doc.addEventListener('visibilitychange', () => { calibrate(); if (doc.hidden && supportedHaptics) try { nav.vibrate(0); } catch {} });
    win.screen?.orientation?.addEventListener('change', calibrate);
    win.addEventListener('blur', calibrate);
    return { toggleMotion, toggleHaptics, feel, suspend, sample: () => target, status };
  }
  if (typeof module === 'object' && module.exports) { module.exports = { create }; return; }
  const motionButton = document.getElementById('btn-motion-top'), hapticButton = document.getElementById('toggle-haptics');
  const mobile = create({ window: root, navigator: root.navigator, document: root.document,
    onNotice: text => root.dispatchEvent(new CustomEvent('tarot:notice', { detail: text })),
    onStatus: value => {
      motionButton.hidden = !value.supportedMotion; motionButton.disabled = value.pending;
      motionButton.setAttribute('aria-pressed', String(value.motion));
      motionButton.setAttribute('aria-label', value.motion ? 'Tắt nghiêng máy' : 'Bật nghiêng máy');
      motionButton.title = value.motion ? 'Tắt nghiêng máy' : 'Nghiêng máy để ngắm ánh sáng';
      hapticButton.hidden = !value.supportedHaptics; hapticButton.setAttribute('aria-pressed', String(value.haptics));
      hapticButton.textContent = value.haptics ? 'Rung nhẹ: bật' : 'Rung nhẹ: tắt';
    }
  });
  root.TarotMobile = mobile;
  motionButton.hidden = !mobile.status().supportedMotion; hapticButton.hidden = !mobile.status().supportedHaptics;
  hapticButton.textContent = mobile.status().haptics ? 'Rung nhẹ: bật' : 'Rung nhẹ: tắt';
  hapticButton.setAttribute('aria-pressed', String(mobile.status().haptics));
  motionButton.addEventListener('click', () => mobile.toggleMotion());
  hapticButton.addEventListener('click', () => { if (mobile.toggleHaptics()) mobile.feel('ui'); });
  root.addEventListener('tarot:feel', event => mobile.feel(event.detail));
})(typeof window === 'object' ? window : this);
