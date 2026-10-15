/* Timings and roles shared by the return-to-home choreography. Seconds, not frames. */
(function (root) {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };
  const FLIP = .72, STAGGER = .075, DEPART = .95, FLIGHT = 1.6, DURATION = DEPART + FLIGHT;
  function plan(count) {
    if (![1, 3, 4].includes(count)) return [];
    if (count === 1) return [{ source: 0, slot: 1, kind: 'home' }, { source: null, slot: 0, kind: 'enter', side: -1 }, { source: null, slot: 2, kind: 'enter', side: 1 }];
    return Array.from({ length: count }, (_, source) => ({ source, slot: source < 3 ? source : null, kind: source < 3 ? 'home' : 'exit', side: 1 }));
  }
  function phase(seconds, index = 0) {
    return { flip: ease((seconds - index * STAGGER) / FLIP), flight: ease((seconds - DEPART) / FLIGHT), done: seconds >= DURATION };
  }
  const api = { plan, phase, DEPART, DURATION };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotReturn = api;
})(typeof window === 'object' ? window : this);
