/* The browser sends tarot data to Apps Script. Provider keys stay on the server. */
(function (root) {
  'use strict';
  const network = typeof module === 'object' && module.exports ? require('./tarot-transport.js') : root.TarotTransport;
  function snapshot(state) {
    return { name: state.userName, question: state.userQuestion, vibe: state.userVibe,
      dob: { ...state.dob }, spreadId: state.activeSpread.id,
      cards: state.selectedCards.map(card => ({ id: card.data.id, reversed: card.isReversed })) };
  }
  function create(options = {}) {
    const transport = network.create({ fetch: options.fetch, now: options.now, sleep: options.sleep }), now = options.now || Date.now;
    let health, retryAt = 0;
    const exchange = (url, payload) => transport.request(url, { payload, timeout: 85000 });
    async function ready() {
      if (!options.endpoint) throw new Error('Rót đang hoàn tất kết nối. Bạn quay lại sau một chút nhé.');
      if (!health) health = exchange(options.endpoint + '?action=ai_health').then(result => {
        // Old GS treats an unknown POST as a sheet row. Never send AI data to it.
        if (result.service !== 'tarot-groq' || result.version !== 1 || !result.configured) {
          throw new Error('Rót đang hoàn tất kết nối. Bạn quay lại sau một chút nhé.');
        }
      }).catch(error => { health = null; throw error; });
      return health;
    }
    async function request(action, state, history) {
      const remaining = Math.ceil((retryAt - now()) / 1000);
      if (remaining > 0) throw new Error(`Dịch vụ đang chạm hạn mức. Bạn chờ khoảng ${remaining} giây rồi thử lại nhé.`);
      const payload = { action, state: snapshot(state),
        ...(history ? { reading: state.readingResult, history: history.map(item => ({ role: item.role, text: item.text })) } : {}) };
      await ready();
      const result = await exchange(options.endpoint, payload);
      if (result.status !== 'success' || typeof result.text !== 'string' || !result.text.trim()) {
        if (result.code === 'RATE_LIMIT' || result.code === 'BUSY') retryAt = now() + Math.max(1, Math.min(86400, Number(result.retryAfter) || 30)) * 1000;
        const error = new Error(result.code === 'RATE_LIMIT'
          ? `Dịch vụ đang chạm hạn mức. Bạn chờ khoảng ${Math.ceil((retryAt - now()) / 1000)} giây rồi thử lại nhé.`
          : result.code === 'BUSY' ? 'Rót đang trả lời một lượt trước đó. Bạn thử lại sau một chút nhé.'
          : result.code === 'NOT_CONFIGURED' ? 'Rót đang hoàn tất kết nối. Bạn quay lại sau một chút nhé.'
          : result.code === 'INCOMPLETE_READING' ? 'Rót chưa nhận đủ nội dung lời giải. Bạn nhấn Thử lại lời giải nhé, các lá đã chọn vẫn được giữ.'
          : 'Rót chưa kết nối được. Bạn thử lại sau một chút nhé.');
        error.code = result.code || 'AI_ERROR';
        throw error;
      }
      return result.text;
    }
    return { read: state => request('ai_reading', state), chat: (state, history) => request('ai_followup', state, history) };
  }
  const api = { create, snapshot };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotAI = api;
})(typeof window === 'object' ? window : this);
