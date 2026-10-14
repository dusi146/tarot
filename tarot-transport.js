/* Recover an Apps Script response without replaying the original POST. */
(function (root) {
  'use strict';
  let sequence = 0;
  function abortError() { const error = new Error('Request aborted'); error.name = 'AbortError'; return error; }
  function pause(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(abortError()); return; }
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
      function cancel() { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(abortError()); }
      signal.addEventListener('abort', cancel, { once: true });
    });
  }
  function create(options = {}) {
    const send = options.fetch || fetch, now = options.now || Date.now, sleep = options.sleep || pause;
    const waits = [1000, 2000, 4000];
    function fresh(url) {
      return url + (url.includes('?') ? '&' : '?') + '_request=' + now().toString(36) + '-' + (++sequence).toString(36);
    }
    async function request(endpoint, options = {}) {
      const controller = new AbortController(), signal = controller.signal;
      const timer = setTimeout(() => controller.abort(), options.timeout || 20000);
      const base = { redirect: 'follow', credentials: 'omit', cache: 'no-store', signal };
      try {
        let response = await send(fresh(endpoint), options.payload ? { ...base,
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(options.payload)
        } : { ...base, method: 'GET' });
        // ContentService gives us a one-time response URL. A temporary 404 can
        // occur there after the script has already completed the operation.
        // Re-read only that response; replaying /exec could duplicate writes.
        for (let attempt = 0; attempt < waits.length && response.status === 404
          && /^https:\/\/script\.googleusercontent\.com\//i.test(response.url || ''); attempt++) {
          const responseUrl = response.url;
          await sleep(waits[attempt], signal);
          if (signal.aborted) throw abortError();
          response = await send(responseUrl, { ...base, method: 'GET' });
        }
        if (!response.ok) {
          const error = new Error(response.status === 404
            ? 'Kết nối của Rót chưa trả được phản hồi. Bạn chờ một chút rồi nhấn Thử lại lời giải nhé.'
            : 'Rót chưa kết nối được. Bạn thử lại sau một chút nhé.');
          error.code = 'CONNECTION_ERROR'; error.status = response.status; throw error;
        }
        try { return await response.json(); }
        catch (cause) {
          if (cause.name === 'AbortError') throw cause;
          const error = new Error('Rót chưa nhận được phản hồi hợp lệ. Bạn thử lại sau một chút nhé.');
          error.code = 'INVALID_RESPONSE'; throw error;
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          const timeout = new Error('Rót đang phản hồi chậm. Bạn chờ một chút rồi thử lại nhé.');
          timeout.code = 'CONNECTION_TIMEOUT'; throw timeout;
        }
        if (error.name === 'TypeError') {
          const connection = new Error('Rót chưa kết nối được. Bạn kiểm tra mạng rồi thử lại sau một chút nhé.');
          connection.code = 'CONNECTION_ERROR'; throw connection;
        }
        throw error;
      } finally { clearTimeout(timer); }
    }
    return { request };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotTransport = api;
})(typeof window === 'object' ? window : this);
