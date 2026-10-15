/* Threads-style particles for the prediction. The reading stays plain text. */
(function (root) {
  'use strict';
  const DENSITY = .6, MAX_PARTICLES = 3200, FRAME_MS = 1000 / 30;
  const instances = new WeakMap();

  function attach(element) {
    const document = element.ownerDocument, view = document.defaultView;
    const button = element.querySelector('.prediction-reveal');
    if (!view || !button || element.classList.contains('is-revealed')) return;
    const canvas = document.createElement('canvas');
    let ctx;
    try { ctx = canvas.getContext('2d'); } catch (_) { return; }
    if (!ctx) return;
    canvas.setAttribute('aria-hidden', 'true'); canvas.className = 'threads-spoiler-particles';
    element.dataset.threadsInit = 'true'; element.appendChild(canvas);
    const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, particles = [], color = '#e2c285';
    let frame = 0, lastPaint = null, visible = !view.IntersectionObserver, revealed = false, disposed = false;
    let intersection, resize;

    function stop() {
      if (frame) view.cancelAnimationFrame(frame);
      frame = 0; lastPaint = null;
    }
    function canAnimate() { return !disposed && visible && !document.hidden && !motion.matches && width > 0 && height > 0; }
    function schedule() { if (!frame && canAnimate()) frame = view.requestAnimationFrame(render); }
    function paint(dt) {
      ctx.clearRect(0, 0, width, height); ctx.fillStyle = color;
      let alive = 0;
      for (const particle of particles) {
        particle.x += particle.vx * dt; particle.y += particle.vy * dt;
        if (revealed) particle.alpha = Math.max(0, particle.alpha - dt * 2.4);
        else {
          particle.x = (particle.x + width) % width; particle.y = (particle.y + height) % height;
          particle.alpha += particle.vAlpha * dt;
          if (particle.alpha < .15 || particle.alpha > .9) {
            particle.alpha = Math.max(.15, Math.min(.9, particle.alpha)); particle.vAlpha *= -1;
          }
        }
        if (particle.alpha <= 0) continue;
        alive++;
        ctx.globalAlpha = particle.alpha; ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return alive;
    }
    function render(timestamp) {
      frame = 0;
      if (!canAnimate()) { lastPaint = null; return; }
      if (lastPaint !== null && timestamp - lastPaint < FRAME_MS - 1) { schedule(); return; }
      const dt = lastPaint === null ? 1 / 30 : Math.min(.05, (timestamp - lastPaint) / 1000);
      lastPaint = timestamp;
      if (!paint(dt) && revealed) { dispose(); return; }
      schedule();
    }
    function setup() {
      if (disposed || revealed) return;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) { width = height = 0; stop(); return; }
      const nextWidth = Math.ceil(rect.width + 4), nextHeight = Math.ceil(rect.height + 4);
      const dpr = Math.min(2, view.devicePixelRatio || 1);
      if (nextWidth === width && nextHeight === height && canvas.width === Math.ceil(width * dpr)) { schedule(); return; }
      width = nextWidth; height = nextHeight;
      canvas.width = Math.ceil(width * dpr); canvas.height = Math.ceil(height * dpr);
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      color = view.getComputedStyle(element).color || '#e2c285';
      const count = Math.max(8, Math.min(MAX_PARTICLES, Math.floor(width * height / 12 * DENSITY)));
      particles = Array.from({ length: count }, () => ({ x: Math.random() * width, y: Math.random() * height,
        vx: (Math.random() - .5) * 21, vy: (Math.random() - .5) * 21,
        r: Math.random() * 1.1 + .4, alpha: Math.random() * .75 + .15, vAlpha: (Math.random() - .5) * 1.5 }));
      lastPaint = null; paint(0); schedule();
    }
    function reveal(event) {
      if (revealed || disposed) return;
      revealed = true; element.classList.add('revealed');
      if (motion.matches || !width || !height) { dispose(); return; }
      const rect = canvas.getBoundingClientRect();
      const pointer = event.detail > 0 && Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
      const cx = pointer ? event.clientX - rect.left : width / 2;
      const cy = pointer ? event.clientY - rect.top : height / 2;
      for (const particle of particles) {
        const dx = particle.x - cx, dy = particle.y - cy, distance = Math.hypot(dx, dy) || 1;
        const force = Math.min(210, 1500 / distance);
        particle.vx = dx / distance * force + (Math.random() - .5) * 35;
        particle.vy = dy / distance * force + (Math.random() - .5) * 35;
      }
      lastPaint = null; schedule();
    }
    function visibilityChanged() { stop(); schedule(); }
    function motionChanged() {
      stop();
      if (revealed) dispose();
      else { if (width && height) paint(0); schedule(); }
    }
    function dispose() {
      if (disposed) return;
      disposed = true; stop(); particles = []; canvas.remove();
      intersection?.disconnect(); resize?.disconnect();
      button.removeEventListener('click', reveal);
      document.removeEventListener('visibilitychange', visibilityChanged);
      motion.removeEventListener?.('change', motionChanged);
      view.removeEventListener('resize', setup);
      delete element.dataset.threadsInit;
    }

    try {
      button.addEventListener('click', reveal);
      document.addEventListener('visibilitychange', visibilityChanged);
      motion.addEventListener?.('change', motionChanged);
      if (view.IntersectionObserver) {
        intersection = new view.IntersectionObserver(entries => {
          visible = entries.some(entry => entry.isIntersecting); stop(); schedule();
        });
        intersection.observe(element);
      }
      if (view.ResizeObserver) { resize = new view.ResizeObserver(setup); resize.observe(element); }
      else view.addEventListener('resize', setup, { passive: true });
      setup();
      return dispose;
    } catch (_) { dispose(); }
  }
  function init(container) {
    if (!container) return;
    let active = instances.get(container);
    if (!active) { active = new Set(); instances.set(container, active); }
    for (const element of container.querySelectorAll('.prediction-spoiler:not([data-threads-init])')) {
      const dispose = attach(element); if (dispose) active.add(dispose);
    }
  }
  function destroy(container) {
    const active = instances.get(container); if (!active) return;
    for (const dispose of active) dispose();
    instances.delete(container);
  }
  const api = { init, destroy };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotSpoiler = api;
})(typeof window === 'object' ? window : this);
