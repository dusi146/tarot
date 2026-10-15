/* The browser sends tarot data to Apps Script. Provider keys stay on the server. */
(function (root) {
  'use strict';
  const network = typeof module === 'object' && module.exports ? require('./tarot-transport.js') : root.TarotTransport;
  function snapshot(state) {
    return { name: state.userName, gender: state.userGender || '', question: state.userQuestion, vibe: state.userVibe,
      dob: { ...state.dob }, spreadId: state.activeSpread.id,
      cards: state.selectedCards.map(card => ({ id: card.data.id, reversed: card.isReversed })) };
  }
  const CODES = ['OK', 'RATE_LIMIT', 'BUSY', 'AUTH_ERROR', 'NOT_CONFIGURED', 'PROVIDER_ERROR', 'PROVIDER_TIMEOUT', 'INCOMPLETE_READING', 'CONNECTION_ERROR', 'CONNECTION_TIMEOUT', 'INVALID_RESPONSE', 'AI_ERROR'];
  function safeAttempts(value) {
    return (Array.isArray(value) ? value : []).slice(0, 3).filter(item => item && ['intern', 'groq', 'gemini'].includes(item.provider) && CODES.includes(item.code))
      .map(item => ({ provider: item.provider, code: item.code, status: Number.isInteger(item.status) && item.status >= 100 && item.status <= 599 ? item.status : 0,
        elapsedMs: Number.isFinite(item.elapsedMs) ? Math.max(0, Math.min(600000, Math.round(item.elapsedMs))) : 0 }));
  }
  function diagnostics(value = {}) {
    const chain = safeAttempts(value.attempts).map(item => item.provider + ':' + item.code + (item.status ? '/HTTP' + item.status : '') + '/' + item.elapsedMs + 'ms').join(' → ');
    return [CODES.includes(value.code) ? value.code : '', chain].filter(Boolean).join(' / ');
  }
  function create(options = {}) {
    const transport = network.create({ fetch: options.fetch, now: options.now, sleep: options.sleep }), now = options.now || Date.now;
    let health, retryAt = 0;
    const inFlight = new Map(), wait = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const exchange = (url, payload, timeout) => transport.request(url, { payload, timeout: timeout || (payload ? 210000 : 20000) });
    async function ready() {
      if (!options.endpoint) throw new Error('Rót đang hoàn tất kết nối. Bạn quay lại sau một chút nhé.');
      if (!health) health = exchange(options.endpoint + '?action=ai_health').then(result => {
        // Old GS treats an unknown POST as a sheet row. Never send AI data to it.
        const compatible = result.service === 'tarot-ai' && result.version === 2 || result.service === 'tarot-groq' && result.version === 1;
        if (!compatible || !result.configured) {
          throw new Error('Rót đang hoàn tất kết nối. Bạn quay lại sau một chút nhé.');
        }
      }).catch(error => { health = null; throw error; });
      return health;
    }
    async function recover(payload) {
      const start = now(); let networkRetries = 0, polls = 0;
      for (;;) {
        let result;
        const remaining = 210000 - (now() - start);
        if (remaining <= 0) { const error = new Error('Rót đang phản hồi chậm. Bạn chờ một chút rồi thử lại nhé.'); error.code = 'CONNECTION_TIMEOUT'; throw error; }
        try { result = await exchange(options.endpoint, payload, remaining); }
        catch (error) {
          // AI POSTs are deduplicated by the server's payload hash and pending lock.
          // Never apply this retry to Sheets writes or replay a redirected response URL.
          if (!['CONNECTION_ERROR', 'CONNECTION_TIMEOUT', 'INVALID_RESPONSE'].includes(error.code) || networkRetries >= 2 || now() - start >= 200000) throw error;
          await wait(++networkRetries * 1500); continue;
        }
        if (result.code !== 'BUSY' || polls >= 24 || now() - start >= 200000) return result;
        polls++;
        await wait(Math.max(2, Math.min(10, Number(result.retryAfter) || 5)) * 1000);
      }
    }
    async function perform(payload) {
      await ready();
      const result = await recover(payload);
      if (result.status !== 'success' || typeof result.text !== 'string' || !result.text.trim()) {
        if (result.code === 'RATE_LIMIT') retryAt = now() + Math.max(1, Math.min(86400, Number(result.retryAfter) || 30)) * 1000;
        const error = new Error(result.code === 'RATE_LIMIT'
          ? `Dịch vụ đang chạm hạn mức. Bạn chờ khoảng ${Math.ceil((retryAt - now()) / 1000)} giây rồi thử lại nhé.`
          : result.code === 'BUSY' ? 'Rót vẫn đang xử lý lượt này. Bạn chờ thêm một chút rồi thử lại nhé, các lá được giữ nguyên.'
          : result.code === 'NOT_CONFIGURED' || result.code === 'AUTH_ERROR' ? 'Kết nối AI cần được chủ trang kiểm tra lại. Bạn quay lại sau một chút nhé.'
          : result.code === 'INCOMPLETE_READING' ? 'Rót chưa nhận đủ nội dung lời giải. Bạn nhấn Thử lại lời giải nhé, các lá đã chọn vẫn được giữ.'
          : 'Rót chưa kết nối được. Bạn thử lại sau một chút nhé.');
        error.code = CODES.includes(result.code) ? result.code : 'AI_ERROR';
        error.attempts = safeAttempts(result.attempts);
        throw error;
      }
      const attempts = safeAttempts(result.attempts);
      return { text: result.text, provider: typeof result.provider === 'string' ? result.provider : 'groq',
        model: typeof result.model === 'string' ? result.model : '', ...(attempts.length ? { attempts } : {}) };
    }
    async function request(action, state, history) {
      const remaining = Math.ceil((retryAt - now()) / 1000);
      if (remaining > 0) throw new Error(`Dịch vụ đang chạm hạn mức. Bạn chờ khoảng ${remaining} giây rồi thử lại nhé.`);
      // Keep complete user/assistant pairs and the latest question within the server's bound.
      const recent = history ? history.map(item => ({ role: item.role === 'user' ? 'user' : 'rot', text: item.text })) : null;
      while (recent && recent.length > 1 && (recent.length > 29 || recent.reduce((sum, item) => sum + item.text.length, 0) > 24000)) recent.splice(0, 2);
      const payload = { action, state: snapshot(state), ...(recent ? { reading: state.readingResult, history: recent } : {}) };
      const key = JSON.stringify(payload);
      if (inFlight.has(key)) return inFlight.get(key);
      const pending = perform(payload); inFlight.set(key, pending);
      try { return await pending; } finally { inFlight.delete(key); }
    }
    return { readResult: state => request('ai_reading', state),
      read: state => request('ai_reading', state).then(result => result.text),
      chat: (state, history) => request('ai_followup', state, history).then(result => result.text) };
  }
  const api = { create, snapshot, diagnostics };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotAI = api;
})(typeof window === 'object' ? window : this);
