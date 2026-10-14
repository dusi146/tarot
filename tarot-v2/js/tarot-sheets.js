/* Protocol matches the existing bound Apps Script's 18 columns (A:R). */
(function (root) {
  'use strict';
  const config = root.TAROT_SHEETS_CONFIG;
  const transport = root.TarotTransport.create({ fetch: (...args) => fetch(...args) });
  const zone = 'Asia/Ho_Chi_Minh';
  const parts = date => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
  const dayKey = date => { const p = parts(date); return `${p.day}-${p.month}-${p.year}`; };
  let ipPromise;
  let lastStamp = 0;

  function getIP() {
    if (!ipPromise) {
      ipPromise = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
          const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
          if (!response.ok) throw new Error('IP unavailable');
          const result = await response.json();
          return typeof result.ip === 'string' ? result.ip : 'Không rõ';
        } catch { return 'Không rõ'; }
        finally { clearTimeout(timer); }
      })();
    }
    return ipPromise;
  }

  async function post(payload) {
    if (!config?.endpoint) throw new Error('Chưa cấu hình Google Sheets.');
    const result = await transport.request(config.endpoint, { payload, timeout: 20000 });
    if (result.status !== 'success') throw new Error(result.message || 'Google Sheets chưa lưu dữ liệu.');
    return result;
  }

  function begin(profile) {
    const identity = getIP();
    const snapshot = { ...profile };
    let key;
    let saved;
    let queue = Promise.resolve();
    function record(conclusion, status) {
      if (saved) return saved;
      saved = (async () => {
        const ip = await identity;
        // Freeze the lookup key once. Milliseconds distinguish fast retries and
        // visitors whose IP lookup fails; Apps Script compares this exact text.
        lastStamp = Math.max(Date.now(), lastStamp + 1);
        const date = new Date(lastStamp);
        const p = parts(date);
        key = {
          time: `${p.hour}:${p.minute}:${p.second}.${String(date.getMilliseconds()).padStart(3, '0')} ${p.day}/${p.month}/${p.year}`,
          ip, sheetName: dayKey(date)
        };
        return post({ ...snapshot, ...key, action: 'log_reading', conclusion, status });
      })();
      return saved;
    }
    function update(action, values) {
      const operation = queue.catch(() => {}).then(async () => {
        if (!saved) throw new Error('Lượt xem chưa được gửi sang Google Sheets.');
        await saved;
        // The legacy script searches today's tab and falls back to IP. Prevent
        // it from updating another reading when feedback arrives after midnight.
        if (dayKey(new Date()) !== key.sheetName) {
          throw new Error('Lượt xem đã sang ngày mới; mã GS cũ không hỗ trợ cập nhật tab hôm trước.');
        }
        return post({ ...values, ...key, action });
      });
      queue = operation;
      return operation;
    }
    return {
      record,
      feedback: values => update('update_feedback', { ...values }),
      followup: values => update('update_followup', { ...values })
    };
  }

  root.TarotSheets = { begin, endpoint: config?.endpoint,
    topDonates: () => transport.request(config.endpoint, { timeout: 20000 }) };
})(window);
