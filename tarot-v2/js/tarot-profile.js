/* Only preferences are remembered; questions and conversations stay in the reading. */
(function (root) {
  'use strict';
  const KEY = 'tarot.profile.v1';
  const tones = ['rot', 'bot', 'tot', 'zot', 'rost'];
  const aliases = { chualanh: 'rot', tatnuoc: 'zot', quansu: 'tot', phansau: 'rot' };
  const spreads = ['time', 'single', 'mind', 'solution'];
  function clean(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const number = (input, maximum) => Number.isInteger(Number(input)) && Number(input) >= 1 && Number(input) <= maximum ? Number(input) : '';
    return {
      name: typeof value.name === 'string' ? value.name.trim().slice(0, 100) : '',
      gender: ['Nam', 'Nữ', 'Khác'].includes(value.gender) ? value.gender : '',
      dob: { day: number(value.dob?.day, 31), month: number(value.dob?.month, 12), year: number(value.dob?.year, new Date().getFullYear()) },
      vibe: tones.includes(value.vibe) ? value.vibe : Object.prototype.hasOwnProperty.call(aliases, value.vibe) ? aliases[value.vibe] : 'rot',
      spread: spreads.includes(value.spread) ? value.spread : 'time'
    };
  }
  function create(getStorage) {
    return {
      load() { try { return clean(JSON.parse(getStorage()?.getItem(KEY) || '{}')); } catch { return clean(); } },
      save(value) { try { const storage = getStorage(); if (!storage) return false; storage.setItem(KEY, JSON.stringify(clean(value))); return true; } catch { return false; } },
      clear() { try { getStorage()?.removeItem(KEY); } catch {} }
    };
  }
  const api = { create, clean, KEY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotProfile = api;
})(typeof window === 'object' ? window : this);
