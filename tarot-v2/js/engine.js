(function () {
      'use strict';

      /* ============================================================================
       * 1. MATHEMATICAL, QUATERNION & CRITICALLY-DAMPED SPRING UTILITIES
       * ============================================================================ */
      const TAU = Math.PI * 2;
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const lerp = (a, b, t) => a + (b - a) * t;
      const smoothstep = (edge0, edge1, x) => {
        const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
      };
      // C2-continuous Quintic Smoothstep (zero acceleration jerk at start and end)
      const smootherstep = (t) => {
        const u = clamp(t, 0, 1);
        return u * u * u * (u * (u * 6 - 15) + 10);
      };
      const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
      const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

      // Critically-damped 1D spring step for silky-smooth C2 continuous motion
      function stepSpring1D(current, velocity, target, omega, dt, out) {
        const f = 1.0 + 2.0 * dt * omega;
        const oo = omega * omega;
        const hoo = dt * oo;
        const hhoo = dt * hoo;
        const detInv = 1.0 / (f + hhoo);
        const detX = f * current + dt * velocity + hhoo * target;
        const detV = velocity + hoo * (target - current);
        out.value = detX * detInv; out.velocity = detV * detInv;
        return out;
      }

      // Critically-damped 3D vector spring step
      function stepSpringVec3(pos, vel, target, omega, dt) {
        const f = 1.0 + 2.0 * dt * omega;
        const oo = omega * omega;
        const hoo = dt * oo;
        const hhoo = dt * hoo;
        const detInv = 1.0 / (f + hhoo);

        const dx = (f * pos.x + dt * vel.x + hhoo * target.x) * detInv;
        const dy = (f * pos.y + dt * vel.y + hhoo * target.y) * detInv;
        const dz = (f * pos.z + dt * vel.z + hhoo * target.z) * detInv;

        vel.x = (vel.x + hoo * (target.x - pos.x)) * detInv;
        vel.y = (vel.y + hoo * (target.y - pos.y)) * detInv;
        vel.z = (vel.z + hoo * (target.z - pos.z)) * detInv;

        pos.set(dx, dy, dz);
      }

      // Weighted Tarot Flip curve:
      // Slow initial lift & anticipation (0.0 - 0.18),
      // Smooth mid-turn acceleration passing 90 deg (0.18 - 0.76),
      // Pronounced deceleration with a tiny gentle settle at the end (0.76 - 1.0)
      function evaluateHeroFlipAngle(t) {
        const u = clamp(t, 0, 1);
        if (u < 0.18) {
          const p = u / 0.18;
          return (p * p * 0.11) * Math.PI;
        } else if (u < 0.76) {
          const p = (u - 0.18) / 0.58;
          const s = easeInOutCubic(p);
          return lerp(0.11, 1.015, s) * Math.PI;
        } else {
          const p = (u - 0.76) / 0.24;
          const settle = Math.cos(p * Math.PI * 0.5);
          return (1.0 + 0.015 * settle) * Math.PI;
        }
      }

      // Evaluate cubic Bezier in 3D
      function evalCubicBezier3D(p0, p1, p2, p3, t, outVec) {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        outVec.set(
          uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
          uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
          uuu * p0.z + 3 * uu * t * p1.z + 3 * u * tt * p2.z + ttt * p3.z
        );
        return outVec;
      }

      /* ============================================================================
       * 2. REALISTIC PROCEDURAL FOLEY & ACOUSTIC SOUND ENGINE
       *    - Auto-unlocks on the user's first interaction so every card touch, swipe,
       *      riffle, draw, dock, and manual flip has realistic tactile sound.
       *    - Multi-layered physical synthesis: cotton-linen cardstock friction,
       *      mechanical card-edge ticks, velvet table dock thuds, metallic foil
       *      shimmer sweeps, and warm acoustic harp/singing-bowl harmonics.
       * ============================================================================ */
      class TarotSoundEngine {
        constructor() {
          this.ctx = null;
          this.masterGain = null;
          this.enabled = true; // Automatically starts on the first trusted interaction.
          this.volume = 3.2;
          this.unlocked = false;
          this.pinkNoiseBuffer = null;
          this.whiteNoiseBuffer = null;
          this.lastRustleTime = 0;
          this.lastTickTime = 0;
          this.lastHoverTime = 0;
        }

        initContext() {
          if (this.ctx) return;
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return;
          this.ctx = new AudioCtx();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.value = this.enabled ? this.volume : 0.0001;
          this.compressor = this.ctx.createDynamicsCompressor();
          this.compressor.threshold.value = -8; this.compressor.knee.value = 12;
          this.compressor.ratio.value = 4; this.compressor.attack.value = .006; this.compressor.release.value = .18;
          this.masterGain.connect(this.compressor); this.compressor.connect(this.ctx.destination);

          const sr = this.ctx.sampleRate;
          // 1. Pink Noise Buffer for warm cotton paper body & air breeze
          this.pinkNoiseBuffer = this.ctx.createBuffer(1, sr * 2, sr);
          const pData = this.pinkNoiseBuffer.getChannelData(0);
          let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
          for (let i = 0; i < pData.length; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            pData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.065;
            b6 = white * 0.115926;
          }

          // 2. Crisp White/Velvet Grain Buffer for realistic high-frequency cardstock surface texture
          this.whiteNoiseBuffer = this.ctx.createBuffer(1, sr * 1.5, sr);
          const wData = this.whiteNoiseBuffer.getChannelData(0);
          for (let i = 0; i < wData.length; i++) {
            wData[i] = (Math.random() * 2 - 1) * 0.32;
          }
        }

        unlockOnGesture() {
          if (!this.ctx) {
            this.initContext();
          }
          if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
          }
          if (!this.unlocked && this.ctx) {
            this.unlocked = true;
            this.syncUiIcon();
          }
        }

        syncUiIcon() {
          const btnSoundTop = document.getElementById('btn-sound-top');
          const iconSoundOff = document.getElementById('icon-sound-off');
          const iconSoundOn = document.getElementById('icon-sound-on');
          if (!btnSoundTop) return;
          const isPlaying = this.enabled && this.unlocked;
          btnSoundTop.setAttribute('aria-pressed', String(isPlaying));
          btnSoundTop.setAttribute('aria-label', isPlaying ? 'Tắt âm thanh' : 'Bật âm thanh');
          btnSoundTop.classList.toggle('active', isPlaying);
          if (iconSoundOff) iconSoundOff.style.display = isPlaying ? 'none' : 'block';
          if (iconSoundOn) iconSoundOn.style.display = isPlaying ? 'block' : 'none';
        }

        toggle() {
          const firstActivation = !this.unlocked;
          this.initContext();
          this.unlocked = true;
          this.enabled = firstActivation ? true : !this.enabled;
          if (this.ctx && this.ctx.state === 'suspended' && this.enabled) {
            this.ctx.resume();
          }
          if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(this.enabled ? this.volume : 0.0001, this.ctx.currentTime, 0.05);
          }
          this.syncUiIcon();
          if (this.enabled) {
            this.playUiClick(1.1);
          }
          return this.enabled;
        }

        createPanner(pan = 0) {
          if (this.ctx.createStereoPanner) {
            const p = this.ctx.createStereoPanner();
            p.pan.value = clamp(pan, -0.85, 0.85);
            p.connect(this.masterGain);
            return p;
          }
          return this.masterGain;
        }

        // Crisp, realistic cardstock tick when scrubbing past each card in the Fan carousel
        playCardTick(pan = 0, pitchMultiplier = 1.0) {
          if (!this.enabled || !this.ctx || !this.whiteNoiseBuffer) return;
          const now = this.ctx.currentTime;
          if (now - this.lastTickTime < 0.032) return;
          this.lastTickTime = now;

          const out = this.createPanner(pan);

          // Layer 1: Micro-snap of beveled card edge (1.8kHz - 3.6kHz resonant impulse)
          const snapSrc = this.ctx.createBufferSource();
          snapSrc.buffer = this.whiteNoiseBuffer;
          snapSrc.playbackRate.value = 1.1 * pitchMultiplier + (Math.random() - 0.5) * 0.12;

          const bp = this.ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(2450 * pitchMultiplier, now);
          bp.Q.setValueAtTime(4.2, now);

          const snapGain = this.ctx.createGain();
          snapGain.gain.setValueAtTime(0.0001, now);
          snapGain.gain.linearRampToValueAtTime(0.11, now + 0.004);
          snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

          snapSrc.connect(bp);
          bp.connect(snapGain);
          snapGain.connect(out);
          snapSrc.start(now, Math.random() * 0.8, 0.055);

          // Layer 2: Soft cardstock body tap (low-mid woody paper resonance ~260Hz)
          const bodyOsc = this.ctx.createOscillator();
          bodyOsc.type = 'triangle';
          bodyOsc.frequency.setValueAtTime(290 * pitchMultiplier, now);
          bodyOsc.frequency.exponentialRampToValueAtTime(115, now + 0.038);

          const bodyGain = this.ctx.createGain();
          bodyGain.gain.setValueAtTime(0.045, now);
          bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

          bodyOsc.connect(bodyGain);
          bodyGain.connect(out);
          bodyOsc.start(now);
          bodyOsc.stop(now + 0.045);
        }

        // Feather-light linen cardstock brush when hovering a card
        playHoverBrush(pan = 0) {
          if (!this.enabled || !this.ctx || !this.pinkNoiseBuffer) return;
          const now = this.ctx.currentTime;
          if (now - this.lastHoverTime < 0.09) return;
          this.lastHoverTime = now;

          const out = this.createPanner(pan);
          const src = this.ctx.createBufferSource();
          src.buffer = this.pinkNoiseBuffer;
          src.playbackRate.value = 1.15 + (Math.random() - 0.5) * 0.1;

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(1950, now);
          filter.frequency.exponentialRampToValueAtTime(2600, now + 0.08);
          filter.Q.value = 3.2;

          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(0.045, now + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);

          src.connect(filter);
          filter.connect(gain);
          gain.connect(out);
          src.start(now, Math.random() * 1.0, 0.11);
        }

        // Realistic multi-layered cardstock friction slide / shuffle rustle
        playPaperRustle(intensity = 0.5, pitch = 1.0, pan = 0) {
          if (!this.enabled || !this.ctx || !this.pinkNoiseBuffer) return;
          const now = this.ctx.currentTime;
          if (now - this.lastRustleTime < 0.055) return;
          this.lastRustleTime = now;

          const out = this.createPanner(pan);
          const src = this.ctx.createBufferSource();
          src.buffer = this.pinkNoiseBuffer;
          src.playbackRate.value = 0.88 + pitch * 0.32 + (Math.random() - 0.5) * 0.14;

          // Formant 1: Warm paper body slide
          const f1 = this.ctx.createBiquadFilter();
          f1.type = 'bandpass';
          f1.frequency.setValueAtTime(980 * pitch, now);
          f1.frequency.linearRampToValueAtTime(1420 * pitch, now + 0.12);
          f1.Q.setValueAtTime(2.4, now);

          // Formant 2: Crisp linen surface grain
          const f2 = this.ctx.createBiquadFilter();
          f2.type = 'bandpass';
          f2.frequency.setValueAtTime(3100 * pitch, now);
          f2.Q.setValueAtTime(3.5, now);

          const gain = this.ctx.createGain();
          const peak = clamp(intensity * 0.13, 0.015, 0.14);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(peak, now + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

          src.connect(f1);
          src.connect(f2);
          f1.connect(gain);
          f2.connect(gain);
          gain.connect(out);
          src.start(now, Math.random() * 1.2, 0.20);
        }

        // Tactile card draw snap + aerodynamic flight whoosh
        playFlightWhoosh(duration = 0.9, baseFreq = 320, pan = 0) {
          if (!this.enabled || !this.ctx || !this.pinkNoiseBuffer) return;
          const now = this.ctx.currentTime;
          const out = this.createPanner(pan);

          // Initial crisp card lift snap
          this.playCardTick(pan, 1.18);

          const src = this.ctx.createBufferSource();
          src.buffer = this.pinkNoiseBuffer;

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.Q.value = 1.6;
          filter.frequency.setValueAtTime(baseFreq * 0.65, now);
          filter.frequency.exponentialRampToValueAtTime(baseFreq * 2.1, now + duration * 0.42);
          filter.frequency.exponentialRampToValueAtTime(baseFreq * 0.55, now + duration);

          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(0.095, now + duration * 0.32);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

          src.connect(filter);
          filter.connect(gain);
          gain.connect(out);
          src.start(now, 0, duration + 0.05);
        }

        // Tactile card landing in receiver slot (soft felt table thud + golden shimmer)
        playSlotDock(slotIdx = 0) {
          if (!this.enabled || !this.ctx) return;
          const now = this.ctx.currentTime;
          const pan = (slotIdx - 1) * 0.35;
          const out = this.createPanner(pan);

          // 1. Soft felt-table card placement thud
          const thudOsc = this.ctx.createOscillator();
          thudOsc.type = 'sine';
          thudOsc.frequency.setValueAtTime(165, now);
          thudOsc.frequency.exponentialRampToValueAtTime(58, now + 0.075);

          const thudGain = this.ctx.createGain();
          thudGain.gain.setValueAtTime(0.12, now);
          thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);

          thudOsc.connect(thudGain);
          thudGain.connect(out);
          thudOsc.start(now);
          thudOsc.stop(now + 0.09);

          // 2. Crisp paper edge settle
          this.playPaperRustle(0.55, 1.15, pan);

          // 3. Harmonic crystal chime confirming slot lock
          const notes = [528, 639, 741];
          const baseF = notes[slotIdx % 3];
          [baseF, baseF * 1.5].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.045);
            g.gain.setValueAtTime(0.0001, now + i * 0.045);
            g.gain.linearRampToValueAtTime(0.045 / (i + 1), now + i * 0.045 + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
            osc.connect(g);
            g.connect(out);
            osc.start(now + i * 0.045);
            osc.stop(now + 1.0);
          });
        }

        // Sound when user taps a Hero card to initiate its weighted 1.48s flip
        playCardFlipStart(slotIdx = 0) {
          if (!this.enabled || !this.ctx || !this.pinkNoiseBuffer) return;
          const now = this.ctx.currentTime;
          const pan = (slotIdx - 1) * 0.45;
          const out = this.createPanner(pan);

          // 1. Tactile cardstock flex / lift
          this.playCardTick(pan, 0.92);
          this.playPaperRustle(0.85, 1.05, pan);

          // 2. Rising metallic foil shimmer sweep as the card rotates toward 90 deg
          const src = this.ctx.createBufferSource();
          src.buffer = this.pinkNoiseBuffer;
          const bp = this.ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.Q.value = 4.5;
          bp.frequency.setValueAtTime(600, now + 0.08);
          bp.frequency.exponentialRampToValueAtTime(3200, now + 0.72);

          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.0001, now + 0.08);
          g.gain.linearRampToValueAtTime(0.07, now + 0.45);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

          src.connect(bp);
          bp.connect(g);
          g.connect(out);
          src.start(now + 0.08, 0, 0.85);
        }

        // Warm resonant celestial harp & singing-bowl bloom when a Hero card face opens
        playRevealResonance(cardIndex = 0) {
          if (!this.enabled || !this.ctx) return;
          const now = this.ctx.currentTime;
          const pan = (cardIndex - 1) * 0.4;
          const out = this.createPanner(pan);

          // Three celestial voicings (The Moon, The Star, The Sun)
          const chords = [
            [220.0, 329.63, 493.88, 659.25, 987.77], // A2, E4, B4, E5, B5 (Lunar mystic)
            [246.94, 369.99, 554.37, 739.99, 1108.73], // B2, F#4, C#5, F#5, C#6 (Starlight celadon)
            [293.66, 440.0, 659.25, 880.0, 1318.51]   // D3, A4, E5, A5, E6 (Solar golden)
          ];
          const freqs = chords[cardIndex % chords.length];

          freqs.forEach((f, idx) => {
            const delay = idx * 0.055; // Subtle harp arpeggio strum
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = idx === 0 ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(f, now + delay);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2400, now + delay);
            filter.frequency.exponentialRampToValueAtTime(680, now + delay + 3.4);

            const amp = (idx === 0 ? 0.055 : 0.032) / (1 + idx * 0.22);
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.linearRampToValueAtTime(amp, now + delay + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 3.3);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(out);
            osc.start(now + delay);
            osc.stop(now + delay + 3.4);
          });
        }

        playUiClick(pitch = 1.0) {
          if (!this.enabled || !this.ctx) return;
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880 * pitch, now);
          osc.frequency.exponentialRampToValueAtTime(440 * pitch, now + 0.045);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
          osc.connect(gain);
          gain.connect(this.masterGain);
          osc.start(now);
          osc.stop(now + 0.055);
        }

        playChime(freq = 587.33, volume = 0.035, duration = 1.1) {
          if (!this.enabled || !this.ctx) return;
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(volume, now + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
          osc.connect(gain);
          gain.connect(this.masterGain);
          osc.start(now);
          osc.stop(now + duration + 0.05);
        }
      }

      const sound = new TarotSoundEngine();

      /* ============================================================================
       * 3. PROCEDURAL TAROT ARTWORK & PBR TEXTURE ENGINE
       *    Generates crisp high-DPI Color, Metalness, Roughness, and Bump maps
       *    for:
       *    - Bespoke "Ta Văn Rót" Back Design
       *    - XVIII: The Moon (Ánh Trăng Huyền Ảo)
       *    - XVII: The Star (Tinh Tú Thanh Khiết)
       *    - XIX: The Sun (Mặt Trời Rạng Rỡ)
       * ============================================================================ */
      const TEX_W = 900;
      const TEX_H = 1530; // Exact 1 : 1.7 ratio

      // Shared tactile cotton paper grain & PBR map builder
      function createPaperGrainCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(w, h);
        const d = img.data;

        // Multi-scale cotton linen weave + organic rag noise
        for (let y = 0; y < h; y++) {
          const wy = Math.sin(y * 0.45) * 6;
          for (let x = 0; x < w; x++) {
            const wx = Math.cos(x * 0.45) * 6;
            const n1 = (Math.random() - 0.5) * 26;
            const n2 = Math.sin(x * 0.08 + y * 0.06) * 5;
            const v = clamp(128 + wy + wx + n1 + n2, 0, 255);
            const idx = (y * w + x) * 4;
            d[idx] = v;
            d[idx + 1] = v;
            d[idx + 2] = v;
            d[idx + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        return c;
      }

      const sharedPaperGrain = createPaperGrainCanvas(512, 512);

      // Builds a synchronized Color Canvas + Foil Mask Canvas so every gold stroke
      // automatically becomes metallic, low-roughness, and embossed in 3D!
      function createSynchronizedArtBuilder() {
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = TEX_W;
        colorCanvas.height = TEX_H;
        const cCtx = colorCanvas.getContext('2d');

        const foilCanvas = document.createElement('canvas');
        foilCanvas.width = TEX_W;
        foilCanvas.height = TEX_H;
        const fCtx = foilCanvas.getContext('2d');

        // Initialize foil mask to black (matte paper = 0 foil)
        fCtx.fillStyle = '#000000';
        fCtx.fillRect(0, 0, TEX_W, TEX_H);

        // Rich champagne gold gradient on the color canvas
        const goldGrad = cCtx.createLinearGradient(0, 0, TEX_W, TEX_H);
        goldGrad.addColorStop(0.0, '#D4B06A');
        goldGrad.addColorStop(0.28, '#F6E3B4');
        goldGrad.addColorStop(0.52, '#C9A259');
        goldGrad.addColorStop(0.76, '#F7E7BE');
        goldGrad.addColorStop(1.0, '#B89047');

        // Helper to execute drawing instructions on both Color (gold) and Foil (white)
        function drawFoil(drawCallback, foilStrength = 1.0, customColorStyle = null) {
          cCtx.save();
          fCtx.save();
          cCtx.strokeStyle = customColorStyle || goldGrad;
          cCtx.fillStyle = customColorStyle || goldGrad;
          const gVal = Math.round(clamp(foilStrength, 0, 1) * 255);
          const maskColor = `rgb(${gVal},${gVal},${gVal})`;
          fCtx.strokeStyle = maskColor;
          fCtx.fillStyle = maskColor;

          drawCallback(cCtx);
          drawCallback(fCtx);

          cCtx.restore();
          fCtx.restore();
        }

        // Subtle paper grain overlay onto color canvas so pigment feels printed on rag paper
        function applyPaperTextureOverlay(strength = 0.08) {
          cCtx.save();
          cCtx.globalAlpha = strength;
          cCtx.globalCompositeOperation = 'overlay';
          const pat = cCtx.createPattern(sharedPaperGrain, 'repeat');
          cCtx.fillStyle = pat;
          cCtx.fillRect(0, 0, TEX_W, TEX_H);
          cCtx.restore();
        }

        // Convert the color + foil mask into Three.js textures with anisotropic filtering
        function compileMaps(renderer) {
          const maxAniso = renderer ? Math.min(renderer.capabilities.getMaxAnisotropy(), 8) : 4;

          // Build Roughness, Metalness, and Bump canvases from Foil Mask + Paper Grain
          const roughCanvas = document.createElement('canvas');
          const metalCanvas = document.createElement('canvas');
          const bumpCanvas = document.createElement('canvas');
          roughCanvas.width = metalCanvas.width = bumpCanvas.width = 512;
          roughCanvas.height = metalCanvas.height = bumpCanvas.height = 870;

          const rCtx = roughCanvas.getContext('2d');
          const mCtx = metalCanvas.getContext('2d');
          const bCtx = bumpCanvas.getContext('2d');

          // Base paper roughness (~0.80 = 204), paper metalness (~0.03 = 8), paper bump
          rCtx.fillStyle = '#cfcfcf';
          rCtx.fillRect(0, 0, 512, 870);
          rCtx.globalAlpha = 0.18;
          rCtx.drawImage(sharedPaperGrain, 0, 0, 512, 870);
          rCtx.globalAlpha = 1.0;

          // Where foil is white, roughness drops to ~0.20 (shiny burnished foil)
          rCtx.globalCompositeOperation = 'difference';
          rCtx.globalAlpha = 0.72;
          rCtx.drawImage(foilCanvas, 0, 0, 512, 870);
          rCtx.globalCompositeOperation = 'source-over';
          rCtx.globalAlpha = 1.0;

          // Metalness map: foil areas are ~0.92 metallic
          mCtx.fillStyle = '#080808';
          mCtx.fillRect(0, 0, 512, 870);
          mCtx.globalAlpha = 0.92;
          mCtx.drawImage(foilCanvas, 0, 0, 512, 870);

          // Bump map: paper grain + raised foil emboss
          bCtx.drawImage(sharedPaperGrain, 0, 0, 512, 870);
          bCtx.globalCompositeOperation = 'lighten';
          bCtx.globalAlpha = 0.85;
          bCtx.drawImage(foilCanvas, 0, 0, 512, 870);

          const makeTex = (canvas, isSRGB) => {
            const tex = new THREE.CanvasTexture(canvas);
            tex.anisotropy = maxAniso;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            if (isSRGB) tex.encoding = THREE.sRGBEncoding;
            tex.needsUpdate = true;
            return tex;
          };

          return {
            map: makeTex(colorCanvas, true),
            roughnessMap: makeTex(roughCanvas, false),
            metalnessMap: makeTex(metalCanvas, false),
            bumpMap: makeTex(bumpCanvas, false)
          };
        }

        return { cCtx, fCtx, goldGrad, drawFoil, applyPaperTextureOverlay, compileMaps };
      }

      // Helper to draw a rounded rectangle path
      function roundedRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      }

      // Helper to draw an ornate 8-point celestial star
      function drawEightPointStar(ctx, cx, cy, outerR, innerR, rot = 0) {
        ctx.beginPath();
        const pts = 16;
        for (let i = 0; i < pts; i++) {
          const ang = rot + (i * TAU) / pts - Math.PI / 2;
          const r = i % 2 === 0 ? outerR : innerR;
          const x = cx + Math.cos(ang) * r;
          const y = cy + Math.sin(ang) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }

      // Helper to draw common ornate gold foil frame shared across the deck
      function drawOrnateTarotFrame(drawFoil, includeCartouche = false, numeralText = '', titleText = '') {
        const pad = 44;
        const w = TEX_W - pad * 2;
        const h = TEX_H - pad * 2;

        drawFoil((ctx) => {
          // Outer double gold foil border
          ctx.lineWidth = 6;
          roundedRectPath(ctx, pad, pad, w, h, 46);
          ctx.stroke();

          ctx.lineWidth = 2.2;
          roundedRectPath(ctx, pad + 16, pad + 16, w - 32, h - 32, 34);
          ctx.stroke();

          // Fine dotted astrolabe inner track
          ctx.save();
          ctx.setLineDash([4, 9]);
          ctx.lineWidth = 1.8;
          roundedRectPath(ctx, pad + 26, pad + 26, w - 52, h - 52, 28);
          ctx.stroke();
          ctx.restore();

          // Corner celestial quadrant ornaments
          const corners = [
            [pad + 42, pad + 42, 0],
            [TEX_W - pad - 42, pad + 42, Math.PI * 0.5],
            [TEX_W - pad - 42, TEX_H - pad - 42, Math.PI],
            [pad + 42, TEX_H - pad - 42, Math.PI * 1.5]
          ];
          corners.forEach(([cx, cy, rot]) => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rot);
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(0, 0, 26, 0, Math.PI * 0.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 0.5);
            ctx.stroke();
            drawEightPointStar(ctx, 8, 8, 9, 3.2, 0);
            ctx.fill();
            ctx.restore();
          });

          if (includeCartouche) {
            // Top numeral pill cartouche
            const topW = 156, topH = 48;
            const topX = (TEX_W - topW) * 0.5, topY = pad + 4;
            ctx.lineWidth = 2.5;
            roundedRectPath(ctx, topX, topY, topW, topH, 24);
            ctx.stroke();

            // Bottom title cartouche
            const botW = 480, botH = 82;
            const botX = (TEX_W - botW) * 0.5, botY = TEX_H - pad - botH - 12;
            ctx.lineWidth = 3.2;
            roundedRectPath(ctx, botX, botY, botW, botH, 18);
            ctx.stroke();
            ctx.lineWidth = 1.4;
            roundedRectPath(ctx, botX + 8, botY + 8, botW - 16, botH - 16, 12);
            ctx.stroke();

            // Flanking diamonds on bottom cartouche
            drawEightPointStar(ctx, botX + 34, botY + botH * 0.5, 11, 4, 0);
            ctx.fill();
            drawEightPointStar(ctx, botX + botW - 34, botY + botH * 0.5, 11, 4, 0);
            ctx.fill();
          }
        }, 1.0);

        if (includeCartouche) {
          // Fill dark backdrop inside cartouches first, then stamp foil typography
          drawFoil((ctx) => {
            ctx.font = '600 28px "Cormorant Garamond", Georgia, serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(numeralText, TEX_W * 0.5, pad + 29);

            ctx.font = '600 40px "Cormorant Garamond", Georgia, serif';
            ctx.fillText(titleText, TEX_W * 0.5, TEX_H - pad - 52);
          }, 0.95);
        }
      }

      /* ----------------------------------------------------------------------------
       * 3A. BESPOKE BACK DESIGN FOR "TA VĂN RÓT"
       *     Luxury Artisan Foil Edition: Deep Lapis-Obsidian Guilloché background,
       *     ornate Baroque-Celestial double borders, corner astrolabe quadrants,
       *     8-point sacred rose, 4 intersecting orbital ellipses with planetary nodes,
       *     waxing/waning moon phases, and a sculpted filigree Golden Crescent Moon.
       * ---------------------------------------------------------------------------- */
      function buildBackCardMaps(renderer) {
        const builder = createSynchronizedArtBuilder();
        const { cCtx, drawFoil, applyPaperTextureOverlay, compileMaps } = builder;
        const cx = TEX_W * 0.5;
        const cy = TEX_H * 0.5;

        // 1. Deep nocturnal Lapis-Indigo & Obsidian velvet paper base
        const bgGrad = cCtx.createRadialGradient(cx, cy, 24, cx, cy, TEX_H * 0.62);
        bgGrad.addColorStop(0.0, '#1B2B56');
        bgGrad.addColorStop(0.38, '#101B3B');
        bgGrad.addColorStop(0.75, '#080E22');
        bgGrad.addColorStop(1.0, '#040712');
        cCtx.fillStyle = bgGrad;
        cCtx.fillRect(0, 0, TEX_W, TEX_H);

        // Subtle engraved Guilloché sunburst & sacred concentric rings in pigment before foil
        cCtx.save();
        cCtx.translate(cx, cy);
        cCtx.strokeStyle = 'rgba(130, 168, 235, 0.055)';
        cCtx.lineWidth = 1.1;
        for (let i = 0; i < 120; i++) {
          const ang = (i * TAU) / 120;
          cCtx.beginPath();
          cCtx.moveTo(Math.cos(ang) * 70, Math.sin(ang) * 70);
          cCtx.lineTo(Math.cos(ang) * 680, Math.sin(ang) * 680);
          cCtx.stroke();
        }
        for (let r = 90; r <= 620; r += 38) {
          cCtx.beginPath();
          cCtx.arc(0, 0, r, 0, TAU);
          cCtx.stroke();
        }
        cCtx.restore();

        // Warm champagne & celadon ambient nebula glow behind the central astrolabe
        const auraGrad = cCtx.createRadialGradient(cx, cy, 12, cx, cy, 350);
        auraGrad.addColorStop(0.0, 'rgba(236, 204, 142, 0.22)');
        auraGrad.addColorStop(0.45, 'rgba(88, 196, 190, 0.10)');
        auraGrad.addColorStop(1.0, 'rgba(11, 16, 38, 0)');
        cCtx.fillStyle = auraGrad;
        cCtx.fillRect(0, 0, TEX_W, TEX_H);

        applyPaperTextureOverlay(0.085);

        // 2. Multi-Layered Champagne Gold Foil Filigree & Celestial Astrolabe
        const pad = 42;
        const w = TEX_W - pad * 2;
        const h = TEX_H - pad * 2;

        drawFoil((ctx) => {
          // Outer heavy architectural gold foil frame
          ctx.lineWidth = 6.0;
          roundedRectPath(ctx, pad, pad, w, h, 44);
          ctx.stroke();

          // Second delicate parallel border
          ctx.lineWidth = 2.2;
          roundedRectPath(ctx, pad + 15, pad + 15, w - 30, h - 30, 34);
          ctx.stroke();

          // Third beaded celestial track
          ctx.save();
          ctx.setLineDash([3, 8]);
          ctx.lineWidth = 1.8;
          roundedRectPath(ctx, pad + 25, pad + 25, w - 50, h - 50, 28);
          ctx.stroke();
          ctx.restore();

          // Inner sanctuary hairline frame
          ctx.lineWidth = 1.5;
          roundedRectPath(ctx, pad + 35, pad + 35, w - 70, h - 70, 22);
          ctx.stroke();

          // Ornate Corner Celestial Quadrants & Filigree Spandrels
          const cornerInset = pad + 35;
          const cornerSpecs = [
            [cornerInset, cornerInset, 0],
            [TEX_W - cornerInset, cornerInset, Math.PI * 0.5],
            [TEX_W - cornerInset, TEX_H - cornerInset, Math.PI],
            [cornerInset, TEX_H - cornerInset, Math.PI * 1.5]
          ];
          cornerSpecs.forEach(([qx, qy, rot]) => {
            ctx.save();
            ctx.translate(qx, qy);
            ctx.rotate(rot);
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(0, 0, 54, 0, Math.PI * 0.5);
            ctx.stroke();
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(0, 0, 38, 0, Math.PI * 0.5);
            ctx.stroke();
            // Radial corner rays
            for (let k = 1; k <= 3; k++) {
              const a = (k * Math.PI) / 8;
              ctx.beginPath();
              ctx.moveTo(Math.cos(a) * 38, Math.sin(a) * 38);
              ctx.lineTo(Math.cos(a) * 66, Math.sin(a) * 66);
              ctx.stroke();
            }
            drawEightPointStar(ctx, 22, 22, 11, 3.6, 0);
            ctx.fill();
            ctx.restore();
          });

          // Side mid-point diamond clasps
          [[pad + 25, cy], [TEX_W - pad - 25, cy], [cx, pad + 25], [cx, TEX_H - pad - 25]].forEach(([mx, my]) => {
            drawEightPointStar(ctx, mx, my, 12, 4.2, 0);
            ctx.fill();
          });

          ctx.save();
          ctx.translate(cx, cy);

          // Outer Zodiac Degree Wheel (72 ticks + double ring)
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.arc(0, 0, 248, 0, TAU);
          ctx.stroke();

          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(0, 0, 232, 0, TAU);
          ctx.stroke();

          for (let i = 0; i < 72; i++) {
            const a = (i * TAU) / 72;
            const rIn = i % 6 === 0 ? 224 : 232;
            const rOut = 248;
            ctx.lineWidth = i % 6 === 0 ? 2.2 : 1.1;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
            ctx.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
            ctx.stroke();
          }

          // 8-Fold Sacred Geometry Rose Star behind the orbital ellipses
          ctx.lineWidth = 1.4;
          for (let s = 0; s < 2; s++) {
            ctx.save();
            ctx.rotate((s * Math.PI) / 4);
            ctx.strokeRect(-142, -142, 284, 284);
            ctx.restore();
          }

          // Four Intersecting Rotated Elliptical Armillary Orbits with Planetary Nodes
          const orbitAngles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
          orbitAngles.forEach((ang, idx) => {
            ctx.save();
            ctx.rotate(ang);
            ctx.lineWidth = idx % 2 === 0 ? 2.5 : 1.75;
            ctx.beginPath();
            ctx.ellipse(0, 0, 224, 116, 0, 0, TAU);
            ctx.stroke();

            // Inner fine companion ellipse
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.ellipse(0, 0, 212, 106, 0, 0, TAU);
            ctx.stroke();

            // Planetary bead nodes at ellipse apices
            ctx.beginPath();
            ctx.arc(224, 0, 4.2, 0, TAU);
            ctx.arc(-224, 0, 4.2, 0, TAU);
            ctx.fill();
            ctx.restore();
          });

          // Inner Sanctuary Medallion Ring framing the Crescent Moon
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.arc(0, 0, 94, 0, TAU);
          ctx.stroke();

          ctx.save();
          ctx.setLineDash([4, 6]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, 82, 0, TAU);
          ctx.stroke();
          ctx.restore();

          // Iconic Sculpted Golden Crescent Moon
          ctx.beginPath();
          ctx.arc(-7, 0, 60, 0.26 * Math.PI, 1.74 * Math.PI);
          ctx.arc(19, 0, 49, 1.63 * Math.PI, 0.37 * Math.PI, true);
          ctx.closePath();
          ctx.fill();

          // Radiant 8-Pointed Star nestled in the Crescent's embrace
          drawEightPointStar(ctx, 32, 0, 17, 5.0, 0);
          ctx.fill();
          drawEightPointStar(ctx, 32, 0, 11, 3.0, Math.PI / 8);
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // Vertical Polar Axis: Waxing & Waning Moon Phases + Grand Polar Stars
          // Top & bottom waxing/waning crescents
          [-345, 345].forEach((py, pIdx) => {
            const dir = pIdx === 0 ? -1 : 1;
            // Outer polar star
            drawEightPointStar(ctx, 0, py + dir * 75, 22, 6.2, 0);
            ctx.fill();

            // Sacred lotus / chalice arch around polar axis
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.arc(0, py, 34, 0, TAU);
            ctx.stroke();

            // Mini crescent inside polar medallion
            ctx.beginPath();
            ctx.arc(-4, py, 20, 0.3 * Math.PI, 1.7 * Math.PI);
            ctx.arc(6, py, 16, 1.6 * Math.PI, 0.4 * Math.PI, true);
            ctx.closePath();
            ctx.fill();

            // Connecting astrolabe spire line
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(0, dir * 248);
            ctx.lineTo(0, py - dir * 34);
            ctx.stroke();
          });

          // Constellation diamond chain along upper & lower spandrels
          [[-165, -345], [165, -345], [-165, 345], [165, 345]].forEach(([sx, sy]) => {
            drawEightPointStar(ctx, sx, sy, 12, 3.8, 0);
            ctx.fill();
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(sx, sy, 20, 0, TAU);
            ctx.stroke();
          });

          // Subtle "TA VĂN RÓT" hallmark engraved along bottom sanctuary ribbon
          ctx.font = '600 19px "Cormorant Garamond", Georgia, serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('✦   T A   V Ă N   R Ó T   ✦', 0, 515);
          ctx.fillText('✦   A R C A N A   ✦', 0, -515);

          ctx.restore();
        }, 1.0);

        return compileMaps(renderer);
      }

      /* ----------------------------------------------------------------------------
       * 3B. HERO CARD 1: XVIII — THE MOON (Ánh Trăng Huyền Ảo)
       *     Silver moon, deep indigo-violet sky, twin mystic peaks, tranquil water
       *     reflections, luminous winding path, and lunar phases in gold foil.
       * ---------------------------------------------------------------------------- */
      function buildMoonCardMaps(renderer) {
        const builder = createSynchronizedArtBuilder();
        const { cCtx, drawFoil, applyPaperTextureOverlay, compileMaps } = builder;
        const cx = TEX_W * 0.5;

        // 1. Nocturnal Indigo-Violet Sky Gradient
        const skyGrad = cCtx.createLinearGradient(0, 60, 0, TEX_H - 60);
        skyGrad.addColorStop(0.0, '#090D24');
        skyGrad.addColorStop(0.32, '#1A1846');
        skyGrad.addColorStop(0.58, '#2B225C');
        skyGrad.addColorStop(0.75, '#131838');
        skyGrad.addColorStop(1.0, '#070A1C');
        cCtx.fillStyle = skyGrad;
        cCtx.fillRect(0, 0, TEX_W, TEX_H);

        // 2. Silver-Lavender Lunar Halo Glow in upper sky
        const moonY = 445;
        const haloGrad = cCtx.createRadialGradient(cx, moonY, 30, cx, moonY, 360);
        haloGrad.addColorStop(0.0, 'rgba(232, 238, 255, 0.52)');
        haloGrad.addColorStop(0.35, 'rgba(165, 178, 238, 0.24)');
        haloGrad.addColorStop(0.7, 'rgba(104, 88, 180, 0.10)');
        haloGrad.addColorStop(1.0, 'rgba(26, 24, 70, 0)');
        cCtx.fillStyle = haloGrad;
        cCtx.fillRect(0, 0, TEX_W, TEX_H);

        // 3. Layered Misty Mountains & Twin Citadel Silhouettes
        // Far ridge
        cCtx.fillStyle = '#1D1A44';
        cCtx.beginPath();
        cCtx.moveTo(60, 910);
        cCtx.lineTo(210, 745);
        cCtx.lineTo(360, 845);
        cCtx.lineTo(540, 845);
        cCtx.lineTo(690, 735);
        cCtx.lineTo(840, 910);
        cCtx.closePath();
        cCtx.fill();

        // Twin Mystic Obelisk Towers framing the Moon
        cCtx.fillStyle = '#0F122E';
        // Left monolith tower
        cCtx.beginPath();
        cCtx.moveTo(135, 920);
        cCtx.lineTo(155, 520);
        cCtx.lineTo(190, 475);
        cCtx.lineTo(225, 520);
        cCtx.lineTo(240, 920);
        cCtx.closePath();
        cCtx.fill();
        // Right monolith tower
        cCtx.beginPath();
        cCtx.moveTo(TEX_W - 135, 920);
        cCtx.lineTo(TEX_W - 155, 520);
        cCtx.lineTo(TEX_W - 190, 475);
        cCtx.lineTo(TEX_W - 225, 520);
        cCtx.lineTo(TEX_W - 240, 920);
        cCtx.closePath();
        cCtx.fill();

        // 4. Tranquil Nocturnal Lake (lower third)
        const lakeTop = 910;
        const lakeGrad = cCtx.createLinearGradient(0, lakeTop, 0, TEX_H - 120);
        lakeGrad.addColorStop(0.0, '#1B2452');
        lakeGrad.addColorStop(0.4, '#11173B');
        lakeGrad.addColorStop(1.0, '#070B1E');
        cCtx.fillStyle = lakeGrad;
        cCtx.fillRect(60, lakeTop, TEX_W - 120, 470);

        // Silver-violet moonlight reflection ripples on the water
        for (let i = 0; i < 22; i++) {
          const t = i / 21;
          const ry = lakeTop + 18 + t * 395;
          const rw = lerp(240, 70, Math.sin(t * Math.PI * 0.85));
          cCtx.fillStyle = i % 2 === 0 ? 'rgba(218, 228, 255, 0.34)' : 'rgba(226, 194, 133, 0.25)';
          roundedRectPath(cCtx, cx - rw * 0.5 + Math.sin(i * 1.7) * 14, ry, rw, 3.5 + t * 2.5, 2);
          cCtx.fill();
        }

        // Silver Lunar Disc before foil overlays
        const moonDiscGrad = cCtx.createRadialGradient(cx - 25, moonY - 25, 10, cx, moonY, 132);
        moonDiscGrad.addColorStop(0.0, '#FAFBFD');
        moonDiscGrad.addColorStop(0.65, '#CFD8F2');
        moonDiscGrad.addColorStop(1.0, '#8E9BC9');
        cCtx.fillStyle = moonDiscGrad;
        cCtx.beginPath();
        cCtx.arc(cx, moonY, 128, 0, TAU);
        cCtx.fill();

        applyPaperTextureOverlay(0.09);

        // 5. Gold Foil Sacred Geometry, Crescent Filigree, Water Ripples & Frame
        drawFoil((ctx) => {
          // Concentric lunar rings & 24 silver-gold rays
          ctx.save();
          ctx.translate(cx, moonY);
          for (let i = 0; i < 24; i++) {
            const ang = (i * TAU) / 24;
            const r1 = 152;
            const r2 = i % 2 === 0 ? 255 : 205;
            ctx.lineWidth = i % 2 === 0 ? 2.4 : 1.4;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
            ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
            ctx.stroke();
          }

          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.arc(0, 0, 132, 0, TAU);
          ctx.stroke();

          ctx.save();
          ctx.setLineDash([5, 8]);
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(0, 0, 152, 0, TAU);
          ctx.stroke();
          ctx.restore();

          // Ornate crescent moon in burnished gold cradling the silver orb
          ctx.beginPath();
          ctx.arc(0, 0, 130, 0.35 * Math.PI, 1.65 * Math.PI);
          ctx.arc(42, 0, 114, 1.58 * Math.PI, 0.42 * Math.PI, true);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Gold foil outlines and windows on the twin monolith towers
          [[190, 475], [TEX_W - 190, 475]].forEach(([tx, ty]) => {
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx - 35, ty + 45);
            ctx.lineTo(tx - 52, 910);
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + 35, ty + 45);
            ctx.lineTo(tx + 52, 910);
            ctx.stroke();
            // Tall arched sanctuary window
            ctx.beginPath();
            ctx.arc(tx, ty + 115, 14, Math.PI, 0);
            ctx.lineTo(tx + 14, ty + 210);
            ctx.lineTo(tx - 14, ty + 210);
            ctx.closePath();
            ctx.stroke();
          });

          // Horizon shoreline & sacred lotus floating on the water
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(70, lakeTop);
          ctx.lineTo(TEX_W - 70, lakeTop);
          ctx.stroke();

          // Dewdrops of light descending from the moon toward the water
          const drops = [
            [cx, 640, 12], [cx - 48, 690, 9], [cx + 48, 690, 9],
            [cx, 755, 14], [cx - 72, 815, 8], [cx + 72, 815, 8], [cx, 845, 11]
          ];
          drops.forEach(([dx, dy, sz]) => {
            ctx.beginPath();
            ctx.moveTo(dx, dy - sz);
            ctx.quadraticCurveTo(dx + sz * 0.7, dy + sz * 0.3, dx, dy + sz);
            ctx.quadraticCurveTo(dx - sz * 0.7, dy + sz * 0.3, dx, dy - sz);
            ctx.fill();
          });

          // Sacred Lotus blooming at lower center of lake
          ctx.save();
          ctx.translate(cx, 1165);
          ctx.lineWidth = 2.4;
          for (let p = -3; p <= 3; p++) {
            ctx.save();
            ctx.rotate(p * 0.26);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(22, -32, 18, -74, 0, -96);
            ctx.bezierCurveTo(-18, -74, -22, -32, 0, 0);
            ctx.stroke();
            ctx.restore();
          }
          ctx.restore();
        }, 1.0);

        // Cartouche backdrops so numeral & title are ultra legible
        cCtx.fillStyle = '#080C21';
        roundedRectPath(cCtx, (TEX_W - 156) * 0.5, 48, 156, 48, 24);
        cCtx.fill();
        roundedRectPath(cCtx, (TEX_W - 480) * 0.5, TEX_H - 44 - 82 - 12, 480, 82, 18);
        cCtx.fill();

        drawOrnateTarotFrame(drawFoil, true, 'XVIII', 'THE MOON');
        return compileMaps(renderer);
      }

      /* ----------------------------------------------------------------------------
       * 3C. HERO CARD 2: XVII — THE STAR (Tinh Tú Thanh Khiết)
       *     Soft celadon-teal & midnight jade, grand 8-pointed Polaris star with
       *     7 satellite stars, celestial constellations, and flowing streams of light.
       * ---------------------------------------------------------------------------- */
      function buildStarCardMaps(renderer) {
        const builder = createSynchronizedArtBuilder();
        const { cCtx, drawFoil, applyPaperTextureOverlay, compileMaps } = builder;
        const cx = TEX_W * 0.5;

        // 1. Airy Celadon-Teal to Deep Midnight Emerald Sky
        const skyGrad = cCtx.createLinearGradient(0, 60, 0, TEX_H - 60);
        skyGrad.addColorStop(0.0, '#071726');
        skyGrad.addColorStop(0.28, '#103444');
        skyGrad.addColorStop(0.55, '#1F6268');
        skyGrad.addColorStop(0.78, '#0E2C3A');
        skyGrad.addColorStop(1.0, '#06101B');
        cCtx.fillStyle = skyGrad;
        cCtx.fillRect(0, 0, TEX_W, TEX_H);

        // 2. Soft Turquoise & Champagne Starlight Bloom
        const starY = 470;
        const glowGrad = cCtx.createRadialGradient(cx, starY, 15, cx, starY, 390);
        glowGrad.addColorStop(0.0, 'rgba(214, 255, 246, 0.55)');
        glowGrad.addColorStop(0.32, 'rgba(72, 178, 173, 0.32)');
        glowGrad.addColorStop(0.7, 'rgba(28, 96, 108, 0.12)');
        glowGrad.addColorStop(1.0, 'rgba(7, 23, 38, 0)');
        cCtx.fillStyle = glowGrad;
        cCtx.fillRect(0, 0, TEX_W, TEX_H);

        // 3. Serene Rolling Emerald Hills & Mirror Sanctuary Pool
        cCtx.fillStyle = '#0C2633';
        cCtx.beginPath();
        cCtx.moveTo(60, 1020);
        cCtx.quadraticCurveTo(250, 915, 450, 985);
        cCtx.quadraticCurveTo(660, 910, 840, 1010);
        cCtx.lineTo(840, 1380);
        cCtx.lineTo(60, 1380);
        cCtx.closePath();
        cCtx.fill();

        // Luminous celadon waterfall / stardust stream pouring from the grand star into the pool
        const streamGrad = cCtx.createLinearGradient(cx, starY + 90, cx, 1280);
        streamGrad.addColorStop(0.0, 'rgba(248, 229, 184, 0.42)');
        streamGrad.addColorStop(0.5, 'rgba(98, 218, 208, 0.35)');
        streamGrad.addColorStop(1.0, 'rgba(72, 178, 173, 0.05)');
        cCtx.fillStyle = streamGrad;
        cCtx.beginPath();
        cCtx.moveTo(cx - 12, starY + 95);
        cCtx.bezierCurveTo(cx - 65, 820, cx + 65, 960, cx - 110, 1250);
        cCtx.lineTo(cx + 110, 1250);
        cCtx.bezierCurveTo(cx - 45, 960, cx + 65, 820, cx + 12, starY + 95);
        cCtx.closePath();
        cCtx.fill();

        applyPaperTextureOverlay(0.09);

        // 4. Gold Foil Grand Polaris Star, 7 Minor Stars, Astrolabe Arch & Flowing Lines
        drawFoil((ctx) => {
          // Slender Gothic-Celestial Botanical Arch framing the sky
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(115, 1260);
          ctx.lineTo(115, 490);
          ctx.arc(cx, 490, cx - 115, Math.PI, 0);
          ctx.lineTo(TEX_W - 115, 1260);
          ctx.stroke();

          // Grand 8-Pointed Central Star (Polaris)
          drawEightPointStar(ctx, cx, starY, 155, 38, 0);
          ctx.fill();
          drawEightPointStar(ctx, cx, starY, 105, 24, Math.PI / 8);
          ctx.lineWidth = 2.2;
          ctx.stroke();

          // Concentric astrolabe halo around the grand star
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.arc(cx, starY, 178, 0, TAU);
          ctx.stroke();

          ctx.save();
          ctx.setLineDash([4, 9]);
          ctx.beginPath();
          ctx.arc(cx, starY, 206, 0, TAU);
          ctx.stroke();
          ctx.restore();

          // Seven Satellite Stars arranged in a sacred crown arc
          const sevenStars = [
            [cx, 210, 36],
            [cx - 165, 265, 28],
            [cx + 165, 265, 28],
            [cx - 245, 425, 30],
            [cx + 245, 425, 30],
            [cx - 195, 635, 26],
            [cx + 195, 635, 26]
          ];

          // Constellation lines linking the seven stars
          ctx.save();
          ctx.lineWidth = 1.4;
          ctx.setLineDash([3, 6]);
          ctx.beginPath();
          ctx.moveTo(sevenStars[5][0], sevenStars[5][1]);
          ctx.lineTo(sevenStars[3][0], sevenStars[3][1]);
          ctx.lineTo(sevenStars[1][0], sevenStars[1][1]);
          ctx.lineTo(sevenStars[0][0], sevenStars[0][1]);
          ctx.lineTo(sevenStars[2][0], sevenStars[2][1]);
          ctx.lineTo(sevenStars[4][0], sevenStars[4][1]);
          ctx.lineTo(sevenStars[6][0], sevenStars[6][1]);
          ctx.stroke();
          ctx.restore();

          sevenStars.forEach(([sx, sy, sr]) => {
            drawEightPointStar(ctx, sx, sy, sr, sr * 0.28, 0);
            ctx.fill();
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(sx, sy, sr * 1.18, 0, TAU);
            ctx.stroke();
          });

          // Graceful flowing streams of golden stardust & water ripples below
          for (let s = -2; s <= 2; s++) {
            ctx.lineWidth = s === 0 ? 2.6 : 1.6;
            ctx.beginPath();
            ctx.moveTo(cx + s * 8, starY + 185);
            ctx.bezierCurveTo(
              cx + s * 45 - 35, 810,
              cx - s * 40 + 35, 980,
              cx + s * 58, 1185
            );
            ctx.stroke();
          }

          // Concentric pool ripples at the base of the stream
          [85, 145, 215, 285].forEach((rw, idx) => {
            ctx.lineWidth = 2.0 - idx * 0.25;
            ctx.beginPath();
            ctx.ellipse(cx, 1205 + idx * 14, rw, rw * 0.22, 0, 0, TAU);
            ctx.stroke();
          });
        }, 1.0);

        // Cartouche dark backdrops
        cCtx.fillStyle = '#071724';
        roundedRectPath(cCtx, (TEX_W - 156) * 0.5, 48, 156, 48, 24);
        cCtx.fill();
        roundedRectPath(cCtx, (TEX_W - 480) * 0.5, TEX_H - 44 - 82 - 12, 480, 82, 18);
        cCtx.fill();

        drawOrnateTarotFrame(drawFoil, true, 'XVII', 'THE STAR');
        return compileMaps(renderer);
      }

      /* ----------------------------------------------------------------------------
       * 3D. HERO CARD 3: XIX — THE SUN (Mặt Trời Rạng Rỡ)
       *     Warm amber gold, burnt terracotta sienna, sculptural multi-layered sun
       *     with alternating straight & undulating rays, and blooming sun-temple geometry.
       * ---------------------------------------------------------------------------- */
      function buildSunCardMaps(renderer) {
        const builder = createSynchronizedArtBuilder();
        const { cCtx, drawFoil, applyPaperTextureOverlay, compileMaps } = builder;
        const cx = TEX_W * 0.5;

        // 1. Warm Terracotta, Amber-Gold & Nocturnal Bronze Gradient
        const skyGrad = cCtx.createLinearGradient(0, 60, 0, TEX_H - 60);
        skyGrad.addColorStop(0.0, '#1D1018');
        skyGrad.addColorStop(0.24, '#4A211B');
        skyGrad.addColorStop(0.48, '#8E4324');
        skyGrad.addColorStop(0.72, '#58251C');
        skyGrad.addColorStop(1.0, '#1A0D12');
        cCtx.fillStyle = skyGrad;
        cCtx.fillRect(0, 0, TEX_W, TEX_H);

        // 2. Radiant Golden-Amber Solar Corona
        const sunY = 540;
        const coronaGrad = cCtx.createRadialGradient(cx, sunY, 20, cx, sunY, 420);
        coronaGrad.addColorStop(0.0, 'rgba(255, 244, 198, 0.72)');
        coronaGrad.addColorStop(0.35, 'rgba(242, 182, 82, 0.42)');
        coronaGrad.addColorStop(0.7, 'rgba(186, 82, 36, 0.18)');
        coronaGrad.addColorStop(1.0, 'rgba(29, 16, 24, 0)');
        cCtx.fillStyle = coronaGrad;
        cCtx.fillRect(0, 0, TEX_W, TEX_H);

        // 3. Sculptural Terracotta Sun-Temple Arches & Warm Dunes at Base
        cCtx.fillStyle = '#2B1314';
        cCtx.beginPath();
        cCtx.moveTo(60, 1080);
        cCtx.quadraticCurveTo(270, 960, cx, 1040);
        cCtx.quadraticCurveTo(630, 960, 840, 1080);
        cCtx.lineTo(840, 1380);
        cCtx.lineTo(60, 1380);
        cCtx.closePath();
        cCtx.fill();

        applyPaperTextureOverlay(0.09);

        // 4. Multi-Layered Solar Rays, Planetary Orbits & Botanical Sunbursts in Gold Foil
        drawFoil((ctx) => {
          ctx.save();
          ctx.translate(cx, sunY);

          // 16 Alternating Straight Spears & Undulating Flame Rays
          const numRays = 16;
          for (let i = 0; i < numRays; i++) {
            ctx.save();
            ctx.rotate((i * TAU) / numRays);
            if (i % 2 === 0) {
              // Straight geometric solar spear ray
              ctx.beginPath();
              ctx.moveTo(-18, -135);
              ctx.lineTo(0, -310);
              ctx.lineTo(18, -135);
              ctx.closePath();
              ctx.fill();
            } else {
              // Undulating serpentine flame ray
              ctx.lineWidth = 5.5;
              ctx.beginPath();
              ctx.moveTo(0, -138);
              ctx.bezierCurveTo(28, -180, -28, -230, 0, -285);
              ctx.stroke();
            }
            ctx.restore();
          }

          // Outer planetary orbit rings around the Sun
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(0, 0, 326, 0, TAU);
          ctx.stroke();

          ctx.save();
          ctx.setLineDash([6, 10]);
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(0, 0, 245, 0, TAU);
          ctx.stroke();
          ctx.restore();

          // Central Embossed Solar Disc
          ctx.beginPath();
          ctx.arc(0, 0, 134, 0, TAU);
          ctx.fill();
          ctx.restore();
        }, 1.0);

        // Inner warm terracotta engraving on the golden solar disc
        cCtx.save();
        cCtx.strokeStyle = '#3B1814';
        cCtx.lineWidth = 3.2;
        cCtx.beginPath();
        cCtx.arc(cx, sunY, 114, 0, TAU);
        cCtx.stroke();
        drawEightPointStar(cCtx, cx, sunY, 92, 34, 0);
        cCtx.stroke();
        cCtx.beginPath();
        cCtx.arc(cx, sunY, 24, 0, TAU);
        cCtx.fillStyle = '#3B1814';
        cCtx.fill();
        cCtx.restore();

        // Lower Sun-Temple Colonnade & Blooming Golden Sunflowers
        drawFoil((ctx) => {
          // Central solar obelisk / sundial pillar rising from lower sanctuary
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(cx - 42, 1320);
          ctx.lineTo(cx - 18, 960);
          ctx.lineTo(cx + 18, 960);
          ctx.lineTo(cx + 42, 1320);
          ctx.stroke();

          // Three sacred sunflowers / rosettes along the lower garden arch
          const blooms = [
            [cx - 210, 1135, 58],
            [cx, 1110, 74],
            [cx + 210, 1135, 58]
          ];
          blooms.forEach(([bx, by, br]) => {
            ctx.save();
            ctx.translate(bx, by);
            for (let p = 0; p < 12; p++) {
              ctx.save();
              ctx.rotate((p * TAU) / 12);
              ctx.lineWidth = 2.0;
              ctx.beginPath();
              ctx.moveTo(0, -br * 0.35);
              ctx.quadraticCurveTo(br * 0.24, -br * 0.75, 0, -br);
              ctx.quadraticCurveTo(-br * 0.24, -br * 0.75, 0, -br * 0.35);
              ctx.stroke();
              ctx.restore();
            }
            ctx.beginPath();
            ctx.arc(0, 0, br * 0.32, 0, TAU);
            ctx.fill();
            ctx.restore();
          });
        }, 1.0);

        // Cartouche dark backdrops
        cCtx.fillStyle = '#1E0E12';
        roundedRectPath(cCtx, (TEX_W - 156) * 0.5, 48, 156, 48, 24);
        cCtx.fill();
        roundedRectPath(cCtx, (TEX_W - 480) * 0.5, TEX_H - 44 - 82 - 12, 480, 82, 18);
        cCtx.fill();

        drawOrnateTarotFrame(drawFoil, true, 'XIX', 'THE SUN');
        return compileMaps(renderer);
      }

      /* ============================================================================
       * 4. 3D BEVELED CARD GEOMETRY & CUSTOM FOIL GLINT SHADER MATERIALS
       *    - Ratio 1 : 1.7 (Width 1.50, Height 2.55)
       *    - Rounded corners & smooth 4-segment beveled edge so light glides along the rim
       *    - Single manifold mesh split cleanly into 3 material groups:
       *      [0: Front Face, 1: Back Face, 2: Champagne Gold Beveled Rim]
       *      -> Zero coplanar z-fighting!
       * ============================================================================ */
      const CARD_W = 1.50;
      const CARD_H = 2.55;
      const CARD_RADIUS = 0.105;
      const CARD_DEPTH = 0.015;
      const CARD_BEVEL = 0.0065;

      function createBeveledCardGeometry() {
        const w = CARD_W - CARD_BEVEL * 2;
        const h = CARD_H - CARD_BEVEL * 2;
        const r = CARD_RADIUS;
        const hw = w * 0.5;
        const hh = h * 0.5;

        const shape = new THREE.Shape();
        shape.moveTo(-hw + r, -hh);
        shape.lineTo(hw - r, -hh);
        shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
        shape.lineTo(hw, hh - r);
        shape.quadraticCurveTo(hw, hh, hw - r, hh);
        shape.lineTo(-hw + r, hh);
        shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
        shape.lineTo(-hw, -hh + r);
        shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

        const extrudeSettings = {
          steps: 1,
          depth: CARD_DEPTH,
          bevelEnabled: true,
          bevelThickness: CARD_BEVEL,
          bevelSize: CARD_BEVEL,
          bevelOffset: 0,
          bevelSegments: 4,
          curveSegments: 16
        };

        let geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Center geometry around (0, 0, 0)
        geom.center();
        if (geom.index) {
          geom = geom.toNonIndexed();
        }
        geom.computeVertexNormals();

        const posAttr = geom.attributes.position;
        const normAttr = geom.attributes.normal;
        const uvAttr = geom.attributes.uv;
        const vertexCount = posAttr.count;
        const triCount = vertexCount / 3;

        // Re-order triangles into 3 clean groups:
        // Group 0: Front face (normal.z > 0.92)
        // Group 1: Back face (normal.z < -0.92)
        // Group 2: Beveled edges & sides (all remaining triangles)
        const frontTris = [];
        const backTris = [];
        const sideTris = [];

        for (let t = 0; t < triCount; t++) {
          const i0 = t * 3;
          const nz = (normAttr.getZ(i0) + normAttr.getZ(i0 + 1) + normAttr.getZ(i0 + 2)) / 3;
          if (nz > 0.92) {
            frontTris.push(t);
          } else if (nz < -0.92) {
            backTris.push(t);
          } else {
            sideTris.push(t);
          }
        }

        const orderedTris = [...frontTris, ...backTris, ...sideTris];
        const newPos = new Float32Array(vertexCount * 3);
        const newNorm = new Float32Array(vertexCount * 3);
        const newUv = new Float32Array(vertexCount * 2);

        const invW = 1 / CARD_W;
        const invH = 1 / CARD_H;

        for (let newT = 0; newT < triCount; newT++) {
          const oldT = orderedTris[newT];
          const isFront = newT < frontTris.length;
          const isBack = !isFront && newT < (frontTris.length + backTris.length);

          for (let v = 0; v < 3; v++) {
            const oldIdx = oldT * 3 + v;
            const newIdx = newT * 3 + v;

            const px = posAttr.getX(oldIdx);
            const py = posAttr.getY(oldIdx);
            const pz = posAttr.getZ(oldIdx);

            newPos[newIdx * 3] = px;
            newPos[newIdx * 3 + 1] = py;
            newPos[newIdx * 3 + 2] = pz;

            newNorm[newIdx * 3] = normAttr.getX(oldIdx);
            newNorm[newIdx * 3 + 1] = normAttr.getY(oldIdx);
            newNorm[newIdx * 3 + 2] = normAttr.getZ(oldIdx);

            if (isFront) {
              newUv[newIdx * 2] = clamp((px + CARD_W * 0.5) * invW, 0, 1);
              newUv[newIdx * 2 + 1] = clamp((py + CARD_H * 0.5) * invH, 0, 1);
            } else if (isBack) {
              // Flip X on back cap so when card is rotated 180° around Y, back design is un-mirrored
              newUv[newIdx * 2] = clamp(1.0 - (px + CARD_W * 0.5) * invW, 0, 1);
              newUv[newIdx * 2 + 1] = clamp((py + CARD_H * 0.5) * invH, 0, 1);
            } else {
              newUv[newIdx * 2] = uvAttr.getX(oldIdx);
              newUv[newIdx * 2 + 1] = uvAttr.getY(oldIdx);
            }
          }
        }

        const finalGeom = new THREE.BufferGeometry();
        finalGeom.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
        finalGeom.setAttribute('normal', new THREE.BufferAttribute(newNorm, 3));
        finalGeom.setAttribute('uv', new THREE.BufferAttribute(newUv, 2));

        finalGeom.clearGroups();
        finalGeom.addGroup(0, frontTris.length * 3, 0);
        finalGeom.addGroup(frontTris.length * 3, backTris.length * 3, 1);
        finalGeom.addGroup((frontTris.length + backTris.length) * 3, sideTris.length * 3, 2);

        return finalGeom;
      }

      // Inject a directional champagne foil light-sweep & subtle rim sheen into card materials
      function createFoilEnhancedMaterial(maps, isEdge = false, sharedUniforms = null) {
        const uniforms = sharedUniforms || {
          uGlintPhase: { value: -1.5 },
          uRimGlow: { value: 0.0 },
          uRimColor: { value: new THREE.Color(0xF6DEAA) }
        };

        const matConfig = isEdge
          ? {
              color: new THREE.Color(0xDFBD7C),
              metalness: 0.88,
              roughness: 0.24
            }
          : {
              color: new THREE.Color(0xffffff),
              map: maps.map,
              roughnessMap: maps.roughnessMap,
              metalnessMap: maps.metalnessMap,
              bumpMap: maps.bumpMap,
              bumpScale: 0.0046,
              metalness: 1.0,
              roughness: 1.0
            };

        const mat = new THREE.MeshStandardMaterial(matConfig);
        mat.userData.extraUniforms = uniforms;

        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uGlintPhase = uniforms.uGlintPhase;
          shader.uniforms.uRimGlow = uniforms.uRimGlow;
          shader.uniforms.uRimColor = uniforms.uRimColor;

          shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
             varying vec3 vLocalPos;
             #ifdef TAROT_INSTANCING
             attribute vec2 instanceFoil;
             varying vec2 vCardFoil;
             #endif`
          );
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             vLocalPos = position;
             #ifdef TAROT_INSTANCING
             vCardFoil = instanceFoil;
             #endif`
          );

          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
             uniform float uGlintPhase;
             uniform float uRimGlow;
             uniform vec3 uRimColor;
             varying vec3 vLocalPos;
             #ifdef TAROT_INSTANCING
             varying vec2 vCardFoil;
             #endif`
          );

          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
             // Dual-band anisotropic champagne foil light-sweep across embossed gold & beveled rim
             float cardGlint = uGlintPhase;
             float cardRim = uRimGlow;
             #ifdef TAROT_INSTANCING
             cardGlint = vCardFoil.x;
             cardRim = vCardFoil.y;
             #endif
             float diagCoord = (vLocalPos.x * 0.55 + vLocalPos.y * 0.38);
             float streakPrimary = smoothstep(0.42, 0.0, abs(diagCoord - cardGlint));
             float streakSecondary = smoothstep(0.18, 0.0, abs(diagCoord - cardGlint + 0.22)) * 0.55;
             float streak = streakPrimary + streakSecondary;
             float foilMask = metalnessFactor;
             vec3 glintContribution = vec3(1.0, 0.93, 0.74) * streak * (0.015 + foilMask * 1.05);

             // Soft Fresnel rim highlight when hovered or flipped
             vec3 viewDir = normalize(vViewPosition);
             float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.3);
             vec3 rimContribution = uRimColor * (fresnel * cardRim * 0.88 + cardRim * foilMask * 0.28);

             gl_FragColor.rgb += glintContribution + rimContribution;
             #include <dithering_fragment>
            `
          );
        };

        return mat;
      }

      /* ============================================================================
       * 5. SCENE, LIGHTING, CAMERA & PROCEDURAL NOCTURNAL ENVIRONMENT
       * ============================================================================ */
      const container = document.getElementById('stage-container');
      let isMobile = window.innerWidth < 768;

      // Dynamic responsive layout metrics updated on resize so mobile portrait never clips cards
      const layoutMetrics = {
        isMobile: window.innerWidth < 768,
        isPortrait: window.innerWidth < window.innerHeight,
        aspect: window.innerWidth / Math.max(1, window.innerHeight),
        introCamZ: 8.6,
        introSpreadX: 1.92,
        shuffleCamZ: 9.35,
        shuffleScaleX: 1.0,
        shuffleScaleY: 1.0,
        fanCamZ: 8.6,
        fanSpacingX: 1.78,
        fanBaseScale: 0.98,
        revealCamZ: 7.15,
        revealInspectCamZ: 4.85,
        revealHeroXs: [-2.22, 0.0, 2.22],
        revealHeroY: 0.22,
        revealHeroScale: 1.04
      };

      function computeResponsiveMetrics() {
        const w = window.innerWidth;
        const h = Math.max(1, window.innerHeight);
        const aspect = w / h;
        isMobile = w < 768;
        layoutMetrics.isMobile = isMobile;
        layoutMetrics.isPortrait = aspect < 0.95;
        layoutMetrics.aspect = aspect;

        if (aspect < 0.65) {
          // Narrow Mobile Portrait (e.g., iPhone / Android portrait 360x780, 390x844)
          const narrowFactor = clamp(0.56 / aspect, 0.95, 1.35);
          layoutMetrics.introCamZ = 10.6 * narrowFactor;
          layoutMetrics.introSpreadX = 1.25;
          layoutMetrics.shuffleCamZ = 11.4 * narrowFactor;
          layoutMetrics.shuffleScaleX = 0.62;
          layoutMetrics.shuffleScaleY = 1.08;
          layoutMetrics.fanCamZ = 9.8 * narrowFactor;
          layoutMetrics.fanSpacingX = 1.16;
          layoutMetrics.fanBaseScale = 0.92;
          layoutMetrics.revealCamZ = 10.2 * narrowFactor;
          layoutMetrics.revealInspectCamZ = 6.2 * narrowFactor;
          layoutMetrics.revealHeroXs = [-1.26, 0.0, 1.26];
          layoutMetrics.revealHeroY = 0.16;
          layoutMetrics.revealHeroScale = 0.74;
        } else if (aspect < 1.0) {
          // Tablet Portrait / Wide Phone Portrait
          layoutMetrics.introCamZ = 9.6;
          layoutMetrics.introSpreadX = 1.52;
          layoutMetrics.shuffleCamZ = 10.4;
          layoutMetrics.shuffleScaleX = 0.78;
          layoutMetrics.shuffleScaleY = 1.02;
          layoutMetrics.fanCamZ = 9.1;
          layoutMetrics.fanSpacingX = 1.38;
          layoutMetrics.fanBaseScale = 0.95;
          layoutMetrics.revealCamZ = 8.8;
          layoutMetrics.revealInspectCamZ = 5.4;
          layoutMetrics.revealHeroXs = [-1.58, 0.0, 1.58];
          layoutMetrics.revealHeroY = 0.18;
          layoutMetrics.revealHeroScale = 0.86;
        } else {
          // Desktop & Landscape Tablet
          layoutMetrics.introCamZ = 8.6;
          layoutMetrics.introSpreadX = 1.92;
          layoutMetrics.shuffleCamZ = 9.35;
          layoutMetrics.shuffleScaleX = 1.0;
          layoutMetrics.shuffleScaleY = 1.0;
          layoutMetrics.fanCamZ = 8.6;
          layoutMetrics.fanSpacingX = 1.78;
          layoutMetrics.fanBaseScale = 0.98;
          layoutMetrics.revealCamZ = 7.15;
          layoutMetrics.revealInspectCamZ = 4.65;
          layoutMetrics.revealHeroXs = [-2.22, 0.0, 2.22];
          layoutMetrics.revealHeroY = 0.22;
          layoutMetrics.revealHeroScale = 1.04;
        }
      }
      computeResponsiveMetrics();
      function qualityRatio() {
        return Math.max(1, Math.min(Math.max(window.devicePixelRatio || 1, 1.5), isMobile ? 1.8 : 2,
          Math.sqrt(4500000 / (innerWidth * innerHeight))));
      }

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false
      });
      renderer.setPixelRatio(qualityRatio());
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050711);

      const camera = new THREE.PerspectiveCamera(
        38,
        window.innerWidth / window.innerHeight,
        0.1,
        120
      );
      camera.position.set(0, 0.15, 9.2);

      // Balanced 3-Point + Grazing Specular Lighting Rig
      const ambientLight = new THREE.HemisphereLight(0x283566, 0x090814, 0.85);
      scene.add(ambientLight);

      // Warm Champagne Key Light
      const keyLight = new THREE.DirectionalLight(0xFFF0D2, 2.15);
      keyLight.position.set(4.2, 5.5, 6.8);
      scene.add(keyLight);

      // Soft Celadon-Teal Fill Light from left
      const fillLight = new THREE.DirectionalLight(0x52B8B2, 0.95);
      fillLight.position.set(-5.5, -2.0, 4.5);
      scene.add(fillLight);

      // Deep Violet / Gold Rim Light from behind to catch beveled edges
      const rimLight = new THREE.PointLight(0xF6D898, 2.2, 22);
      rimLight.position.set(0, 3.2, -3.5);
      scene.add(rimLight);

      // Moving Glint Point Light that sweeps across cards during flips and mouse tilts
      const glintLight = new THREE.PointLight(0xFFE7B8, 1.65, 16);
      glintLight.position.set(1.5, 1.2, 4.5);
      scene.add(glintLight);

      /* ----------------------------------------------------------------------------
       * 5A. LAYERED NOCTURNAL BACKGROUND (Strictly behind all card orbits z <= -10)
       * ---------------------------------------------------------------------------- */
      const bgGroup = new THREE.Group();
      scene.add(bgGroup);

      // 1. Procedural Nebula, Sacred Astrolabe Halo & Aurora Backdrop Shader Plane (z = -28)
      const nebulaUniforms = {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
      };

      const nebulaMat = new THREE.ShaderMaterial({
        uniforms: nebulaUniforms,
        depthWrite: false,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec2 uResolution;
          varying vec2 vUv;

          float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          float fbm(vec2 p) {
            float v = 0.0;
            float amp = 0.5;
            mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
            for (int i = 0; i < 5; i++) {
              v += amp * noise(p);
              p = rot * p * 2.03 + vec2(0.15, -0.11);
              amp *= 0.5;
            }
            return v;
          }

          void main() {
            vec2 uv = vUv - 0.5;
            float aspect = uResolution.x / max(1.0, uResolution.y);
            vec2 metricUv = vec2(uv.x * aspect, uv.y);
            float dist = length(metricUv * vec2(0.85, 1.0));

            // Multi-layered cosmic domain warping
            vec2 q = uv * 2.8 + vec2(uTime * 0.011, -uTime * 0.007);
            float n1 = fbm(q);
            vec2 r = vec2(fbm(q + vec2(1.7, 9.2) + 0.015 * uTime), fbm(q + vec2(8.3, 2.8) - 0.012 * uTime));
            float n2 = fbm(q + r * 1.65);

            // Nocturnal Sanctuary Palette
            vec3 abyss      = vec3(0.014, 0.020, 0.056);
            vec3 midnight   = vec3(0.048, 0.072, 0.185);
            vec3 amethyst   = vec3(0.210, 0.095, 0.345);
            vec3 celadon    = vec3(0.110, 0.440, 0.455);
            vec3 champagne  = vec3(0.480, 0.375, 0.215);

            vec3 col = mix(abyss, midnight, smoothstep(1.15, 0.0, dist));
            col = mix(col, amethyst, smoothstep(0.22, 0.82, n2) * 0.68);

            // Upper-right amethyst & celadon nebula bloom (matching reference ambiance)
            float upperBloom = exp(-length(metricUv - vec2(0.18, 0.16)) * 2.2) * (0.6 + 0.4 * n1);
            col += mix(amethyst, celadon, n1) * upperBloom * 0.42;

            // Flowing dual aurora curtains
            float wave1 = sin(uv.x * 4.8 + n2 * 2.8 + uTime * 0.15) * 0.12;
            float aurora1 = smoothstep(0.24, 0.0, abs(uv.y - 0.11 - wave1));
            col += mix(amethyst, celadon, n2) * aurora1 * 0.32;

            // Golden stardust filament veins inside nebula
            float filament = smoothstep(0.48, 0.52, n2) * smoothstep(0.58, 0.52, n2);
            col += champagne * filament * 0.45 * exp(-dist * 1.4);

            // Warm central sanctuary halo behind cards
            float centerWarmth = exp(-dist * dist * 3.2) * (0.6 + 0.4 * n2);
            col += champagne * centerWarmth * 0.24;

            // Soft vignette at outer edges
            col *= smoothstep(1.65, 0.38, dist);

            // Anti-banding subpixel dither
            float dither = (hash(vUv * 1024.0 + fract(uTime)) - 0.5) / 255.0;
            col += dither;

            gl_FragColor = vec4(col, 1.0);
          }
        `
      });

      const nebulaPlane = new THREE.Mesh(new THREE.PlaneGeometry(110, 68), nebulaMat);
      nebulaPlane.position.set(0, 0, -28);
      bgGroup.add(nebulaPlane);

      // 2. Flowing Silk Aurora Ribbon Mesh (z = -18)
      const auroraRibbonGeom = new THREE.PlaneGeometry(46, 9.0, 64, 16);
      const auroraRibbonMat = new THREE.ShaderMaterial({
        uniforms: { uTime: nebulaUniforms.uTime },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            p.y += sin(p.x * 0.22 + uTime * 0.35) * 0.75 + cos(p.x * 0.45 - uTime * 0.22) * 0.35;
            p.z += cos(p.x * 0.18 + uTime * 0.28) * 1.2;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            float vFade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
            float hFade = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
            float curtain = 0.55 + 0.45 * sin(vUv.x * 28.0 + uTime * 0.5);
            vec3 teal = vec3(0.24, 0.68, 0.66);
            vec3 violet = vec3(0.42, 0.22, 0.68);
            vec3 col = mix(violet, teal, 0.5 + 0.5 * sin(vUv.x * 6.28 + uTime * 0.2));
            gl_FragColor = vec4(col, vFade * hFade * curtain * 0.15);
          }
        `
      });
      const auroraMesh = new THREE.Mesh(auroraRibbonGeom, auroraRibbonMat);
      auroraMesh.position.set(0, 2.2, -18);
      bgGroup.add(auroraMesh);

      // 3. Sanctuary Perspective Astrolabe Floor Plane (Matches lower concentric rings in reference)
      const sanctuaryFloorMat = new THREE.ShaderMaterial({
        uniforms: { uTime: nebulaUniforms.uTime },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv - 0.5;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            float r = length(vUv) * 2.0;
            float a = atan(vUv.y, vUv.x);

            // Concentric astrolabe floor rings
            float ring1 = smoothstep(0.008, 0.0, abs(r - 0.28));
            float ring2 = smoothstep(0.006, 0.0, abs(r - 0.46));
            float ring3 = smoothstep(0.007, 0.0, abs(r - 0.64));
            float ring4 = smoothstep(0.005, 0.0, abs(r - 0.82));

            // Fine degree ticks on ring2 & ring3
            float ticks = smoothstep(0.6, 0.95, sin(a * 36.0 + uTime * 0.15)) * smoothstep(0.035, 0.0, abs(r - 0.55));
            // 12 zodiac radial spokes
            float spokes = smoothstep(0.996, 1.0, cos(a * 12.0 - uTime * 0.04)) * smoothstep(0.28, 0.32, r) * smoothstep(0.85, 0.6, r);

            float pattern = (ring1 + ring2 * 0.85 + ring3 + ring4 * 0.7 + ticks * 0.35 + spokes * 0.45);
            float radialFade = smoothstep(1.0, 0.25, r) * smoothstep(0.05, 0.26, r);

            vec3 gold = vec3(0.88, 0.75, 0.52);
            vec3 teal = vec3(0.34, 0.76, 0.74);
            vec3 col = mix(gold, teal, smoothstep(0.3, 0.8, r) * 0.4);

            gl_FragColor = vec4(col, pattern * radialFade * 0.22);
          }
        `
      });
      const sanctuaryFloorMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), sanctuaryFloorMat);
      sanctuaryFloorMesh.rotation.x = -Math.PI * 0.41;
      sanctuaryFloorMesh.position.set(0, -3.25, -4.5);
      bgGroup.add(sanctuaryFloorMesh);

      // 4. Delicate Astrolabe Orbital Rings in Background (z = -11.5)
      const orbitalRingsGroup = new THREE.Group();
      orbitalRingsGroup.position.set(0, 0.2, -11.5);
      bgGroup.add(orbitalRingsGroup);

      function createOrbitalRing(radius, segments, opacity, dashed = false, color = 0xE2C285) {
        const pts = [];
        for (let i = 0; i <= segments; i++) {
          const a = (i / segments) * TAU;
          pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
        }
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        if (dashed) {
          const mat = new THREE.LineDashedMaterial({
            color,
            transparent: true,
            opacity,
            dashSize: 0.22,
            gapSize: 0.18,
            depthWrite: false
          });
          const line = new THREE.Line(geom, mat);
          line.computeLineDistances();
          return line;
        } else {
          const mat = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false
          });
          return new THREE.Line(geom, mat);
        }
      }

      const ringOuter = createOrbitalRing(6.2, 160, 0.15, false, 0xE2C285);
      const ringMid = createOrbitalRing(5.65, 140, 0.18, true, 0xE2C285);
      const ringInner = createOrbitalRing(4.1, 128, 0.12, false, 0x48B2AD);
      const ringTilted = createOrbitalRing(6.8, 160, 0.11, false, 0xE2C285);
      ringTilted.rotation.set(0.52, 0.28, 0.15);
      const ringEllipse = createOrbitalRing(5.2, 140, 0.11, false, 0xE2C285);
      ringEllipse.scale.set(0.68, 1.15, 1);
      ringEllipse.rotation.z = -0.32;
      orbitalRingsGroup.add(ringOuter, ringMid, ringInner, ringTilted, ringEllipse);

      // 5. Multi-Depth Twinkling Starfield & Floating Champagne Dust Motes
      function createSoftParticleTexture() {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0.0, 'rgba(255, 250, 235, 1.0)');
        g.addColorStop(0.28, 'rgba(242, 212, 152, 0.75)');
        g.addColorStop(0.65, 'rgba(226, 194, 133, 0.18)');
        g.addColorStop(1.0, 'rgba(226, 194, 133, 0.0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
      }

      const particleTex = createSoftParticleTexture();
      const dustCount = isMobile ? 140 : 260;
      const dustGeom = new THREE.BufferGeometry();
      const dustPos = new Float32Array(dustCount * 3);
      const dustPhase = new Float32Array(dustCount);
      const dustSpeed = new Float32Array(dustCount);
      const dustScale = new Float32Array(dustCount);
      const dustColorAttr = new Float32Array(dustCount * 3);

      const starPalette = [
        new THREE.Color(0xF8E5B8), // Champagne gold
        new THREE.Color(0xD8E8FF), // Silver-ice starlight
        new THREE.Color(0x78E2DC), // Soft celadon
        new THREE.Color(0xE8C498)  // Warm amber
      ];

      for (let i = 0; i < dustCount; i++) {
        const isDeepStar = i < dustCount * 0.68;
        dustPos[i * 3] = (Math.random() - 0.5) * (isDeepStar ? 38 : 18);
        dustPos[i * 3 + 1] = (Math.random() - 0.5) * (isDeepStar ? 24 : 12);
        dustPos[i * 3 + 2] = isDeepStar ? (-9 - Math.random() * 16) : (-4.2 - Math.random() * 4.5);
        dustPhase[i] = Math.random() * TAU;
        dustSpeed[i] = isDeepStar ? (0.02 + Math.random() * 0.06) : (0.12 + Math.random() * 0.22);
        dustScale[i] = (isDeepStar ? 0.65 : 1.15) * (0.6 + Math.random() * 0.9);

        const c = starPalette[i % starPalette.length];
        dustColorAttr[i * 3] = c.r;
        dustColorAttr[i * 3 + 1] = c.g;
        dustColorAttr[i * 3 + 2] = c.b;
      }
      dustGeom.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
      dustGeom.setAttribute('aPhase', new THREE.BufferAttribute(dustPhase, 1));
      dustGeom.setAttribute('aSpeed', new THREE.BufferAttribute(dustSpeed, 1));
      dustGeom.setAttribute('aScale', new THREE.BufferAttribute(dustScale, 1));
      dustGeom.setAttribute('color', new THREE.BufferAttribute(dustColorAttr, 3));

      // 100% GPU-driven particle drift & twinkle (zero CPU buffer uploads per frame)
      const dustMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: nebulaUniforms.uTime,
          uTex: { value: particleTex },
          uPixelRatio: { value: renderer.getPixelRatio() }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        vertexShader: `
          uniform float uTime;
          uniform float uPixelRatio;
          attribute float aPhase;
          attribute float aSpeed;
          attribute float aScale;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vColor = color;
            vec3 p = position;
            // Continuous vertical wrap in [-12, 12] and gentle horizontal sine drift on GPU
            float driftedY = mod(p.y + 12.0 + uTime * aSpeed, 24.0) - 12.0;
            p.y = driftedY;
            p.x += sin(uTime * 0.55 + aPhase) * 0.18;

            float twinkle = 0.42 + 0.58 * sin(uTime * 1.85 + aPhase);
            vAlpha = twinkle * 0.88;
            vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = aScale * (115.0 / -mvPosition.z) * uPixelRatio;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform sampler2D uTex;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vec4 texCol = texture2D(uTex, gl_PointCoord);
            gl_FragColor = vec4(vColor * texCol.rgb, texCol.a * vAlpha);
          }
        `
      });
      const dustPoints = new THREE.Points(dustGeom, dustMat);
      scene.add(dustPoints);

      /* ----------------------------------------------------------------------------
       * 5B. THREE 3D RECEIVER SLOTS AT LOWER STAGE (For Act III Card Selection)
       *     Exact frustum-projected world position & scale matching the 3 HTML slot boxes
       *     (`Quá Khứ`, `Hiện Tại`, `Tương Lai`) so chosen cards dock 100% inside the frames!
       * ---------------------------------------------------------------------------- */
      const receiverGroup = new THREE.Group();
      scene.add(receiverGroup);

      const SLOT_Z = 2.25;
      const receiverSlots = [];
      const slotDomBoxes = [
        document.getElementById('slot-box-0'),
        document.getElementById('slot-box-1'),
        document.getElementById('slot-box-2'),
        document.getElementById('slot-box-3')
      ];
      const slotMiniFrames = [
        document.getElementById('slot-frame-0'),
        document.getElementById('slot-frame-1'),
        document.getElementById('slot-frame-2'),
        document.getElementById('slot-frame-3')
      ];

      function createRoundedFrameLine(w, h, r, color, opacity) {
        const hw = w * 0.5, hh = h * 0.5;
        const shape = new THREE.Shape();
        shape.moveTo(-hw + r, -hh);
        shape.lineTo(hw - r, -hh);
        shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
        shape.lineTo(hw, hh - r);
        shape.quadraticCurveTo(hw, hh, hw - r, hh);
        shape.lineTo(-hw + r, hh);
        shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
        shape.lineTo(-hw, -hh + r);
        shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

        const pts = shape.getPoints(32).map(p => new THREE.Vector3(p.x, p.y, 0));
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        return new THREE.Line(geom, mat);
      }

      for (let i = 0; i < 4; i++) {
        const slotHolder = new THREE.Group();
        slotHolder.position.set((i - 1) * 1.15, -2.15, SLOT_Z);

        // Unit-scale card outline (scaled dynamically to match exact slot scale)
        const pulseFrame = createRoundedFrameLine(
          CARD_W * 1.06,
          CARD_H * 1.06,
          CARD_RADIUS,
          0xFFF0C8,
          0.0
        );
        slotHolder.add(pulseFrame);
        receiverGroup.add(slotHolder);

        receiverSlots.push({
          group: slotHolder,
          pulseFrame,
          pulseTime: -1,
          occupiedCard: null,
          targetScale: 0.16,
          cachedRect: null
        });
      }

      // Cache DOM rects on resize/transition to prevent per-frame layout reflow
      let spreadRectsDirty = true;
      const spreadTransitions = new Map();
      const spreadBounds = { headerBottom: 0, controlsTop: innerHeight };
      function refreshSlotDomRects() {
        spreadBounds.headerBottom = spreadHeaderEl.getBoundingClientRect().bottom;
        spreadBounds.controlsTop = spreadBottomEl.getBoundingClientRect().top;
        for (let i = 0; i < 4; i++) {
          const el = slotMiniFrames[i];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            receiverSlots[i].cachedRect = {
              cx: rect.left + rect.width * 0.5,
              cy: rect.top + rect.height * 0.5,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height
            };
          }
        }
        spreadRectsDirty = false;
      }

      // Project a screen pixel coordinate (px, py) onto the world plane z = targetZ
      const _unprojectVec = new THREE.Vector3();
      const _rayDir = new THREE.Vector3();
      const _topWorldVec = new THREE.Vector3();
      const _botWorldVec = new THREE.Vector3();
      const slotOrigin = new THREE.Vector3(), slotForward = new THREE.Vector3(), slotRay = new THREE.Vector3();

      function screenToWorldAtZ(screenX, screenY, targetZ, outVec) {
        const ndcX = (screenX / window.innerWidth) * 2 - 1;
        const ndcY = -(screenY / window.innerHeight) * 2 + 1;
        _unprojectVec.set(ndcX, ndcY, 0.5).unproject(camera);
        _rayDir.copy(_unprojectVec).sub(camera.position).normalize();
        const dist = (targetZ - camera.position.z) / _rayDir.z;
        return outVec.copy(camera.position).addScaledVector(_rayDir, dist);
      }

      function syncReceiverSlotsWithDOM(forceRefreshRects = false) {
  const now = performance.now();
  for (const [element, until] of spreadTransitions) if (now > until) spreadTransitions.delete(element);
  if (forceRefreshRects || spreadRectsDirty || spreadTransitions.size || !receiverSlots[0].cachedRect) refreshSlotDomRects();
  camera.updateMatrixWorld(true);
  const origin = camera.getWorldPosition(slotOrigin);
  const forward = camera.getWorldDirection(slotForward);
  const depth = 3.5, width = innerWidth, height = innerHeight;
  const units = 2 * depth * Math.tan(camera.fov * Math.PI / 360) / height;
  for (let i = 0; i < activeCount; i++) {
    const slot = receiverSlots[i], r = slot.cachedRect;
    if (!r) continue;
    const ray = slotRay.set(r.cx / width * 2 - 1, 1 - r.cy / height * 2, 0).unproject(camera).sub(origin).normalize();
    slot.group.position.copy(origin).addScaledVector(ray, depth / ray.dot(forward));
    slot.targetScale = Math.min((r.width - 2) / CARD_W, (r.height - 2) / CARD_H) * units;
    slot.group.quaternion.copy(camera.quaternion).multiply(backRotation);
  }
}


      /* ============================================================================
       * 6. CONTINUOUS 24-CARD 3D DECK POOL & HERO REVEAL HALOS
       *    All 24 cards exist continuously in the scene with Spring Physics state.
       * ============================================================================ */
      const TOTAL_CARDS = 78;
      const cards = [];
      const deckGroup = new THREE.Group();
      scene.add(deckGroup);

      // Build procedural textures
      const backMaps = buildBackCardMaps(renderer);
      const heroMaps = [
        buildMoonCardMaps(renderer), // 0: XVIII The Moon
        buildStarCardMaps(renderer), // 1: XVII The Star
        buildSunCardMaps(renderer)   // 2: XIX The Sun
      ];

      const sharedCardGeometry = createBeveledCardGeometry();

      // Create soft radial halo texture for behind the 3 revealed Hero cards
      function createHaloCanvasTexture(r, g, b) {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 256;
        const ctx = c.getContext('2d');
        const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
        grad.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, 0.65)`);
        grad.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, 0.25)`);
        grad.addColorStop(0.72, `rgba(${r}, ${g}, ${b}, 0.06)`);
        grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0.0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
        return new THREE.CanvasTexture(c);
      }

      const heroHaloTextures = [
        createHaloCanvasTexture(165, 178, 255), // Moon: Silver-Violet
        createHaloCanvasTexture(82, 214, 206),  // Star: Celadon-Teal
        createHaloCanvasTexture(248, 192, 96)   // Sun: Warm Amber-Gold
      ];

      const _targetQuat = new THREE.Quaternion();
      const sharedHaloGeometry = new THREE.PlaneGeometry(3.7, 4.6);

      for (let i = 0; i < TOTAL_CARDS; i++) {
        const heroType = i % 3;
        const sharedCardUniforms = {
          uGlintPhase: { value: -1.5 },
          uRimGlow: { value: 0.0 },
          uRimColor: { value: new THREE.Color(0xF6DEAA) }
        };
        const frontMat = createFoilEnhancedMaterial(backMaps, false, sharedCardUniforms);
        const backMat = createFoilEnhancedMaterial(backMaps, false, sharedCardUniforms);
        const edgeMat = createFoilEnhancedMaterial(null, true, sharedCardUniforms);

        const mesh = new THREE.Mesh(sharedCardGeometry, [frontMat, backMat, edgeMat]);

        // Attach a subtle back-halo plane behind each card (only illuminated on Hero reveal)
        const haloMat = new THREE.MeshBasicMaterial({
          map: heroHaloTextures[heroType],
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const haloMesh = new THREE.Mesh(sharedHaloGeometry, haloMat);
        haloMesh.position.set(0, 0, -0.08);
        mesh.add(haloMesh);

        // Start cards on their initial non-overlapping celestial orbital shells
        const ringId = i % 2;
        const slotInRing = Math.floor(i / 2);
        const theta = (slotInRing / (TOTAL_CARDS / 2)) * TAU;
        const rX = (ringId === 0 ? 2.45 : 3.65) * layoutMetrics.shuffleScaleX;
        const rY = (ringId === 0 ? 0.95 : 1.48) * layoutMetrics.shuffleScaleY;
        mesh.position.set(Math.cos(theta) * rX, Math.sin(theta) * rY, (ringId === 0 ? 0.65 : -0.95));
        mesh.rotation.set(0, Math.PI, 0);

        deckGroup.add(mesh);

        cards.push({
          index: i,
          mesh,
          haloMesh,
          frontMat,
          backMat,
          edgeMat,
          sharedUniforms: sharedCardUniforms,
          haloMat,
          heroType,
          // Spring physics state for ultra-smooth C2 motion
          pos: mesh.position,
          vel: new THREE.Vector3(0, 0, 0),
          rot: mesh.rotation,
          quat: mesh.quaternion,
          scale: 0.82,
          scaleVel: 0.0,
          scaleStep: { value: 0, velocity: 0 },
          targetPos: mesh.position.clone(),
          targetRot: new THREE.Euler(0, Math.PI, 0),
          targetScale: 0.82,
          springOmega: 10.5,
          // Flight curve state for selection & launch
          flightActive: false,
          flightStartTime: 0,
          flightDuration: 1.0,
          p0: new THREE.Vector3(),
          p1: new THREE.Vector3(),
          p2: new THREE.Vector3(),
          p3: new THREE.Vector3(),
          startQuat: new THREE.Quaternion(),
          endQuat: new THREE.Quaternion(),
          startScale: 1.0,
          endScale: 1.0,
          onFlightComplete: null,
          // Hero flip state
          flipRequested: false,
          flipStarted: false,
          flipStartTime: 0,
          flipDuration: 1.48,
          isFlipped: false,
          slotIndex: -1,
          hoverAmount: 0,
          glintPhase: -1.5,
          rimGlow: 0.0
        });
      }

      // Helper to advance a card's transform smoothly using critically-damped springs + Quaternion slerp
      const cardBatch = window.TarotBatch.create({ THREE, geometry: sharedCardGeometry, maps: backMaps,
        makeMaterial: createFoilEnhancedMaterial, group: deckGroup, capacity: TOTAL_CARDS,
        supported: renderer.capabilities.isWebGL2 || renderer.extensions.has('ANGLE_instanced_arrays') });

      function stepCardSpringTransform(c, dt) {
        stepSpringVec3(c.pos, c.vel, c.targetPos, c.springOmega, dt);
        const sStep = stepSpring1D(c.scale, c.scaleVel, c.targetScale, c.springOmega * 1.15, dt, c.scaleStep);
        c.scale = sStep.value;
        c.scaleVel = sStep.velocity;
        c.mesh.scale.setScalar(c.scale);

        _targetQuat.setFromEuler(c.targetRot);
        const qAlpha = 1.0 - Math.exp(-c.springOmega * 1.25 * dt);
        c.quat.slerp(_targetQuat, qAlpha);
      }

      // Assign a specific Hero artwork (Moon=0, Star=1, Sun=2) to a chosen card
      function assignHeroFaceToCard(card) { card.faceReady = prepareFace(card); }

      // Pre-allocated Object Pool for rising luminous motes emitted on card flip (zero runtime GC stutter)
      const MOTE_POOL_SIZE = 42;
      const revealMotesPool = [];
      const moteGroup = new THREE.Group();
      scene.add(moteGroup);

      for (let i = 0; i < MOTE_POOL_SIZE; i++) {
        const mat = new THREE.SpriteMaterial({
          map: particleTex,
          color: 0xFFE29A,
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        sprite.visible = false;
        moteGroup.add(sprite);
        revealMotesPool.push({
          active: false,
          sprite,
          mat,
          vx: 0,
          vy: 0,
          age: 0,
          maxAge: 2.0
        });
      }

      function spawnRevealMotesForCard(worldPos, heroIndex) {
        const colors = [0xCFD8FF, 0x72E8DF, 0xFFE29A];
        const col = colors[heroIndex % 3];
        let spawned = 0;
        for (let i = 0; i < MOTE_POOL_SIZE && spawned < 14; i++) {
          const m = revealMotesPool[i];
          if (m.active) continue;
          m.active = true;
          m.age = 0;
          m.maxAge = 2.0 + Math.random() * 1.4;
          m.vx = (Math.random() - 0.5) * 0.22;
          m.vy = 0.38 + Math.random() * 0.45;
          m.mat.color.setHex(col);
          m.mat.opacity = 0.0;
          const s = 0.07 + Math.random() * 0.11;
          m.sprite.scale.set(s, s, 1);
          m.sprite.position.set(
            worldPos.x + (Math.random() - 0.5) * 1.4,
            worldPos.y - 0.8 + (Math.random() - 0.5) * 1.2,
            worldPos.z - 0.12
          );
          m.sprite.visible = true;
          spawned++;
        }
      }

      const moteBatch = window.TarotBatch.createMotes({ THREE, group: moteGroup, map: particleTex, capacity: MOTE_POOL_SIZE,
        supported: renderer.getContext().getParameter(renderer.getContext().ALIASED_POINT_SIZE_RANGE)[1] >= 64 });

      /* ============================================================================
       * 7. CHOREOGRAPHY STATE MACHINE & 4-ACT DIRECTOR (NO INTRO DELAY)
       *    Acts:
       *    - 'SHUFFLE' : 24 cards weave on collision-free multi-shell celestial rings + Riffle
       *    - 'GATHER'  : Deck decelerates & breathes back into a neat stack
       *    - 'FAN'     : Reference-matched 7-card horizontal spread; USER manually picks 3 cards
       *    - 'ASCEND'  : 3 chosen cards fly continuously from lower slots up to center stage
       *    - 'REVEAL'  : Weighted 1.48s Hero Flip with gold edge glint, back-halo & inspection
       * ============================================================================ */
      const brandCrestEl = document.getElementById('brand-crest');
      const whisperEl = document.getElementById('whisper-caption');
      const holdBtnEl = document.getElementById('hold-shuffle-btn');
      const holdLabelEl = document.getElementById('hold-btn-label');
      const titlesBarEl = document.getElementById('card-titles-bar');
      const spreadHeaderEl = document.getElementById('spread-header-ui');
      const spreadBottomEl = document.getElementById('spread-bottom-ui');
      const spreadStepCountEl = document.getElementById('spread-step-count');
      const spreadStepTitleEl = document.getElementById('spread-step-title');
      const spreadSliderEl = document.getElementById('spread-slider');
      const spreadCounterLabelEl = document.getElementById('spread-counter-label');
      const btnDrawCurrentEl = document.getElementById('btn-draw-current');
      const revealActionBarEl = document.getElementById('reveal-action-bar');
      const revealHeaderHintEl = document.getElementById('reveal-header-hint');
      const btnFlipNextEl = document.getElementById('btn-flip-next');
      const btnFlipNextLabelEl = document.getElementById('btn-flip-next-label');

      const captionEls = [
        document.getElementById('caption-0'),
        document.getElementById('caption-1'),
        document.getElementById('caption-2'),
        document.getElementById('caption-3')
      ];

      let SPREAD_STEP_NAMES = ['Quá Khứ', 'Hiện Tại', 'Tương Lai'];
      let activeCount = 3;

      const state = {
        mode: 'MANUAL', // 'PLAY_ALL' | 'SHUFFLE_ONLY' | 'FAN_ONLY' | 'REVEAL_ONLY'
        act: 'HOME',
        actTime: 0,
        globalTime: 0,
        // Camera smooth rig
        camPos: new THREE.Vector3(0, 0.22, layoutMetrics.shuffleCamZ),
        camVel: new THREE.Vector3(0, 0, 0),
        camTargetPos: new THREE.Vector3(0, 0.22, layoutMetrics.shuffleCamZ),
        camLookAt: new THREE.Vector3(0, 0, 0),
        camLookVel: new THREE.Vector3(0, 0, 0),
        camTargetLookAt: new THREE.Vector3(0, 0, 0),
        // Shuffle state
        isHoldingShuffle: false,
        autoHoldActive: false,
        shuffleSpeed: 0.55,
        shufflePhase: 0,
        shuffleEnergy: 0.0,
        // Unbounded circular coordinates; wrap only when looking up an actual card.
        fanFocusIndex: 11,      // Smooth floating-point focus index
        fanFocusVel: 0,         // Spring velocity for silky carousel scrubbing
        fanStep: { value: 0, velocity: 0 },
        fanTargetIndex: 11,     // Target focus index
        fanLastRoundedIndex: 11,
        fanVelocity: 0,
        hoveredCardIndex: -1,
        lastHoveredCardIndex: -1,
        selectedCards: [],
        // Reveal inspection state
        inspectedSlot: -1,
        pointerNDC: new THREE.Vector2(0, 0),
        smoothPointer: new THREE.Vector2(0, 0)
      };

      function setWhisper(text) {
        if (!text) {
          whisperEl.classList.remove('active');
        } else {
          whisperEl.textContent = text;
          whisperEl.classList.add('active');
        }
      }

      function hideRevealedCaptions() {
        titlesBarEl.classList.remove('visible');
        revealActionBarEl.classList.remove('visible');
        captionEls.forEach(el => {
          el.classList.remove('shown', 'ready-to-flip');
        });
      }

      function updateRevealActionUI() {
        if (state.act !== 'REVEAL') {
          revealActionBarEl.classList.remove('visible');
          return;
        }
        revealActionBarEl.classList.add('visible');

        // Find first card that has not been requested to flip yet
        const nextUnflippedIdx = state.selectedCards.findIndex(c => !c.flipRequested);
        if (nextUnflippedIdx !== -1) {
          revealHeaderHintEl.textContent = 'Chạm vào từng lá bài trên màn hình để lật mở';
          btnFlipNextEl.classList.remove('hidden-btn');
          btnFlipNextLabelEl.textContent = `Lật mở lá ${SPREAD_STEP_NAMES[nextUnflippedIdx]}`;
        } else {
          revealHeaderHintEl.textContent = state.inspectedSlot !== -1
            ? 'Chạm lại vào lá bài để thu nhỏ góc nhìn'
            : 'Chạm vào lá bài bất kỳ để ngắm gần chi tiết nhũ vàng';
          btnFlipNextEl.classList.add('hidden-btn');
        }
      }

      // Manually trigger the weighted 1.48s Hero Flip for a specific slot (0, 1, or 2)
      function triggerSingleCardFlip(slotIdx) {
        if (state.act !== 'REVEAL') return;
        const card = state.selectedCards[slotIdx];
        if (!card) return;

        if (!card.flipRequested) {
          if (!card.faceReadyDone) {
            if (card.waitingFace) return;
            if (card.faceFailed) { card.faceFailed = false; card.faceReady = prepareFace(card); }
            card.waitingFace = true; const version = generation;
            Promise.resolve(card.faceReady).then(() => {
              if (version !== generation) return;
              card.waitingFace = false;
              if (card.faceReadyDone) triggerSingleCardFlip(slotIdx);
              else window.dispatchEvent(new CustomEvent('tarot:notice', { detail: 'Mặt bài chưa tải được. Bạn chạm lại lá để thử nhé.' }));
            }); return;
          }
          card.flipRequested = true;
          card.flipStarted = true;
          card.flipStartTime = state.globalTime;
          sound.playCardFlipStart(slotIdx);
          window.TarotMobile?.feel('flip');
          updateRevealActionUI();
        } else if (card.isFlipped && card.flipComplete) {
          // Card is already open -> toggle close-up inspection zoom
          state.inspectedSlot = (state.inspectedSlot === slotIdx) ? -1 : slotIdx;
          sound.playPaperRustle(0.45, state.inspectedSlot !== -1 ? 1.15 : 0.92, (slotIdx - 1) * 0.35);
          sound.playChime(state.inspectedSlot !== -1 ? 659.25 : 528.0, 0.028, 0.65);
          updateRevealActionUI();
        }
      }

      function hideSpreadUI() {
        spreadHeaderEl.classList.remove('visible');
        spreadBottomEl.classList.remove('visible');
      }

      function updateSpreadStepUI() {
        const current = state.selectedCards.length, stepIdx = Math.min(current, activeCount - 1);
        spreadStepCountEl.textContent = Math.min(current + 1, activeCount) + ' / ' + activeCount;
        spreadStepTitleEl.textContent = current < activeCount ? SPREAD_STEP_NAMES[stepIdx] : 'Đã chọn đủ lá';
        slotDomBoxes.forEach((box, idx) => { box.hidden = idx >= activeCount; box.classList.toggle('active-step', idx === current); });
      }

      let availableFanCards = null;
      function getAvailableFanCards() {
        if (availableFanCards) return availableFanCards;
        const list = [];
        for (let i = 0; i < TOTAL_CARDS; i++) {
          const c = cards[i];
          if (c.slotIndex === -1 && !c.flightActive) {
            list.push(c);
          }
        }
        return availableFanCards = list;
      }

      function resetAllCardsTransformState() {
        availableFanCards = null;
        state.selectedCards = [];
        state.inspectedSlot = -1;
        receiverSlots.forEach(s => {
          s.occupiedCard = null;
          s.pulseFrame.material.opacity = 0;
          s.pulseTime = -1;
        });
        slotDomBoxes.forEach((box, idx) => {
          box.classList.toggle('active-step', idx === 0);
          box.classList.remove('filled');
        });

        cards.forEach((c, i) => {
          c.flightActive = false;
          c.flipRequested = false;
          c.flipStarted = false;
          c.isFlipped = false;
          c.slotIndex = -1;
          c.hoverAmount = 0;
          c.glintPhase = -1.5;
          c.rimGlow = 0.0;
          c.haloMat.opacity = 0.0;
          c.vel.set(0, 0, 0);
          c.scaleVel = 0;
          c.springOmega = 10.5;
          c.sharedUniforms.uGlintPhase.value = -1.5;
          c.sharedUniforms.uRimGlow.value = 0.0;
          Object.assign(c.frontMat, backMaps); c.mesh.visible = true; c.faceReady = null; c.flipComplete = false; c.haloMat.opacity = 0;
          c.faceMaps = null; c.faceReadyDone = false; c.faceFailed = false; c.waitingFace = false; c.image = '';
        });
      }

      // Launch a card along a continuous 3D cubic Bezier trajectory with Quaternion slerp
      function launchCardBezier(card, targetPos, targetEuler, targetScale, duration, arcLiftY, arcPullZ, onComplete) {
        card.flightActive = true;
        card.flightStartTime = state.globalTime;
        card.flightDuration = duration;

        card.p0.copy(card.pos);
        card.p3.copy(targetPos);

        card.p1.set(
          lerp(card.p0.x, card.p3.x, 0.25),
          Math.max(card.p0.y, card.p3.y) + arcLiftY,
          lerp(card.p0.z, card.p3.z, 0.28) + arcPullZ
        );
        card.p2.set(
          lerp(card.p0.x, card.p3.x, 0.72),
          lerp(card.p0.y, card.p3.y, 0.78) + arcLiftY * 0.25,
          lerp(card.p0.z, card.p3.z, 0.82) + arcPullZ * 0.32
        );

        card.startQuat.copy(card.quat);
        card.endQuat.setFromEuler(targetEuler);
        card.startScale = card.scale;
        card.endScale = targetScale;
        card.vel.set(0, 0, 0);
        card.onFlightComplete = onComplete || null;
      }

      /* ----------------------------------------------------------------------------
       * ACT TRANSITIONS (Starts directly at SHUFFLE, no INTRO delay)
       * ---------------------------------------------------------------------------- */
      function enterActShuffle(resetDeck = true) {
        state.act = 'SHUFFLE';
        state.actTime = 0;
        state.shuffleSpeed = 0.62;
        state.shuffleEnergy = 0.0;
        state.isHoldingShuffle = false;
        state.autoHoldActive = false;

        if (resetDeck) {
          resetAllCardsTransformState();
        }

        hideRevealedCaptions();
        hideSpreadUI();
        brandCrestEl.classList.add('visible', 'docked');
        holdBtnEl.classList.add('visible');
        holdBtnEl.classList.remove('holding');
        holdLabelEl.textContent = 'Giữ để xáo';
        setWhisper('Cứ thong thả, khi nào thấy thích hợp thì thả tay.');

        keyLight.intensity = 2.15;
        rimLight.intensity = 2.2;
        fillLight.intensity = 0.95;

        state.camTargetPos.set(0, 0.22, layoutMetrics.shuffleCamZ);
        state.camTargetLookAt.set(0, 0, 0);
      }

      function enterActGather() {
        if (state.act === 'GATHER') return;
        state.act = 'GATHER';
        state.actTime = 0;
        state.isHoldingShuffle = false;
        state.autoHoldActive = false;
        holdBtnEl.classList.remove('holding', 'visible');
        setWhisper('');
        state.camTargetPos.set(0, 0.1, layoutMetrics.introCamZ * 0.96);
        state.camTargetLookAt.set(0, -0.05, 0);
        sound.playPaperRustle(0.75, 0.95, 0);
      }

      function enterActFan(fromStandaloneButton = false) {
        if (fromStandaloneButton) {
          resetAllCardsTransformState();
        }
        state.act = 'FAN';
        state.actTime = 0;
        state.fanFocusIndex = 38.0;
        state.fanFocusVel = 0.0;
        state.fanTargetIndex = 38.0;
        state.fanLastRoundedIndex = 38;
        state.fanVelocity = 0;
        state.hoveredCardIndex = -1;
        state.selectedCards = [];

        brandCrestEl.classList.add('visible', 'docked');
        holdBtnEl.classList.remove('visible', 'holding');
        hideRevealedCaptions();
        setWhisper('');

        updateSpreadStepUI();
        spreadSliderEl.max = String(TOTAL_CARDS - 1);
        spreadSliderEl.value = String(state.fanTargetIndex);
        updateSpreadCounterText();

        spreadHeaderEl.classList.add('visible');
        spreadBottomEl.classList.add('visible');

        state.camTargetPos.set(0, 0.05, layoutMetrics.fanCamZ);
        state.camTargetLookAt.set(0, -0.08, 0);

        receiverSlots.forEach(s => {
          s.occupiedCard = null;
          s.pulseTime = -1;
        });

        // Refresh DOM slot bounding boxes once UI becomes visible
        requestAnimationFrame(() => {
          refreshSlotDomRects();
          syncReceiverSlotsWithDOM(true);
        });

        sound.playPaperRustle(0.85, 1.1, 0);
      }

      function updateSpreadCounterText() {
        const available = getAvailableFanCards();
        const index = window.TarotCarousel.wrap(Math.round(state.fanFocusIndex), available.length);
        const text = (available.length ? index + 1 : 0) + ' / ' + available.length;
        if (spreadCounterLabelEl.textContent !== text) {
          spreadCounterLabelEl.textContent = text;
          spreadSliderEl.setAttribute('aria-valuetext', 'Lá ' + (index + 1) + ' trong vòng ' + available.length + ' lá, vuốt hai chiều liên tục');
        }
      }

      // Manual card selection from the spread carousel (flies 100% accurately into Quá Khứ / Hiện Tại / Tương Lai box)
      function selectCardFromFan(card) {
        if (state.act !== 'FAN') return;
        if (!card || card.slotIndex !== -1 || card.flightActive) return;
        if (state.selectedCards.length >= activeCount || state.picking || state.actTime < .8) return;

        syncReceiverSlotsWithDOM(true);

        const beforePick = getAvailableFanCards(), removedIndex = beforePick.indexOf(card);
        const slotIdx = state.selectedCards.length;
        card.slotIndex = slotIdx;
        availableFanCards = null;
        state.selectedCards.push(card); state.picking = true; overlayScene.attach(card.mesh);
        window.TarotMobile?.feel('select');

        // Assign corresponding Hero artwork (0: The Moon, 1: The Star, 2: The Sun)
        assignHeroFaceToCard(card, slotIdx);

        const slot = receiverSlots[slotIdx];
        slot.occupiedCard = card;

        // Rebase both spring coordinates into the smaller ring without jumping a revolution.
        const avail = getAvailableFanCards();
        if (avail.length > 0) {
          state.fanFocusIndex = window.TarotCarousel.remove(state.fanFocusIndex, removedIndex, beforePick.length);
          state.fanTargetIndex = window.TarotCarousel.remove(state.fanTargetIndex, removedIndex, beforePick.length);
          state.fanLastRoundedIndex = Math.round(state.fanFocusIndex);
          state.fanVelocity = 0;
          spreadSliderEl.max = String(avail.length - 1);
          spreadSliderEl.value = String(window.TarotCarousel.wrap(state.fanFocusIndex, avail.length));
        }

        updateSpreadStepUI();

        const targetPos = slot.group.position.clone();
        // Match camera pitch so the card sits completely flat inside the 2D UI slot frame
        const targetRot = new THREE.Euler().setFromQuaternion(camera.quaternion.clone().multiply(backRotation));

        sound.playFlightWhoosh(0.82, 360 + slotIdx * 65, (slotIdx - 1) * 0.35);

        launchCardBezier(
          card,
          targetPos,
          targetRot,
          slot.targetScale,
          1.10,
          0.72, // Graceful upward lift before arcing down into the exact receiver frame
          1.25, // Pull forward in Z so it clears the spread cards cleanly
          () => {
            // Trigger golden ripple & realistic dock sound on the receiver frame upon exact docking
            slot.pulseTime = state.globalTime;
            state.picking = false;
            slotDomBoxes[slotIdx].classList.add('landed');
            recordDockError(card, slotIdx);
            sound.playSlotDock(slotIdx);
            window.TarotMobile?.feel(state.selectedCards.length === activeCount ? 'complete' : 'dock');

            // When all 3 cards have been manually chosen and landed, ascend to center stage
            if (state.selectedCards.length === activeCount) {
              const allLanded = state.selectedCards.every(c => !c.flightActive);
              if (allLanded) {
                schedule(() => { if (state.act === 'FAN') enterActAscendToReveal(); }, 220);
              }
            }
          }
        );
      }

      function enterActAscendToReveal() {
        state.act = 'ASCEND';
        state.actTime = 0;
        setWhisper('');
        holdBtnEl.classList.remove('visible');
        hideSpreadUI();
        computeRevealLayout();

        const heroXs = layoutMetrics.revealHeroXs;
        const heroY = layoutMetrics.revealHeroY;
        const heroZs = [0.0, 0.0, 0.0, 0.0];
        const heroScale = layoutMetrics.revealHeroScale;

        state.camTargetPos.set(0, 0.14, layoutMetrics.revealCamZ + 0.45);
        state.camTargetLookAt.set(0, 0.12, 0);

        // Launch the 3 chosen cards sequentially from their lower receiver frames up to center stage
        state.selectedCards.forEach((card, idx) => {
          const delay = idx * 0.16;
          schedule(() => {
            if (state.act !== 'ASCEND' && state.act !== 'REVEAL') return;
            sound.playFlightWhoosh(1.0, 310 + idx * 50, (idx - 1) * 0.4);
            launchCardBezier(
              card,
              new THREE.Vector3(heroXs[idx], layoutMetrics.revealHeroYs[idx], heroZs[idx] || 0),
              new THREE.Euler(0, Math.PI, 0),
              heroScale,
              1.45,
              0.68,
              1.15,
              () => {
                sound.playPaperRustle(0.45, 1.0 + idx * 0.08, (idx - 1) * 0.4);
                if (state.selectedCards.every(item => !item.flightActive)) {
                  enterActRevealSequence(false);
                }
              }
            );
          }, delay * 1000);
        });
      }

      function enterActRevealSequence(directJump = false) {
        state.act = 'REVEAL';
        computeRevealLayout();
        state.selectedCards.forEach(c => { deckGroup.attach(c.mesh); if (c.faceMaps) applyMaps(c, c.faceMaps); });
        cards.forEach(c => { if (c.slotIndex === -1) c.mesh.visible = false; });
        state.actTime = 0;
        state.inspectedSlot = -1;
        brandCrestEl.classList.add('visible', 'docked');
        holdBtnEl.classList.remove('visible', 'holding');
        hideSpreadUI();
        setWhisper('');

        const heroXs = layoutMetrics.revealHeroXs;
        const heroY = layoutMetrics.revealHeroY;
        const heroZs = [0.0, 0.0, 0.0, 0.0];
        const heroScale = layoutMetrics.revealHeroScale;

        if (directJump) {
          resetAllCardsTransformState();
          state.selectedCards = [cards[0], cards[1], cards[2]];
          for (let i = 0; i < 3; i++) {
            const c = state.selectedCards[i];
            c.slotIndex = i;
            assignHeroFaceToCard(c, i);
            c.pos.set(heroXs[i], heroY, heroZs[i]);
            c.rot.set(0, Math.PI, 0);
            c.quat.setFromEuler(c.rot);
            c.scale = heroScale;
            c.mesh.scale.setScalar(c.scale);
          }
          for (let i = 3; i < TOTAL_CARDS; i++) {
            cards[i].pos.set(0, -0.5, -14.0 - i * 0.06);
            cards[i].scale = 0.8;
            cards[i].mesh.scale.setScalar(0.8);
          }
          sound.playPaperRustle(0.65, 1.05, 0);
        }

        state.camTargetPos.set(0, 0.14, layoutMetrics.revealCamZ);
        state.camTargetLookAt.set(0, 0.12, 0);
        titlesBarEl.classList.add('visible');

        // IMPORTANT: Do NOT auto-flip! Keep all 3 cards face down until the user taps each card.
        state.selectedCards.forEach((card, idx) => {
          card.flipRequested = false;
          card.flipStarted = false;
          card.isFlipped = false;
          card.flipDuration = reducedMotion ? .15 : 1.48;
          card.flipStartTime = 0;
          if (captionEls[idx]) {
            captionEls[idx].classList.remove('shown');
            captionEls[idx].classList.add('ready-to-flip');
          }
        });

        updateRevealActionUI();
      }

      /* ============================================================================
       * 8. PER-FRAME CHOREOGRAPHY SOLVERS (ZERO INTERSECTION & SPRING SMOOTH)
       * ============================================================================ */
      function updateActShuffle(dt, t) {
        if (state.mode === 'PLAY_ALL' && !state.isHoldingShuffle) {
          if (t > 0.45 && t < 3.85) {
            state.autoHoldActive = true;
            holdBtnEl.classList.add('holding');
          } else if (t >= 3.85) {
            state.autoHoldActive = false;
            holdBtnEl.classList.remove('holding');
            enterActGather();
            return;
          }
        }

        const activeHold = state.isHoldingShuffle || state.autoHoldActive;
        const targetEnergy = activeHold ? 1.0 : 0.22;
        state.shuffleEnergy = lerp(state.shuffleEnergy, targetEnergy, 1 - Math.exp(-3.2 * dt));

        const targetSpeed = lerp(0.74, 2.05, easeInOutCubic(state.shuffleEnergy));
        state.shuffleSpeed = lerp(state.shuffleSpeed, targetSpeed, 1 - Math.exp(-4.2 * dt));
        state.shufflePhase += state.shuffleSpeed * dt * (reducedMotion ? .05 : 1);

        if (Math.sin(state.shufflePhase * 5.2) > 0.90) {
          sound.playPaperRustle(
            0.35 + state.shuffleEnergy * 0.45,
            0.92 + state.shuffleEnergy * 0.28,
            Math.sin(state.shufflePhase * 2.0) * 0.5
          );
        }

        rimLight.intensity = lerp(2.1, 3.6, state.shuffleEnergy);
        state.camTargetPos.set(
          Math.sin(t * 0.45) * 0.20,
          0.18 + Math.cos(t * 0.32) * 0.09,
          lerp(layoutMetrics.shuffleCamZ, layoutMetrics.shuffleCamZ - 0.55, state.shuffleEnergy)
        );

        if (activeHold) {
          window.TarotMobile?.feel('shuffle');
          const message = ['Cứ thong thả, Rót đang ở đây cùng bạn.', 'Chà, câu hỏi này thật sâu sắc…', 'Xáo tiếp đến khi bạn cảm thấy thích hợp nhé.', 'Không cần vội. Mình cứ nhẹ nhàng thôi.'][Math.floor((state.globalTime - state.holdStarted) / 4.8) % 4];
          if (whisperEl.textContent !== message) setWhisper(message);
        }
        const breath = 0.84 + 0.16 * Math.sin(t * 1.45) + state.shuffleEnergy * 0.16;

        for (let i = 0; i < TOTAL_CARDS; i++) {
          const c = cards[i];
          c.springOmega = 12.5;

          const visibleCount = isMobile ? 24 : 32;
          c.mesh.visible = i < visibleCount;
          if (!c.mesh.visible) continue;
          const ringId = i % 2;
          const slotInRing = Math.floor(i / 2);
          const totalInRing = visibleCount / 2;

          const dir = ringId === 0 ? 1.0 : -0.88;
          const theta = state.shufflePhase * dir + (slotInRing / totalInRing) * TAU;

          const radiusX = (ringId === 0 ? 2.48 : 3.68) * breath * layoutMetrics.shuffleScaleX;
          const radiusY = (ringId === 0 ? 0.96 : 1.50) * breath * layoutMetrics.shuffleScaleY;
          const baseZ   = (ringId === 0 ? 0.68 : -0.92);
          const zWave   = Math.sin(theta) * 0.42 + (slotInRing - 6) * 0.026;

          const riffleLift = Math.sin(theta * 2.0 + t * 1.8) * 0.24 * state.shuffleEnergy;

          const px = Math.cos(theta) * radiusX;
          const py = Math.sin(theta) * radiusY + riffleLift;
          const pz = baseZ + zWave;

          const bankZ = -Math.sin(theta) * 0.28 * dir;
          const tiltX = Math.cos(theta) * 0.18;
          const yawY  = Math.PI + Math.cos(theta) * 0.38;

          c.targetPos.set(px, py, pz);
          c.targetRot.set(tiltX, yawY, bankZ);
          c.targetScale = (ringId === 0 ? 0.84 : 0.76) * (layoutMetrics.isPortrait ? 0.9 : 1.0);

          c.glintPhase = Math.sin(theta + t) * 1.15;
          c.rimGlow = 0.20 + state.shuffleEnergy * 0.48;

          stepCardSpringTransform(c, dt);
        }
      }

      function updateActGather(dt, t) {
        // Cards sequentially find their home in a neat breathing stack with strict Z-ordering
        for (let i = 0; i < TOTAL_CARDS; i++) {
          const c = cards[i];
          const delay = i * 0.022;
          const localT = clamp((t - delay) / 0.75, 0, 1);
          const e = easeOutQuart(localT);
          c.springOmega = 8.5 + e * 6.0;

          // Subtle breathing pulse right as the stack settles
          const breath = Math.sin(clamp(t - 0.55, 0, 1.1) * Math.PI) * 0.008 * (i - TOTAL_CARDS * 0.5);

          // Strict Z spacing (0.024 units > CARD_DEPTH 0.015) so stacked cards never clip!
          const stackZ = (TOTAL_CARDS - 1 - i) * 0.024 - 0.3 + breath;
          const stackY = -0.15 + Math.sin(t * 2.4) * 0.015;

          c.targetPos.set(0, stackY, stackZ);
          c.targetRot.set(-0.05, Math.PI, 0);
          c.targetScale = 0.94;
          c.rimGlow = lerp(c.rimGlow, 0.12, dt * 5);
          c.glintPhase = lerp(c.glintPhase, -1.2, dt * 4);

          stepCardSpringTransform(c, dt);
        }

        if (t > 1.45) {
          if (state.mode === 'SHUFFLE_ONLY') {
            holdBtnEl.classList.add('visible');
            setWhisper('Bộ bài đã gom gọn. Giữ nút bên dưới để tiếp tục xáo.');
          } else {
            enterActFan(false);
          }
        }
      }

      /* ----------------------------------------------------------------------------
       * REFERENCE-MATCHED HORIZONTAL SPREAD CAROUSEL (ACT III: FAN):
       * - Displays 7 visible cards centered around `state.fanFocusIndex` (`offset` in [-3..+3])
       * - Generous horizontal spacing so adjacent cards NEVER overlap or clip!
       * - Center card (`offset = 0`) is large, upright, and framed in the middle.
       * - Side cards (`±1, ±2, ±3`) step back in Z and scale down progressively,
       *   tilting subtly just like the user's reference screenshot (`image_4dc512.jpg`).
       * - Cards beyond `|offset| > 3.4` recede smoothly into deep dark space.
       * - ZERO automatic selection: waits for user click on card or "Rút lá đang xem".
       * ---------------------------------------------------------------------------- */
      function updateActFan(dt, t) {
        syncReceiverSlotsWithDOM();
        computeFanLayout();

        const availCards = getAvailableFanCards();
        const maxAvailIndex = Math.max(0, availCards.length - 1);

        // Apply smooth inertia when not dragging
        if (!pointerState.isDragging) {
          state.fanTargetIndex += state.fanVelocity * dt;
          state.fanVelocity *= Math.exp(-6.8 * dt);
          if (Math.abs(state.fanVelocity) < 0.01) state.fanVelocity = 0;

          if (Math.abs(state.fanVelocity) < 0.35) {
            const nearestInt = Math.round(state.fanTargetIndex);
            state.fanTargetIndex = lerp(state.fanTargetIndex, nearestInt, 1 - Math.exp(-8.5 * dt));
          }
        }

        // Critically-damped spring on fanFocusIndex for buttery-smooth carousel scrubbing
        const focusStep = stepSpring1D(state.fanFocusIndex, state.fanFocusVel, state.fanTargetIndex, 15.5, dt, state.fanStep);
        state.fanFocusIndex = focusStep.value;
        state.fanFocusVel = focusStep.velocity;

        // Play realistic tactile card-edge detent tick whenever the focused card index crosses an integer boundary!
        const curRounded = Math.round(state.fanFocusIndex);
        if (curRounded !== state.fanLastRoundedIndex && t > 0.35) {
          const stepDir = Math.sign(curRounded - state.fanLastRoundedIndex);
          state.fanLastRoundedIndex = curRounded;
          sound.playCardTick(stepDir * 0.25, 0.96 + (window.TarotCarousel.wrap(curRounded, availCards.length) / Math.max(1, maxAvailIndex)) * 0.18);
          window.TarotMobile?.feel('tick');
        }

        if (document.activeElement !== spreadSliderEl) {
          const max = String(maxAvailIndex), value = window.TarotCarousel.wrap(state.fanFocusIndex, availCards.length).toFixed(2);
          if (spreadSliderEl.max !== max) spreadSliderEl.max = max;
          if (Math.abs(Number(spreadSliderEl.value) - Number(value)) >= .009) spreadSliderEl.value = value;
        }
        updateSpreadCounterText();

        receiverSlots.forEach((slot) => {
          if (slot.pulseTime > 0) {
            const pAge = state.globalTime - slot.pulseTime;
            if (pAge < 0.85) {
              const pNorm = pAge / 0.85;
              const s = slot.targetScale * (1.0 + easeOutCubic(pNorm) * 0.45);
              slot.pulseFrame.scale.set(s, s, 1);
              slot.pulseFrame.material.opacity = (1.0 - pNorm) * 0.95;
            } else {
              slot.pulseFrame.material.opacity = 0;
            }
          }
        });

        for (let i = 0; i < TOTAL_CARDS; i++) {
          const c = cards[i];
          if (c.flightActive) {
            updateCardBezierFlight(c);
          } else if (c.slotIndex !== -1) {
            const slot = receiverSlots[c.slotIndex];
            c.pos.copy(slot.group.position);
            c.quat.copy(camera.quaternion).multiply(backRotation);
            c.quat.setFromEuler(c.rot);
            c.scale = slot.targetScale;
            c.mesh.scale.setScalar(c.scale);
            c.rimGlow = 0.48;
            c.glintPhase = Math.sin(state.globalTime * 1.6 + c.slotIndex) * 0.65;
          }
        }

        const baseSpacingX = layoutMetrics.fanSpacingX;
        const baseScaleCenter = layoutMetrics.fanBaseScale;

        for (let listIdx = 0; listIdx < availCards.length; listIdx++) {
          const c = availCards[listIdx];
          c.springOmega = 14.0;

          const wasVisible = c.mesh.visible;
          const offset = window.TarotCarousel.offset(listIdx, state.fanFocusIndex, availCards.length);
          c.mesh.visible = Math.abs(offset) < 4.6;
          if (!c.mesh.visible) continue;
          const waveDelay = Math.abs(window.TarotCarousel.offset(listIdx, 38, TOTAL_CARDS)) * 0.022;
          const waveProgress = smootherstep(clamp((t - waveDelay) / 0.72, 0, 1));

          const absOff = Math.abs(offset);

          const isHovered = (state.hoveredCardIndex === c.index);
          c.hoverAmount = lerp(c.hoverAmount, isHovered ? 1.0 : 0.0, 1 - Math.exp(-15 * dt));

          const sign = Math.sign(offset);
          const compressedOff = sign * (absOff + Math.min(absOff, 1.0) * 0.14);
          const spreadX = compressedOff * baseSpacingX + (layoutMetrics.fanBaseX || 0);

          const spreadY = (layoutMetrics.fanBaseY || 0) + 0.08 - Math.pow(absOff, 1.35) * 0.052 + c.hoverAmount * 0.14;
          const spreadZ = 0.85 - absOff * 0.52 + (absOff < 0.5 ? (0.5 - absOff) * 0.45 : 0) + c.hoverAmount * 0.25;

          const centerProminence = Math.exp(-absOff * absOff * 0.45);
          let targetScale = clamp(baseScaleCenter * (1 - absOff * .135), baseScaleCenter * .40, baseScaleCenter * 1.04) + (centerProminence * .06 + c.hoverAmount * .04) * baseScaleCenter;

          let finalZ = spreadZ;
          if (absOff > 3.35) {
            const hideFactor = clamp((absOff - 3.35) / 1.2, 0, 1);
            finalZ = lerp(spreadZ, -9.5 - absOff * 0.2, hideFactor);
            targetScale = lerp(targetScale, 0.35, hideFactor);
          }

          const stackZ = (TOTAL_CARDS - 1 - c.index) * 0.024 - 0.3;

          c.targetPos.set(
            lerp(0, spreadX, waveProgress),
            lerp(-0.15, spreadY, waveProgress),
            lerp(stackZ, finalZ, waveProgress)
          );

          const tiltZ = -offset * 0.028 * waveProgress;
          const yawY = Math.PI - offset * 0.065 * waveProgress;
          const pitchX = c.hoverAmount * 0.08 * waveProgress;

          c.targetRot.set(pitchX, yawY, tiltZ);
          c.targetScale = lerp(0.92, targetScale, waveProgress);

          c.rimGlow = centerProminence * 0.45 + c.hoverAmount * 0.65;
          c.glintPhase = offset * 0.35 + c.hoverAmount * 0.3;

          if (!wasVisible && t > 1.5) {
            // A recycled card enters from the hidden outer edge, never across the centre.
            c.pos.copy(c.targetPos); c.rot.copy(c.targetRot); c.quat.setFromEuler(c.rot);
            c.scale = c.targetScale; c.mesh.scale.setScalar(c.scale);
            c.vel.set(0, 0, 0); c.scaleVel = 0;
          }
          stepCardSpringTransform(c, dt);
        }
      }

      const _flightTargetEuler = new THREE.Euler();
      const _flightTargetQuaternion = new THREE.Quaternion();
      function updateCardBezierFlight(c) {
        const elapsed = state.globalTime - c.flightStartTime;
        const rawT = clamp(elapsed / c.flightDuration, 0, 1);
        // C2-continuous quintic easing for ultra-silky flight takeoff and docking
        const e = smootherstep(rawT);

        // If flying into a receiver slot during FAN, keep p3 & endScale locked to the live projected slot transform
        if (state.act === 'FAN' && c.slotIndex !== -1) {
          const slot = receiverSlots[c.slotIndex];
          c.p3.copy(slot.group.position);
          c.endScale = slot.targetScale;
          _flightTargetEuler.setFromQuaternion(_flightTargetQuaternion.copy(camera.quaternion).multiply(backRotation));
          c.endQuat.setFromEuler(_flightTargetEuler);
        }

        evalCubicBezier3D(c.p0, c.p1, c.p2, c.p3, e, c.pos);

        // Smooth Quaternion interpolation + subtle mid-flight banking roll that vanishes smoothly at landing
        c.quat.copy(c.startQuat).slerp(c.endQuat, e);
        const midArc = Math.sin(rawT * Math.PI) * (1.0 - rawT * 0.35);
        c.rot.setFromQuaternion(c.quat);
        c.rot.x += midArc * 0.18;
        c.rot.z += midArc * 0.06;
        c.quat.setFromEuler(c.rot);

        c.scale = lerp(c.startScale, c.endScale, e);
        c.mesh.scale.setScalar(c.scale);

        c.glintPhase = lerp(-1.25, 1.25, e);
        c.rimGlow = 0.42 + midArc * 0.58;

        if (rawT >= 1.0) {
          c.flightActive = false;
          if (c.onFlightComplete) {
            const cb = c.onFlightComplete;
            c.onFlightComplete = null;
            cb();
          }
        }
      }

      function updateActAscend(dt, t) {
        receiverSlots.forEach(s => {
          s.pulseFrame.material.opacity = lerp(s.pulseFrame.material.opacity, 0, dt * 6);
        });

        for (let i = 0; i < TOTAL_CARDS; i++) {
          const c = cards[i];
          if (c.flightActive) {
            updateCardBezierFlight(c);
          } else if (c.slotIndex === -1) {
            // Unselected spread cards fold and recede cleanly into deep nocturnal space without crossing
            c.springOmega = 6.5;
            c.targetPos.set(c.pos.x * 1.05, -0.6, -13.5 - i * 0.08);
            c.targetRot.set(0, Math.PI, 0);
            c.targetScale = 0.72;
            c.rimGlow = lerp(c.rimGlow, 0, dt * 6);
            stepCardSpringTransform(c, dt);
          }
        }
      }

      function updateActReveal(dt, t) {
        const heroXs = layoutMetrics.revealHeroXs;
        const heroY = layoutMetrics.revealHeroY;
        const heroZs = [0.0, 0.0, 0.0, 0.0];
        const baseScale = layoutMetrics.revealHeroScale;

        if (state.inspectedSlot !== -1) {
          const focusX = heroXs[state.inspectedSlot];
          state.camTargetPos.set(focusX * 0.85, layoutMetrics.revealHeroYs[state.inspectedSlot] + 0.02, layoutMetrics.revealInspectCamZ);
          state.camTargetLookAt.set(focusX * 0.96, layoutMetrics.revealHeroYs[state.inspectedSlot] + 0.02, 0.25);
        } else {
          state.camTargetPos.set(
            state.smoothPointer.x * 0.24,
            0.14 + state.smoothPointer.y * 0.16,
            layoutMetrics.revealCamZ
          );
          state.camTargetLookAt.set(0, 0.12, 0);
        }

        glintLight.position.set(
          state.smoothPointer.x * 4.2,
          1.2 + state.smoothPointer.y * 2.8,
          4.2
        );

        state.selectedCards.forEach((c, slotIdx) => {
          const isHovered = (state.hoveredCardIndex === c.index);
          c.hoverAmount = lerp(c.hoverAmount, isHovered ? 1.0 : 0.0, 1 - Math.exp(-12 * dt));
          const floatIdle = Math.sin(state.globalTime * 1.7 + slotIdx * 1.3) * 0.038;

          // If user has NOT tapped this card yet, keep it face-down, breathing gently & inviting touch
          if (!c.flipRequested) {
            const hoverLiftY = c.hoverAmount * 0.12;
            const hoverPullZ = c.hoverAmount * 0.22;
            c.pos.set(
              heroXs[slotIdx],
              layoutMetrics.revealHeroYs[slotIdx] + floatIdle + hoverLiftY,
              heroZs[slotIdx] + hoverPullZ
            );
            const tiltX = clamp(-state.smoothPointer.y * 0.12, -0.15, 0.15) * (0.4 + c.hoverAmount * 0.6);
            const tiltY = clamp(state.smoothPointer.x * 0.14, -0.16, 0.16) * (0.4 + c.hoverAmount * 0.6);
            c.rot.set(tiltX, Math.PI + tiltY, 0);
            c.quat.setFromEuler(c.rot);
            c.scale = baseScale * (1.0 + c.hoverAmount * 0.04);
            c.mesh.scale.setScalar(c.scale);

            // Subtle breathing golden rim & glint so user sees the card is interactive
            c.rimGlow = 0.28 + 0.22 * Math.sin(state.globalTime * 2.6 + slotIdx) + c.hoverAmount * 0.45;
            c.glintPhase = Math.sin(state.globalTime * 1.1 + slotIdx) * 0.75;
            c.haloMat.opacity = lerp(c.haloMat.opacity, 0.15 + c.hoverAmount * 0.2, dt * 4);
            return;
          }

          // Card flip has been triggered by the user!
          const localFlipTime = state.globalTime - c.flipStartTime;
          const u = clamp(localFlipTime / c.flipDuration, 0, 1);

          if (u >= 0.48 && !c.isFlipped) {
            c.isFlipped = true;
            sound.playRevealResonance(slotIdx);
            spawnRevealMotesForCard(c.pos, slotIdx);
            if (captionEls[slotIdx]) {
              captionEls[slotIdx].classList.remove('ready-to-flip');
              captionEls[slotIdx].classList.add('shown');
            }
          }

          if (u >= 1) c.flipComplete = true;
          const flipDelta = evaluateHeroFlipAngle(u);
          const baseRotY = Math.PI - flipDelta;

          const liftBell = Math.sin(u * Math.PI);
          const inspectWeight = smoothstep(0.75, 1.0, u);
          const tiltX = clamp(-state.smoothPointer.y * 0.19, -0.2, 0.2) * inspectWeight;
          const tiltY = clamp(state.smoothPointer.x * 0.22, -0.22, 0.22) * inspectWeight;

          const isFocused = (state.inspectedSlot === slotIdx);
          const focusPullZ = isFocused ? 0.55 : 0.0;

          c.pos.set(
            heroXs[slotIdx],
            layoutMetrics.revealHeroYs[slotIdx] + liftBell * 0.34 + floatIdle + c.hoverAmount * 0.06,
            heroZs[slotIdx] + liftBell * 0.52 + focusPullZ + c.hoverAmount * 0.12
          );

          c.rot.set(
            liftBell * 0.14 + tiltX,
            baseRotY + tiltY,
            Math.sin(u * TAU) * 0.045 * (1 - u * 0.5) + (c.data?.isReversed ? Math.PI * smootherstep(u) : 0)
          );
          c.quat.setFromEuler(c.rot);

          c.scale = baseScale * (1.0 + liftBell * 0.06 + c.hoverAmount * 0.025);
          c.mesh.scale.setScalar(c.scale);

          if (u < 1.0) {
            c.glintPhase = lerp(-1.25, 1.25, u);
            c.rimGlow = Math.sin(u * Math.PI) * 0.95;
          } else {
            c.glintPhase = (state.smoothPointer.x * 0.85 + state.smoothPointer.y * 0.45) + (slotIdx - 1) * 0.22;
            c.rimGlow = 0.24 + c.hoverAmount * 0.48;
          }

          const haloTarget = smoothstep(0.42, 0.92, u) * 0.68;
          c.haloMat.opacity = lerp(c.haloMat.opacity, haloTarget, dt * 5);
        });

        for (let i = 0; i < TOTAL_CARDS; i++) {
          const c = cards[i];
          if (c.slotIndex === -1) {
            c.pos.z = lerp(c.pos.z, -14.5 - i * 0.05, dt * 3);
          }
        }
      }

      /* ============================================================================
       * 9. INTERACTION HANDLERS (Raycasting, Spread Carousel Controls, Hold-to-Shuffle)
       * ============================================================================ */
      const raycaster = new THREE.Raycaster();
      raycaster.layers.enable(1);
      const rayCandidateMeshes = [], rayHits = [];
      let hoverPending = false;
      const pointerState = {
        isDown: false,
        isDragging: false,
        startX: 0,
        startY: 0,
        lastX: 0,
        downTime: 0
      };

      // Unlock Web Audio automatically on the very first user gesture anywhere in the window
      window.addEventListener('pointerdown', event => {
        if (!event.isTrusted) return;
        sound.unlockOnGesture();
        if (event.target.closest?.('button, summary, .spread-picker label, .tone-picker label')) sound.playUiClick(.95);
      }, { passive: true });
      window.addEventListener('keydown', event => {
        if (event.isTrusted) sound.unlockOnGesture();
      }, { passive: true });

      function updatePointerNDC(clientX, clientY) {
        state.pointerNDC.x = (clientX / window.innerWidth) * 2 - 1;
        state.pointerNDC.y = -(clientY / window.innerHeight) * 2 + 1;
      }

      function performCardRaycast() {
        raycaster.setFromCamera(state.pointerNDC, camera);
        const candidateMeshes = rayCandidateMeshes; candidateMeshes.length = 0; rayHits.length = 0;
        if (state.inputBlocked) return null;

        if (state.act === 'FAN') {
          const avail = getAvailableFanCards();
          avail.forEach((c, listIdx) => {
            if (c.mesh.visible && Math.abs(window.TarotCarousel.offset(listIdx, state.fanFocusIndex, avail.length)) <= 3.4) {
              candidateMeshes.push(c.mesh);
            }
          });
        } else if (state.act === 'REVEAL') {
          state.selectedCards.forEach(c => candidateMeshes.push(c.mesh));
        }

        if (candidateMeshes.length === 0) {
          state.hoveredCardIndex = -1;
          state.lastHoveredCardIndex = -1;
          container.classList.remove('pointer-card');
          return null;
        }

        const hits = raycaster.intersectObjects(candidateMeshes, false, rayHits);
        if (hits.length > 0) {
          const hitMesh = hits[0].object;
          const found = cards.find(c => c.mesh === hitMesh);
          if (found) {
            state.hoveredCardIndex = found.index;
            if (state.lastHoveredCardIndex !== found.index) {
              state.lastHoveredCardIndex = found.index;
              sound.playHoverBrush(state.pointerNDC.x * 0.5);
            }
            container.classList.add('pointer-card');
            return found;
          }
        }
        state.hoveredCardIndex = -1;
        state.lastHoveredCardIndex = -1;
        container.classList.remove('pointer-card');
        return null;
      }

      container.addEventListener('pointerdown', (e) => {
        if (state.inputBlocked || !e.isPrimary || e.button !== 0) return;
        pointerState.pointerId = e.pointerId; container.setPointerCapture(e.pointerId);
        sound.unlockOnGesture();
        updatePointerNDC(e.clientX, e.clientY);
        pointerState.isDown = true;
        pointerState.isDragging = false;
        pointerState.startX = e.clientX;
        pointerState.startY = e.clientY;
        pointerState.lastX = e.clientX;
        pointerState.downTime = performance.now();
      });

      window.addEventListener('pointermove', (e) => {
        if (state.inputBlocked || (pointerState.isDown && e.pointerId !== pointerState.pointerId)) return;
        updatePointerNDC(e.clientX, e.clientY);

        if (pointerState.isDown && state.act === 'FAN') {
          const dx = e.clientX - pointerState.lastX;
          const totalDx = Math.abs(e.clientX - pointerState.startX);
          if (totalDx > 6) {
            pointerState.isDragging = true;
            container.classList.add('dragging');
          }
          if (pointerState.isDragging) {
            const sensitivity = isMobile ? 0.015 : 0.011;
            state.fanTargetIndex -= dx * sensitivity;
            const now = performance.now(), seconds = Math.max(.008, (now - (pointerState.lastMoveTime || now - 16)) / 1000);
            state.fanVelocity = (-dx * sensitivity) / seconds;
          }
          pointerState.lastX = e.clientX;
          pointerState.lastMoveTime = performance.now();
        } else if (!pointerState.isDown) {
          hoverPending = true;
        }
      });

      window.addEventListener('pointerup', (e) => {
        if (!pointerState.isDown || e.pointerId !== pointerState.pointerId) return;
        pointerState.isDown = false;
        container.classList.remove('dragging');

        const clickDuration = performance.now() - pointerState.downTime;
        const movedDist = Math.hypot(e.clientX - pointerState.startX, e.clientY - pointerState.startY);

        if (!pointerState.isDragging && movedDist < 14 && clickDuration < 500) {
          updatePointerNDC(e.clientX, e.clientY);
          const hitCard = performCardRaycast();

          if (state.act === 'FAN' && hitCard) {
            const avail = getAvailableFanCards();
            const clickedListIdx = avail.indexOf(hitCard);
            if (clickedListIdx !== -1) {
              selectCardFromFan(hitCard);
            }
          } else if (state.act === 'REVEAL') {
            if (hitCard && hitCard.slotIndex !== -1) {
              // Tapping a card in REVEAL flips it if unflipped, or toggles close-up inspection if already flipped!
              triggerSingleCardFlip(hitCard.slotIndex);
            } else if (state.inspectedSlot !== -1) {
              state.inspectedSlot = -1;
              sound.playPaperRustle(0.35, 0.9, 0);
              updateRevealActionUI();
            }
          }
        }
        pointerState.isDragging = false;
      });

      // Allow tapping the bottom caption badges ("✦ Chạm để mở" / Quá Khứ, Hiện Tại, Tương Lai) or top helper button to flip
      captionEls.forEach((capEl, idx) => {
        capEl.addEventListener('click', (e) => {
          e.stopPropagation();
          sound.unlockOnGesture();
          if (state.act === 'REVEAL') {
            triggerSingleCardFlip(idx);
          }
        });
      });

      btnFlipNextEl.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.unlockOnGesture();
        if (state.act !== 'REVEAL') return;
        const nextIdx = state.selectedCards.findIndex(c => !c.flipRequested);
        if (nextIdx !== -1) {
          triggerSingleCardFlip(nextIdx);
        }
      });

      // Spread Carousel UI Controls (<, >, Slider, and "Rút lá đang xem")
      document.getElementById('btn-fan-prev').addEventListener('click', () => {
        sound.unlockOnGesture();
        if (state.act !== 'FAN') return;
        state.fanTargetIndex = Math.round(state.fanTargetIndex - 1);
        sound.playCardTick(-0.35, 1.06);
      });

      document.getElementById('btn-fan-next').addEventListener('click', () => {
        sound.unlockOnGesture();
        if (state.act !== 'FAN') return;
        state.fanTargetIndex = Math.round(state.fanTargetIndex + 1);
        sound.playCardTick(0.35, 0.96);
      });

      spreadSliderEl.addEventListener('input', (e) => {
        sound.unlockOnGesture();
        if (state.act !== 'FAN' || state.picking) return;
        const count = getAvailableFanCards().length;
        state.fanTargetIndex = window.TarotCarousel.nearest(parseFloat(e.target.value), state.fanFocusIndex, count);
        state.fanVelocity = 0;
      });

      btnDrawCurrentEl.addEventListener('click', () => {
        sound.unlockOnGesture();
        if (state.act !== 'FAN') return;
        const avail = getAvailableFanCards();
        if (avail.length === 0) return;
        const centerListIdx = window.TarotCarousel.wrap(Math.round(state.fanFocusIndex), avail.length);
        const chosenCard = avail[centerListIdx];
        if (chosenCard) {
          selectCardFromFan(chosenCard);
        }
      });

      // Keyboard Left/Right/Enter support during FAN & REVEAL
      window.addEventListener('keydown', (e) => {
        if (state.inputBlocked || e.target.closest?.('input, textarea, select, dialog')
            || (e.target.closest?.('button') && (e.key === 'Enter' || e.key === ' '))) return;
        sound.unlockOnGesture();
        if (state.act === 'FAN') {
          if (e.key === 'ArrowLeft') {
            state.fanTargetIndex = Math.round(state.fanTargetIndex - 1);
            sound.playCardTick(-0.3, 1.05);
          } else if (e.key === 'ArrowRight') {
            state.fanTargetIndex = Math.round(state.fanTargetIndex + 1);
            sound.playCardTick(0.3, 0.96);
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            btnDrawCurrentEl.click();
          }
        } else if (state.act === 'REVEAL') {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const nextIdx = state.selectedCards.findIndex(c => !c.flipRequested);
            if (nextIdx !== -1) triggerSingleCardFlip(nextIdx);
          } else if (e.key === '1') {
            triggerSingleCardFlip(0);
          } else if (e.key === '2') {
            triggerSingleCardFlip(1);
          } else if (e.key === '3') {
            triggerSingleCardFlip(2);
          } else if (e.key === '4') {
            triggerSingleCardFlip(3);
          } else if (e.key === 'Escape') {
            state.inspectedSlot = -1; updateRevealActionUI();
          }
        }
      });

      // "Giữ để xáo" Interactive Hold Button Events
      function startHoldShuffle(e) {
        if (state.act !== 'SHUFFLE' || state.isHoldingShuffle) return;
        if (e?.pointerId !== undefined && (!e.isPrimary || e.button !== 0)) return;
        e?.preventDefault(); sound.unlockOnGesture();
        holdPointerId = e?.pointerId ?? null;
        if (holdPointerId !== null) holdBtnEl.setPointerCapture(holdPointerId);
        state.holdStarted = state.globalTime; state.isHoldingShuffle = true; state.autoHoldActive = false;
        holdBtnEl.classList.add('holding'); holdLabelEl.textContent = 'Đang xáo dòng bài…';
        sound.playPaperRustle(.75, 1.02, 0);
        window.TarotMobile?.feel('shuffle');
      }

      function endHoldShuffle(e) {
        if (!state.isHoldingShuffle || (e?.pointerId !== undefined && e.pointerId !== holdPointerId)) return;
        state.isHoldingShuffle = false; holdPointerId = null; holdBtnEl.classList.remove('holding'); holdLabelEl.textContent = 'Giữ để xáo';
        if (e?.type !== 'pointercancel' && state.globalTime - state.holdStarted > .45) enterActGather();
      }

      holdBtnEl.addEventListener('pointerdown', startHoldShuffle);
      window.addEventListener('pointerup', endHoldShuffle);
      window.addEventListener('pointercancel', endHoldShuffle);

      // Control Dock Navigation Buttons
      const btnPlayAll = document.getElementById('btn-play-all');
      const btnShuffle = document.getElementById('btn-shuffle');
      const btnFanMode = document.getElementById('btn-fan-mode');
      const btnReveal = document.getElementById('btn-reveal');
      const btnReplay = document.getElementById('btn-replay');

      function setActiveDockButton(activeBtn) {
        [btnPlayAll, btnShuffle, btnFanMode, btnReveal].forEach(b => b.classList.remove('active'));
        if (activeBtn) activeBtn.classList.add('active');
      }

      /* ============================================================================
       * 10. WINDOW RESIZE & MAIN DELTA-TIME RENDER LOOP
       * ============================================================================ */
      let viewportDirty = false;
      window.addEventListener('resize', () => { viewportDirty = true; spreadRectsDirty = true; });
      function applyViewportResize() {
        viewportDirty = false;
        const w = window.innerWidth;
        const h = window.innerHeight;
        computeResponsiveMetrics();
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        // One drawing-buffer allocation per renderer, even during a burst of resize events.
        renderer.setDrawingBufferSize(w, h, qualityRatio());
        overlayRenderer.setDrawingBufferSize(w, h, Math.min(renderer.getPixelRatio(), 1.5));
        renderer.domElement.style.width = overlayRenderer.domElement.style.width = '100%';
        renderer.domElement.style.height = overlayRenderer.domElement.style.height = '100%';
        if (state.act === 'REVEAL' || state.act === 'ASCEND') computeRevealLayout();
        nebulaUniforms.uResolution.value.set(w, h);
        dustMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
        refreshSlotDomRects();
        syncReceiverSlotsWithDOM();
      }

      // Application extension of the original 3D.html director.
let generation = 0, holdPointerId = null, frameRequest = 0, contextLost = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const backRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const scheduled = new Set(), faceCache = new Map();
let deckData = window.TAROT_CARDS.map(data => ({ ...data, isReversed: false }));
const overlayScene = new THREE.Scene();
const overlayRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
overlayRenderer.domElement.id = 'flight-layer';
overlayRenderer.domElement.setAttribute('aria-hidden', 'true');
overlayRenderer.setClearColor(0, 0); overlayRenderer.outputEncoding = THREE.sRGBEncoding;
overlayRenderer.toneMapping = renderer.toneMapping; overlayRenderer.toneMappingExposure = renderer.toneMappingExposure;
overlayRenderer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1.5)); overlayRenderer.setSize(innerWidth, innerHeight);
document.body.appendChild(overlayRenderer.domElement);
for (const light of [ambientLight, keyLight, fillLight, rimLight, glintLight]) overlayScene.add(light.clone());
const diagnostics = document.getElementById('scene-status');
// Let fades finish before pausing CSS animations that have become completely invisible.
for (const [parent, selector, visible] of [
  [document.getElementById('loading-veil'), '.loader-ring', element => !element.classList.contains('hidden')],
  [holdBtnEl, '.pulse-dot', element => element.classList.contains('visible')],
  [titlesBarEl, '.tap-to-flip-badge', element => element.classList.contains('visible')]
]) {
  const play = value => parent.querySelectorAll(selector).forEach(element => { element.style.animationPlayState = value ? 'running' : 'paused'; });
  play(visible(parent));
  new MutationObserver(() => { if (visible(parent)) play(true); else if (reducedMotion) play(false); }).observe(parent, { attributes: true, attributeFilter: ['class'] });
  parent.addEventListener('transitionend', event => {
    if (event.target === parent && ['opacity', 'visibility'].includes(event.propertyName) && !visible(parent)) play(false);
  });
}
const spreadObserver = new ResizeObserver(() => { spreadRectsDirty = true; });
for (const element of [spreadHeaderEl, spreadBottomEl, ...slotMiniFrames]) spreadObserver.observe(element);
for (const element of [spreadHeaderEl, spreadBottomEl]) {
  element.addEventListener('transitionrun', event => {
    if (event.target === element && event.propertyName === 'transform') { spreadTransitions.set(element, performance.now() + 1000); spreadRectsDirty = true; }
  });
  for (const type of ['transitionend', 'transitioncancel']) element.addEventListener(type, event => {
    if (event.target === element && event.propertyName === 'transform') { spreadTransitions.delete(element); spreadRectsDirty = true; }
  });
}
window.visualViewport?.addEventListener('resize', () => { spreadRectsDirty = true; });
let lastSignature = '', lastStage = '', frameTime = 0, frameCount = 0;

