/* Quiet paper, wood and bell textures, with gentle attacks and a shared room. */
(function (root) {
  'use strict';
  class TarotAudio {
    constructor() { this.ctx = null; this.muted = true; this.drone = []; this.bowl = null; }
    init() {
      if (!this.ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        try { this.ctx = new AC(); } catch { return; }
        const ctx = this.ctx;
        this.master = ctx.createGain(); this.master.gain.value = 0;
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -22; compressor.ratio.value = 3;
        compressor.attack.value = .015; compressor.release.value = .25;
        this.master.connect(compressor); compressor.connect(ctx.destination);
        this.room = ctx.createConvolver();
        const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * .85), ctx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const samples = impulse.getChannelData(channel);
          let soft = 0;
          for (let i = 0; i < samples.length; i++) {
            soft = .7 * soft + .3 * (Math.random() * 2 - 1);
            samples[i] = soft * Math.pow(1 - i / samples.length, 3.2);
          }
        }
        this.room.buffer = impulse;
        const wet = ctx.createGain(); wet.gain.value = .12;
        this.room.connect(wet); wet.connect(this.master);
        this.paper = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .24), ctx.sampleRate);
        const samples = this.paper.getChannelData(0); let pink = 0;
        for (let i = 0; i < samples.length; i++) {
          pink = .82 * pink + .18 * (Math.random() * 2 - 1);
          samples[i] = pink;
        }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    }
    route(node, room = true) { node.connect(this.master); if (room) node.connect(this.room); }
    toggle() {
      this.init();
      if (!this.ctx) return true;
      this.muted = !this.muted;
      this.master.gain.setTargetAtTime(this.muted ? 0 : .55, this.ctx.currentTime, .1);
      if (this.muted) { this.stopDrone(); this.stopBowl(); }
      else this.startDrone();
      return this.muted;
    }
    startDrone() {
      if (this.muted || !this.ctx || this.drone.length) return;
      for (const frequency of [130.81, 196]) {
        const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(.009, this.ctx.currentTime + 3);
        oscillator.connect(gain); this.route(gain);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(); this.drone.push({ oscillator, gain });
      }
    }
    stopDrone() {
      for (const { oscillator, gain } of this.drone) {
        gain.gain.setTargetAtTime(.00001, this.ctx.currentTime, .1);
        oscillator.stop(this.ctx.currentTime + .6);
      }
      this.drone = [];
    }
    setBowl(ratio) {
      if (this.muted || !this.ctx) return;
      if (!this.bowl) {
        const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = 220; gain.gain.value = 0;
        oscillator.connect(gain); this.route(gain);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(); this.bowl = { oscillator, gain };
      }
      this.bowl.gain.gain.setTargetAtTime(.006 + Math.min(1, ratio) * .016, this.ctx.currentTime, .2);
      this.bowl.oscillator.frequency.setTargetAtTime(220 + Math.min(1, ratio) * 28, this.ctx.currentTime, .3);
    }
    stopBowl() {
      if (!this.bowl) return;
      this.bowl.gain.gain.setTargetAtTime(.00001, this.ctx.currentTime, .12);
      this.bowl.oscillator.stop(this.ctx.currentTime + .65); this.bowl = null;
    }
    noise(duration, volume, center, offset = 0) {
      if (this.muted || !this.ctx) return;
      const ctx = this.ctx, now = ctx.currentTime + offset;
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = this.paper; source.playbackRate.value = .75 + Math.random() * .35;
      filter.type = 'bandpass'; filter.frequency.value = center; filter.Q.value = .65;
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + duration * .25);
      gain.gain.exponentialRampToValueAtTime(.00001, now + duration);
      source.connect(filter); filter.connect(gain); this.route(gain, false);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
      source.start(now); source.stop(now + duration + .01);
    }
    bell(frequency, volume, duration, offset = 0) {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime + offset;
      const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + .014);
      gain.gain.exponentialRampToValueAtTime(.00001, now + duration);
      oscillator.connect(gain); this.route(gain);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now); oscillator.stop(now + duration + .04);
    }
    playSilkCardRustle() {
      this.noise(.16, .11, 1050 + Math.random() * 300);
      this.noise(.12, .055, 1900 + Math.random() * 300, .045);
    }
    playSolfeggioBell() {
      this.bell(392, .045, 2.3); this.bell(786.5, .012, 1.7, .008); this.bell(1178, .004, 1.1, .012);
    }
    playCosmicBreeze() { this.noise(.23, .085, 650); this.bell(196, .018, .38); }
    click() { this.noise(.055, .045, 950); this.bell(174.6, .022, .09); }
    pause() { if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, .1); }
    resume() { if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(.55, this.ctx.currentTime, .15); }
  }
  if (typeof module === 'object' && module.exports) module.exports = TarotAudio;
  else root.TarotAudio = TarotAudio;
})(typeof window === 'object' ? window : this);
