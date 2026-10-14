/* Circular positions stay unbounded so the spring never jumps across a seam. */
(function (root) {
  'use strict';
  const wrap = (value, count) => count > 0 ? ((value % count) + count) % count : 0;
  const offset = (index, focus, count) => count > 0 ? wrap(index - focus + count / 2, count) - count / 2 : 0;
  const nearest = (index, focus, count) => focus + offset(index, focus, count);
  function remove(position, removed, count) {
    if (count <= 1) return 0;
    const cycle = Math.floor(position / count), phase = wrap(position, count);
    // Collapse only the removed card's interval. Preserve every other card's identity,
    // including the next revolution and negative positions after swiping backwards.
    return cycle * (count - 1) + phase - Math.max(0, Math.min(1, phase - removed));
  }
  const api = { wrap, offset, nearest, remove };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotCarousel = api;
})(typeof window === 'object' ? window : this);