function schedule(callback, milliseconds) {
  const version = generation;
  const timer = setTimeout(() => { scheduled.delete(timer); if (version === generation) callback(); }, milliseconds);
  scheduled.add(timer); return timer;
}
function applyMaps(card, maps) {
  // Texture presence and shader features are unchanged; avoid recompiling the material.
  Object.assign(card.frontMat, maps);
  card.frontMat.map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
}
const faceJobs = [];
let facePumpScheduled = false;
let maxFaceTask = 0;
function faceStep(work, version) {
  return new Promise((resolve, reject) => { faceJobs.push({ work, version, resolve, reject }); pumpFaces(); });
}
function pumpFaces() {
  if (facePumpScheduled || !faceJobs.length) return;
  facePumpScheduled = true;
  requestAnimationFrame(() => setTimeout(() => {
    facePumpScheduled = false;
    const job = faceJobs[0];
    if (!job) return;
    if (job.version !== generation) { faceJobs.shift(); job.resolve(null); pumpFaces(); return; }
    const busy = state.picking || state.act === 'ASCEND' || state.act === 'GATHER' || state.act === 'INTRO'
      || state.isHoldingShuffle || state.selectedCards.some(card => card.flipRequested && !card.flipComplete);
    if (busy) { pumpFaces(); return; }
    faceJobs.shift();
    try {
      const start = performance.now(), result = job.work();
      maxFaceTask = Math.max(maxFaceTask, performance.now() - start); diagnostics.dataset.faceTaskMax = maxFaceTask.toFixed(1);
      job.resolve(result);
    } catch (error) { job.reject(error); }
    pumpFaces();
  }, 0));
}
function disposeFace(entry) {
  entry.disposed = true;
  if (entry.image?.startsWith('blob:')) URL.revokeObjectURL(entry.image);
  if (entry.maps && !entry.shared) Object.values(entry.maps).forEach(texture => texture.dispose());
}
function thumbnail(entry, canvas) {
  entry.imageReady = new Promise(resolve => canvas.toBlob(blob => {
    if (!blob || entry.disposed) { resolve(''); return; }
    entry.image = URL.createObjectURL(blob); resolve(entry.image);
  }, 'image/webp', .88));
}
function prepareFace(card) {
  card.data = deckData[card.index]; card.faceReadyDone = false; card.flipComplete = false;
  const data = card.data, version = generation;
  let entry = faceCache.get(data.id);
  if (!entry) {
    const hero = { '18': 0, '17': 1, '19': 2 }[data.id];
    entry = { shared: hero !== undefined, image: '' };
    entry.promise = (async () => {
      let maps;
      if (hero !== undefined) maps = heroMaps[hero];
      else {
        const image = new Image(); image.decoding = 'async';
        const success = await new Promise(resolve => {
          let settled = false;
          const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
          const timer = setTimeout(() => finish(false), 10000);
          image.onload = () => finish(true); image.onerror = () => finish(false); image.src = 'images/' + data.file;
        });
        const builder = await faceStep(() => {
        const builder = createSynchronizedArtBuilder(), ctx = builder.cCtx;
        const gradient = ctx.createLinearGradient(0, 0, TEX_W, TEX_H);
        gradient.addColorStop(0, '#18213d'); gradient.addColorStop(1, '#080d1d');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, TEX_W, TEX_H);
        if (success) {
          const width = 610, height = Math.min(1070, width * image.naturalHeight / image.naturalWidth);
          ctx.save(); roundedRectPath(ctx, 145, 172, 610, 1090, 22); ctx.clip();
          ctx.drawImage(image, 145, 172 + (1090 - height) / 2, width, height); ctx.restore();
        } else {
          builder.drawFoil(context => { drawEightPointStar(context, TEX_W / 2, TEX_H / 2, 160, 52); context.fill(); });
        }
        return builder;
        }, version);
        if (!builder) return null;
        await faceStep(() => { builder.applyPaperTextureOverlay(.045);
          drawOrnateTarotFrame(builder.drawFoil, true, data.id.toUpperCase(), data.viName.toUpperCase()); }, version);
        maps = await faceStep(() => builder.compileMaps(renderer), version);
        if (!maps) return null;
      }
      entry.maps = maps; thumbnail(entry, maps.map.image);
      if (!entry.shared) for (const texture of Object.values(maps)) {
        if (await faceStep(() => { renderer.initTexture(texture); return true; }, version) === null) { disposeFace(entry); return null; }
      }
      return entry;
    })().catch(() => { card.faceFailed = true; disposeFace(entry); return null; }).then(result => {
      if (!result && faceCache.get(data.id) === entry) faceCache.delete(data.id);
      return result;
    });
    faceCache.set(data.id, entry);
  }
  return entry.promise.then(result => {
    if (!result || result.disposed || version !== generation || card.data.id !== data.id) return;
    card.faceMaps = result.maps;
    if (state.act === 'REVEAL') applyMaps(card, result.maps);
    card.image = result.image || 'images/' + data.file; card.faceReadyDone = true;
    result.imageReady?.then(url => { if (url && version === generation && card.data.id === data.id) card.image = url; });
    const color = window.TarotReading.themeFor(SPREAD_STEP_NAMES[card.slotIndex], card.slotIndex).color;
    card.sharedUniforms.uRimColor.value.set(color);
    const caption = captionEls[card.slotIndex];
    if (caption) {
      caption.querySelector('.revealed-name').textContent = data.viName;
      caption.querySelector('.revealed-numeral').textContent = '';
      caption.querySelector('.revealed-sub').textContent = data.isReversed ? 'Bài ngược' : 'Bài xuôi';
    }
  });
}
function computeRevealLayout() {
  const w = innerWidth, h = innerHeight, landscape = h < 500 && w > 640;
  const columns = activeCount === 4 && w < 768 && h > w ? 2 : activeCount;
  const rows = Math.ceil(activeCount / columns), areaWidth = landscape ? w - 285 : w;
  const top = landscape ? 125 : Math.max(170, document.getElementById('reveal-action-bar').getBoundingClientRect().bottom + 26);
  const bottom = landscape ? h - 20 : h - 130;
  const cellHeight = Math.max(100, bottom - top) / rows;
  const pixelHeight = Math.max(42, Math.min(340, cellHeight - 66, (areaWidth * .9 / columns - 18) * CARD_H / CARD_W));
  const depth = layoutMetrics.revealCamZ;
  const units = 2 * depth * Math.tan(camera.fov * Math.PI / 360) / h;
  const spacing = pixelHeight * CARD_W / CARD_H + (w < 768 ? 14 : 28);
  layoutMetrics.revealHeroScale = pixelHeight * units / CARD_H;
  layoutMetrics.revealHeroXs = []; layoutMetrics.revealHeroYs = [];
  for (let i = 0; i < activeCount; i++) {
    const sx = (landscape ? 12 : 0) + areaWidth / 2 + (i % columns - (columns - 1) / 2) * spacing;
    const sy = top + Math.floor(i / columns) * cellHeight + (cellHeight - 62) / 2;
    layoutMetrics.revealHeroXs.push((sx - w / 2) * units);
    layoutMetrics.revealHeroYs.push((h / 2 - sy) * units + .12);
  }
}
function recordDockError(card, slotIndex) {
  camera.updateMatrixWorld(true); const r = slotMiniFrames[slotIndex].getBoundingClientRect();
  const center = card.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
  const error = Math.hypot((center.x + 1) * innerWidth / 2 - r.left - r.width / 2,
    (1 - center.y) * innerHeight / 2 - r.top - r.height / 2);
  diagnostics.dataset.dockError = error.toFixed(3);
  slotDomBoxes[slotIndex].classList.add('filled');
}
function computeFanLayout() {
  const w = innerWidth, h = innerHeight, landscape = h < 500 && w > 640;
  const top = spreadBounds.headerBottom + 18, bottom = landscape ? h - 75 : spreadBounds.controlsTop - 20;
  const areaWidth = landscape ? w - 300 : w;
  const units = 2 * layoutMetrics.fanCamZ * Math.tan(camera.fov * Math.PI / 360) / h;
  const size = Math.max(.18, Math.min(.98, Math.max(60, bottom - top) * units / CARD_H * .8, areaWidth * units * .40 / CARD_W));
  layoutMetrics.fanBaseScale = size;
  layoutMetrics.fanSpacingX = size * 1.85;
  layoutMetrics.fanBaseX = ((landscape ? areaWidth / 2 + 12 : w / 2) - w / 2) * units;
  layoutMetrics.fanBaseY = (h / 2 - (top + bottom) / 2) * units - .08;
}
const homeBounds = { top: 145, bottom: innerHeight * .55 };
const homePlacement = { center: innerHeight * .26, height: innerHeight * .24 };
function refreshHomeBounds() {
  if (innerWidth >= 768 || innerHeight <= innerWidth || document.getElementById('welcome-panel').hidden) return;
  const heading = document.querySelector('.welcome-heading').getBoundingClientRect();
  const form = document.getElementById('intent-form').getBoundingClientRect();
  if (form.height > 0) { homeBounds.top = heading.bottom + 14; homeBounds.bottom = form.top - 16; }
}
const homeObserver = new ResizeObserver(refreshHomeBounds);
homeObserver.observe(document.getElementById('intent-form'));
homeObserver.observe(document.querySelector('.welcome-heading'));
window.addEventListener('resize', refreshHomeBounds);
document.getElementById('welcome-panel').addEventListener('animationend', refreshHomeBounds);
const captionCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const captionStyleCache = captionEls.map(() => ({ transform: '', width: '' }));
// Three light ribbons are allocated once, alongside the original particles and astrolabe.
const introOrbits = new THREE.Group(); scene.add(introOrbits);
const introDepths = [-2.6, 2.6, 0];
const introTrails = [0xD2B5FA, 0xF8E5B8, 0x78DCD6].map(color => {
  const positions = new Float32Array(72 * 3), colors = new Float32Array(72 * 3), tint = new THREE.Color(color);
  for (let j = 0; j < 72; j++) {
    const light = Math.pow(j / 71, 1.7);
    colors.set([tint.r * light, tint.g * light, tint.b * light], j * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Line(geometry, material); line.frustumCulled = false; introOrbits.add(line);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: particleTex, color, transparent: true,
    opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  introOrbits.add(glow);
  return { positions, geometry, material, glow };
});
function updateHome(dt) {
  const intro = state.act === 'INTRO';
  let blend = intro ? clamp((state.actTime - .15) / 6.2, 0, 1) : 1;
  if (intro && state.introSkipAt !== null) blend = lerp(state.introSkipFrom, 1, smootherstep((state.actTime - state.introSkipAt) / .95));
  state.introBlend = blend;
  const t = reducedMotion ? 0 : state.globalTime;
  const z = layoutMetrics.introCamZ;
  const viewHeight = 2 * z * Math.tan(camera.fov * Math.PI / 360), unit = viewHeight / innerHeight;
  const viewWidth = viewHeight * innerWidth / innerHeight;
  const compact = innerWidth < 768, portrait = compact && innerHeight > innerWidth;
  const homeEase = 1 - Math.exp(-9 * dt);
  homePlacement.center = lerp(homePlacement.center, (homeBounds.top + homeBounds.bottom) / 2, homeEase);
  homePlacement.height = lerp(homePlacement.height, Math.max(58, Math.min(230, (homeBounds.bottom - homeBounds.top) * .84)), homeEase);
  const centerX = compact ? 0 : innerWidth * .225 * unit;
  const centerY = portrait ? (innerHeight / 2 - homePlacement.center) * unit : compact ? viewHeight * .27 : 0;
  const size = portrait ? Math.min(.68, homePlacement.height * unit / CARD_H) : compact ? Math.min(.68, viewHeight * .24 / CARD_H) : Math.min(1.05, viewHeight * .53 / CARD_H, viewWidth * .14 / CARD_W);
  const orbit = smootherstep((blend - .08) / .52), gather = smootherstep((blend - .60) / .23);
  const land = smootherstep((blend - .83) / .17);
  const heroSize = Math.min(.92, viewWidth * .19 / CARD_W, viewHeight * .25 / CARD_H);
  const radiusX = Math.min(2.35, viewWidth * .20), radiusY = Math.min(1.18, viewHeight * .12);
  const cameraArc = intro ? Math.sin(orbit * Math.PI) * (1 - gather) : 0;
  state.camTargetPos.set(cameraArc * .24, .14 + cameraArc * .12, z + (1 - gather) * .65);
  state.camTargetLookAt.set(0, .12, 0);
  const pitch = state.smoothPointer.y * .045, yaw = state.smoothPointer.x * .065;
  introOrbits.visible = intro;
  cards.forEach((card, index) => {
    card.mesh.visible = index < 3; if (index >= 3) return;
    const localX = (index - 1) * (compact ? CARD_W * size * .72 : Math.min(1.18, viewWidth * .115));
    const localY = Math.sin(t * .8 + index) * .04;
    const finalX = centerX + localX, finalY = centerY + localY, finalZ = index === 1 ? .82 : 0;
    if (intro) {
      const enter = smootherstep((blend - index * .018) / .25);
      const angle = -.5 * Math.PI + index * TAU / 3 + orbit * TAU * .82;
      // Each card owns a separate depth plane for the full orbit and turn.
      // First settle XY/rotation; only then compress depth into the home fan.
      const depth = introDepths[index] * heroSize;
      const orbitX = Math.cos(angle) * radiusX;
      const orbitY = Math.sin(angle) * radiusY - (1 - enter) * viewHeight * .28;
      card.pos.set(lerp(orbitX, finalX, gather), lerp(orbitY, finalY, gather), lerp(depth, finalZ, land));
      const turn = 1 - smootherstep((blend - index * .018) / .42);
      card.rot.set(lerp(Math.cos(angle) * .13, -.035 + pitch, gather),
        lerp(Math.PI + turn * TAU + Math.sin(angle) * .32, Math.PI + (1 - index) * .22 + yaw, gather),
        lerp(Math.sin(angle + .7) * .30, (1 - index) * .10, gather));
      card.scale = lerp(heroSize * (.08 + .92 * enter), size, gather);
      card.glintPhase = lerp(-1.7 + enter * 3.0 + Math.sin(angle) * .4, Math.sin(t * .4 + index) * 1.15, land);
      card.rimGlow = .16 + (1 - gather) * (.22 + Math.sin(enter * Math.PI) * .36);
      const trail = introTrails[index], opacity = Math.sin(enter * Math.PI / 2) * (1 - gather) * .50;
      for (let j = 0; j < 72; j++) {
        const tailAngle = angle - (1 - j / 71) * 1.15;
        const offset = j * 3;
        trail.positions[offset] = Math.cos(tailAngle) * radiusX;
        trail.positions[offset + 1] = Math.sin(tailAngle) * radiusY;
        trail.positions[offset + 2] = depth - .10;
      }
      trail.geometry.attributes.position.needsUpdate = true; trail.material.opacity = opacity;
      trail.glow.position.set(orbitX, Math.sin(angle) * radiusY, depth - .08);
      trail.glow.scale.setScalar(heroSize * .22); trail.glow.material.opacity = opacity * 1.5;
    } else {
      card.pos.set(finalX, finalY, finalZ);
      card.rot.set(-.035 + pitch, Math.PI + (1 - index) * .22 + yaw, (1 - index) * .10);
      card.scale = size; card.glintPhase = Math.sin(t * .4 + index) * 1.15; card.rimGlow = .16;
    }
    card.mesh.scale.setScalar(card.scale);
  });
  if (intro && blend >= 1) { state.act = 'HOME'; state.actTime = 0; introOrbits.visible = false; }
}
function projectCaptions() {
  if (state.act !== 'REVEAL') return;
  state.selectedCards.forEach((card, index) => {
    let left = Infinity, right = -Infinity, bottom = -Infinity;
    for (let i = 0; i < 4; i++) {
      const point = captionCorners[i].set(i % 2 ? CARD_W / 2 : -CARD_W / 2, i < 2 ? -CARD_H / 2 : CARD_H / 2, 0).applyMatrix4(card.mesh.matrixWorld).project(camera);
      const x = (point.x + 1) * innerWidth / 2, y = (1 - point.y) * innerHeight / 2;
      left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    const caption = captionEls[index];
    const cache = captionStyleCache[index];
    const transform = 'translate3d(' + ((left + right) / 2).toFixed(2) + 'px,' + (bottom + 8).toFixed(2) + 'px,0) translateX(-50%)';
    const width = Math.round(Math.max(75, Math.min(210, (right - left) * 1.2))) + 'px';
    if (cache.transform !== transform) { caption.style.transform = transform; cache.transform = transform; }
    if (cache.width !== width) { caption.style.width = width; cache.width = width; }
  });
}
function publishState(dt) {
  projectCaptions();
  const drawDisabled = state.picking || state.selectedCards.length >= activeCount || state.actTime < .8;
  if (btnDrawCurrentEl.disabled !== drawDisabled) btnDrawCurrentEl.disabled = drawDisabled;
  const completed = state.selectedCards.filter(c => c.flipComplete).length;
  const signature = [state.act, state.selectedCards.length, completed, !!state.picking, state.inspectedSlot].join(':');
  if (lastStage !== state.act) {
    lastStage = state.act; document.body.dataset.act = state.act;
    if (state.act === 'REVEAL') computeRevealLayout();
    window.dispatchEvent(new CustomEvent('tarot:stage', { detail: state.act }));
  }
  if (signature !== lastSignature) {
    lastSignature = signature;
    Object.assign(diagnostics.dataset, { act: state.act, selected: state.selectedCards.length, opened: completed, picking: !!state.picking, inspected: state.inspectedSlot });
    window.dispatchEvent(new CustomEvent('tarot:selection', { detail: window.TarotExperience.snapshot() }));
  }
  frameTime += dt; frameCount++;
  if (frameTime > 2) {
    const ms = frameTime / frameCount * 1000; diagnostics.dataset.frameMs = ms.toFixed(1);
    // Never resize the GPU drawing buffer while a card is being picked, flying or flipping.
    const quiet = state.act === 'HOME' && state.actTime > 3 && !document.querySelector('dialog[open]');
    if (quiet && ms > 30 && renderer.getPixelRatio() > 1.2 && state.globalTime - (state.lastQualityChange || 0) > 12) {
      renderer.setPixelRatio(Math.max(1.2, renderer.getPixelRatio() * .9)); state.lastQualityChange = state.globalTime;
    }
    frameTime = frameCount = 0;
  }
}
window.TarotExperience = {
  start(spread) {
    this.home(false); activeCount = spread.count; SPREAD_STEP_NAMES = spread.slots.map(s => s.title);
    document.body.style.setProperty('--slot-count', activeCount);
    deckData = window.TAROT_CARDS.map(data => ({ ...data, isReversed: Math.random() < .38 }));
    for (let i = deckData.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deckData[i], deckData[j]] = [deckData[j], deckData[i]]; }
    cards.forEach((card, index) => { card.data = deckData[index]; });
    slotDomBoxes.forEach((box, index) => { box.hidden = index >= activeCount; box.querySelector('.slot-title').textContent = SPREAD_STEP_NAMES[index] || ''; });
    captionEls.forEach((caption, index) => { caption.hidden = index >= activeCount; caption.querySelector('.revealed-position-tag').textContent = SPREAD_STEP_NAMES[index] || ''; });
    state.mode = 'MANUAL'; state.picking = false; enterActShuffle(false);
  },
  home(intro = false) {
    generation++; for (const timer of scheduled) clearTimeout(timer); scheduled.clear();
    maxFaceTask = 0;
    state.inputBlocked = false; state.picking = false; pointerState.isDown = false; pointerState.isDragging = false;
    for (const card of cards) deckGroup.attach(card.mesh);
    resetAllCardsTransformState(); hideSpreadUI(); hideRevealedCaptions(); holdBtnEl.classList.remove('visible', 'holding'); setWhisper('');
    state.isHoldingShuffle = false; state.inspectedSlot = -1; state.actTime = 0; state.act = intro && !reducedMotion ? 'INTRO' : 'HOME';
    state.introSkipAt = null; state.introSkipFrom = 0; state.introBlend = intro ? 0 : 1;
    brandCrestEl.classList.add('docked'); introOrbits.visible = state.act === 'INTRO';
    for (const [key, face] of faceCache) if (!face.shared && (!face.maps || faceCache.size > 6)) {
      disposeFace(face); faceCache.delete(key);
    }
    state.camTargetPos.set(0, .14, layoutMetrics.introCamZ); state.camTargetLookAt.set(0, .12, 0);
  },
  snapshot() { return state.selectedCards.map(card => ({ data: card.data, isReversed: !!card.data?.isReversed,
    slotTitle: SPREAD_STEP_NAMES[card.slotIndex], image: card.image || 'images/' + card.data?.file, isFlipped: !!card.flipComplete })); },
  flipAll() { state.selectedCards.forEach((card, i) => schedule(() => triggerSingleCardFlip(i), i * 160)); },
  blockInput(blocked) { state.inputBlocked = blocked; state.hoveredCardIndex = -1; pointerState.isDown = false; window.TarotMobile?.suspend(blocked); },
  skipIntro() { if (state.act === 'INTRO' && state.introSkipAt === null) { state.introSkipAt = state.actTime; state.introSkipFrom = state.introBlend; } },
  geometrySnapshot() {
    return cards.filter(card => card.mesh.visible).map(card => {
      card.mesh.updateMatrixWorld(true);
      if (!card.mesh.geometry.boundingBox) card.mesh.geometry.computeBoundingBox();
      const box = card.mesh.geometry.boundingBox.clone().applyMatrix4(card.mesh.matrixWorld);
      const point = card.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      return { index: card.index, id: card.data?.id, min: box.min.toArray(), max: box.max.toArray(), flying: card.flightActive,
        screen: [(point.x + 1) * innerWidth / 2, (1 - point.y) * innerHeight / 2] };
    });
  },
  fanSnapshot() {
    const available = getAvailableFanCards(), index = window.TarotCarousel.wrap(Math.round(state.fanFocusIndex), available.length);
    return { phase: state.fanFocusIndex, target: state.fanTargetIndex, index, count: available.length,
      focusedId: available[index]?.data?.id, availableIds: available.map(card => card.data?.id) };
  },
  renderStats() {
    return { batch: cardBatch.stats(), motes: moteBatch.stats(), calls: renderer.info.render.calls + (overlayScene.children.some(item => item.isMesh) ? overlayRenderer.info.render.calls : 0),
      triangles: renderer.info.render.triangles, cardVertices: sharedCardGeometry.attributes.position.count,
      particles: dustCount, activeMotes: revealMotesPool.filter(mote => mote.active).length, pixelRatio: renderer.getPixelRatio() };
  },
  mute() { return sound.toggle(); }
};
// Local review hooks let tests compare the same frozen frame using either drawing path.
let profileFrozen = false;
if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('profile') === '1') {
  window.TarotExperience.profile = { freeze: value => { profileFrozen = !!value; }, batch: value => { cardBatch.setEnabled(value); moteBatch.setEnabled(value); } };
}
container.tabIndex = 0; container.setAttribute('aria-label', 'Bàn bài 3D. Vuốt hoặc dùng phím mũi tên để chọn bài.');
captionEls.forEach((caption, index) => {
  caption.tabIndex = 0; caption.setAttribute('role', 'button');
  caption.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); triggerSingleCardFlip(index); }
  });
});
container.addEventListener('wheel', event => {
  if (state.act !== 'FAN' || state.inputBlocked || state.picking) return;
  event.preventDefault();
  const pixels = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : 1);
  state.fanTargetIndex += pixels / 110; state.fanVelocity = 0;
}, { passive: false });
window.addEventListener('pointercancel', () => { pointerState.isDown = false; pointerState.isDragging = false; container.classList.remove('dragging'); });
window.addEventListener('blur', () => { pointerState.isDown = false; state.isHoldingShuffle = false; holdBtnEl.classList.remove('holding'); });
document.addEventListener('visibilitychange', () => {
  lastFrameTime = performance.now(); state.isHoldingShuffle = false; pointerState.isDown = false;
  holdBtnEl.classList.remove('holding'); holdLabelEl.textContent = 'Giữ để xáo';
  if (document.hidden) sound.ctx?.suspend(); else if (sound.enabled && sound.unlocked) sound.ctx?.resume();
});
renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); contextLost = true; });
renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; lastFrameTime = performance.now(); });
holdBtnEl.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) startHoldShuffle(); });
holdBtnEl.addEventListener('keyup', event => { if (event.key === 'Enter' || event.key === ' ') endHoldShuffle(); });

      let lastFrameTime = performance.now();

      function animate(now) {
        frameRequest = requestAnimationFrame(animate);
        if (document.hidden || contextLost) return;
        if (viewportDirty) applyViewportResize();

        const dt = Math.min((now - lastFrameTime) * 0.001, 0.05);
        lastFrameTime = now;
        if (profileFrozen) { cardBatch.sync(cards); moteBatch.sync(revealMotesPool, camera); renderer.render(scene, camera); if (overlayScene.children.some(item => item.isMesh)) overlayRenderer.render(overlayScene, camera); return; }

        state.globalTime += dt;
        state.actTime += dt;
        nebulaUniforms.uTime.value = reducedMotion ? 0 : state.globalTime;

        const ptrDamp = 1 - Math.exp(-8.5 * dt);
        const physical = window.TarotMobile?.sample();
        const targetX = physical?.active ? physical.x : state.pointerNDC.x;
        const targetY = physical?.active ? physical.y : state.pointerNDC.y;
        state.smoothPointer.x = lerp(state.smoothPointer.x, targetX, ptrDamp);
        state.smoothPointer.y = lerp(state.smoothPointer.y, targetY, ptrDamp);

        // Rotate background astrolabe rings imperceptibly
        ringOuter.rotation.z = state.globalTime * 0.025;
        ringMid.rotation.z = -state.globalTime * 0.038;
        ringInner.rotation.z = state.globalTime * 0.05;
        ringTilted.rotation.z = state.globalTime * 0.03;
        ringEllipse.rotation.z = -0.32 + Math.sin(state.globalTime * 0.15) * 0.08;

        // Update pooled rising reveal motes (zero memory allocation or disposal)
        for (let i = 0; i < MOTE_POOL_SIZE; i++) {
          const m = revealMotesPool[i];
          if (!m.active) continue;
          m.age += dt;
          if (m.age >= m.maxAge) {
            m.active = false;
            m.sprite.visible = false;
            continue;
          }
          const lifeNorm = m.age / m.maxAge;
          m.sprite.position.x += m.vx * dt + Math.sin(state.globalTime * 2.5 + i) * 0.003;
          m.sprite.position.y += m.vy * dt;
          m.mat.opacity = Math.sin(lifeNorm * Math.PI) * 0.85;
        }

        // Critically-damped spring camera tracking updated BEFORE slot projection so 3D-to-DOM alignment is zero-lag
        stepSpringVec3(state.camPos, state.camVel, state.camTargetPos, 6.2, dt);
        stepSpringVec3(state.camLookAt, state.camLookVel, state.camTargetLookAt, 7.0, dt);
        camera.position.copy(state.camPos);
        camera.lookAt(state.camLookAt);

        // Execute current Act choreography
        switch (state.act) {
          case 'INTRO': case 'HOME': updateHome(dt); break;
          case 'SHUFFLE':
            updateActShuffle(dt, state.actTime);
            break;
          case 'GATHER':
            updateActGather(dt, state.actTime);
            break;
          case 'FAN':
            updateActFan(dt, state.actTime);
            break;
          case 'ASCEND':
            updateActAscend(dt, state.actTime);
            break;
          case 'REVEAL':
            updateActReveal(dt, state.actTime);
            break;
        }

        // Push per-card shared shader uniforms (1 update per card instead of 3)
        for (let i = 0; i < TOTAL_CARDS; i++) {
          const c = cards[i];
          if (!c.mesh.visible) continue;
          c.sharedUniforms.uGlintPhase.value = c.glintPhase;
          c.sharedUniforms.uRimGlow.value = c.rimGlow;
        }

        if (hoverPending) { performCardRaycast(); hoverPending = false; }
        cardBatch.sync(cards);
        moteBatch.sync(revealMotesPool, camera);
        renderer.render(scene, camera);
        const overlayVisible = overlayScene.children.some(item => item.isMesh);
        const overlayDisplay = overlayVisible ? 'block' : 'none';
        if (overlayRenderer.domElement.style.display !== overlayDisplay) overlayRenderer.domElement.style.display = overlayDisplay;
        if (overlayVisible) overlayRenderer.render(overlayScene, camera);
        publishState(dt);
      }

      window.onload = function () {
        // Pre-compile WebGL shaders before hiding loading veil so first card flips & transitions never stutter
        cardBatch.mesh.visible = moteBatch.mesh.visible = true; renderer.compile(scene, camera); cardBatch.mesh.visible = moteBatch.mesh.visible = false;
        // Warm both WebGL contexts under the loading veil, avoiding first-pick shader stalls.
        for (const maps of [backMaps, ...heroMaps]) for (const texture of Object.values(maps)) renderer.initTexture(texture);
        for (const texture of [...Object.values(backMaps), ...heroHaloTextures]) overlayRenderer.initTexture(texture);
        for (let i = 0; i < 3; i++) overlayScene.attach(cards[i].mesh);
        overlayRenderer.compile(overlayScene, camera); overlayRenderer.render(overlayScene, camera);
        for (let i = 0; i < 3; i++) deckGroup.attach(cards[i].mesh);
        overlayRenderer.domElement.style.display = 'none';
        const veil = document.getElementById('loading-veil');
        if (veil) veil.classList.add('hidden');
        refreshSlotDomRects();
        syncReceiverSlotsWithDOM(true);
        window.TarotExperience.home(true);
        window.dispatchEvent(new Event('tarot:ready'));
        lastFrameTime = performance.now();
        requestAnimationFrame(animate);
      };
    })();
