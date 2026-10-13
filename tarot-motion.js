/* Frame-rate independent motion and viewport-based card layout. */
(function (root) {
  'use strict';
  const damp = (rate, dt) => -Math.expm1(-rate * dt);
  function advanceRibbon(state, dt, limit, dragging) {
    if (!dragging) {
      const decay = Math.exp(-3.6 * dt);
      state.target += state.velocity * (1 - decay) / 3.6;
      state.velocity *= decay;
      const edge = Math.max(-limit, Math.min(limit, state.target));
      if (edge !== state.target) {
        state.target += (edge - state.target) * damp(14, dt);
        state.velocity *= Math.exp(-24 * dt);
      }
      if (Math.abs(state.velocity) < 0.001) state.velocity = 0;
    }
    state.offset += (state.target - state.offset) * damp(9.5, dt);
  }
  function viewAt(camera, aspect, z) {
    const depth = camera.z - z;
    const height = 2 * depth * Math.tan(Math.PI / 8);
    return { width: height * aspect, height, centerY: camera.y + Math.tan(camera.rotX) * depth };
  }
  function selectedLayout(count, index, width, height, camera, cardW, cardH, preview) {
    const z = 1.15;
    const view = viewAt(camera, width / height, z);
    if (count === 4 && width < 640 && height > width && !preview) {
      const scale = Math.min(1, view.width * 0.84 / (cardW * 2.28), view.height * 0.44 / (cardH * 2.40));
      return { x: (index % 2 - 0.5) * cardW * scale * 1.28,
        y: view.centerY + view.height * 0.04 + (0.5 - Math.floor(index / 2)) * cardH * scale * 1.40,
        z, scale };
    }
    const scale = Math.min(preview ? 0.57 : 1, view.width * 0.86 / (cardW * (1 + (count - 1) * 1.28)), view.height * 0.38 / cardH);
    const spacing = cardW * scale * 1.28;
    return { x: (index - (count - 1) / 2) * spacing,
      y: view.centerY + view.height * (preview ? 0.18 : 0.025), z, scale };
  }
  function screenToWorld(camera, width, height, sx, sy, z) {
    const nx = sx / width * 2 - 1, ny = 1 - sy / height * 2, f = Math.tan(Math.PI / 8);
    const s = Math.sin(camera.rotX), c = Math.cos(camera.rotX);
    const distance = (camera.z - z) / (c - ny * f * s);
    return { x: (camera.x || 0) + nx * f * distance * width / height,
      y: camera.y + (ny * f * c + s) * distance, z };
  }
  function carouselPose(delta, config, hover = 0) {
    const abs = Math.abs(delta), focus = Math.exp(-delta * delta * 0.7);
    const z = 0.45 - delta * delta * 0.30 + focus * 0.10 + hover * 0.10;
    const perspective = config.cameraDepth ? (config.cameraDepth + 0.45 - z) / config.cameraDepth : 1;
    return { x: ((config.baseX || 0) + delta * config.step) * perspective, y: config.baseY - Math.min(abs, 3) * 0.035 + hover * 0.04,
      z,
      scale: config.scale * (0.68 + 0.32 * focus) * Math.min(1, Math.max(0, (config.visibleLimit || 4) - abs)) * (1 + hover * 0.025),
      rotX: -0.08, rotY: Math.max(-0.36, Math.min(0.36, -delta * 0.16)),
      rotZ: Math.max(-0.05, Math.min(0.05, -delta * 0.025)) };
  }
  function stackPose(index, thickness, count = 78) {
    const depth = (index - (count - 1) / 2) * (thickness + 0.0005);
    return { x: 0, y: Math.sin(0.35) * depth, z: Math.cos(0.35) * depth };
  }
  const api = { damp, advanceRibbon, viewAt, selectedLayout, screenToWorld, carouselPose, stackPose };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotMotion = api;
})(typeof window === 'object' ? window : this);
